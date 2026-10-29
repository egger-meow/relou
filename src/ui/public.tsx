import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { entrySchema, INTERESTS, PRIVACY_VERSION } from '../shared/schema';
import type { EntryInput } from '../shared/schema';

type Draft = Omit<EntryInput,'adultAttested'|'shareContactConsent'|'privacyConsentVersion'|'turnstileToken'> & {
  adultAttested: boolean; shareContactConsent: boolean; privacyConsentVersion: string;
};
type Stats = {round:{slug:string;title:string;status:string;opensAt:string;closesAt:string;notificationTargetAt:string|null}|null;
  activeSubmissionCount:number;lifetimeSubmissionCount:number|null;previousRoundPairCount:number|null;asOf:string};
type Config = {turnstileSiteKey:string|null;supportEmail:string|null};
type Choice = {value:string;label:string};
declare global {
  interface Window {
    turnstile?: {render(element:HTMLElement,options:Record<string,unknown>):string;reset(id?:string):void;remove(id:string):void};
  }
}

const choices = {
  schoolClaimed:[{value:'NYCU',label:'陽明交大'},{value:'NTHU',label:'清大'}],
  gender:[{value:'man',label:'男'},{value:'woman',label:'女'},{value:'nonbinary',label:'非二元'},{value:'other',label:'其他'},{value:'undisclosed',label:'不想說'}],
  desiredGenders:[{value:'man',label:'男'},{value:'woman',label:'女'},{value:'nonbinary_or_other',label:'非二元／其他'},{value:'all',label:'都可以'}],
  intent:[{value:'friends',label:'交新朋友'},{value:'dating',label:'約會看看'},{value:'either',label:'都可以'}],
  campusPreference:[{value:'same_school',label:'只限同校'},{value:'either_school',label:'清交都可以'}],
  dayOffStyle:[{value:'plan',label:'先規劃'},{value:'spontaneous',label:'隨興'},{value:'both',label:'都行'}],
  conflictStyle:[{value:'listen',label:'先聽懂彼此'},{value:'direct',label:'直接說清楚'},{value:'depends',label:'看情況'}],
  chatStyle:[{value:'often',label:'常常分享小事'},{value:'deep',label:'有話深聊'},{value:'meet',label:'比較愛見面'}],
  firstMeet:[{value:'cafe',label:'咖啡'},{value:'walk',label:'散步'},{value:'sports',label:'運動／活動'},{value:'food',label:'吃東西'},{value:'chat_first',label:'先線上聊'}],
  topValue:[{value:'honesty',label:'真誠溝通'},{value:'ease',label:'彼此自在'},{value:'growth',label:'一起成長'},{value:'passion',label:'相同熱愛'}]
} satisfies Record<string,Choice[]>;

const initial:Draft = {
  schoolClaimed:'NYCU',nickname:'',gender:'undisclosed',desiredGenders:[],intent:'either',
  campusPreference:'either_school',interests:[],dayOffStyle:'both',conflictStyle:'depends',
  chatStyle:'deep',firstMeet:'chat_first',topValue:'ease',openAnswer:'',mbti:null,
  notificationEmail:'',contactKind:'instagram',contactValue:'',adultAttested:false,
  shareContactConsent:false,privacyConsentVersion:''
};
function remaining(date:string|null):string {
  if (!date) return '待公告';
  const diff = Date.parse(date)-Date.now();
  if (diff<=0) return '已截止';
  const d=Math.floor(diff/86400000),h=Math.floor(diff%86400000/3600000),m=Math.floor(diff%3600000/60000);
  return d>0 ? d+' 天 '+h+' 小時' : h>0 ? h+' 小時 '+m+' 分' : m+' 分鐘';
}
function localDate(date:string|null):string {
  if (!date) return '截止後統一通知';
  return new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(date));
}
function PillGroup({title,desc,options,value,onChange,multiple=false}:{
  title:string;desc?:string;options:Choice[];value:string|string[];
  onChange:(v:string|string[])=>void;multiple?:boolean;
}) {
  const selected = Array.isArray(value)?value:[value];
  return <fieldset className="question"><legend className="question-title">{title}</legend>
    {desc&&<p className="question-desc">{desc}</p>}
    <div className="pill-list">{options.map(o=><button key={o.value} type="button" aria-pressed={selected.includes(o.value)}
      className={'pill '+(selected.includes(o.value)?'selected':'')} onClick={()=>{
        if (!multiple) {onChange(o.value);return;}
        const prev=selected;
        if(o.value==='all') {onChange(prev.includes('all')?[]:['all']);return;}
        const clean=prev.filter(x=>x!=='all');
        onChange(clean.includes(o.value)?clean.filter(x=>x!==o.value):[...clean,o.value]);
      }}>{o.label}</button>)}</div></fieldset>;
}
function Turnstile({siteKey,onToken}: {siteKey:string;onToken:(token:string)=>void}) {
  const holder=useRef<HTMLDivElement>(null);
  const widget=useRef<string|null>(null);
  useEffect(()=>{
    let active=true;
    function render(){
      if(!active || !holder.current || !window.turnstile || widget.current)return;
      widget.current=window.turnstile.render(holder.current,{
        sitekey:siteKey,theme:'light',appearance:'interaction-only',
        callback:(token:unknown)=>onToken(String(token)),
        'expired-callback':()=>onToken(''),
        'error-callback':()=>onToken('')
      });
    }
    if(!document.querySelector('script[data-relou-turnstile]')){
      const s=document.createElement('script');s.dataset.relouTurnstile='true';
      s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';s.async=true;
      s.onload=render;document.head.appendChild(s);
    } else {
      const t=setInterval(render,200);return ()=>{active=false;clearInterval(t);if(widget.current){window.turnstile?.remove(widget.current);widget.current=null;}};
    }
    return ()=>{active=false;if(widget.current){window.turnstile?.remove(widget.current);widget.current=null;}};
  },[siteKey,onToken]);
  return <div className="turnstile-box" ref={holder} aria-label="防機器人安全檢查"/>;
}

export function PublicApp(){
  const [stats,setStats]=useState<Stats|null>(null),[config,setConfig]=useState<Config|null>(null);
  const [draft,setDraft]=useState<Draft>(initial),[token,setToken]=useState('');
  const [sending,setSending]=useState(false),[done,setDone]=useState(false),[error,setError]=useState('');
  const [page,setPage]=useState<'form'|'stats'>(()=>window.location.hash==='#stats'?'stats':'form');
  const [nowTick,setNowTick]=useState(0);
  useEffect(()=>{const change=()=>setPage(window.location.hash==='#stats'?'stats':'form');window.addEventListener('hashchange',change);window.addEventListener('popstate',change);return()=>{window.removeEventListener('hashchange',change);window.removeEventListener('popstate',change);};},[]);
  useEffect(()=>{
    const load=()=>fetch('/api/public/stats').then(r=>r.ok?r.json() as Promise<Stats>:Promise.reject()).then(setStats).catch(()=>setStats(null));
    load();fetch('/api/public/config').then(r=>r.json() as Promise<Config>).then(setConfig).catch(()=>setConfig(null));
    const t=setInterval(load,90000),clock=setInterval(()=>setNowTick(n=>n+1),30000);
    return ()=>{clearInterval(t);clearInterval(clock);};
  },[]);
  void nowTick;
  function set<K extends keyof Draft>(key:K,value:Draft[K]) {setDraft(v=>({...v,[key]:value}));}
  const round=stats?.round;
  const open=round?.status==='OPEN' && Date.now()>=Date.parse(round.opensAt) && Date.now()<Date.parse(round.closesAt);
  const ready=!!config?.turnstileSiteKey && !!config?.supportEmail;
  const canSubmit=!!open && ready && !sending;
  async function submit(e:FormEvent){
    e.preventDefault();setError('');
    if(!canSubmit)return;
    const p=entrySchema.safeParse({...draft,customInterests:draft.interests.includes('其他')?(draft.customInterests||[]).map(v=>v.trim()).filter(Boolean):[],turnstileToken:token});
    if(!p.success){setError('還有欄位沒有填好，請檢查必填題目、聯絡方式與同意事項。');return;}
    setSending(true);
    try{
      const response=await fetch('/api/entry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p.data)});
      const data=await response.json() as {ok?:boolean;error?:string};
      if(!response.ok||!data.ok)throw new Error(data.error||'送出失敗，請稍後再試');
      setDone(true);window.scrollTo({top:0,behavior:'smooth'});
    }catch(e){
      setError(e instanceof Error?e.message:'送出失敗');
      setToken('');window.turnstile?.reset();
    }finally{setSending(false);}
  }
  return <div className="site">
    <header className="nav"><span className="brand">relou</span><nav aria-label="頁面"><a href="#form" onClick={e=>{e.preventDefault();history.pushState(null,'','#form');setPage('form');window.scrollTo(0,0);}} aria-current={page==='form'?'page':undefined}>填寫表單</a><a href="#stats" onClick={e=>{e.preventDefault();history.pushState(null,'','#stats');setPage('stats');window.scrollTo(0,0);}} aria-current={page==='stats'?'page':undefined}>統計</a></nav></header>
    <main id="top">
      <section hidden={page!=='stats'} className="stats-band"><div className="wrap">
        <h1>報名統計</h1>
        <div className="stats-grid">
          <div className="stat"><span>本期已收到</span><strong>{stats?stats.activeSubmissionCount.toLocaleString():'…'} <small>份報名</small></strong><em>只統計有效報名，不代表已驗證身分</em></div>
          <div className="stat"><span>目前活動</span><strong className="stat-title">{round?.title||'尚未開放'}</strong><em>{round?.status==='OPEN'?'● 報名進行中':round?.status==='LOCKED'?'配對處理中':round?'敬請期待下一期':'等待主辦者開放'}</em></div>
          <div className="stat"><span>距離報名截止</span><strong className="stat-title">{round?remaining(round.closesAt):'待公告'}</strong><em>{round?'截止：'+localDate(round.closesAt):'時間將在開放後公布'}</em></div>
          <div className="stat"><span>配對結果通知</span><strong className="stat-title">{localDate(round?.notificationTargetAt||null)}</strong><em>統一寄到報名時填寫的 Email</em></div>
        </div>
        {stats && (stats.lifetimeSubmissionCount!==null||stats.previousRoundPairCount!==null)&&<div className="history-strip">
          {stats.lifetimeSubmissionCount!==null&&<span>歷期累計 <b>{stats.lifetimeSubmissionCount}</b> 份報名</span>}
          {stats.previousRoundPairCount!==null&&<span>上一期完成 <b>{stats.previousRoundPairCount}</b> 組配對</span>}
        </div>}
      </div></section>
      <section hidden={page!=='form'} id="form" className="form-section"><div className="wrap form-layout">
        <div className="form-card">
          {done?<div className="success-panel"><h2>已收到你的報名！</h2><p>你已加入 {round?.title||'本期'}。截止後會統一配對，結果寄到你填寫的 Email。</p><p>每期最多配到一位，也可能因雙向條件而沒有合適對象。</p><strong>不必再做任何事，也不用開信箱驗證。</strong></div>
          :<><div className="form-head"><h1>清交配對報名表</h1><p>填寫後送出即可。每期最多配對一位，也可能沒有合適對象。</p><p>{round?round.title+' · 截止：'+localDate(round.closesAt):'本期時間尚未公告'} · 結果通知：{localDate(round?.notificationTargetAt||null)}</p></div>
          {!open&&<div className="notice">目前尚未開放報名，表單會在本期開放時啟用。你可以先看看題目。</div>}
          {open&&!ready&&<div className="notice">主辦者尚未完成收件防護或聯絡窗口設定，目前暫停收件。</div>}
          <form onSubmit={submit} noValidate>
            <div className="form-block"><div className="block-label">01 / 關於你</div>
              <PillGroup title="你是哪一校？" desc="自行填寫，不會要求學校信箱驗證" options={choices.schoolClaimed} value={draft.schoolClaimed} onChange={v=>set('schoolClaimed',v as Draft['schoolClaimed'])}/>
              <label className="question"><span className="question-title">想怎麼稱呼你？</span><input className="text-input" placeholder="你的暱稱（2–16 字）" value={draft.nickname} maxLength={16} onChange={e=>set('nickname',e.target.value)}/></label>
              <PillGroup title="你的性別？" options={choices.gender} value={draft.gender} onChange={v=>set('gender',v as Draft['gender'])}/>
              <PillGroup title="你願意認識誰？" desc="可以複選，選「都可以」則不用選其他" options={choices.desiredGenders} value={draft.desiredGenders} multiple onChange={v=>set('desiredGenders',v as Draft['desiredGenders'])}/>
            </div>
            <div className="form-block"><div className="block-label">02 / 你想遇見誰</div>
              <PillGroup title="來 Relou 想遇見？" options={choices.intent} value={draft.intent} onChange={v=>set('intent',v as Draft['intent'])}/>
              <PillGroup title="跨校 OK 嗎？" options={choices.campusPreference} value={draft.campusPreference} onChange={v=>set('campusPreference',v as Draft['campusPreference'])}/>
              <fieldset className="question"><legend className="question-title">最近喜歡什麼？</legend><p className="question-desc">選 1–4 個，配對後也許就是破冰話題。</p><div className="pill-list">{INTERESTS.map(t=><button key={t} type="button" aria-pressed={draft.interests.includes(t)} className={'pill '+(draft.interests.includes(t)?'selected':'')}
                onClick={()=>set('interests',draft.interests.includes(t)?draft.interests.filter(x=>x!==t):draft.interests.length<4?[...draft.interests,t]:draft.interests)}>{t}</button>)}</div>
                {draft.interests.includes('其他')&&<div className="custom-interests"><p className="question-desc">其他興趣（選填，最多 3 項，每項 30 字）。</p>{[0,1,2].map(i=><label key={i}><span className="question-desc">自填興趣 {i+1}</span><input className="text-input" maxLength={30} placeholder={i===0?'例如：烘焙、桌遊或手作':'還有其他喜歡的事嗎？'} value={draft.customInterests?.[i]||''} onChange={e=>{const values=[...(draft.customInterests||[])];values[i]=e.target.value;set('customInterests',values);}}/></label>)}</div>}
              </fieldset>
            </div>
            <div className="form-block"><div className="block-label">03 / 相處的模樣</div>
              <PillGroup title="放假時你比較…" options={choices.dayOffStyle} value={draft.dayOffStyle} onChange={v=>set('dayOffStyle',v as Draft['dayOffStyle'])}/>
              <PillGroup title="意見不同時希望…" options={choices.conflictStyle} value={draft.conflictStyle} onChange={v=>set('conflictStyle',v as Draft['conflictStyle'])}/>
              <PillGroup title="理想相處頻率…" options={choices.chatStyle} value={draft.chatStyle} onChange={v=>set('chatStyle',v as Draft['chatStyle'])}/>
              <PillGroup title="第一次互動想…" options={choices.firstMeet} value={draft.firstMeet} onChange={v=>set('firstMeet',v as Draft['firstMeet'])}/>
              <PillGroup title="一段關係最重要的是…" options={choices.topValue} value={draft.topValue} onChange={v=>set('topValue',v as Draft['topValue'])}/>
              <label className="question"><span className="question-title">最近讓你著迷的是？ <small>選填</small></span><textarea className="text-input" placeholder="一句話就好，例如：最近開始練吉他！" value={draft.openAnswer||''} maxLength={100} rows={2} onChange={e=>set('openAnswer',e.target.value)}/></label>
              <label className="question"><span className="question-title">MBTI <small>選填，不影響配對分數</small></span><select className="text-input" value={draft.mbti||''} onChange={e=>set('mbti',e.target.value||null)}>
                <option value="">跳過／不知道</option>{['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP'].map(x=><option key={x}>{x}</option>)}</select></label>
            </div>
            <div className="form-block"><div className="block-label">04 / 結果寄送與聯絡</div>
              <label className="question"><span className="question-title">配對結果要寄去哪裡？</span><input className="text-input" type="email" autoComplete="email" placeholder="you@example.com" value={draft.notificationEmail} maxLength={254} onChange={e=>set('notificationEmail',e.target.value)}/><span className="question-desc">只用來寄結果，不需驗證，也不會自動提供給對方。請檢查拼寫。</span></label>
              <fieldset className="question"><legend className="question-title">配對成功後，對方怎麼找到你？</legend><div className="contact-choices">
                <label className={'contact-choice '+(draft.contactKind==='instagram'?'active':'')}><input type="radio" name="contact" checked={draft.contactKind==='instagram'} onChange={()=>set('contactKind','instagram')}/> Instagram（推薦）</label>
                <label className={'contact-choice '+(draft.contactKind==='submitted_email'?'active':'')}><input type="radio" name="contact" checked={draft.contactKind==='submitted_email'} onChange={()=>{set('contactKind','submitted_email');set('contactValue','');}}/> 使用上方 Email</label>
              </div>{draft.contactKind==='instagram'&&<input className="text-input" placeholder="@yourusername" value={draft.contactValue||''} maxLength={31} onChange={e=>set('contactValue',e.target.value)}/>}
              <p className="question-desc">只會分享你主動選擇的聯絡方式給唯一配對對象，不需要 IG 登入。</p></fieldset>
              <div className="consents">
                <label><input type="checkbox" checked={draft.adultAttested} onChange={e=>set('adultAttested',e.target.checked)}/><span>我已滿 18 歲。</span></label>
                <label><input type="checkbox" checked={draft.shareContactConsent} onChange={e=>set('shareContactConsent',e.target.checked)}/><span>如果成功配對，我同意將上方選定的聯絡方式提供給唯一配對對象。</span></label>
                <label><input type="checkbox" checked={draft.privacyConsentVersion===PRIVACY_VERSION} onChange={e=>set('privacyConsentVersion',e.target.checked?PRIVACY_VERSION:'')}/><span>我已閱讀下方的資料使用與隱私說明。</span></label>
              </div>
              <div className="honeypot" aria-hidden="true"><label>網站網址<input name="website" tabIndex={-1} autoComplete="off" value={draft.website||''} onChange={e=>set('website',e.target.value)}/></label></div>
              {config?.turnstileSiteKey&&<Turnstile siteKey={config.turnstileSiteKey} onToken={setToken}/>}
            </div>
            {error&&<div role="alert" className="form-error">{error}</div>}
            <button className="submit-btn" type="submit" disabled={!canSubmit}>{sending?'送出中…':open?'送出報名':'尚未開放報名'}</button>
            <p className="submit-note">按一次送出就完成。沒有驗證信、登入或第二步。</p>
          </form></>}
        </div></div></section>
      <section hidden={page!=='form'} id="privacy" className="privacy wrap"><details><summary>資料使用、隱私與聯絡窗口</summary>
        <div className="privacy-grid"><p>Relou 只蒐集本期配對需要的答案、暱稱、通知 Email 和你選擇分享的 IG／Email。資料不會公開成參與者名單，也不會公開性別或偏好比例。</p>
          <p>本活動不驗證 Email 持有權、學生身分或年齡證件。請勿填別人的聯絡方式。成功配對只分享你明確同意的資訊，並不保證一定配到對象。</p>
          <p>資料用於本期配對及通知；期次封存滿 30 天後，主辦者可從後台清除個人資料（目前為人工執行）。需要更正、撤回、反映誤收信或請求刪除，請透過活動聯絡窗口提出，主辦者會人工核對。</p></div>
        <p className="support">聯絡窗口：{config?.supportEmail?<a href={'mailto:'+config.supportEmail}>{config.supportEmail}</a>:'主辦者尚未設定，正式報名暫停'}</p></details></section>
    </main>
  </div>;
}
