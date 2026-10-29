import { audit } from './db';
import { mailReady, sendResult } from './smtp';
import type { Env } from './types';
type Outbox = {id:string;recipient_email:string;subject:string;text_body:string;state:string;attempts:number};
export async function dispatchMail(env:Env,roundId:string,actor:string,earlyOnly=false) {
 if(!mailReady(env))throw new Error('Mail disabled');
    const pending = await env.DB.prepare(
      "SELECT id,recipient_email,subject,text_body,state,attempts FROM email_outbox WHERE round_id=? AND state='queued' AND (?=0 OR phase='early') ORDER BY created_at,id LIMIT ?"
    ).bind(roundId,earlyOnly?1:0,earlyOnly?4:10).all<Outbox>();
    let sent=0,uncertain=0,failed=0;
    for (const item of pending.results||[]) {
      // Each message is claimed by exactly one Worker; crashes leave 'sending' for manual reconciliation.
      const claimed = await env.DB.prepare(
        "UPDATE email_outbox SET state='sending',attempts=attempts+1,claimed_at=? WHERE id=? AND state='queued' " +
        "AND attempts<3 AND EXISTS (SELECT 1 FROM rounds WHERE id=email_outbox.round_id AND ((status='MATCHED' AND send_paused=0) OR (email_outbox.phase='early' AND early_paused=0 AND status IN ('OPEN','LOCKED','MATCHED')))) RETURNING id"
      ).bind(new Date().toISOString(),item.id).first<{id:string}>();
      if (!claimed) continue;
      try {
        const result = await sendResult(env,{
          to:item.recipient_email,from:env.EMAIL_FROM,subject:item.subject,text:item.text_body
        });
        const providerId = result && typeof result==='object' && 'messageId' in result
          ? String((result as {messageId:unknown}).messageId) : null;
        await env.DB.prepare(
          "UPDATE email_outbox SET state='sent',sent_at=?,provider_message_id=?,error_code=NULL WHERE id=? AND state='sending'"
        ).bind(new Date().toISOString(),providerId,item.id).run();
        sent++;
      } catch (e) {
        const code = e && typeof e==='object' && 'code' in e ? String((e as {code:unknown}).code) : 'UNKNOWN';
        const knownRejected = /^SMTP_REJECTED_/.test(code) || ['E_VALIDATION_ERROR','E_FIELD_MISSING','E_SENDER_NOT_VERIFIED',
          'E_RECIPIENT_NOT_ALLOWED','E_RECIPIENT_SUPPRESSED','E_ACCOUNT_SUSPENDED',
          'E_SENDER_DOMAIN_NOT_AVAILABLE','E_CONTENT_TOO_LARGE','E_RATE_LIMIT_EXCEEDED',
          'E_DAILY_LIMIT_EXCEEDED','INVALID_RECIPIENT','INVALID_SENDER','VALIDATION_ERROR'].includes(code);
        await env.DB.prepare(
          "UPDATE email_outbox SET state=?,error_code=? WHERE id=? AND state='sending'"
        ).bind(knownRejected?'failed':'uncertain',code.slice(0,60),item.id).run();
        if (knownRejected) failed++; else uncertain++;
      }
    }
    const remaining = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM email_outbox WHERE round_id=? AND state IN ('queued','sending','failed','uncertain')"
    ).bind(roundId).first<{n:number}>();
    if ((remaining?.n??1)===0) {
      await env.DB.prepare("UPDATE rounds SET status='NOTIFIED',send_paused=1 WHERE id=? AND status='MATCHED'").bind(roundId).run();
    }
    await audit(env,actor,earlyOnly?'mail.early-send-batch':'mail.send_batch',roundId,{sent,uncertain,failed,remaining:remaining?.n});

 return {ok:true,sent,uncertain,failed,remaining:remaining?.n||0};
}
