import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { request } from 'node:https';
import { Resolver } from 'node:dns/promises';
const publicOrigin='https://relou.jjmowlab.com';
const adminOrigin='https://admin.relou.jjmowlab.com';
async function get(url,init={}){
  if(!process.argv.includes('--public-dns'))return fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000),...init});
  // Resolve fresh custom domains without changing the machine's DNS/cache. TLS validation stays enabled.
  const resolver=new Resolver();resolver.setServers(['1.1.1.1']);
  const ips=await resolver.resolve4(new URL(url).hostname);
  return new Promise((resolve,reject)=>{
    const req=request(url,{headers:init.headers,lookup:(_name,options,callback)=>{
      callback(null,options.all?[{address:ips[0],family:4}]:ips[0],4);
    }},res=>{
      const parts=[];res.on('data',part=>parts.push(part));res.on('end',()=>resolve(new Response(Buffer.concat(parts),{status:res.statusCode,headers:res.headers})));
    });
    req.setTimeout(15000,()=>req.destroy(new Error('HTTPS timeout')));req.on('error',reject);req.end();
  });
}
const page=await get(publicOrigin);assert.equal(page.status,200);
assert.match(page.headers.get('content-type'),/text\/html/);
const stats=await get(publicOrigin+'/api/public/stats');assert.equal(stats.status,200);
const data=await stats.json();
assert.deepEqual(Object.keys(data).sort(),['round','activeSubmissionCount','lifetimeSubmissionCount','previousRoundPairCount','asOf'].sort());
assert.doesNotMatch(JSON.stringify(data),/gender|desiredGenders|email|contact|schoolClaimed|intent|mbti/i);
if(data.round){
  assert.deepEqual(Object.keys(data.round).sort(),['slug','title','status','opensAt','closesAt','notificationTargetAt'].sort());
  assert.ok(Date.parse(data.round.opensAt)<Date.parse(data.round.closesAt));
}
assert.ok(Number.isInteger(data.activeSubmissionCount)&&data.activeSubmissionCount>=0);
for(const path of ['/admin','/api/admin/dashboard','/api/admin/health']){
  const res=await get(publicOrigin+path,{headers:{'Cf-Access-Jwt-Assertion':'forged'}});assert.equal(res.status,404);
}
const adminAsset=readdirSync('dist/assets').find(name=>/^admin-.*\.js$/.test(name));assert.ok(adminAsset);
assert.equal((await get(publicOrigin+'/assets/'+adminAsset)).status,404);
for(const path of ['/','/api/admin/dashboard','/assets/'+adminAsset]){
  const response=await get(adminOrigin+path);
  assert.ok([302,303].includes(response.status),'Admin must redirect to Access: '+path);
  assert.equal(new URL(response.headers.get('location')).hostname,'quiet-leaf-d9e5.cloudflareaccess.com');
}
console.log('PASS: HTTPS public page, safe real D1 stats, no public demographics, public admin routes/assets denied, entire admin host redirects to Access. No participant data written or mail sent.');
