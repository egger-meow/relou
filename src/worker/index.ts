import { Hono } from 'hono';
import { registerPublic } from './public';
import { registerAdmin } from './admin';
import { verifyAdmin } from './auth';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env; Variables: { adminEmail: string } }>();
registerPublic(app);
registerAdmin(app);
app.notFound(c => c.json({ error: 'Not found' },404));
app.onError((_error,c) => c.json({ error: '服務暫時無法處理請求' },500,{ 'Cache-Control':'no-store' }));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const isAdmin = url.hostname === env.ADMIN_HOST;
    const isPublic = url.hostname === env.PUBLIC_HOST ||
      (env.ENVIRONMENT === 'local' && ['localhost','127.0.0.1'].includes(url.hostname));
    if (!isAdmin && !isPublic) return new Response('Not found', {status:404});
    if (isPublic && (url.pathname.startsWith('/api/admin/') || url.pathname.startsWith('/admin') ||
        url.pathname.startsWith('/assets/admin-'))) {
      return new Response('Not found', {status:404});
    }
    if (isAdmin) {
      // Guard the ENTIRE admin hostname including JS/CSS/HTML, even when Access is misconfigured.
      if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD || !env.ADMIN_EMAIL_ALLOWLIST)
        return new Response('Cloudflare Access admin configuration required',{status:503});
      if (!await verifyAdmin(request,env)) return new Response('Access denied',{status:401});
      if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/admin/'))
        return new Response('Not found',{status:404});
    }
    if (url.pathname.startsWith('/api/')) return app.fetch(request,env,ctx);
    if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405});
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options','nosniff');
    headers.set('Referrer-Policy','strict-origin-when-cross-origin');
    headers.set('X-Frame-Options','DENY');
    headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    if (isAdmin) headers.set('Cache-Control','no-store');
    return new Response(response.body,{status:response.status,headers});
  }
};
