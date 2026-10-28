import type { Hono } from 'hono';
import { roundCreateSchema } from '../shared/schema';
import { snapshotHash } from '../matching/engine';
import { verifyAdmin, adminMutationAllowed } from './auth';
import { audit, currentRound, eligibleRows, roundById } from './db';
import type { Env } from './types';
import { registerOperations } from './operations';

type App = Hono<{ Bindings: Env; Variables: { adminEmail: string } }>;
type Confirmation = { confirm?: string };
const noStore = { 'Cache-Control': 'no-store' };
async function jsonBody(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown>> {
  try {
    const b = await c.req.json();
    return b && typeof b === 'object' && !Array.isArray(b) ? b as Record<string, unknown> : {};
  } catch { return {}; }
}
export function registerAdmin(app: App) {
  app.use('/api/admin/*', async (c,next) => {
    if (new URL(c.req.url).hostname !== c.env.ADMIN_HOST) return c.json({ error: 'Not found' },404,noStore);
    const email = await verifyAdmin(c.req.raw,c.env);
    if (!email) return c.json({ error: '管理員驗證失敗或尚未設定 Cloudflare Access' },401,noStore);
    if (c.req.method !== 'GET' && !adminMutationAllowed(c.req.raw,c.env))
      return c.json({ error: '管理操作需要同源 JSON 請求' },403,noStore);
    c.set('adminEmail',email);
    await next();
    c.header('Cache-Control','no-store');
  });

  app.get('/api/admin/dashboard', async c => {
    const db = c.env.DB;
    const round = await currentRound(db);
    if (!round) return c.json({ round:null, counts:null, trend:[], outbox:{}, mailConfigured:false });
    const [counts, today, trend, outbox] = await Promise.all([
      db.prepare("SELECT status,COUNT(*) AS n FROM entries WHERE round_id=? GROUP BY status").bind(round.id).all<{status:string;n:number}>(),
      db.prepare("SELECT COUNT(*) AS n FROM entries WHERE round_id=? AND date(submitted_at,'+8 hours')=date('now','+8 hours')").bind(round.id).first<{n:number}>(),
      db.prepare("SELECT date(submitted_at,'+8 hours') AS day, COUNT(*) AS n FROM entries WHERE round_id=? AND submitted_at>=datetime('now','-14 days') GROUP BY day ORDER BY day").bind(round.id).all<{day:string;n:number}>(),
      db.prepare("SELECT state,COUNT(*) AS n FROM email_outbox WHERE round_id=? GROUP BY state").bind(round.id).all<{state:string;n:number}>()
    ]);
    const grouped = Object.fromEntries((counts.results||[]).map(r=>[r.status,r.n]));
    const mailGrouped = Object.fromEntries((outbox.results||[]).map(r=>[r.state,r.n]));
    return c.json({
      round: { id:round.id,slug:round.slug,title:round.title,status:round.status,opensAt:round.opens_at,
        closesAt:round.closes_at,notificationTargetAt:round.notification_target_at,
        minPairScore:round.min_pair_score,sendPaused:round.send_paused===1 },
      counts: { eligible:grouped.eligible||0, excluded:grouped.excluded||0,withdrawn:grouped.withdrawn||0,
        today:today?.n||0 },
      trend:trend.results||[],
      outbox:mailGrouped,
      mailConfigured:c.env.EMAIL_DRY_RUN==='false' && c.env.EMAIL_ENABLED==='true' && !!c.env.EMAIL_FROM && !!c.env.EMAIL,
      emailDryRun:c.env.EMAIL_DRY_RUN!=='false',
      asOf:new Date().toISOString()
    });
  });

  app.get('/api/admin/rounds', async c => {
    const rows = await c.env.DB.prepare(
      'SELECT id,slug,title,status,opens_at,closes_at,notification_target_at,min_pair_score,send_paused,archived_at,purged_at,created_at FROM rounds ORDER BY created_at DESC LIMIT 40'
    ).all();
    return c.json({ rounds:rows.results||[] });
  });

  app.post('/api/admin/rounds', async c => {
    const b = await jsonBody(c);
    const p = roundCreateSchema.safeParse(b);
    if (!p.success) return c.json({error:'期次設定無效',fields:p.error.issues.map(x=>x.path.join('.'))},400);
    const v = p.data;
    const id = crypto.randomUUID();
    try {
      await c.env.DB.prepare(
        'INSERT INTO rounds(id,slug,title,opens_at,closes_at,notification_target_at,min_pair_score) VALUES(?,?,?,?,?,?,?)'
      ).bind(id,v.slug,v.title,new Date(v.opensAt).toISOString(),new Date(v.closesAt).toISOString(),
        v.notificationTargetAt?new Date(v.notificationTargetAt).toISOString():null,v.minPairScore).run();
      await audit(c.env,c.get('adminEmail'),'round.create',id,{slug:v.slug});
      return c.json({ok:true,id},201);
    } catch { return c.json({error:'期次無法建立，可能 slug 重複'},409); }
  });

  app.post('/api/admin/rounds/:id/open', async c => {
    const b = await jsonBody(c) as Confirmation;
    if (b.confirm!=='OPEN') return c.json({error:'需要 OPEN 確認'},400);
    if (!c.env.SUPPORT_EMAIL || !c.env.TURNSTILE_SITE_KEY || !c.env.TURNSTILE_SECRET_KEY || !c.env.RATE_HASH_PEPPER || !c.env.SUBMIT_LIMITER || !c.env.EMAIL_LIMITER || !c.env.EMAIL_FROM || !c.env.EMAIL)
      return c.json({error:'開池前必須設定主辦者聯絡窗口、Turnstile、限速與 Email Service sender'},503);
    const now = new Date().toISOString();
    try {
      const r = await c.env.DB.prepare(
        "UPDATE rounds SET status='OPEN' WHERE id=? AND status='DRAFT' AND opens_at<=? AND closes_at>? RETURNING id"
      ).bind(c.req.param('id'),now,now).first<{id:string}>();
      if (!r) return c.json({error:'期次尚未開始、已截止或狀態不符'},409);
      await audit(c.env,c.get('adminEmail'),'round.open',r.id);
      return c.json({ok:true});
    } catch { return c.json({error:'已有其他開放中的期次，或無法開池'},409); }
  });

  app.post('/api/admin/rounds/:id/lock', async c => {
    const b = await jsonBody(c) as Confirmation;
    if (b.confirm!=='LOCK') return c.json({error:'需要 LOCK 確認'},400);
    const id = c.req.param('id');
    const r = await roundById(c.env.DB,id);
    if (!r || r.status!=='OPEN') return c.json({error:'只有 OPEN 期次可鎖定'},409);
    // First close the round atomically; subsequent submissions are then impossible.
    const updated = await c.env.DB.prepare(
      "UPDATE rounds SET status='LOCKED' WHERE id=? AND status='OPEN' RETURNING id"
    ).bind(id).first<{id:string}>();
    if (!updated) return c.json({error:'期次已變更，請重新整理'},409);
    const rows = await eligibleRows(c.env.DB,id);
    const hash = await snapshotHash(rows);
    await c.env.DB.prepare(
      "UPDATE rounds SET snapshot_hash=? WHERE id=? AND status='LOCKED' AND snapshot_hash IS NULL"
    ).bind(hash,id).run();
    await audit(c.env,c.get('adminEmail'),'round.lock',id,{eligible:rows.length,snapshotHash:hash});
    return c.json({ok:true,eligibleCount:rows.length});
  });

  app.post('/api/admin/rounds/:id/archive', async c => {
    const b = await jsonBody(c) as Confirmation;
    if (b.confirm!=='ARCHIVE') return c.json({error:'需要 ARCHIVE 確認'},400);
    const id = c.req.param('id');
    const row = await c.env.DB.prepare(
      "UPDATE rounds SET status='ARCHIVED',archived_at=?," +
      "final_submission_count=(SELECT COUNT(*) FROM entries WHERE round_id=rounds.id AND status='eligible')," +
      "final_pair_count=(SELECT COUNT(*) FROM matches WHERE round_id=rounds.id) " +
      "WHERE id=? AND status='NOTIFIED' RETURNING id"
    ).bind(new Date().toISOString(),id).first<{id:string}>();
    if (!row) return c.json({error:'只有完成通知的期次可以封存'},409);
    await audit(c.env,c.get('adminEmail'),'round.archive',id);
    return c.json({ok:true});
  });

  app.post('/api/admin/rounds/:id/purge', async c => {
    const b = await jsonBody(c) as Confirmation;
    if (b.confirm!=='PURGE') return c.json({error:'需確認 PURGE'},400);
    const id = c.req.param('id');
    const round = await roundById(c.env.DB,id);
    if (!round || round.status!=='ARCHIVED') return c.json({error:'僅可清除已封存期次'},409);
    const retention = await c.env.DB.prepare(
      'SELECT archived_at,purged_at FROM rounds WHERE id=?'
    ).bind(id).first<{archived_at:string|null;purged_at:string|null}>();
    if (!retention?.archived_at || retention.purged_at) return c.json({error:'期次未封存或已清除'},409);
    if (Date.now()-Date.parse(retention.archived_at)<30*86400000)
      return c.json({error:'封存後未滿 30 天，不可清除'},409);
    const db=c.env.DB;
    try {
      const result=await db.batch([
        db.prepare('DELETE FROM email_outbox WHERE round_id=?').bind(id),
        db.prepare('DELETE FROM match_members WHERE round_id=?').bind(id),
        db.prepare('DELETE FROM matches WHERE round_id=?').bind(id),
        db.prepare('DELETE FROM match_runs WHERE round_id=?').bind(id),
        db.prepare('DELETE FROM entries WHERE round_id=?').bind(id),
        db.prepare("UPDATE rounds SET purged_at=? WHERE id=? AND status='ARCHIVED' AND purged_at IS NULL").bind(new Date().toISOString(),id),
        db.prepare('INSERT INTO admin_audit_events(id,actor,action,round_id,meta_json) VALUES(?,?,?,?,?)')
          .bind(crypto.randomUUID(),c.get('adminEmail'),'round.purge',id,'{}')
      ]);
      if ((result[5].meta.changes||0)!==1) return c.json({error:'清除狀態衝突'},409);
      return c.json({ok:true,deletedEntries:result[4].meta.changes||0});
    } catch { return c.json({error:'清除失敗，交易已回滾'},409); }
  });

  app.post('/api/admin/entries/:id/withdraw', async c => {
    const b = await jsonBody(c);
    if (b.confirm!=='WITHDRAW' || typeof b.reason!=='string' || b.reason.trim().length<3 || b.reason.length>100)
      return c.json({error:'需確認 WITHDRAW 並提供核對原因'},400);
    const id=c.req.param('id');
    const row=await c.env.DB.prepare(
      "UPDATE entries SET status='withdrawn' WHERE id=? AND status='eligible' AND EXISTS " +
      "(SELECT 1 FROM rounds WHERE id=entries.round_id AND status='OPEN') RETURNING round_id"
    ).bind(id).first<{round_id:string}>();
    if (!row) return c.json({error:'僅能撤回 OPEN 期次中的有效報名'},409);
    await audit(c.env,c.get('adminEmail'),'entry.withdraw',row.round_id,{entryId:id,reason:b.reason.trim()});
    return c.json({ok:true});
  });

  app.get('/api/admin/entries', async c => {
    const round = await currentRound(c.env.DB);
    if (!round) return c.json({entries:[]});
    const rows = await c.env.DB.prepare(
      'SELECT id,normalized_email,status,submitted_at FROM entries WHERE round_id=? ORDER BY submitted_at DESC LIMIT 100'
    ).bind(round.id).all<{id:string;normalized_email:string;status:string;submitted_at:string}>();
    return c.json({entries:(rows.results||[]).map(e=>{
      const [local,domain] = e.normalized_email.split('@');
      return {id:e.id,maskedEmail:local.slice(0,2)+'***@'+domain,status:e.status,submittedAt:e.submitted_at};
    })});
  });

  app.post('/api/admin/entries/:id/exclude', async c => {
    const b = await jsonBody(c);
    if (b.confirm!=='EXCLUDE' || typeof b.reason!=='string' || b.reason.trim().length<3 || b.reason.length>100)
      return c.json({error:'需確認 EXCLUDE 並提供簡短原因'},400);
    const id = c.req.param('id');
    const row = await c.env.DB.prepare(
      "UPDATE entries SET status='excluded' WHERE id=? AND status='eligible' AND EXISTS " +
      "(SELECT 1 FROM rounds WHERE id=entries.round_id AND status='OPEN') RETURNING round_id"
    ).bind(id).first<{round_id:string}>();
    if (!row) return c.json({error:'僅能排除 OPEN 期次中的有效報名'},409);
    await audit(c.env,c.get('adminEmail'),'entry.exclude',row.round_id,{entryId:id,reason:b.reason.trim()});
    return c.json({ok:true});
  });

  app.get('/api/admin/audit', async c => {
    const rows = await c.env.DB.prepare(
      'SELECT actor,action,round_id,meta_json,created_at FROM admin_audit_events ORDER BY created_at DESC LIMIT 50'
    ).all<{actor:string;action:string;round_id:string;meta_json:string;created_at:string}>();
    return c.json({events:(rows.results||[]).map(r=>({actor:r.actor,action:r.action,roundId:r.round_id,
      createdAt:r.created_at,meta:JSON.parse(r.meta_json)}))});
  });

  app.get('/api/admin/health', c => c.json({ok:true,actor:c.get('adminEmail')}));
  registerOperations(app);
}
