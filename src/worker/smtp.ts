import type { Env } from './types';

export type MailMessage = {to:string;from:string;subject:string;text:string;html?:string;replyTo?:string};
export type SmtpSocket = {
  readable:ReadableStream<Uint8Array>; writable:WritableStream<Uint8Array>;
  close():Promise<void>;
};
const utf8Base64=(text:string)=>btoa(Array.from(new TextEncoder().encode(text),b=>String.fromCharCode(b)).join(''));
const address=(value:string)=>/^[^\s<>@\r\n]+@[^\s<>@\r\n]+$/.test(value);

// RFC 2047 encoded-words stay below 75 characters without splitting UTF-8 characters.
function encodedSubject(value:string){
 const words:string[]=[];let chunk='';
 for(const char of value){if(new TextEncoder().encode(chunk+char).length>42){words.push('=?UTF-8?B?'+utf8Base64(chunk)+'?=');chunk='';}chunk+=char;}
 if(chunk)words.push('=?UTF-8?B?'+utf8Base64(chunk)+'?=');
 return words.join('\r\n ');
}
const encodedBody=(value:string)=>utf8Base64(value).match(/.{1,76}/g)?.join('\r\n')||'';
export function buildMime(message:MailMessage,messageId:string){
 if(!address(message.from)||!address(message.to)||/[\r\n]/.test(message.subject)||(message.replyTo&&!address(message.replyTo)))
  throw Object.assign(new Error('Invalid mail envelope'),{code:'SMTP_REJECTED_INPUT'});
 const headers=['From: Relou <'+message.from+'>','To: <'+message.to+'>','Subject: '+encodedSubject(message.subject),
  'Date: '+new Date().toUTCString(),'Message-ID: '+messageId,'MIME-Version: 1.0',
  ...(message.replyTo?['Reply-To: <'+message.replyTo+'>']:[])];
 if(!message.html)return [...headers,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',encodedBody(message.text)].join('\r\n');
 const boundary='relou-'+crypto.randomUUID();
 return [...headers,'Content-Type: multipart/alternative; boundary="'+boundary+'"','',
  '--'+boundary,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',encodedBody(message.text),
  '--'+boundary,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',encodedBody(message.html),
  '--'+boundary+'--',''].join('\r\n');
}

// Implicit TLS only, fixed Gmail endpoint. No plaintext fallback or arbitrary SMTP host.
export async function smtpSession(socket:SmtpSocket, user:string, password:string, message:MailMessage) {
  if(!address(user)||!address(message.to)||message.from!==user||/[\r\n]/.test(message.subject)||(message.replyTo&&!address(message.replyTo)))
    throw Object.assign(new Error('Invalid mail envelope'),{code:'SMTP_REJECTED_INPUT'});
  const reader=socket.readable.getReader(),writer=socket.writable.getWriter();
  const encoder=new TextEncoder(),decoder=new TextDecoder();let buffer='';
  async function reply(expected:number){
    let bytes=0;
    while(true){
      const end=buffer.indexOf('\r\n');
      if(end<0){
        const chunk=await reader.read();if(chunk.done)throw new Error('SMTP connection closed');
        bytes+=chunk.value.byteLength;if(bytes>32768)throw new Error('SMTP reply too long');
        buffer+=decoder.decode(chunk.value,{stream:true});continue;
      }
      const line=buffer.slice(0,end);buffer=buffer.slice(end+2);
      const match=/^(\d{3})([ -])/.exec(line);if(!match)throw new Error('Invalid SMTP response');
      const code=Number(match[1]);
      if(code!==expected)throw Object.assign(new Error('SMTP rejected request'),{code:'SMTP_REJECTED_'+code});
      if(match[2]===' ')return;
    }
  }
  async function command(value:string,expected:number){await writer.write(encoder.encode(value+'\r\n'));await reply(expected);}
  const messageId='<'+crypto.randomUUID()+'@relou.jjmowlab.com>';
  try {
    await reply(220);
    await command('EHLO relou.jjmowlab.com',250);
    await command('AUTH LOGIN',334);
    await command(utf8Base64(user),334);
    await command(utf8Base64(password.replace(/\s/g,'')),235);
    await command('MAIL FROM:<'+message.from+'>',250);
    await command('RCPT TO:<'+message.to+'>',250);
    await command('DATA',354);
    const mime=buildMime(message,messageId);
    await writer.write(encoder.encode(mime+'\r\n.\r\n'));
    await reply(250); // Accepted by Gmail, not proof of inbox delivery.
    return {messageId};
  } finally {reader.releaseLock();writer.releaseLock();}
}

export function mailReady(env:Env){
  return env.EMAIL_DRY_RUN==='false' && env.EMAIL_ENABLED==='true' && mailCredentialsReady(env);
}
export function mailCredentialsReady(env:Env){
  if(!env.EMAIL_FROM)return false;
  return env.MAIL_PROVIDER==='gmail_smtp'
    ? !!env.GMAIL_SMTP_USER && !!env.GMAIL_SMTP_APP_PASSWORD && env.EMAIL_FROM===env.GMAIL_SMTP_USER
    : !!env.EMAIL;
}
export async function sendResult(env:Env,message:MailMessage){
  if(!mailReady(env))throw new Error('Mail is disabled or not configured');
  if(env.MAIL_PROVIDER!=='gmail_smtp')return env.EMAIL!.send(message);
  const {connect}=await import('cloudflare:sockets');
  const socket=connect({hostname:'smtp.gmail.com',port:465},{secureTransport:'on',allowHalfOpen:false});
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    return await Promise.race([
      smtpSession(socket,env.GMAIL_SMTP_USER!,env.GMAIL_SMTP_APP_PASSWORD!,message),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('SMTP timeout')),20000);})
    ]);
  } finally {clearTimeout(timer);await socket.close().catch(()=>{});}
}
