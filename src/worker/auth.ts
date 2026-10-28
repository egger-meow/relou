import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from './types';

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function verifyAdmin(request: Request, env: Env): Promise<string | null> {
  if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD || !env.ADMIN_EMAIL_ALLOWLIST) return null;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;
  try {
    const origin = new URL(env.CF_ACCESS_TEAM_DOMAIN);
    if (origin.protocol !== 'https:' || !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(origin.hostname) ||
        origin.pathname !== '/' || origin.username || origin.password) return null;
    const issuer = origin.origin;
    const certs = issuer + '/cdn-cgi/access/certs';
    let jwks = jwksCache.get(certs);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(certs));
      jwksCache.set(certs, jwks);
    }
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: env.CF_ACCESS_AUD,
      algorithms: ['RS256'],
      clockTolerance: 30
    });
    if (typeof payload.email !== 'string') return null;
    const email = payload.email.toLowerCase();
    const allow = env.ADMIN_EMAIL_ALLOWLIST.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    return allow.includes(email) ? email : null;
  } catch {
    return null;
  }
}

export function correctOrigin(request: Request, host: string): boolean {
  const origin = request.headers.get('Origin');
  // Browser POSTs must carry a same-origin Origin header.
  return origin === 'https://' + host ||
    (['localhost','127.0.0.1'].includes(host) && origin === 'http://' + host + ':8787');
}

export function adminMutationAllowed(request: Request, env: Env): boolean {
  const url = new URL(request.url);
  return url.hostname === env.ADMIN_HOST && correctOrigin(request, env.ADMIN_HOST) &&
    request.headers.get('Content-Type')?.toLowerCase().includes('application/json') === true;
}
