import type { Env } from './types';

export type MailMessage = {to:string;from:string;subject:string;text:string};
export type SmtpSocket = {
  readable:ReadableStream<Uint8Array>; writable:WritableStream<Uint8Array>;
  close():Promise<void>;
};
const utf8Base64=(text:string)=>btoa(Array.from(new TextEncoder().encode(text),b=>String.fromCharCode(b)).join(''));
const address=(value:string)=>/^[^\s<>@\r\n]+@[^\s<>@\r\n]+$/.test(value);

// Implicit TLS only, fixed Gmail endpoint. No plaintext fallback or arbitrary SMTP host.
export async function smtpSession(socket:SmtpSocket, user:string, password:string, message:MailMessage) {
  if(!address(user)||!address(message.to)||message.from!==user||/[\r\n]/.test(message.subject))
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
    const encoded=utf8Base64(message.text).match(/.{1,76}/g)?.join('\r\n')||'';
    const mime=['From: <'+message.from+'>','To: <'+message.to+'>',
      'Subject: =?UTF-8?B?'+utf8Base64(message.subject)+'?=',
      'Date: '+new Date().toUTCString(),'Message-ID: '+messageId,'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',encoded].join('\r\n');
    await writer.write(encoder.encode(mime+'\r\n.\r\n'));
    await reply(250); // Accepted by Gmail, not proof of inbox delivery.
    return {messageId};
  } finally {reader.releaseLock();writer.releaseLock();}
}

export function mailReady(env:Env){
  if(env.EMAIL_DRY_RUN!=='false'||env.EMAIL_ENABLED!=='true'||!env.EMAIL_FROM)return false;
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
