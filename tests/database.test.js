import { PROGRAMS } from '../src/shared/programs';
// Real SQLite + synthetic records. Cloudflare Access is mocked only in this suite.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/worker/auth', async importOriginal => ({
  ...await importOriginal(), verifyAdmin: async () => 'operator@synthetic.nycu.edu.tw'
}));
import worker from '../src/worker/index';
import { commitEarly, earlyPlan, runEarlySchedule } from '../src/worker/early';
import { syncMonthlyRounds } from '../src/worker/schedule';
import { currentRound } from '../src/worker/db';
import { snapshotHash } from '../src/matching/engine';
import { PRIVACY_VERSION } from '../src/shared/schema';

let sqlite, env;
const participant = email => ({schoolClaimed:'NYCU',degreeLevel:'bachelor',programId:PROGRAMS.find(p=>p.school==='NYCU'&&p.degree==='bachelor').id,departmentPreference:'either_department',nickname:'測試者',gender:'woman',desiredGenders:['all'],
  intent:'either',campusPreference:'either_school',interests:['音樂'],dayOffStyle:'both',
  conflictStyle:'depends',chatStyle:'deep',firstMeet:'cafe',topValue:'ease',notificationEmail:email,
  contactKind:'instagram',contactValue:'@synthetic',adultAttested:true,shareContactConsent:true,
  privacyConsentVersion:PRIVACY_VERSION,turnstileToken:'synthetic'});
function statement(sql, args=[]) {
  return {bind(...values){return statement(sql,values);},
    async first(){return sqlite.prepare(sql).get(...args)??null;},
    async all(){return {results:sqlite.prepare(sql).all(...args)};},
    async run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}
  };
}
async function request(path, body, admin=true) {
  const host=admin?'admin.relou.jjmowlab.com':'relou.jjmowlab.com';
  return worker.fetch(new Request('https://'+host+path,body ? {method:'POST',
    headers:{Origin:'https://'+host,'Content-Type':'application/json'},body:JSON.stringify(body)} : {}),env,{});
}
async function submit(email){return request('/api/entry',participant(email),false);}
async function lockAndPreview(){
  expect((await request('/api/admin/rounds/r/lock',{confirm:'LOCK'})).status).toBe(200);
  return (await request('/api/admin/matching/preview?round=r')).json();
}
async function commit(preview){return request('/api/admin/matching/commit',{
  confirm:'COMMIT',roundId:'r',previewDigest:preview.previewDigest});}
beforeEach(()=>{
  sqlite=new DatabaseSync(':memory:');
  for(const name of readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort())
    sqlite.exec(readFileSync('migrations/'+name,'utf8'));
  sqlite.prepare("INSERT INTO rounds(id,slug,title,status,opens_at,closes_at) VALUES('r','round-test','Synthetic','OPEN',?,?)")
    .run(new Date(Date.now()-60000).toISOString(),new Date(Date.now()+86400000).toISOString());
  env={PUBLIC_HOST:'relou.jjmowlab.com',ADMIN_HOST:'admin.relou.jjmowlab.com',ENVIRONMENT:'production',
    CF_ACCESS_TEAM_DOMAIN:'https://test.cloudflareaccess.com',CF_ACCESS_AUD:'test',ADMIN_EMAIL_ALLOWLIST:'operator@synthetic.nycu.edu.tw',
    SUPPORT_EMAIL:'support@synthetic.nycu.edu.tw',TURNSTILE_SECRET_KEY:'synthetic',RATE_HASH_PEPPER:'synthetic',
    SUBMIT_LIMITER:{limit:async()=>({success:true})},EMAIL_LIMITER:{limit:async()=>({success:true})},
    EMAIL_DRY_RUN:'true',EMAIL_ENABLED:'false',EMAIL_FROM:'sender@synthetic.nycu.edu.tw',EMAIL:{send:vi.fn()},
    DB:{prepare:statement,async batch(statements){
      sqlite.exec('BEGIN');try {const result=[];for(const s of statements)result.push(await s.run());
        sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}
    }}};
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({success:true,hostname:env.PUBLIC_HOST})));
});
afterEach(()=>{sqlite.close();vi.unstubAllGlobals();vi.useRealTimers();});
describe('single-submit and settlement with real SQLite',()=>{
  it('stores optional custom interests privately with the entry answers',async()=>{
    const r=await request('/api/entry',{...participant('custom@synthetic.nycu.edu.tw'),interests:['其他'],customInterests:[' 桌遊 ','烘焙']},false);
    expect(r.status).toBe(200);
    expect(JSON.parse(sqlite.prepare('SELECT answers_json FROM entries').get().answers_json).customInterests).toEqual(['桌遊','烘焙']);
    const stats=await (await request('/api/public/stats',null,false)).text();
    expect(stats).not.toContain('桌遊');
    expect(stats).not.toContain('customInterests');
  });
  it('persists one entry and never overwrites or sends signup mail',async()=>{
    const first=await submit('synthetic@synthetic.nycu.edu.tw');
    expect(first.status).toBe(200);
    const duplicate=await request('/api/entry',{...participant('synthetic@synthetic.nycu.edu.tw'),nickname:'冒名修改'},false);
    expect(await duplicate.json()).toEqual(await first.json());
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM entries').get().n).toBe(1);
    expect(sqlite.prepare('SELECT nickname FROM entries').get().nickname).toBe('測試者');
    expect(env.EMAIL.send).not.toHaveBeenCalled();
  });
  it('dry-run is read-only, commits one terminal outcome each, rejects repeat commit',async()=>{
    for(let i=0;i<5;i++)expect((await submit(`synthetic${i}@synthetic.nycu.edu.tw`)).status).toBe(200);
    const preview=await lockAndPreview();
    expect(preview.metrics.unmatchedCount).toBe(1);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM match_runs').get().n).toBe(0);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM email_outbox').get().n).toBe(0);
    expect((await (await request('/api/public/stats',null,false)).json()).currentRoundPairCount).toBe(0);
    expect((await commit(preview)).status).toBe(200);
    expect((await (await request('/api/public/stats',null,false)).json()).currentRoundPairCount).toBe(2);
    expect((await commit(preview)).status).toBe(409);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM match_members').get().n).toBe(4);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM email_outbox').get().n).toBe(5);
    expect((await submit('late@synthetic.nycu.edu.tw')).status).toBe(409);
    expect((await request('/api/admin/mail/send',{confirm:'SEND',roundId:'r'})).status).toBe(503);
  });
  it('rolls back the whole commit when an outbox write fails',async()=>{
    await submit('a@synthetic.nycu.edu.tw');await submit('b@synthetic.nycu.edu.tw');
    const preview=await lockAndPreview();
    sqlite.exec("CREATE TRIGGER reject_outbox BEFORE INSERT ON email_outbox BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
    expect((await commit(preview)).status).toBe(409);
    for(const table of ['match_runs','matches','match_members','email_outbox'])
      expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n).toBe(0);
    expect(sqlite.prepare("SELECT status FROM rounds WHERE id='r'").get().status).toBe('LOCKED');
  });
  it('detects tampering with every frozen participant field used for matching or delivery',async()=>{
    await submit('a@synthetic.nycu.edu.tw');const preview=await lockAndPreview();
    const row=sqlite.prepare('SELECT * FROM entries').get();
    for(const [field,value] of Object.entries({school_claimed:'NTHU',gender:'man',adult_attested:0,share_contact_consent:0,nickname:'changed'}))
      expect(await snapshotHash([{...row,[field]:value}])).not.toBe(await snapshotHash([row]));
    sqlite.exec("UPDATE entries SET school_claimed='NTHU'");
    expect((await commit(preview)).status).toBe(409);
  });
  it('honors pause between messages and never automatically retries an uncertain delivery',async()=>{
    for(let i=0;i<3;i++)await submit(`mail${i}@synthetic.nycu.edu.tw`);
    await commit(await lockAndPreview());
    env.EMAIL_DRY_RUN='false';env.EMAIL_ENABLED='true';
    sqlite.exec('UPDATE rounds SET send_paused=0');
    env.EMAIL.send.mockImplementation(async()=>{
      sqlite.exec('UPDATE rounds SET send_paused=1');throw new Error('synthetic provider timeout');
    });
    const response=await request('/api/admin/mail/send',{confirm:'SEND',roundId:'r'});
    expect(response.status).toBe(200);expect(env.EMAIL.send).toHaveBeenCalledTimes(1);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE state='uncertain'").get().n).toBe(1);
    await request('/api/admin/mail/retry',{confirm:'RETRY',roundId:'r'});
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE state='queued'").get().n).toBe(2);
  });
});

describe('monthly scheduler using real SQLite and synthetic credentials',()=>{
  function configure(){Object.assign(env,{MONTHLY_ROUNDS_ENABLED:'true',TURNSTILE_SITE_KEY:'synthetic',MAIL_PROVIDER:'gmail_smtp',GMAIL_SMTP_USER:'sender@synthetic.nycu.edu.tw',GMAIL_SMTP_APP_PASSWORD:'synthetic'});}
  it('keeps October closed and opens November once with sending still disabled',async()=>{
    configure();sqlite.exec("DELETE FROM rounds WHERE id='r'");
    await syncMonthlyRounds(env,Date.parse('2026-10-29T00:00:00Z'));
    expect(sqlite.prepare("SELECT status FROM rounds WHERE slug='2026-11'").get().status).toBe('DRAFT');
    const start=Date.parse('2026-10-31T16:00:00Z');
    await syncMonthlyRounds(env,start);await syncMonthlyRounds(env,start);
    expect(sqlite.prepare("SELECT status FROM rounds WHERE slug='2026-11'").get().status).toBe('OPEN');
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM admin_audit_events WHERE action='round.auto-open'").get().n).toBe(1);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM email_outbox').get().n).toBe(0);
    expect(env.EMAIL.send).not.toHaveBeenCalled();
  });
  it('closes at 21st midnight, freezes once, then opens next month despite older locked round',async()=>{
    configure();sqlite.exec("DELETE FROM rounds WHERE id='r'");
    await syncMonthlyRounds(env,Date.parse('2026-11-20T15:59:59Z'));
    expect(sqlite.prepare("SELECT status FROM rounds WHERE slug='2026-11'").get().status).toBe('OPEN');
    await syncMonthlyRounds(env,Date.parse('2026-11-20T16:00:00Z'));
    await syncMonthlyRounds(env,Date.parse('2026-11-20T16:15:00Z'));
    const locked=sqlite.prepare("SELECT * FROM rounds WHERE slug='2026-11'").get();
    expect(locked.status).toBe('LOCKED');expect(locked.snapshot_hash).toBeTruthy();
    const start=Date.parse('2026-11-30T16:00:00Z');await syncMonthlyRounds(env,start);
    expect((await currentRound(env.DB,start)).slug).toBe('2026-12');
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM rounds WHERE status='OPEN'").get().n).toBe(1);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM admin_audit_events WHERE action='round.auto-lock'").get().n).toBe(1);
  });
  it('fails closed with missing sender credentials or disabled scheduler',async()=>{
    configure();sqlite.exec("DELETE FROM rounds WHERE id='r'");delete env.GMAIL_SMTP_APP_PASSWORD;
    await syncMonthlyRounds(env,Date.parse('2026-10-31T16:00:00Z'));
    expect(sqlite.prepare("SELECT status FROM rounds WHERE slug='2026-11'").get().status).toBe('DRAFT');
    env.MONTHLY_ROUNDS_ENABLED='false';await syncMonthlyRounds(env,Date.parse('2026-11-30T16:00:00Z'));
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM rounds WHERE slug='2026-12'").get().n).toBe(0);
  });
});

it('rejects submission at the exact close even before cron locks the round',async()=>{
  sqlite.exec("DELETE FROM rounds WHERE id='r'; UPDATE rounds SET status='OPEN' WHERE slug='2026-11';");
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-20T15:59:59.999Z'));
  expect((await submit('before@synthetic.nycu.edu.tw')).status).toBe(200);
  vi.setSystemTime(new Date('2026-11-20T16:00:00.000Z'));
  expect((await submit('after@synthetic.nycu.edu.tw')).status).toBe(409);
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM entries').get().n).toBe(1);
});

describe('high compatibility early allocation (synthetic only)',()=>{
 function enabled(){Object.assign(env,{EARLY_MATCHING_ENABLED:'true',EMAIL_ENABLED:'true',EMAIL_DRY_RUN:'false'});}
 it('reserves high pairs once, then final settlement handles only remaining entries',async()=>{
  enabled();await submit('high-a@synthetic.nycu.edu.tw');await submit('high-b@synthetic.nycu.edu.tw');
  const p=await earlyPlan(env,'r');expect(p.plan.pairs).toHaveLength(1);expect(p.plan.pairs[0].score).toBe(100);
  expect((await commitEarly(env,'r')).pairs).toBe(1);
  expect((await commitEarly(env,'r')).pairs).toBe(0);
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM matches').get().n).toBe(1);
  expect(sqlite.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE phase='early'").get().n).toBe(2);
  const a=sqlite.prepare('SELECT a_id FROM matches').get().a_id;
  expect((await request('/api/admin/entries/'+a+'/withdraw',{confirm:'WITHDRAW',reason:'synthetic reason'})).status).toBe(409);
  await submit('remaining@synthetic.nycu.edu.tw');const preview=await lockAndPreview();
  expect(preview.metrics.eligibleCount).toBe(1);expect(preview.metrics.unmatchedCount).toBe(1);
  expect((await commit(preview)).status).toBe(200);
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM match_runs').get().n).toBe(1);
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM allocation_batches').get().n).toBe(2);
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM email_outbox').get().n).toBe(3);
  expect(sqlite.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE template_version='result-v2' AND html_body IS NOT NULL").get().n).toBe(3);
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM match_members').get().n).toBe(2);
 });
 it('leaves below-threshold, incompatible and only-Other submissions waiting',async()=>{
  enabled();await submit('low-a@synthetic.nycu.edu.tw');
  await request('/api/entry',{...participant('low-b@synthetic.nycu.edu.tw'),chatStyle:'meet'},false);
  expect((await earlyPlan(env,'r')).plan.pairs).toHaveLength(0);
  sqlite.exec("UPDATE entries SET answers_json=json_set(answers_json,'$.chatStyle','deep','$.campusPreference','same_school'); UPDATE entries SET school_claimed='NTHU' WHERE normalized_email='low-b@synthetic.nycu.edu.tw';");
  expect((await earlyPlan(env,'r')).plan.pairs).toHaveLength(0);
  sqlite.prepare("UPDATE entries SET school_claimed='NYCU',answers_json=json_set(answers_json,'$.interests',json(?))").run(JSON.stringify(['其他']));
  expect((await commitEarly(env,'r')).pairs).toBe(0);
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM email_outbox').get().n).toBe(0);
 });
 it('rolls back early allocation on outbox failure and respects closed/paused rounds and dry-run',async()=>{
  await submit('rollback-a@synthetic.nycu.edu.tw');await submit('rollback-b@synthetic.nycu.edu.tw');
  env.EARLY_MATCHING_ENABLED='true';expect((await commitEarly(env,'r')).pairs).toBe(0);enabled();
  sqlite.exec("CREATE TRIGGER early_outbox_failure BEFORE INSERT ON email_outbox BEGIN SELECT RAISE(ABORT,'synthetic'); END;");
  await expect(commitEarly(env,'r')).rejects.toThrow();
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM match_members').get().n).toBe(0);
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM match_runs').get().n).toBe(0);
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM allocation_batches').get().n).toBe(0);
  sqlite.exec("DROP TRIGGER early_outbox_failure; UPDATE rounds SET early_paused=1 WHERE id='r';");
  await expect(earlyPlan(env,'r')).rejects.toThrow();
  sqlite.exec("UPDATE rounds SET early_paused=0,status='LOCKED' WHERE id='r'");
  await expect(earlyPlan(env,'r')).rejects.toThrow();
 });
 it('sends early results via schedule but keeps OPEN and never sends an unmatched notice early',async()=>{
  enabled();await submit('send-a@synthetic.nycu.edu.tw');await submit('send-b@synthetic.nycu.edu.tw');await submit('wait@synthetic.nycu.edu.tw');
  await runEarlySchedule(env);
  expect(env.EMAIL.send).toHaveBeenCalledTimes(2);
  expect(sqlite.prepare("SELECT status FROM rounds WHERE id='r'").get().status).toBe('OPEN');
  expect(sqlite.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE state='sent'").get().n).toBe(2);
  await runEarlySchedule(env);expect(env.EMAIL.send).toHaveBeenCalledTimes(2);
 });
});

it('applies department exclusions to early and final matching, and stores canonical private identifiers',async()=>{
 Object.assign(env,{EARLY_MATCHING_ENABLED:'true',EMAIL_ENABLED:'true',EMAIL_DRY_RUN:'false'});
 const input={...participant('dept-a@synthetic.nycu.edu.tw'),departmentPreference:'different_department'};
 expect((await request('/api/entry',input,false)).status).toBe(200);
 await submit('dept-b@synthetic.nycu.edu.tw');
 const row=sqlite.prepare("SELECT answers_json FROM entries WHERE normalized_email='dept-a@synthetic.nycu.edu.tw'").get();
 expect(JSON.parse(row.answers_json).departmentGroup).toBe(PROGRAMS.find(p=>p.id===input.programId).departmentGroup);
 expect((await commitEarly(env,'r')).pairs).toBe(0);
 const preview=await lockAndPreview();expect(preview.metrics.validEdges).toBe(0);
 expect((await commit(preview)).status).toBe(200);
 expect(sqlite.prepare('SELECT COUNT(*) AS n FROM matches').get().n).toBe(0);
 expect(sqlite.prepare('SELECT COUNT(*) AS n FROM email_outbox').get().n).toBe(2);
});

it('rechecks early pause between messages and does not requeue uncertain SMTP outcomes',async()=>{
 Object.assign(env,{EARLY_MATCHING_ENABLED:'true',EMAIL_ENABLED:'true',EMAIL_DRY_RUN:'false'});
 await submit('earlypause-a@synthetic.nycu.edu.tw');await submit('earlypause-b@synthetic.nycu.edu.tw');
 env.EMAIL.send.mockImplementation(async()=>{sqlite.exec("UPDATE rounds SET early_paused=1 WHERE id='r'");throw new Error('synthetic timeout');});
 await runEarlySchedule(env);expect(env.EMAIL.send).toHaveBeenCalledTimes(1);
 expect(sqlite.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE state='uncertain'").get().n).toBe(1);
 expect(sqlite.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE state='queued'").get().n).toBe(1);
 await request('/api/admin/mail/retry',{confirm:'RETRY',roundId:'r'});
 expect(sqlite.prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE state='uncertain'").get().n).toBe(1);
});
it('rejects an early allocation atomically if the round locks after planning',async()=>{
 Object.assign(env,{EARLY_MATCHING_ENABLED:'true',EMAIL_ENABLED:'true',EMAIL_DRY_RUN:'false'});
 await submit('stale-a@synthetic.nycu.edu.tw');await submit('stale-b@synthetic.nycu.edu.tw');
 const batch=env.DB.batch;
 env.DB.batch=async statements=>{sqlite.exec("UPDATE rounds SET status='LOCKED' WHERE id='r'");return batch(statements);};
 await expect(commitEarly(env,'r')).rejects.toThrow();
 for(const table of ['match_runs','allocation_batches','matches','match_members','email_outbox'])
  expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n).toBe(0);
});

it('stores private feedback and blocks public reading, invalid content and rate abuse',async()=>{
 expect((await request('/api/feedback',{message:'  合成回饋 <script>  ',turnstileToken:'synthetic'},false)).status).toBe(200);
 expect(sqlite.prepare('SELECT message FROM feedback').get().message).toBe('合成回饋 <script>');
 const inbox=await (await request('/api/admin/feedback')).json();expect(inbox.items).toHaveLength(1);
 expect((await request('/api/admin/feedback',undefined,false)).status).toBe(404);
 expect((await request('/api/feedback',{message:'x'.repeat(2001),turnstileToken:'synthetic'},false)).status).toBe(400);
 env.SUBMIT_LIMITER.limit=async()=>({success:false});
 expect((await request('/api/feedback',{message:'spam',turnstileToken:'synthetic'},false)).status).toBe(429);
 expect(sqlite.prepare('SELECT count(*) n FROM feedback').get().n).toBe(1);
});
