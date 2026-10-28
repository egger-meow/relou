import { describe,expect,it } from 'vitest';
import worker from '../src/worker/index';
import type { Env } from '../src/worker/types';
const round={id:'r1',slug:'round-1',title:'第 1 期',status:'OPEN',opens_at:'2026-10-28T00:00:00.000Z',
  closes_at:'2026-11-08T00:00:00.000Z',notification_target_at:null,min_pair_score:55,snapshot_hash:null,send_paused:1,created_at:'2026-10-28T00:00:00.000Z'};
function env():Env{
  return {
    PUBLIC_HOST:'relou.jjmowlab.com',ADMIN_HOST:'admin.relou.jjmowlab.com',
    PUBLIC_SITE_URL:'https://relou.jjmowlab.com',ENVIRONMENT:'production',
    TURNSTILE_SITE_KEY:'test',EMAIL_DRY_RUN:'true',EMAIL_ENABLED:'false',EMAIL_FROM:'',SUPPORT_EMAIL:'contact@example.invalid',
    ASSETS:{fetch:async()=>new Response('<html/>',{headers:{'Content-Type':'text/html'}})},
    DB:{prepare:(sql:string)=>({
      bind(){return this;},
      async first(){if(sql.includes('FROM rounds ORDER BY'))return round;if(sql.includes('COUNT(*) AS n FROM rounds'))return {n:1};return {n:4};},
      async all(){return {results:[]};}
    })} as unknown as D1Database
  };
}
const ctx={} as ExecutionContext;
describe('host isolation and public privacy',()=>{
  it('denies admin paths on public hostname even with forged Access header',async()=>{
    const res=await worker.fetch(new Request('https://relou.jjmowlab.com/api/admin/dashboard',{headers:{'Cf-Access-Jwt-Assertion':'fake'}}),env(),ctx);
    expect(res.status).toBe(404);
  });
  it('denies preview/workers.dev admin bypass',async()=>{
    const res=await worker.fetch(new Request('https://relou-test.workers.dev/api/admin/dashboard'),env(),ctx);
    expect(res.status).toBe(404);
  });
  it('fails closed on admin hostname without Access configuration',async()=>{
    const res=await worker.fetch(new Request('https://admin.relou.jjmowlab.com/'),env(),ctx);
    expect(res.status).toBe(503);
  });
  it('public stats contain only safe aggregate keys',async()=>{
    const res=await worker.fetch(new Request('https://relou.jjmowlab.com/api/public/stats'),env(),ctx);
    expect(res.status).toBe(200);
    const data=await res.json() as Record<string,unknown>;
    expect(Object.keys(data).sort()).toEqual(['activeSubmissionCount','asOf','lifetimeSubmissionCount','previousRoundPairCount','round'].sort());
    expect(JSON.stringify(data)).not.toMatch(/gender|email|desiredGenders|contact|intent|schoolClaimed|MBTI/i);
  });
  it('registration fails closed when anti-abuse bindings are not configured',async()=>{
    const res=await worker.fetch(new Request('https://relou.jjmowlab.com/api/entry',{
      method:'POST',headers:{'Origin':'https://relou.jjmowlab.com','Content-Type':'application/json'},body:'{}'
    }),env(),ctx);
    expect(res.status).toBe(503);
  });
});
