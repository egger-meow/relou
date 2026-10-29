import { monthlyRound } from '../shared/calendar';
import { snapshotHash } from '../matching/engine';
import { eligibleRows } from './db';
import { mailCredentialsReady } from './smtp';
import type { Env } from './types';

// Cron never commits matches or sends mail. Dates are enforced independently by POST /api/entry.
export async function syncMonthlyRounds(env:Env,time=Date.now()) {
  if(env.MONTHLY_ROUNDS_ENABLED!=='true')return;
  const now=new Date(time).toISOString(),month=monthlyRound(time);
  const expired=await env.DB.prepare("SELECT id FROM rounds WHERE status='OPEN' AND closes_at<=?").bind(now).all<{id:string}>();
  for(const row of expired.results||[]) {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO admin_audit_events(id,actor,action,round_id,meta_json) SELECT ?,'system:monthly','round.auto-lock',id,'{}' FROM rounds WHERE id=? AND status='OPEN' AND closes_at<=?").bind(crypto.randomUUID(),row.id,now),
      env.DB.prepare("UPDATE rounds SET status='LOCKED' WHERE id=? AND status='OPEN' AND closes_at<=?").bind(row.id,now)
    ]);
  }
  // Repair an interrupted freeze idempotently before any operator can commit a result.
  const frozen=await env.DB.prepare("SELECT id FROM rounds WHERE status='LOCKED' AND snapshot_hash IS NULL").all<{id:string}>();
  for(const row of frozen.results||[]) {
    const hash=await snapshotHash(await eligibleRows(env.DB,row.id));
    await env.DB.prepare("UPDATE rounds SET snapshot_hash=? WHERE id=? AND status='LOCKED' AND snapshot_hash IS NULL").bind(hash,row.id).run();
  }
  await env.DB.prepare('INSERT OR IGNORE INTO rounds(id,slug,title,opens_at,closes_at,notification_target_at) VALUES(?,?,?,?,?,?)')
    .bind(month.id,month.slug,month.title,month.opensAt,month.closesAt,new Date(Date.parse(month.endAt)-1).toISOString()).run();
  if(!env.SUPPORT_EMAIL||!env.TURNSTILE_SITE_KEY||!env.TURNSTILE_SECRET_KEY||!env.RATE_HASH_PEPPER||!env.SUBMIT_LIMITER||!env.EMAIL_LIMITER||!mailCredentialsReady(env))return;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO admin_audit_events(id,actor,action,round_id,meta_json) SELECT ?,'system:monthly','round.auto-open',id,'{}' FROM rounds WHERE slug=? AND status='DRAFT' AND opens_at<=? AND closes_at>? AND NOT EXISTS(SELECT 1 FROM rounds WHERE status='OPEN')").bind(crypto.randomUUID(),month.slug,now,now),
    env.DB.prepare("UPDATE rounds SET status='OPEN' WHERE slug=? AND status='DRAFT' AND opens_at<=? AND closes_at>? AND NOT EXISTS(SELECT 1 FROM rounds WHERE status='OPEN')").bind(month.slug,now,now)
  ]);
}
