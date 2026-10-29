import { programById, PROGRAM_CATALOG_VERSION } from '../shared/programs';
import type { Hono } from 'hono';
import { entrySchema, normalizeEmail, contactForMatch, publicRound } from '../shared/schema';
import { sha256 } from '../matching/engine';
import { currentRound } from './db';
import { correctOrigin } from './auth';
import type { Env } from './types';

type App = Hono<{ Bindings: Env; Variables: { adminEmail: string } }>;
const headers = { 'Cache-Control': 'no-store' };

async function verifyTurnstile(token: string, ip: string, env: Env): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return false;
  try {
    const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip });
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: form, signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return false;
    const data = await response.json() as { success?: boolean; hostname?: string; metadata?: {result_with_testing_key?:boolean} };
    if (!data.success) return false;
    // Official dummy keys report example.com. Permit this only for the explicit local demo.
    if (env.ENVIRONMENT === 'local' && env.TURNSTILE_SECRET_KEY === '1x0000000000000000000000000000000AA' &&
        data.metadata?.result_with_testing_key === true) return true;
    if (env.ENVIRONMENT !== 'local' && !data.hostname) return false;
    if (data.hostname && data.hostname !== env.PUBLIC_HOST &&
      !(env.ENVIRONMENT === 'local' && ['localhost','127.0.0.1'].includes(data.hostname))) return false;
    return true;
  } catch {
    return false;
  }
}

export function registerPublic(app: App) {
  app.get('/api/public/config', c => c.json({
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || null,
    supportEmail: c.env.SUPPORT_EMAIL || null
  }, 200, { 'Cache-Control': 'public, max-age=60' }));

  app.get('/api/public/stats', async c => {
    const round = await currentRound(c.env.DB);
    if (!round) return c.json({
      round: null, activeSubmissionCount: 0, lifetimeSubmissionCount: null,
      previousRoundPairCount: null, asOf: new Date().toISOString()
    }, 200, { 'Cache-Control': 'public, max-age=60, s-maxage=60' });
    const count = round.purged_at ? { n: round.final_submission_count ?? 0 } : await c.env.DB.prepare("SELECT COUNT(*) AS n FROM entries WHERE round_id=? AND status='eligible'")
      .bind(round.id).first<{ n: number }>();
    const totalRounds = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM rounds').first<{ n: number }>();
    let lifetimeSubmissionCount: number | null = null;
    let previousRoundPairCount: number | null = null;
    if ((totalRounds?.n || 0) > 1) {
      const lifetime = await c.env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN r.purged_at IS NOT NULL THEN r.final_submission_count ELSE (SELECT COUNT(*) FROM entries e WHERE e.round_id=r.id AND e.status='eligible') END),0) AS n FROM rounds r").first<{ n: number }>();
      const previous = await c.env.DB.prepare(
        "SELECT id,purged_at,final_pair_count FROM rounds WHERE id <> ? AND status IN ('NOTIFIED','ARCHIVED') ORDER BY created_at DESC LIMIT 1"
      ).bind(round.id).first<{ id: string;purged_at:string|null;final_pair_count:number|null }>();
      if (previous?.id) {
        lifetimeSubmissionCount = lifetime?.n ?? 0;
        const pairs = previous.purged_at ? { n: previous.final_pair_count ?? 0 } : await c.env.DB.prepare('SELECT COUNT(*) AS n FROM matches WHERE round_id=?')
          .bind(previous.id).first<{ n: number }>();
        previousRoundPairCount = pairs?.n ?? 0;
      }
    }
    // Deliberately allowlist public keys; NEVER serialize entries, gender or demographic breakdowns.
    return c.json({
      round: publicRound(round),
      activeSubmissionCount: count?.n ?? 0,
      lifetimeSubmissionCount,
      previousRoundPairCount,
      asOf: new Date().toISOString()
    }, 200, { 'Cache-Control': 'public, max-age=60, s-maxage=60' });
  });

  app.post('/api/feedback', async c => {
    const host=new URL(c.req.url).hostname;
    const originHost=c.env.ENVIRONMENT==='local'&&['localhost','127.0.0.1'].includes(host)?host:c.env.PUBLIC_HOST;
    if(!correctOrigin(c.req.raw,originHost))return c.json({error:'來源不正確'},403,headers);
    if(!c.req.header('content-type')?.includes('application/json'))return c.json({error:'請使用 JSON'},415,headers);
    if(!c.env.RATE_HASH_PEPPER||!c.env.SUBMIT_LIMITER||!c.env.TURNSTILE_SECRET_KEY)return c.json({error:'回饋暫停收件'},503,headers);
    const raw=await c.req.text();if(raw.length>12000)return c.json({error:'資料太長'},413,headers);
    let body:Record<string,unknown>;try{body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw 0;}catch{return c.json({error:'格式錯誤'},400,headers);}
    const message=typeof body.message==='string'?body.message.trim():'';
    if(!message||message.length>2000||typeof body.turnstileToken!=='string'||body.turnstileToken.length>2048)return c.json({error:'請填寫 1～2000 字回饋'},400,headers);
    if(body.website)return c.json({ok:true},200,headers);
    const ip=c.req.header('CF-Connecting-IP')||'unknown';
    const key=await sha256(c.env.RATE_HASH_PEPPER+'|ip|'+ip);
    if(!(await c.env.SUBMIT_LIMITER.limit({key})).success)return c.json({error:'送出太頻繁，請稍後再試'},429,headers);
    if(!await verifyTurnstile(body.turnstileToken,ip,c.env))return c.json({error:'安全檢查未通過，請重新整理再試'},400,headers);
    await c.env.DB.prepare('INSERT INTO feedback(id,message) VALUES(?,?)').bind(crypto.randomUUID(),message).run();
    return c.json({ok:true},200,headers);
  });

  app.post('/api/entry', async c => {
    const requestHost = new URL(c.req.url).hostname;
    const allowedOriginHost = c.env.ENVIRONMENT === 'local' && ['localhost','127.0.0.1'].includes(requestHost) ? requestHost : c.env.PUBLIC_HOST;
    if (!correctOrigin(c.req.raw, allowedOriginHost)) return c.json({ error: '來源不正確' }, 403, headers);
    if (!c.req.header('content-type')?.toLowerCase().includes('application/json')) return c.json({ error: '請使用 JSON' }, 415, headers);
    if (!c.env.TURNSTILE_SECRET_KEY || !c.env.RATE_HASH_PEPPER || !c.env.SUBMIT_LIMITER || !c.env.EMAIL_LIMITER || !c.env.SUPPORT_EMAIL)
      return c.json({ error: '報名防護尚未設定，暫停收件' }, 503, headers);
    const round = await currentRound(c.env.DB);
    const now = new Date().toISOString();
    if (!round || round.status !== 'OPEN' || now < round.opens_at || now >= round.closes_at)
      return c.json({ error: '本期目前沒有開放報名' }, 409, headers);
    const body = await c.req.text();
    if (body.length > 10000) return c.json({ error: '資料太長' }, 413, headers);
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { return c.json({ error: '資料格式錯誤' }, 400, headers); }
    const result = entrySchema.safeParse(parsed);
    if (!result.success) return c.json({ error: '請檢查必填欄位', fields: result.error.issues.map(i => i.path.join('.')) }, 400, headers);
    const v = result.data;
    // Honeypot never creates an entry; return neutral response to avoid training bots.
    if (v.website) return c.json({ ok: true, roundTitle: round.title }, 200, headers);
    const ip = c.req.header('CF-Connecting-IP') || 'unknown';
    const ipKey = await sha256(c.env.RATE_HASH_PEPPER + '|ip|' + ip);
    const email = normalizeEmail(v.notificationEmail);
    const emailKey = await sha256(c.env.RATE_HASH_PEPPER + '|email|' + email);
    const [ipLimit, emailLimit] = await Promise.all([
      c.env.SUBMIT_LIMITER.limit({ key: ipKey }),
      c.env.EMAIL_LIMITER.limit({ key: emailKey })
    ]);
    if (!ipLimit.success || !emailLimit.success) return c.json({ error: '送出太頻繁，請稍後再試' }, 429, headers);
    if (!await verifyTurnstile(v.turnstileToken, ip, c.env))
      return c.json({ error: '安全檢查未通過，請重新整理再試' }, 400, headers);

    const answers = {
      schoolClaimed: v.schoolClaimed, gender: v.gender, desiredGenders: v.desiredGenders,
      degreeLevel:v.degreeLevel, programId:v.programId, departmentPreference:v.departmentPreference,
      departmentGroup:programById(v.programId)!.departmentGroup,programCatalogVersion:PROGRAM_CATALOG_VERSION,
      intent: v.intent, campusPreference: v.campusPreference, interests: v.interests, customInterests: v.customInterests || [],
      dayOffStyle: v.dayOffStyle, conflictStyle: v.conflictStyle, chatStyle: v.chatStyle,
      firstMeet: v.firstMeet, topValue: v.topValue,
      openAnswer: v.openAnswer || '', mbti: v.mbti || null, mbtiPreference: v.mbtiPreference || 'either'
    };
    const contact = contactForMatch(v);
    const id = crypto.randomUUID();
    try {
      // SELECT + ON CONFLICT keeps the round gate and per-round uniqueness in the database.
      const write = await c.env.DB.prepare(
        "INSERT INTO entries(id,round_id,normalized_email,nickname,school_claimed,gender,contact_kind,contact_value,answers_json,adult_attested,share_contact_consent,privacy_version) " +
        "SELECT ?,?,?,?,?,?,?,?,?,1,1,? FROM rounds WHERE id=? AND status='OPEN' AND opens_at<=? AND closes_at>? " +
        "ON CONFLICT(round_id,normalized_email) DO NOTHING"
      ).bind(id,round.id,email,v.nickname,v.schoolClaimed,v.gender,v.contactKind,contact,JSON.stringify(answers),
        v.privacyConsentVersion,round.id,now,now).run();
      if ((write.meta.changes || 0) === 0) {
        const check = await c.env.DB.prepare('SELECT status FROM rounds WHERE id=?').bind(round.id).first<{ status: string }>();
        if (check?.status !== 'OPEN') return c.json({ error: '本期已截止' }, 409, headers);
      }
      // A duplicate gets the same neutral response. No ownership lookup or overwrite.
      // Never send a registration/verification/confirmation email.
      return c.json({ ok: true, roundTitle: round.title }, 200, headers);
    } catch {
      return c.json({ error: '目前無法儲存報名，請稍後再試' }, 503, headers);
    }
  });
}
