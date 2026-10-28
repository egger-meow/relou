import type { Hono } from 'hono';
import { ALGORITHM_VERSION, computePlan, fromRow, planDigest, snapshotHash } from '../matching/engine';
import type { EntryRow } from '../shared/schema';
import { audit, eligibleRows, roundById } from './db';
import { resultEmail, maskedPreview } from './mail';
import type { Env } from './types';

type App = Hono<{ Bindings: Env; Variables: { adminEmail: string } }>;
type Outbox = {id:string;recipient_email:string;subject:string;text_body:string;state:string;attempts:number};
async function body(c: {req:{json():Promise<unknown>}}): Promise<Record<string,unknown>> {
  try {
    const v = await c.req.json();
    return v && typeof v==='object' && !Array.isArray(v) ? v as Record<string,unknown> : {};
  } catch { return {}; }
}
async function preparePlan(env: Env, id: string) {
  const round = await roundById(env.DB,id);
  if (!round || round.status!=='LOCKED' || !round.snapshot_hash) throw new Error('本期未鎖定或尚未建立快照');
  const rows = await eligibleRows(env.DB,id);
  const hash = await snapshotHash(rows);
  if (hash !== round.snapshot_hash) throw new Error('候選資料已變更，禁止使用過期快照結算');
  const plan = computePlan(rows.map(fromRow),round.min_pair_score);
  const digest = await planDigest(id,hash,plan);
  return {round,rows,hash,plan,digest};
}
function mailReady(env: Env) {
  return env.EMAIL_DRY_RUN==='false' && env.EMAIL_ENABLED==='true' && !!env.EMAIL_FROM && !!env.EMAIL;
}
export function registerOperations(app: App) {
  app.get('/api/admin/matching/preview', async c => {
    const id = c.req.query('round');
    if (!id) return c.json({error:'缺少期次'},400);
    try {
      const {plan,digest,hash} = await preparePlan(c.env,id);
      // No writes: a preview is strictly side-effect free.
      const {pairs: _privatePairs, ...metrics} = plan;
      void _privatePairs;
      return c.json({roundId:id,snapshotHash:hash,previewDigest:digest,metrics,algorithmVersion:ALGORITHM_VERSION});
    } catch (e) { return c.json({error:e instanceof Error?e.message:'無法預覽'},409); }
  });

  app.post('/api/admin/matching/commit', async c => {
    const v = await body(c);
    if (v.confirm!=='COMMIT' || typeof v.roundId!=='string' || typeof v.previewDigest!=='string')
      return c.json({error:'需確認 COMMIT 與預覽摘要'},400);
    let p: Awaited<ReturnType<typeof preparePlan>>;
    try { p = await preparePlan(c.env,v.roundId); }
    catch (e) { return c.json({error:e instanceof Error?e.message:'快照無效'},409); }
    if (v.previewDigest!==p.digest) return c.json({error:'配對預覽已變更，請重新預覽'},409);
    const {round,rows,hash,plan,digest} = p;
    const runId = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [
      c.env.DB.prepare(
        "INSERT INTO match_runs(id,round_id,snapshot_hash,plan_digest,algorithm_version,metrics_json) " +
        "SELECT ?,id,?,?,?,? FROM rounds WHERE id=? AND status='LOCKED' AND snapshot_hash=?"
      ).bind(runId,hash,digest,ALGORITHM_VERSION,JSON.stringify({
        eligibleCount:plan.eligibleCount,validEdges:plan.validEdges,matchedPairs:plan.pairs.length,
        unmatchedCount:plan.unmatchedCount,matchRate:plan.matchRate,meanScore:plan.meanScore,medianScore:plan.medianScore
      }),round.id,hash),
      c.env.DB.prepare(
        "UPDATE rounds SET status='MATCHED',send_paused=1 WHERE id=? AND status='LOCKED' AND EXISTS (SELECT 1 FROM match_runs WHERE id=? AND round_id=rounds.id)"
      ).bind(round.id,runId)
    ];
    const byId = new Map<string,EntryRow>(rows.map(r=>[r.id,r]));
    const partners = new Map<string,string>();
    for (const pair of plan.pairs) {
      if (!byId.has(pair.a) || !byId.has(pair.b) || partners.has(pair.a) || partners.has(pair.b))
        return c.json({error:'配對資料不符合唯一性'},409);
      partners.set(pair.a,pair.b); partners.set(pair.b,pair.a);
      const matchId = crypto.randomUUID();
      statements.push(c.env.DB.prepare(
        'INSERT INTO matches(id,round_id,run_id,a_id,b_id,score) VALUES(?,?,?,?,?,?)'
      ).bind(matchId,round.id,runId,pair.a,pair.b,pair.score));
      for (const id of [pair.a,pair.b]) statements.push(c.env.DB.prepare(
        'INSERT INTO match_members(round_id,entry_id,match_id) VALUES(?,?,?)'
      ).bind(round.id,id,matchId));
    }
    for (const row of rows) {
      const other = partners.get(row.id);
      const message = resultEmail(row,other?byId.get(other)!:null,c.env.SUPPORT_EMAIL||'');
      statements.push(c.env.DB.prepare(
        'INSERT INTO email_outbox(id,round_id,run_id,entry_id,dedupe_key,recipient_email,subject,text_body) VALUES(?,?,?,?,?,?,?,?)'
      ).bind(crypto.randomUUID(),round.id,runId,row.id,round.id+':'+row.id+':v1',row.normalized_email,
        message.subject,message.text));
    }
    statements.push(c.env.DB.prepare(
      'INSERT INTO admin_audit_events(id,actor,action,round_id,meta_json) SELECT ?,?,?,?,? FROM match_runs WHERE id=?'
    ).bind(crypto.randomUUID(),c.get('adminEmail'),'matching.commit',round.id,
      JSON.stringify({pairs:plan.pairs.length,eligible:rows.length,planDigest:digest}),runId));
    try {
      // D1 batch is atomic: constraints/foreign keys rollback the whole batch on failure.
      const results = await c.env.DB.batch(statements);
      if ((results[0].meta.changes||0)!==1 || (results[1].meta.changes||0)!==1)
        return c.json({error:'配對已由其他管理操作結算，請重新整理'},409);
      return c.json({ok:true,runId,matchedPairs:plan.pairs.length,unmatchedCount:plan.unmatchedCount});
    } catch {
      return c.json({error:'配對提交衝突或資料庫拒絕，未建立第二份配對'},409);
    }
  });

  app.get('/api/admin/mail/status', async c => {
    const id = c.req.query('round');
    if (!id) return c.json({error:'缺少期次'},400);
    const round = await roundById(c.env.DB,id);
    if (!round) return c.json({error:'找不到期次'},404);
    const states = await c.env.DB.prepare(
      'SELECT state,COUNT(*) AS n FROM email_outbox WHERE round_id=? GROUP BY state'
    ).bind(id).all<{state:string;n:number}>();
    const sample = await c.env.DB.prepare(
      'SELECT subject FROM email_outbox WHERE round_id=? ORDER BY created_at LIMIT 1'
    ).bind(id).first<{subject:string}>();
    return c.json({
      roundId:id,roundStatus:round.status,paused:round.send_paused===1,
      dryRun:c.env.EMAIL_DRY_RUN!=='false',mailConfigured:mailReady(c.env),
      states:Object.fromEntries((states.results||[]).map(s=>[s.state,s.n])),
      sample:sample?maskedPreview(sample.subject):null
    });
  });

  app.post('/api/admin/mail/pause', async c => {
    const v = await body(c);
    if (v.confirm!=='PAUSE' || typeof v.roundId!=='string') return c.json({error:'需確認 PAUSE'},400);
    const updated = await c.env.DB.prepare(
      "UPDATE rounds SET send_paused=1 WHERE id=? AND status IN ('MATCHED','NOTIFIED') RETURNING id"
    ).bind(v.roundId).first<{id:string}>();
    if (!updated) return c.json({error:'狀態不允許暫停'},409);
    await audit(c.env,c.get('adminEmail'),'mail.pause',v.roundId);
    return c.json({ok:true});
  });

  app.post('/api/admin/mail/resume', async c => {
    const v = await body(c);
    if (v.confirm!=='RESUME' || typeof v.roundId!=='string') return c.json({error:'需確認 RESUME'},400);
    if (!mailReady(c.env)) return c.json({error:'寄件功能未正式啟用，dry-run 預設不允許真寄'},503);
    const updated = await c.env.DB.prepare(
      "UPDATE rounds SET send_paused=0 WHERE id=? AND status='MATCHED' RETURNING id"
    ).bind(v.roundId).first<{id:string}>();
    if (!updated) return c.json({error:'狀態不允許啟動寄送'},409);
    await audit(c.env,c.get('adminEmail'),'mail.resume',v.roundId);
    return c.json({ok:true});
  });

  app.post('/api/admin/mail/retry', async c => {
    const v = await body(c);
    if (v.confirm!=='RETRY' || typeof v.roundId!=='string') return c.json({error:'需確認 RETRY'},400);
    const round = await roundById(c.env.DB,v.roundId);
    if (!round || round.status!=='MATCHED') return c.json({error:'只有已配對期次可重試'},409);
    // Never automatically retry "uncertain" deliveries: they may have reached recipients.
    const r = await c.env.DB.prepare(
      "UPDATE email_outbox SET state='queued',error_code=NULL WHERE round_id=? AND state='failed' AND attempts<3"
    ).bind(v.roundId).run();
    await audit(c.env,c.get('adminEmail'),'mail.retry',v.roundId,{requeued:r.meta.changes});
    return c.json({ok:true,requeued:r.meta.changes||0});
  });

  app.post('/api/admin/mail/send', async c => {
    const v = await body(c);
    if (v.confirm!=='SEND' || typeof v.roundId!=='string') return c.json({error:'需確認 SEND'},400);
    if (!mailReady(c.env)) return c.json({error:'寄件尚未開通或目前為 dry-run；不會寄出真信'},503);
    const round = await roundById(c.env.DB,v.roundId);
    if (!round || round.status!=='MATCHED' || round.send_paused!==0)
      return c.json({error:'期次未配對或寄送已暫停'},409);
    const pending = await c.env.DB.prepare(
      "SELECT id,recipient_email,subject,text_body,state,attempts FROM email_outbox WHERE round_id=? AND state='queued' ORDER BY created_at,id LIMIT 10"
    ).bind(round.id).all<Outbox>();
    let sent=0,uncertain=0,failed=0;
    for (const item of pending.results||[]) {
      // Each message is claimed by exactly one Worker; crashes leave 'sending' for manual reconciliation.
      const claimed = await c.env.DB.prepare(
        "UPDATE email_outbox SET state='sending',attempts=attempts+1,claimed_at=? WHERE id=? AND state='queued' RETURNING id"
      ).bind(new Date().toISOString(),item.id).first<{id:string}>();
      if (!claimed) continue;
      try {
        const result = await c.env.EMAIL!.send({
          to:item.recipient_email,from:c.env.EMAIL_FROM,subject:item.subject,text:item.text_body
        });
        const providerId = result && typeof result==='object' && 'messageId' in result
          ? String((result as {messageId:unknown}).messageId) : null;
        await c.env.DB.prepare(
          "UPDATE email_outbox SET state='sent',sent_at=?,provider_message_id=?,error_code=NULL WHERE id=? AND state='sending'"
        ).bind(new Date().toISOString(),providerId,item.id).run();
        sent++;
      } catch (e) {
        const code = e && typeof e==='object' && 'code' in e ? String((e as {code:unknown}).code) : 'UNKNOWN';
        const knownRejected = ['INVALID_RECIPIENT','INVALID_SENDER','VALIDATION_ERROR'].includes(code);
        await c.env.DB.prepare(
          "UPDATE email_outbox SET state=?,error_code=? WHERE id=? AND state='sending'"
        ).bind(knownRejected?'failed':'uncertain',code.slice(0,60),item.id).run();
        if (knownRejected) failed++; else uncertain++;
      }
    }
    const remaining = await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM email_outbox WHERE round_id=? AND state IN ('queued','sending','failed','uncertain')"
    ).bind(round.id).first<{n:number}>();
    if ((remaining?.n??1)===0) {
      await c.env.DB.prepare("UPDATE rounds SET status='NOTIFIED',send_paused=1 WHERE id=? AND status='MATCHED'").bind(round.id).run();
    }
    await audit(c.env,c.get('adminEmail'),'mail.send_batch',round.id,{sent,uncertain,failed,remaining:remaining?.n});
    return c.json({ok:true,sent,uncertain,failed,remaining:remaining?.n||0});
  });
}
