import { describe,expect,it } from 'vitest';
import { correctOrigin,verifyAdmin } from '../src/worker/auth';
import type { Env } from '../src/worker/types';
const env={
  CF_ACCESS_TEAM_DOMAIN:'https://example.cloudflareaccess.com',
  CF_ACCESS_AUD:'correct-admin-audience',
  ADMIN_EMAIL_ALLOWLIST:'admin@example.invalid'
} as Env;
describe('Cloudflare Access hardening',()=>{
  it('never accepts a missing or forged JWT header',async()=>{
    expect(await verifyAdmin(new Request('https://admin.relou.jjmowlab.com/'),env)).toBeNull();
    const forged=new Request('https://admin.relou.jjmowlab.com/',{
      headers:{'Cf-Access-Jwt-Assertion':'fake.payload.signature'}
    });
    expect(await verifyAdmin(forged,env)).toBeNull();
  });
  it('rejects arbitrary JWKS domains',async()=>{
    const bad={...env,CF_ACCESS_TEAM_DOMAIN:'https://evil.example.invalid'};
    const request=new Request('https://admin.relou.jjmowlab.com/',{
      headers:{'Cf-Access-Jwt-Assertion':'fake.payload.signature'}
    });
    expect(await verifyAdmin(request,bad)).toBeNull();
  });
  it('enforces exact Origin for browser mutations',()=>{
    expect(correctOrigin(new Request('https://relou.jjmowlab.com/api/entry',{
      method:'POST',headers:{Origin:'https://relou.jjmowlab.com'}
    }),'relou.jjmowlab.com')).toBe(true);
    expect(correctOrigin(new Request('https://relou.jjmowlab.com/api/entry',{
      method:'POST',headers:{Origin:'https://attacker.invalid'}
    }),'relou.jjmowlab.com')).toBe(false);
    expect(correctOrigin(new Request('http://localhost:8787/api/entry',{
      method:'POST',headers:{Origin:'http://localhost:8787'}
    }),'localhost')).toBe(true);
  });
});
