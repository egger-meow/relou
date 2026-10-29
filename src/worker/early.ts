import { ALGORITHM_VERSION, computePlan, fromRow, planDigest, snapshotHash } from '../matching/engine';
import { eligibleRows, roundById } from './db';
import { resultEmail } from './mail';
import { mailReady } from './smtp';
import { dispatchMail } from './dispatch';
import type { Env } from './types';
export const EARLY_MIN_SCORE=90;
export async function earlyPlan(env:Env,id:string) {
 const round=await roundById(env.DB,id);
 if(!round||round.status!=='OPEN'||round.early_paused===1)throw new Error('Early matching paused or round closed');
 const rows=await eligibleRows(env.DB,id),hash=await snapshotHash(rows);
 const candidates=rows.map(fromRow).map(c=>({...c,answers:{...c.answers,interests:c.answers.interests.filter(tag=>tag!=='其他')}})).filter(c=>c.answers.interests.length>0);
 const complete=computePlan(candidates,Math.max(EARLY_MIN_SCORE,round.min_pair_score),(a,b)=>
  a.answers.interests.some(tag=>tag!=='其他'&&b.answers.interests.includes(tag)));
 const pairs=[...complete.pairs].sort((a,b)=>b.score-a.score||a.a.localeCompare(b.a)).slice(0,2);
 const scores=pairs.map(p=>p.score).sort((a,b)=>a-b);
 const plan={...complete,pairs,unmatchedCount:complete.eligibleCount-pairs.length*2,
  matchRate:complete.eligibleCount?Math.round(pairs.length*20000/complete.eligibleCount)/100:0,
  meanScore:scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*100)/100:null,
  medianScore:scores.length?scores.length===1?scores[0]:(scores[0]+scores[1])/2:null};
 const digest=await planDigest(id,hash,plan);
 return {round,rows,hash,plan,digest};
}
export async function commitEarly(env:Env,id:string) {
 // Do not reserve real people while the global mail execution gate is closed.
 if(env.EARLY_MATCHING_ENABLED!=='true'||!mailReady(env))return {pairs:0};
 const {round,rows,hash,plan,digest}=await earlyPlan(env,id);
 const now=new Date().toISOString();
 if(now<round.opens_at||now>=round.closes_at||!plan.pairs.length)return {pairs:0};
 const existing=await env.DB.prepare('SELECT id FROM match_runs WHERE round_id=?').bind(id).first<{id:string}>();
 const runId=existing?.id||'round-run:'+id,batchId=crypto.randomUUID();
 const statements=[
  env.DB.prepare('INSERT OR IGNORE INTO match_runs(id,round_id,snapshot_hash,plan_digest,algorithm_version,metrics_json) VALUES(?,?,?,?,?,?)')
   .bind(runId,id,hash,digest,ALGORITHM_VERSION,JSON.stringify({phase:'early',matchedPairs:plan.pairs.length})),
  env.DB.prepare("INSERT INTO allocation_batches(id,round_id,phase,snapshot_hash,plan_digest,algorithm_version,metrics_json,observed_at) VALUES(?,?,'early',?,?,?,?,?)")
   .bind(batchId,id,hash,digest,ALGORITHM_VERSION,JSON.stringify({minScore:Math.max(EARLY_MIN_SCORE,round.min_pair_score),matchedPairs:plan.pairs.length}),now)
 ];
 const byId=new Map(rows.map(r=>[r.id,r]));
 // Bounded chunks keep the number of statements within practical D1 invocation limits.
 for(const pair of plan.pairs) {
  const matchId=crypto.randomUUID(),a=byId.get(pair.a)!,b=byId.get(pair.b)!;
  statements.push(env.DB.prepare('INSERT INTO matches(id,round_id,run_id,a_id,b_id,score,batch_id) VALUES(?,?,?,?,?,?,?)')
   .bind(matchId,id,runId,a.id,b.id,pair.score,batchId));
  for(const [person,other] of [[a,b],[b,a]]) {
   const message=resultEmail(person,other,env.SUPPORT_EMAIL,{roundTitle:round.title,phase:'early'});
   statements.push(env.DB.prepare('INSERT INTO match_members(round_id,entry_id,match_id) VALUES(?,?,?)').bind(id,person.id,matchId));
   statements.push(env.DB.prepare("INSERT INTO email_outbox(id,round_id,run_id,entry_id,dedupe_key,recipient_email,subject,text_body,phase,batch_id,html_body,template_version) VALUES(?,?,?,?,?,?,?,?,'early',?,?,?)")
    .bind(crypto.randomUUID(),id,runId,person.id,id+':'+person.id+':v1',person.normalized_email,message.subject,message.text,batchId,message.html,message.version));
  }
 }
 statements.push(env.DB.prepare("INSERT INTO admin_audit_events(id,actor,action,round_id,meta_json) VALUES(?,'system:early','matching.early-commit',?,?)")
  .bind(crypto.randomUUID(),id,JSON.stringify({batchId,minScore:Math.max(EARLY_MIN_SCORE,round.min_pair_score),pairs:plan.pairs.length,digest})));
 await env.DB.batch(statements); // Any reservation collision or changed round rolls back the entire batch.
 return {pairs:plan.pairs.length};
}
export async function runEarlySchedule(env:Env) {
 if(env.EARLY_MATCHING_ENABLED!=='true'||!mailReady(env))return;
 const now=new Date().toISOString();
 const open=await env.DB.prepare("SELECT id FROM rounds WHERE status='OPEN' AND early_paused=0 AND opens_at<=? AND closes_at>?").bind(now,now).all<{id:string}>();
 for(const r of open.results||[])await commitEarly(env,r.id);
 const pending=await env.DB.prepare("SELECT DISTINCT r.id FROM rounds r JOIN email_outbox o ON o.round_id=r.id WHERE r.status IN ('OPEN','LOCKED','MATCHED') AND r.early_paused=0 AND o.phase='early' AND o.state='queued' LIMIT 1").all<{id:string}>();
 for(const r of pending.results||[])await dispatchMail(env,r.id,'system:early',true);
}
