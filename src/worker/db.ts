import type { Env } from './types';
import type { EntryRow, RoundRow } from '../shared/schema';

export async function currentRound(db: D1Database, time=Date.now()): Promise<RoundRow | null> {
  const now=new Date(time).toISOString();
  return db.prepare("SELECT * FROM rounds ORDER BY CASE WHEN opens_at<=? THEN 0 ELSE 1 END, CASE WHEN opens_at<=? THEN opens_at END DESC, opens_at ASC LIMIT 1").bind(now,now).first<RoundRow>();
}
export async function roundById(db: D1Database, id: string): Promise<RoundRow | null> {
  return db.prepare('SELECT * FROM rounds WHERE id = ?').bind(id).first<RoundRow>();
}
export async function eligibleRows(db: D1Database, id: string): Promise<EntryRow[]> {
  const r = await db.prepare("SELECT * FROM entries WHERE round_id=? AND status='eligible' AND NOT EXISTS (SELECT 1 FROM match_members m WHERE m.round_id=entries.round_id AND m.entry_id=entries.id) ORDER BY id").bind(id).all<EntryRow>();
  return r.results || [];
}
export async function audit(env: Env, actor: string, action: string, roundId: string | null, meta: object = {}) {
  await env.DB.prepare('INSERT INTO admin_audit_events(id,actor,action,round_id,meta_json) VALUES(?,?,?,?,?)')
    .bind(crypto.randomUUID(),actor,action,roundId,JSON.stringify(meta)).run();
}
export function isoNow() { return new Date().toISOString(); }
export function fail(message: string, status = 400) { return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } }); }
