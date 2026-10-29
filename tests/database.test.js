// Real SQLite + synthetic records. Cloudflare Access is mocked only in this suite.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/worker/auth', async importOriginal => ({
  ...await importOriginal(), verifyAdmin: async () => 'operator@example.invalid'
}));
import worker from '../src/worker/index';
import { snapshotHash } from '../src/matching/engine';
import { PRIVACY_VERSION } from '../src/shared/schema';

let sqlite, env;
const participant = email => ({schoolClaimed:'NYCU',nickname:'測試者',gender:'woman',desiredGenders:['all'],
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
    CF_ACCESS_TEAM_DOMAIN:'https://test.cloudflareaccess.com',CF_ACCESS_AUD:'test',ADMIN_EMAIL_ALLOWLIST:'operator@example.invalid',
    SUPPORT_EMAIL:'support@example.invalid',TURNSTILE_SECRET_KEY:'synthetic',RATE_HASH_PEPPER:'synthetic',
    SUBMIT_LIMITER:{limit:async()=>({success:true})},EMAIL_LIMITER:{limit:async()=>({success:true})},
    EMAIL_DRY_RUN:'true',EMAIL_ENABLED:'false',EMAIL_FROM:'sender@example.invalid',EMAIL:{send:vi.fn()},
    DB:{prepare:statement,async batch(statements){
      sqlite.exec('BEGIN');try {const result=[];for(const s of statements)result.push(await s.run());
        sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}
    }}};
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({success:true,hostname:env.PUBLIC_HOST})));
});
afterEach(()=>{sqlite.close();vi.unstubAllGlobals();});
describe('single-submit and settlement with real SQLite',()=>{
  it('stores optional custom interests privately with the entry answers',async()=>{
    const r=await request('/api/entry',{...participant('custom@example.invalid'),interests:['其他'],customInterests:[' 桌遊 ','烘焙']},false);
    expect(r.status).toBe(200);
    expect(JSON.parse(sqlite.prepare('SELECT answers_json FROM entries').get().answers_json).customInterests).toEqual(['桌遊','烘焙']);
    const stats=await (await request('/api/public/stats',null,false)).text();
    expect(stats).not.toContain('桌遊');
    expect(stats).not.toContain('customInterests');
  });
  it('persists one entry and never overwrites or sends signup mail',async()=>{
    const first=await submit('synthetic@example.invalid');
    expect(first.status).toBe(200);
    const duplicate=await request('/api/entry',{...participant('synthetic@example.invalid'),nickname:'冒名修改'},false);
    expect(await duplicate.json()).toEqual(await first.json());
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM entries').get().n).toBe(1);
    expect(sqlite.prepare('SELECT nickname FROM entries').get().nickname).toBe('測試者');
    expect(env.EMAIL.send).not.toHaveBeenCalled();
  });
  it('dry-run is read-only, commits one terminal outcome each, rejects repeat commit',async()=>{
    for(let i=0;i<5;i++)expect((await submit(`synthetic${i}@example.invalid`)).status).toBe(200);
    const preview=await lockAndPreview();
    expect(preview.metrics.unmatchedCount).toBe(1);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM match_runs').get().n).toBe(0);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM email_outbox').get().n).toBe(0);
    expect((await commit(preview)).status).toBe(200);
    expect((await commit(preview)).status).toBe(409);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM match_members').get().n).toBe(4);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM email_outbox').get().n).toBe(5);
    expect((await submit('late@example.invalid')).status).toBe(409);
    expect((await request('/api/admin/mail/send',{confirm:'SEND',roundId:'r'})).status).toBe(503);
  });
  it('rolls back the whole commit when an outbox write fails',async()=>{
    await submit('a@example.invalid');await submit('b@example.invalid');
    const preview=await lockAndPreview();
    sqlite.exec("CREATE TRIGGER reject_outbox BEFORE INSERT ON email_outbox BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
    expect((await commit(preview)).status).toBe(409);
    for(const table of ['match_runs','matches','match_members','email_outbox'])
      expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n).toBe(0);
    expect(sqlite.prepare('SELECT status FROM rounds').get().status).toBe('LOCKED');
  });
  it('detects tampering with every frozen participant field used for matching or delivery',async()=>{
    await submit('a@example.invalid');const preview=await lockAndPreview();
    const row=sqlite.prepare('SELECT * FROM entries').get();
    for(const [field,value] of Object.entries({school_claimed:'NTHU',gender:'man',adult_attested:0,share_contact_consent:0,nickname:'changed'}))
      expect(await snapshotHash([{...row,[field]:value}])).not.toBe(await snapshotHash([row]));
    sqlite.exec("UPDATE entries SET school_claimed='NTHU'");
    expect((await commit(preview)).status).toBe(409);
  });
  it('honors pause between messages and never automatically retries an uncertain delivery',async()=>{
    for(let i=0;i<3;i++)await submit(`mail${i}@example.invalid`);
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
