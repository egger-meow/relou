import type { Env } from './types';
import type { EntryRow, RoundRow } from '../shared/schema';

export async function currentRound(db: D1Database): Promise<RoundRow | null> {
  return db.prepare("SELECT * FROM rounds ORDER BY CASE status WHEN 'OPEN' THEN 0 WHEN 'DRAFT' THEN 1 ELSE 2 END, created_at DESC LIMIT 1").first<RoundRow>();
}
export async function roundById(db: D1Database, id: string): Promise<RoundRow | null> {
  return db.prepare('SELECT * FROM rounds WHERE id = ?').bind(id).first<RoundRow>();
}
export async function eligibleRows(db: D1Database, id: string): Promise<EntryRow[]> {
  const r = await db.prepare("SELECT * FROM entries WHERE round_id=? AND status='eligible' ORDER BY id").bind(id).all<EntryRow>();
  return r.results || [];
}
export async function audit(env: Env, actor: string, action: string, roundId: string | null, meta: object = {}) {
  await env.DB.prepare('INSERT INTO admin_audit_events(id,actor,action,round_id,meta_json) VALUES(?,?,?,?,?)')
    .bind(crypto.randomUUID(),actor,action,roundId,JSON.stringify(meta)).run();
}
export function isoNow() { return new Date().toISOString(); }
export function fail(message: string, status = 400) { return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } }); }
