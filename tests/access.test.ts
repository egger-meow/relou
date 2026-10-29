import { describe,expect,it,vi } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { correctOrigin,verifyAdmin } from '../src/worker/auth';
import type { Env } from '../src/worker/types';
const env={
  CF_ACCESS_TEAM_DOMAIN:'https://example.cloudflareaccess.com',
  CF_ACCESS_AUD:'correct-admin-audience',
  ADMIN_EMAIL_ALLOWLIST:'admin@example.invalid'
} as Env;
describe('Cloudflare Access hardening',()=>{
  it('requires signed tokens with expiry, correct audience, issuer and exact operator email',async()=>{
    const {privateKey,publicKey}=await generateKeyPair('RS256');
    const jwk={...await exportJWK(publicKey),kid:'synthetic-test',alg:'RS256',use:'sig'};
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({keys:[jwk]})));
    try {
      for (const variant of ['valid','no-expiry','expired','wrong-audience','wrong-issuer','wrong-email']) {
        const issuer='https://'+variant+'.cloudflareaccess.com';
        let jwt=new SignJWT({email:variant==='wrong-email'?'attacker@example.invalid':'admin@example.invalid'})
          .setProtectedHeader({alg:'RS256',kid:'synthetic-test'})
          .setIssuer(variant==='wrong-issuer'?'https://other.cloudflareaccess.com':issuer)
          .setAudience(variant==='wrong-audience'?'another-app':'correct-admin-audience');
        if (variant!=='no-expiry') jwt=jwt.setExpirationTime(variant==='expired'?Math.floor(Date.now()/1000)-120:'5m');
        const request=new Request('https://admin.relou.jjmowlab.com/',{
          headers:{'Cf-Access-Jwt-Assertion':await jwt.sign(privateKey)}
        });
        expect(await verifyAdmin(request,{...env,CF_ACCESS_TEAM_DOMAIN:issuer}))
          .toBe(variant==='valid'?'admin@example.invalid':null);
      }
    } finally {vi.unstubAllGlobals();}
  });
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
