import { INTERESTS, PRIVACY_VERSION } from '../shared/schema';
import type { EntryRow } from '../shared/schema';
export const RESULT_TEMPLATE_VERSION='result-v2';
type Context={roundTitle?:string;phase?:'early'|'final'};
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const validEmail=(value:string)=>/^[^\s<>@\r\n]+@[^\s<>@\r\n]+$/.test(value);
const p=(value:string)=>'<p style="margin:0 0 16px;line-height:1.85">'+escape(value)+'</p>';
const heading=(value:string)=>'<h2 style="font-size:17px;line-height:1.5;margin:28px 0 12px;color:#263e30">'+escape(value)+'</h2>';
function answers(row:EntryRow):Record<string,unknown>{
 try{const value:unknown=JSON.parse(row.answers_json);return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}catch{return {};}
}
function commonPoints(a:EntryRow,b:EntryRow){
 const x=answers(a),y=answers(b);
 const tags=(v:unknown)=>Array.isArray(v)?[...new Set(v.filter((tag):tag is string=>typeof tag==='string'&&(INTERESTS as readonly string[]).includes(tag)&&tag!=='其他'))]:[];
 const shared=tags(x.interests).filter(tag=>tags(y.interests).includes(tag));
 const points:string[]=shared.length?['共同興趣：'+shared.join('、')]:[];
 const mappings:Record<string,Record<string,string>>={
  firstMeet:{cafe:'都想從喝咖啡開始認識',walk:'都喜歡以散步作為第一次互動',sports:'都想一起參加運動或活動',food:'都想先一起吃點東西',chat_first:'都希望先在線上聊聊'},
  chatStyle:{often:'都喜歡分享日常小事',deep:'都偏好有話題時深入聊聊',meet:'都偏好見面互動'},
  topValue:{honesty:'都重視真誠溝通',ease:'都重視彼此相處自在',growth:'都重視一起成長',passion:'都重視共同熱愛的事'}
 };
 // Existing consent versions covered common interests, not additional answer summaries.
 if(a.privacy_version===PRIVACY_VERSION&&b.privacy_version===PRIVACY_VERSION)
 for(const [key,labels] of Object.entries(mappings))if(typeof x[key]==='string'&&x[key]===y[key]&&labels[x[key] as string])points.push(labels[x[key] as string]);
 return {shared,points:points.slice(0,3)};
}
function page(title:string,round:string,content:string,support:string){
 const supportText=support?'若未報名、誤收信、需要更正／刪除資料或停止後續聯絡，請聯絡：'+support+'。主辦者會人工核對處理。':'若未報名、誤收信或需要處理資料，請透過活動官方聯絡窗口提出，主辦者會人工核對。';
 const footer=p(supportText)+(validEmail(support)?'<p style="margin:0"><a style="color:#245b3d;text-decoration:underline" href="mailto:'+encodeURIComponent(support)+'">聯絡主辦者</a></p>':'');
 const html='<!doctype html><html lang="zh-Hant"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(title)+'</title></head><body style="margin:0;background:#ffffff;color:#27352d;font-family:Arial,\'Noto Sans TC\',sans-serif;font-size:15px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:24px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" align="center" style="max-width:600px"><tr><td style="padding-bottom:18px;border-bottom:2px solid #245b3d;font-size:19px;font-weight:bold">青椒配對 <span style="font-size:12px;font-weight:normal;color:#647168">'+escape(round)+'</span></td></tr><tr><td style="padding-top:24px"><h1 style="font-size:23px;line-height:1.5;margin:0 0 22px">'+escape(title)+'</h1>'+content+'</td></tr><tr><td style="padding-top:24px;border-top:1px solid #e1e6e2;color:#647168;font-size:12px;line-height:1.9">'+footer+'</td></tr></table></td></tr></table></body></html>';
 return {html,supportText};
}
export function resultEmail(person:EntryRow,other:EntryRow|null,support:string,context:Context={}){
 if(context.phase==='early'&&!other)throw new Error('Early unmatched notices are forbidden');
 const round=(context.roundTitle||'本期').replace(/[\r\n]/g,' '),early=context.phase==='early';
 const hello=person.nickname+'，你好！';
 if(!other){
  const title='本期沒有找到合適的配對';
  const paragraphs=['這一期沒有找到同時符合雙方意願的配對對象。謝謝你的參與，這不代表你不適合任何人。','本期報名已結束，不會再將你的聯絡方式提供給候選對象，也不會自動沿用至下一期。','想參加下一期，請在下個月 1～20 日重新填表並同意資料使用。你不需要回信或進行其他操作。'];
  const {html,supportText}=page(title,round,p(hello)+paragraphs.map(p).join(''),support);
  return {version:RESULT_TEMPLATE_VERSION,subject:'青椒配對｜'+round+'｜配對結果',text:[round,hello,'',...paragraphs.flatMap(v=>[v,'']),supportText].join('\n'),html};
 }
 if(other.share_contact_consent!==1)throw new Error('Contact sharing consent required');
 let contactLabel:string,contactValue:string,contactUrl:string;
 if(other.contact_kind==='instagram'){
  if(!/^@(?!\.)(?!.*\.\.)(?!.*\.$)[a-zA-Z0-9._]{1,30}$/.test(other.contact_value))throw new Error('Invalid shared IG');
  contactLabel='Instagram';contactValue=other.contact_value;contactUrl='https://www.instagram.com/'+encodeURIComponent(contactValue.slice(1))+'/';
 }else{
  if(!validEmail(other.contact_value)||other.contact_value!==other.normalized_email)throw new Error('Invalid opt-in shared email');
  contactLabel='Email';contactValue=other.contact_value;contactUrl='mailto:'+encodeURIComponent(contactValue);
 }
 const {shared,points}=commonPoints(person,other);
 const intro='你和「'+other.nickname+'」在'+round+'配對成功了。';
 const phase=early?'你們的興趣與相處偏好達到高度契合門檻，因此提前收到結果。本期配對已確定，不會再為你安排其他對象。':'這是本期正式配對結果。每人一期最多一位，本期不再重新配對。';
 const starter='嗨，我是'+person.nickname+'，我們透過青椒配對認識了！'+(shared.length?'看到我們都喜歡'+shared[0]+'，最近有沒有想分享的？':'最近有沒有讓你覺得很有趣的事？');
 const caveat='以上只摘要你們共同選擇的興趣與相處偏好，不代表戀愛成功率或關係保證。';
 const safety=['可以先傳一則簡短招呼；是否回覆、何時回覆，都由雙方自由決定。沒有回覆時，請尊重對方，不連續追問。','若決定見面，請選公開場所並告知可信任的人；不要提供金錢、密碼、證件或其他敏感資料。','請勿轉傳對方的聯絡方式。本活動未驗證信箱持有權、學生身分或年齡證件，請自行留意互動安全。'];
 const title=early?'你們提前配對成功了':'你們配對成功了';
 const pointsHtml=points.length?'<ul style="margin:0 0 16px;padding-left:22px;line-height:1.9">'+points.map(v=>'<li>'+escape(v)+'</li>').join('')+'</ul>':p('這次沒有可列出的明確共通點，可以先從近況開始聊聊。');
 const contactHtml='<p style="margin:0 0 8px;font-weight:bold">'+escape(other.nickname)+'</p><p style="margin:0 0 16px;line-height:1.8;word-break:break-word">'+escape(contactLabel)+'：<a style="color:#245b3d;text-decoration:underline" href="'+escape(contactUrl)+'">'+escape(contactValue)+'</a></p>';
 const content=p(hello)+p(intro)+p(phase)+heading('你們的共通點')+pointsHtml+p(caveat)+heading('對方同意分享的聯絡方式')+contactHtml+p('只提供對方主動選擇的這一種聯絡方式，請尊重彼此的聯絡意願。')+heading('可以這樣開始聊')+'<blockquote style="margin:0 0 24px;padding:14px 16px;border-left:3px solid #b8d1c0;background:#f5f8f5;line-height:1.9">'+escape(starter)+'</blockquote>'+heading('聯絡前，請留意')+safety.map(p).join('');
 const {html,supportText}=page(title,round,content,support);
 const text=[round,hello,'',intro,phase,'','你們的共通點',...(points.length?points.map(v=>'・'+v):['這次沒有可列出的明確共通點，可以先從近況開始聊聊。']),caveat,'','對方同意分享的聯絡方式',other.nickname,contactLabel+'：'+contactValue,...(other.contact_kind==='instagram'?[contactUrl]:[]),'只提供對方主動選擇的這一種聯絡方式。','','可以這樣開始聊','「'+starter+'」','','聯絡前，請留意',...safety.flatMap(v=>[v,'']),supportText].join('\n');
 return {version:RESULT_TEMPLATE_VERSION,subject:'青椒配對｜'+round+'｜'+(early?'提前配對成功':'配對成功'),text,html};
}
export function maskedPreview(subject:string){return {subject,text:'（隱私遮罩）不顯示實際收件者與配對資料。合成模板範例請見本機產生的預覽；真實信件只由後端從 outbox 寄出。'};}
