import { describe,expect,it } from 'vitest';
import { buildMime,mailReady,smtpSession } from '../src/worker/smtp';
import type { Env } from '../src/worker/types';

const message={to:'synthetic@example.invalid',from:'sender@example.invalid',subject:'Relou｜結果通知',text:'合成測試\n.不是真信'};
function fakeSocket(responses:string[]){
  const writes:string[]=[];
  const readable=new ReadableStream<Uint8Array>({start(controller){
    // Split responses across arbitrary TCP chunk boundaries.
    const text=responses.join('\r\n')+'\r\n';
    for(let i=0;i<text.length;i+=7)controller.enqueue(new TextEncoder().encode(text.slice(i,i+7)));
    controller.close();
  }});
  return {writes,readable,writable:new WritableStream<Uint8Array>({write(chunk){writes.push(new TextDecoder().decode(chunk));}}),async close(){}};
}
describe('Gmail SMTP over TLS protocol (synthetic socket)',()=>{
  it('handles multiline replies and UTF-8 MIME, one recipient, accepted result',async()=>{
    const socket=fakeSocket(['220 ready','250-smtp.gmail.com','250 AUTH LOGIN','334 username','334 password','235 authenticated','250 sender','250 recipient','354 data','250 accepted']);
    const result=await smtpSession(socket,message.from,'synthetic-app-password',message);
    expect(result.messageId).toMatch(/^<.+@relou.jjmowlab.com>$/);
    expect(socket.writes.slice(0,6)).toEqual(['EHLO relou.jjmowlab.com\r\n','AUTH LOGIN\r\n',btoa(message.from)+'\r\n',btoa('synthetic-app-password')+'\r\n','MAIL FROM:<sender@example.invalid>\r\n','RCPT TO:<synthetic@example.invalid>\r\n']);
    const mime=socket.writes.at(-1)!;
    expect(mime).toContain('Subject: =?UTF-8?B?');
    expect(mime).toContain('Content-Transfer-Encoding: base64');
    expect(mime).not.toMatch(/Bcc:|Cc:/i);
    expect(mime.endsWith('\r\n.\r\n')).toBe(true);
  });
  it('returns only a safe rejection code when Gmail refuses authentication',async()=>{
    const socket=fakeSocket(['220 ready','250 ready','334 username','334 password','535 rejected secret details']);
    await expect(smtpSession(socket,message.from,'synthetic',message)).rejects.toMatchObject({code:'SMTP_REJECTED_535',message:'SMTP rejected request'});
    expect(socket.writes.join('')).not.toContain('MAIL FROM');
  });
  it('fails uncertain if the connection closes after DATA without acceptance',async()=>{
    const socket=fakeSocket(['220 ready','250 ready','334 username','334 password','235 ok','250 ok','250 ok','354 data']);
    await expect(smtpSession(socket,message.from,'synthetic',message)).rejects.toThrow('SMTP connection closed');
  });
  it('blocks header injection, sender spoofing and incomplete/dry-run configuration',async()=>{
    await expect(smtpSession(fakeSocket([]),message.from,'synthetic',{...message,subject:'bad\r\nBcc: injected'})).rejects.toMatchObject({code:'SMTP_REJECTED_INPUT'});
    const configured={MAIL_PROVIDER:'gmail_smtp',EMAIL_FROM:message.from,GMAIL_SMTP_USER:message.from,GMAIL_SMTP_APP_PASSWORD:'synthetic',EMAIL_DRY_RUN:'false',EMAIL_ENABLED:'true'} as Env;
    expect(mailReady(configured)).toBe(true);
    expect(mailReady({...configured,EMAIL_DRY_RUN:'true'})).toBe(false);
    expect(mailReady({...configured,GMAIL_SMTP_APP_PASSWORD:''})).toBe(false);
    expect(mailReady({...configured,EMAIL_FROM:'spoof@example.invalid'})).toBe(false);
  });
});

it('builds UTF-8 multipart alternatives with folded long subject and a safe reply address',()=>{
 const subject='Relou｜2026 年 11 月期 · 第 1 期｜提前配對成功，這是一個很長的中文主旨';
 const html='<html lang="zh-Hant"><body>共同興趣：音樂</body></html>';
 const mime=buildMime({...message,subject,html,replyTo:'support@example.invalid'},'<synthetic@relou.jjmowlab.com>');
 expect(mime).toContain('From: =?UTF-8?B?6Z2S5qSS6YWN5bCN?= <sender@example.invalid>');expect(mime).toContain('Reply-To: <support@example.invalid>');
 expect(mime).toContain('multipart/alternative');expect(mime.indexOf('text/plain')).toBeLessThan(mime.indexOf('text/html'));
 const decode=(v:string)=>new TextDecoder().decode(Uint8Array.from(atob(v),c=>c.charCodeAt(0)));
 const words=[...(mime.match(/Subject: ([\s\S]*?)\r\nDate:/)?.[1]||'').matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)];
 expect(words.length).toBeGreaterThan(1);expect(words.every(w=>w[0].length<=75)).toBe(true);
 expect(words.map(w=>decode(w[1])).join('')).toBe(subject);
 const bodies=[...mime.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--relou-/g)];
 expect(bodies.map(m=>decode(m[1].replace(/\r\n/g,'')))).toEqual([message.text,html]);
 expect(()=>buildMime({...message,replyTo:'bad\r\nBcc: leak'},'<id>')).toThrow();
});
