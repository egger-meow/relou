import { INTEREST_GROUPS } from '../shared/interests';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { PROGRAMS } from '../shared/programs';
import { monthlyRound } from '../shared/calendar';
import { entrySchema, PRIVACY_VERSION } from '../shared/schema';
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
  schoolClaimed:'NYCU',degreeLevel:'bachelor',programId:'',departmentPreference:'either_department',nickname:'',gender:'undisclosed',desiredGenders:[],intent:'either',
  campusPreference:'either_school',interests:[],dayOffStyle:'both',conflictStyle:'depends',
  chatStyle:'deep',firstMeet:'chat_first',topValue:'ease',openAnswer:'',mbti:null,mbtiPreference:'either',
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
function InterestPicker({value,onChange}:{value:Draft['interests'];onChange:(value:Draft['interests'])=>void}) {
  const [category,setCategory]=useState(0);
  const toggle=(tag:Draft['interests'][number])=>onChange(value.includes(tag)?value.filter(t=>t!==tag):value.length<8?[...value,tag]:value);
  return <div className="interest-picker">
    <div className="interest-toolbar"><span>挑幾個能聊起來的話題</span><strong aria-live="polite">{value.length}<span> / 8</span></strong></div>
    <div className="interest-categories" aria-label="興趣分類">{INTEREST_GROUPS.map((group,i)=><button type="button" key={group.label} aria-pressed={category===i} className={category===i?'active':''} onClick={()=>setCategory(i)}>{group.label}{group.tags.some(t=>value.includes(t))&&<span className="interest-dot" aria-label="有已選興趣"/>}</button>)}</div>
    <div className="interest-options" aria-label={INTEREST_GROUPS[category].label}>{INTEREST_GROUPS[category].tags.map(tag=><button type="button" key={tag} aria-pressed={value.includes(tag)} className={value.includes(tag)?'chosen':''} disabled={!value.includes(tag)&&value.length>=8} onClick={()=>toggle(tag)}><span aria-hidden="true">{value.includes(tag)?'✓':'+'}</span>{tag}</button>)}</div>
    <div className="interest-selection"><span className="interest-selection-label">已選興趣</span>{value.length?<div>{value.map(tag=><button type="button" key={tag} onClick={()=>toggle(tag)} aria-label={'移除'+tag}>{tag}<span aria-hidden="true">×</span></button>)}</div>:<span className="interest-empty">從上方選 1–8 個，隨時可以更換。</span>}</div>
  </div>;
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
  const [page,setPage]=useState<'form'|'stats'|'about'>(()=>window.location.hash==='#about'?'about':window.location.hash==='#stats'?'stats':'form');
  const [nowTick,setNowTick]=useState(0);
  useEffect(()=>{const change=()=>setPage(window.location.hash==='#about'?'about':window.location.hash==='#stats'?'stats':'form');window.addEventListener('hashchange',change);window.addEventListener('popstate',change);return()=>{window.removeEventListener('hashchange',change);window.removeEventListener('popstate',change);};},[]);
  useEffect(()=>{
    const load=()=>fetch('/api/public/stats').then(r=>r.ok?r.json() as Promise<Stats>:Promise.reject()).then(setStats).catch(()=>setStats(null));
    load();fetch('/api/public/config').then(r=>r.json() as Promise<Config>).then(setConfig).catch(()=>setConfig(null));
    const t=setInterval(load,90000),clock=setInterval(()=>setNowTick(n=>n+1),30000);
    return ()=>{clearInterval(t);clearInterval(clock);};
  },[]);
  void nowTick;
  function set<K extends keyof Draft>(key:K,value:Draft[K]) {setDraft(v=>({...v,[key]:value}));}
  const round=stats?.round;
  const calendar=monthlyRound(round?Date.parse(round.opensAt):Date.now());
  const periodTitle=round?.title||calendar.title;
  const junctionAngle=2*Math.PI*20/calendar.daysInMonth-Math.PI/2;
  const junction=(radius:number)=>({x:200+Math.cos(junctionAngle)*radius,y:170+Math.sin(junctionAngle)*radius});
  const deliveryWindow=`${calendar.month}/21～${calendar.month}/${calendar.daysInMonth}`;
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
    <header className="nav"><span className="brand">relou</span><nav aria-label="頁面">{([{id:'form',label:'表單'},{id:'stats',label:'統計'},{id:'about',label:'說明'}] as const).map(item=><a key={item.id} href={'#'+item.id} onClick={e=>{e.preventDefault();history.pushState(null,'','#'+item.id);setPage(item.id);window.scrollTo(0,0);}} aria-current={page===item.id?'page':undefined}>{item.label}</a>)}</nav></header>
    <main id="top">
      <section hidden={page!=='stats'} className="stats-band"><div className="wrap">
        <h1>報名統計</h1>
        <div className="stats-grid">
          <div className="stat"><span>本期已收到</span><strong>{stats?stats.activeSubmissionCount.toLocaleString():'…'} <small>份報名</small></strong><em>只統計有效報名，不代表已驗證身分</em></div>
          <div className="stat"><span>目前活動</span><strong className="stat-title">{periodTitle}</strong><em>{open?'報名進行中':Date.now()<Date.parse(round?.opensAt||calendar.opensAt)?'尚未開始':round?.status==='DRAFT'?'準備中':'報名已截止'}</em></div>
          <div className="stat"><span>距離報名截止</span><strong className="stat-title">{remaining(round?.closesAt||calendar.closesAt)}</strong><em>{'截止：'+localDate(round?.closesAt||calendar.closesAt)+'（台灣時間）'}</em></div>
          <div className="stat"><span>配對結果通知</span><strong className="stat-title">{deliveryWindow}</strong><em>配對與通知期間，結果寄到填寫的 Email</em></div>
        </div>
        {stats && (stats.lifetimeSubmissionCount!==null||stats.previousRoundPairCount!==null)&&<div className="history-strip">
          {stats.lifetimeSubmissionCount!==null&&<span>歷期累計 <b>{stats.lifetimeSubmissionCount}</b> 份報名</span>}
          {stats.previousRoundPairCount!==null&&<span>上一期完成 <b>{stats.previousRoundPairCount}</b> 組配對</span>}
        </div>}
      </div></section>
      <section hidden={page!=='form'} id="form" className="form-section"><div className="wrap form-layout">
        <div className="form-card">
          {done?<div className="success-panel"><h2>已收到你的報名！</h2><p>你已加入 {periodTitle}。主要配對與結果通知期間為 {deliveryWindow}；若雙方高度契合，也可能提前收到結果。結果寄到你填寫的 Email。</p><p>每期最多配到一位，也可能因雙向條件而沒有合適對象。</p><strong>不必再做任何事，也不用開信箱驗證。</strong></div>
          :<><div className="form-head"><h1>清交配對報名表</h1><p className="period-title">{periodTitle}</p><p>填寫後送出即可。每期最多配對一位，也可能沒有合適對象。</p><p>報名：{calendar.month}/1～{calendar.month}/20 · 配對與通知：{deliveryWindow}（台灣時間）</p></div>
          {!open&&<div className="notice">{Date.now()<Date.parse(round?.opensAt||calendar.opensAt)?`${calendar.year} 年 ${calendar.month} 月 1 日 00:00 開始報名。2026 年 10 月不開放報名。`:round?.status==='DRAFT'?'本期正在準備中，尚未開放報名。':'本期報名已截止，21 日起為配對與結果通知期間，次月 1 日開放下一期。'}</div>}
          {open&&!ready&&<div className="notice">主辦者尚未完成收件防護或聯絡窗口設定，目前暫停收件。</div>}
          <form onSubmit={submit} noValidate><fieldset className="form-fields" disabled={!canSubmit}>
            <div className="form-block"><div className="block-label">01 / 關於你</div>
              <label className="question"><span className="question-title">學校</span><select className="text-input" value={draft.schoolClaimed} onChange={e=>setDraft(v=>({...v,schoolClaimed:e.target.value as Draft['schoolClaimed'],programId:''}))}>{choices.schoolClaimed.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select><span className="question-desc">學校與系所由你自行填寫，不驗證學生身分。</span></label>
              <label className="question"><span className="question-title">學位</span><select className="text-input" value={draft.degreeLevel} onChange={e=>setDraft(v=>({...v,degreeLevel:e.target.value as Draft['degreeLevel'],programId:''}))}><option value="bachelor">學士（含學士後）</option><option value="master">碩士（含在職專班）</option><option value="doctor">博士</option></select></label>
              <label className="question"><span className="question-title">系所／學位學程</span><select className="text-input" value={draft.programId} onChange={e=>set('programId',e.target.value)}><option value="">請選擇系所或學位學程</option>{PROGRAMS.filter(p=>p.school===draft.schoolClaimed&&p.degree===draft.degreeLevel).sort((a,b)=>a.name.localeCompare(b.name,'zh-TW')).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><span className="question-desc">名單依教育部資料及 115 學年異動核對。找不到系所請聯絡主辦者；校系只用於配對，不公開或放進結果信。</span></label>
              <label className="question"><span className="question-title">想怎麼稱呼你？</span><input className="text-input" placeholder="你的暱稱（2–16 字）" value={draft.nickname} maxLength={16} onChange={e=>set('nickname',e.target.value)}/></label>
              <PillGroup title="你的性別？" options={choices.gender} value={draft.gender} onChange={v=>set('gender',v as Draft['gender'])}/>
              <PillGroup title="你願意認識誰？" desc="可以複選，選「都可以」則不用選其他" options={choices.desiredGenders} value={draft.desiredGenders} multiple onChange={v=>set('desiredGenders',v as Draft['desiredGenders'])}/>
            </div>
            <div className="form-block"><div className="block-label">02 / 你想遇見誰</div>
              <PillGroup title="來 Relou 想遇見？" options={choices.intent} value={draft.intent} onChange={v=>set('intent',v as Draft['intent'])}/>
              <PillGroup title="跨校 OK 嗎？" options={choices.campusPreference} value={draft.campusPreference} onChange={v=>set('campusPreference',v as Draft['campusPreference'])}/>
              <PillGroup title="對同校系的偏好？" desc="同系指同一所學校、同一系所，跨學位仍算同系；獨立研究所不因名稱相近而合併。這是配對限制，雙方都必須同意。" options={[{value:'same_department',label:'只限同校同系'},{value:'different_department',label:'避開同校同系'},{value:'either_department',label:'都可以'}]} value={draft.departmentPreference} onChange={v=>set('departmentPreference',v as Draft['departmentPreference'])}/>
              <fieldset className="question"><legend className="question-title">最近喜歡什麼？</legend><InterestPicker value={draft.interests} onChange={v=>set('interests',v)}/>
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
              <label className="question"><span className="question-title">MBTI <small>選填</small></span><select className="text-input" value={draft.mbti||''} onChange={e=>{set('mbti',e.target.value||null);if(!e.target.value)set('mbtiPreference','either');}}>
                <option value="">跳過／不知道</option>{['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP'].map(x=><option key={x}>{x}</option>)}</select></label>
              {draft.mbti&&draft.mbti!=='unknown'&&<PillGroup title="MBTI 方面，你比較想認識…" desc="相近＝四個字母較多相同；相異＝較多不同。僅作小幅配對偏好，不是人格相容性的判定，也不保證一定符合。對方沒填時不計算，不限定一定要有 E 人。" options={[{value:'similar',label:'相近的類型'},{value:'different',label:'相異的類型'},{value:'either',label:'都可以'}]} value={draft.mbtiPreference||'either'} onChange={v=>set('mbtiPreference',v as Draft['mbtiPreference'])}/>}
            </div>
            <div className="form-block"><div className="block-label">04 / 結果寄送與聯絡</div>
              <label className="question"><span className="question-title">配對結果要寄去哪裡？</span><input className="text-input" type="email" autoComplete="email" placeholder="學校信箱（含系所子網域）" value={draft.notificationEmail} maxLength={254} onChange={e=>set('notificationEmail',e.target.value)}/><span className="question-desc">限用陽明交大 nycu.edu.tw 或清大 nthu.edu.tw 學校信箱（含系所子網域），作為學生參加資格限制。只用來寄結果，不會自動提供給對方；未驗證信箱持有權或在學身分，請檢查拼寫。</span></label>
              <fieldset className="question"><legend className="question-title">配對成功後，對方怎麼找到你？</legend><div className="contact-choices">
                <label className={'contact-choice '+(draft.contactKind==='instagram'?'active':'')}><input type="radio" name="contact" checked={draft.contactKind==='instagram'} onChange={()=>set('contactKind','instagram')}/> Instagram（推薦）</label>
                <label className={'contact-choice '+(draft.contactKind==='submitted_email'?'active':'')}><input type="radio" name="contact" checked={draft.contactKind==='submitted_email'} onChange={()=>{set('contactKind','submitted_email');set('contactValue','');}}/> 使用上方 Email</label>
              </div>{draft.contactKind==='instagram'&&<input className="text-input" placeholder="@yourusername" value={draft.contactValue||''} maxLength={31} onChange={e=>set('contactValue',e.target.value)}/>}
              <p className="question-desc">只會分享你主動選擇的聯絡方式給唯一配對對象，不需要 IG 登入。</p></fieldset>
              <div className="consents">
                <label><input type="checkbox" checked={draft.adultAttested} onChange={e=>set('adultAttested',e.target.checked)}/><span>我已滿 18 歲。</span></label>
                <label><input type="checkbox" checked={draft.shareContactConsent} onChange={e=>set('shareContactConsent',e.target.checked)}/><span>如果成功配對，我同意將上方選定的聯絡方式，以及共同興趣與相處偏好的簡短摘要，提供給唯一配對對象。</span></label>
                <label><input type="checkbox" checked={draft.privacyConsentVersion===PRIVACY_VERSION} onChange={e=>set('privacyConsentVersion',e.target.checked?PRIVACY_VERSION:'')}/><span>我已閱讀下方的資料使用與隱私說明。</span></label>
              </div>
              <div className="honeypot" aria-hidden="true"><label>網站網址<input name="website" tabIndex={-1} autoComplete="off" value={draft.website||''} onChange={e=>set('website',e.target.value)}/></label></div>
              {config?.turnstileSiteKey&&<Turnstile siteKey={config.turnstileSiteKey} onToken={setToken}/>}
            </div>
            </fieldset>
            {error&&<div role="alert" className="form-error">{error}</div>}
            <button className="submit-btn" type="submit" disabled={!canSubmit}>{sending?'送出中…':open?'送出報名':'尚未開放報名'}</button>
            <p className="submit-note">按一次送出就完成。沒有驗證信、登入或第二步。</p>
          </form></>}
        </div></div></section>
      <section hidden={page!=='about'} className="about-page wrap"><h1>每月一期，怎麼進行？</h1><p className="about-intro">每月 1～20 日報名，21 日至月底配對並寄送結果。所有時間以台灣時間為準。</p>
        <figure className="cycle-figure"><svg viewBox="0 0 380 340" role="img" aria-labelledby="cycle-title cycle-desc"><title id="cycle-title">每月報名與配對分發時程</title><desc id="cycle-desc">頂部接點是當月 1 號，左下接點是當月 20 號結束。1 日到 20 日開放報名；21 日到月底關閉報名，進行配對與寄送。</desc>
          <circle cx="200" cy="170" r="100" fill="none" stroke="#e6d6b9" strokeWidth="24"/>
          <circle cx="200" cy="170" r="100" fill="none" stroke="#397254" strokeWidth="24" pathLength="100" strokeDasharray={`${20/calendar.daysInMonth*100} 100`} transform="rotate(-90 200 170)"/>
          <path d="M200 52V88" stroke="white" strokeWidth="9"/>
          <line x1={junction(82).x} y1={junction(82).y} x2={junction(118).x} y2={junction(118).y} stroke="white" strokeWidth="9"/>
          <path d="M200 36V55" className="cycle-guide"/>
          <polyline points={`${junction(122).x},${junction(122).y} 72,260 16,260`} className="cycle-guide"/>
          <circle cx="200" cy="70" r="5" fill="#397254" stroke="white" strokeWidth="2"/>
          <circle cx={junction(100).x} cy={junction(100).y} r="5" fill="#397254" stroke="white" strokeWidth="2"/>
          <text x="200" y="24" textAnchor="middle" className="cycle-date">當月 1 號</text>
          <text x="16" y="284" className="cycle-date">當月 20 號</text>
          <text x="16" y="304" className="cycle-date-note">報名截止</text>
          <text x="200" y="160" textAnchor="middle" className="cycle-main">每月一期</text><text x="200" y="187" textAnchor="middle" className="cycle-sub">1 日重新開始</text></svg><figcaption><span><i className="legend-enroll"/>1～20 日：報名期間</span><span><i className="legend-deliver"/>21 日～月底：配對與分發</span></figcaption></figure>
        <div className="schedule-notes"><h2>1～20 日：填表報名</h2><p>當月 1 日 00:00 開始，20 日 23:59 結束。填完按一次送出即可，不需登入或驗證信箱。</p><h2>21 日～月底：配對與寄送結果</h2><p>報名關閉後，依雙方意願與相處偏好配對，主辦者確認後陸續寄出結果。每人一期最多一位，也可能沒有合適對象。</p><h2>次月 1 日：新的一期</h2><p>第一期是 2026 年 11 月期，11 月 1 日開始，10 月不收件。之後每月重新報名與同意，不自動沿用上一期資料。</p><p className="question-desc">報名期間若出現高度契合、且雙方條件皆符合的對象，可能提前配對並寄送結果；並非每份報名都會提前收到。已配對者當期不會再次配對，其餘報名仍在 20 日截止後進行主要配對。</p></div>
      </section>
      <section hidden={page!=='form'} id="privacy" className="privacy wrap"><details><summary>資料使用、隱私與聯絡窗口</summary>
        <div className="privacy-grid"><p>Relou 只蒐集本期配對需要的學校、學位、系所、答案、暱稱、通知 Email 和你選擇分享的 IG／Email。資料不會公開成參與者名單，也不會公開性別或偏好比例。</p>
          <p>本活動不驗證 Email 持有權、學生身分或年齡證件。請勿填別人的聯絡方式。成功配對只分享你選定的聯絡方式，以及雙方共同選擇的興趣與相處偏好摘要；不附完整自由回答、校系或配對分數，並不保證一定配到對象。</p>
          <p>資料用於本期配對及通知；期次封存滿 30 天後，主辦者可從後台清除個人資料（目前為人工執行）。需要更正、撤回、反映誤收信或請求刪除，請透過活動聯絡窗口提出，主辦者會人工核對。</p></div>
        <p className="support">聯絡窗口：{config?.supportEmail?<a href={'mailto:'+config.supportEmail}>{config.supportEmail}</a>:'主辦者尚未設定，正式報名暫停'}</p></details></section>
    </main>
  </div>;
}
