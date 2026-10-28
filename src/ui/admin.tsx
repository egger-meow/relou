import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

type Round = {id:string;slug:string;title:string;status:string;opensAt:string;closesAt:string;notificationTargetAt:string|null;minPairScore:number;sendPaused:boolean};
type Dashboard = {round:Round|null;counts:{eligible:number;excluded:number;withdrawn:number;today:number}|null;
  trend:{day:string;n:number}[];outbox:Record<string,number>;mailConfigured:boolean;emailDryRun:boolean;asOf:string};
type Preview = {roundId:string;snapshotHash:string;previewDigest:string;metrics:{
  eligibleCount:number;validEdges:number;unmatchedCount:number;matchRate:number;meanScore:number|null;medianScore:number|null}};
type Mail = {roundId:string;roundStatus:string;paused:boolean;dryRun:boolean;mailConfigured:boolean;states:Record<string,number>;sample:{subject:string;text:string}|null};
type Entry = {id:string;maskedEmail:string;status:string;submittedAt:string};
type Audit = {actor:string;action:string;roundId:string;createdAt:string;meta:Record<string,unknown>};
type Tab = 'overview'|'entries'|'matching'|'mail'|'rounds'|'audit';

async function api<T>(path:string, options?:RequestInit):Promise<T> {
  const response=await fetch(path,{credentials:'same-origin',...options});
  const data=await response.json() as T & {error?:string};
  if(!response.ok)throw new Error(data.error||'操作失敗');
  return data;
}
function post<T>(path:string,body:object){return api<T>(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
function time(t:string|null|undefined){return t?new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',dateStyle:'short',timeStyle:'short'}).format(new Date(t)):'未設定';}
function isoFromLocal(s:string){return new Date(s).toISOString();}
function localInput(d:Date){const n=new Date(d.getTime()-d.getTimezoneOffset()*60000);return n.toISOString().slice(0,16);}
const tabs:{key:Tab;name:string;icon:string}[]=[
  {key:'overview',name:'總覽',icon:'◈'},{key:'entries',name:'報名',icon:'☷'},
  {key:'matching',name:'配對',icon:'♡'},{key:'mail',name:'寄信',icon:'✉'},
  {key:'rounds',name:'期次',icon:'◷'},{key:'audit',name:'稽核',icon:'≡'}
];

export function AdminApp(){
  const [tab,setTab]=useState<Tab>('overview'),[dash,setDash]=useState<Dashboard|null>(null);
  const [rounds,setRounds]=useState<Round[]>([]),[entries,setEntries]=useState<Entry[]>([]);
  const [audit,setAudit]=useState<Audit[]>([]),[preview,setPreview]=useState<Preview|null>(null);
  const [mail,setMail]=useState<Mail|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [form,setForm]=useState({title:'Relou 第 1 期',slug:'round-1',
    opensAt:localInput(new Date(Date.now()+600000)),closesAt:localInput(new Date(Date.now()+7*86400000)),
    notificationTargetAt:'',minPairScore:55});
  const load=useCallback(async()=>{
    try{
      const [d,r,e,a]=await Promise.all([
        api<Dashboard>('/api/admin/dashboard'),
        api<{rounds:Round[]}>('/api/admin/rounds'),
        api<{entries:Entry[]}>('/api/admin/entries'),
        api<{events:Audit[]}>('/api/admin/audit')
      ]);
      setDash(d);setRounds(r.rounds);setEntries(e.entries);setAudit(a.events);
      if(d.round) {
        const m=await api<Mail>('/api/admin/mail/status?round='+encodeURIComponent(d.round.id));
        setMail(m);
      }else setMail(null);
    }catch(e){setError(e instanceof Error?e.message:'後台載入失敗');}
  },[]);
  useEffect(()=>{void load();},[load]);
  async function action(path:string,body:object,confirmation:string,success:string){
    if(!window.confirm('確定要執行「'+confirmation+'」？這是正式管理操作。'))return;
    setBusy(true);setError('');setNotice('');
    try{await post(path,body);setNotice(success);await load();}catch(e){setError(e instanceof Error?e.message:'操作失敗');}
    finally{setBusy(false);}
  }
  const round=dash?.round;
  async function runPreview(){
    if(!round)return;
    setBusy(true);setError('');
    try{setPreview(await api<Preview>('/api/admin/matching/preview?round='+encodeURIComponent(round.id)));}
    catch(e){setError(e instanceof Error?e.message:'無法預覽');}
    finally{setBusy(false);}
  }
  async function createRound(e:FormEvent){
    e.preventDefault();
    try{
      const payload={title:form.title,slug:form.slug,opensAt:isoFromLocal(form.opensAt),
        closesAt:isoFromLocal(form.closesAt),notificationTargetAt:form.notificationTargetAt?isoFromLocal(form.notificationTargetAt):null,
        minPairScore:Number(form.minPairScore)};
      await action('/api/admin/rounds',payload,'建立新期次','已建立草稿期次');
    }catch{setError('請檢查日期格式');}
  }
  const counts=dash?.counts;
  const maxTrend=Math.max(1,...(dash?.trend||[]).map(x=>x.n));
  return <div className="admin-shell">
    <aside className="admin-sidebar"><div className="admin-logo">relou<span>.</span><small>OPERATOR CONSOLE</small></div>
      <div className="admin-menu">{tabs.map(t=><button key={t.key} className={tab===t.key?'active':''} onClick={()=>setTab(t.key)}><span>{t.icon}</span>{t.name}</button>)}</div>
      <div className="admin-side-foot">🔐 Cloudflare Access<br/><small>僅授權管理員可使用</small></div>
    </aside>
    <main className="admin-main">
      <header className="admin-top"><div><span className="section-kicker">RELOU / CONTROL ROOM</span><h1>{tabs.find(t=>t.key===tab)?.name}</h1></div>
        <div className="admin-top-right"><span className="status-badge">{round?.status||'NO ROUND'}</span><button className="small-btn" onClick={()=>void load()} disabled={busy}>↻ 更新</button></div></header>
      {error&&<div role="alert" className="form-error">{error}<button onClick={()=>setError('')}>×</button></div>}
      {notice&&<div className="admin-notice">{notice}</div>}
      {tab==='overview'&&<div>
        <div className="admin-intro"><h2>{round?.title||'尚無活動期次'}</h2><p>{round?'截止 '+time(round.closesAt):'請先建立第一期，正式報名前需設定 Cloudflare 防護、寄件與聯絡窗口。'}</p></div>
        <div className="admin-kpis"><div><span>本期有效報名</span><strong>{counts?.eligible??'—'}</strong><small>份，非驗證人數</small></div><div><span>今日新增</span><strong>{counts?.today??'—'}</strong><small>台灣時間</small></div>
          <div><span>已排除</span><strong>{counts?.excluded??'—'}</strong><small>人工審核</small></div><div><span>通知寄出</span><strong>{dash?.outbox.sent??0}</strong><small>實際發送成功</small></div></div>
        <div className="admin-panel"><h3>最近 14 天 · 每日報名</h3>{dash?.trend.length?<div className="trend-chart">{dash.trend.map(x=><div key={x.day} className="trend-column" title={x.day+'：'+x.n+' 份'}><div className="trend-bar" style={{height:Math.max(3,x.n/maxTrend*170)+'px'}}/><small>{x.day.slice(5)}</small><b>{x.n}</b></div>)}</div>:<p className="muted">尚無報名資料，圖表不會使用假數字。</p>}</div>
        <div className="admin-panel"><h3>營運提醒</h3><p>報名網站不要求 Email 驗證。性別分布、性向與聯絡方式絕不出現在公開統計 API。</p>
          <p>寄件狀態：<b>{dash?.mailConfigured?'已配置正式寄件（仍需人工解除暫停）':'尚未啟用正式寄件'}</b>。預設 dry-run：{dash?.emailDryRun?'是':'否'}。</p></div>
      </div>}
      {tab==='entries'&&<div className="admin-panel"><h3>本期報名審核 <span className="muted">最多顯示最近 100 筆</span></h3>
        <p className="muted">僅提供遮罩 Email，沒有公開候選名單。只有 OPEN 期次可排除可疑報名。</p>
        <div className="admin-table-wrap"><table><thead><tr><th>匿名 ID</th><th>通知信箱（遮罩）</th><th>狀態</th><th>時間</th><th>管理</th></tr></thead><tbody>{entries.map(e=><tr key={e.id}><td>{e.id.slice(0,8)}</td><td>{e.maskedEmail}</td><td>{e.status}</td><td>{time(e.submittedAt)}</td><td><button disabled={busy||round?.status!=='OPEN'||e.status!=='eligible'} onClick={()=>{
          const reason=window.prompt('排除原因（至少 3 字，將記錄在稽核）');
          if(reason)void action('/api/admin/entries/'+e.id+'/exclude',{confirm:'EXCLUDE',reason},'排除這份報名','已排除並留下稽核紀錄');
        }}>排除</button></td></tr>)}</tbody></table></div>{entries.length===0&&<p className="muted">尚無報名。</p>}</div>}
      {tab==='matching'&&<div className="admin-panel"><h3>配對結算中心</h3><p className="muted">先鎖池，再模擬配對。模擬不寫入資料庫；正式提交需要同一快照的預覽摘要。</p>
        <div className="admin-action-row"><button className="small-btn" disabled={busy||round?.status!=='OPEN'} onClick={()=>round&&void action('/api/admin/rounds/'+round.id+'/lock',{confirm:'LOCK'},'鎖定本期報名','已鎖定候選資料')}>① 鎖定本期</button>
          <button className="small-btn" disabled={busy||round?.status!=='LOCKED'} onClick={()=>void runPreview()}>② 模擬配對</button>
          <button className="danger-btn" disabled={busy||round?.status!=='LOCKED'||!preview||preview.roundId!==round.id} onClick={()=>round&&preview&&void action('/api/admin/matching/commit',{roundId:round.id,previewDigest:preview.previewDigest,confirm:'COMMIT'},'正式提交配對（不可回復）','已正式配對，結果信排入 outbox')}>③ 正式提交</button></div>
        {preview&&<div className="preview-grid"><div><span>有效候選</span><strong>{preview.metrics.eligibleCount}</strong></div><div><span>雙向合格邊</span><strong>{preview.metrics.validEdges}</strong></div><div><span>預計配對組數</span><strong>{(preview.metrics.eligibleCount-preview.metrics.unmatchedCount)/2}</strong></div><div><span>落單人數</span><strong>{preview.metrics.unmatchedCount}</strong></div><div><span>配對率</span><strong>{preview.metrics.matchRate}%</strong></div><div><span>平均分數</span><strong>{preview.metrics.meanScore??'—'}</strong></div></div>}
        {!preview&&<p className="muted">尚未產生模擬結果。</p>}
      </div>}
      {tab==='mail'&&<div className="admin-panel"><h3>結果信寄送</h3><p className="muted">只有本期正式配對後才會建立 outbox。送出表單當下不會寄任何信。</p>
        <div className="preview-grid">{['queued','sending','sent','failed','uncertain','suppressed'].map(k=><div key={k}><span>{k}</span><strong>{mail?.states[k]??0}</strong></div>)}</div>
        <div className="admin-notice">{mail?.dryRun?'🧪 Dry-run 開啟，不會寄真信。':'正式寄件模式'} · {mail?.paused?'目前暫停':'寄送已解除暫停'} · {mail?.mailConfigured?'已配置寄件':'寄件未配置'}</div>
        {mail?.sample&&<div className="mail-preview"><b>{mail.sample.subject}</b><p>{mail.sample.text}</p></div>}
        <div className="admin-action-row"><button className="small-btn" disabled={busy||round?.status!=='MATCHED'||!mail?.mailConfigured||!mail.paused} onClick={()=>round&&void action('/api/admin/mail/resume',{roundId:round.id,confirm:'RESUME'},'解除寄送暫停','已解除寄送暫停')}>解除暫停</button>
          <button className="small-btn" disabled={busy||round?.status!=='MATCHED'} onClick={()=>round&&void action('/api/admin/mail/pause',{roundId:round.id,confirm:'PAUSE'},'暫停寄送','已暫停寄送')}>暫停</button>
          <button className="danger-btn" disabled={busy||round?.status!=='MATCHED'||!mail?.mailConfigured||mail.paused} onClick={()=>round&&void action('/api/admin/mail/send',{roundId:round.id,confirm:'SEND'},'正式寄出最多 10 封信','寄送批次已執行，請查看最新狀態')}>正式寄送（最多 10 封）</button>
          <button className="small-btn" disabled={busy||round?.status!=='MATCHED'} onClick={()=>round&&void action('/api/admin/mail/retry',{roundId:round.id,confirm:'RETRY'},'重新排入確定失敗的信件','已將可重試失敗信件重新排隊')}>重試失敗</button></div>
        <p className="muted">uncertain/sending 狀態可能已被寄送，不能盲目重寄；請先核對 Cloudflare Email Service 紀錄。</p>
      </div>}
      {tab==='rounds'&&<div className="admin-panel"><h3>建立下一期</h3><form className="round-form" onSubmit={createRound}>
        <label>活動名稱<input required value={form.title} onChange={e=>setForm(v=>({...v,title:e.target.value}))}/></label>
        <label>期次 slug<input required value={form.slug} onChange={e=>setForm(v=>({...v,slug:e.target.value}))}/></label>
        <label>開始（瀏覽器本地時間）<input type="datetime-local" required value={form.opensAt} onChange={e=>setForm(v=>({...v,opensAt:e.target.value}))}/></label>
        <label>截止<input type="datetime-local" required value={form.closesAt} onChange={e=>setForm(v=>({...v,closesAt:e.target.value}))}/></label>
        <label>預計通知日（可留空）<input type="datetime-local" value={form.notificationTargetAt} onChange={e=>setForm(v=>({...v,notificationTargetAt:e.target.value}))}/></label>
        <label>最低配對分<input type="number" min="0" max="100" value={form.minPairScore} onChange={e=>setForm(v=>({...v,minPairScore:Number(e.target.value)}))}/></label>
        <button className="small-btn" disabled={busy} type="submit">建立草稿期次</button></form>
        <h3 className="space-top">現有期次</h3><div className="admin-table-wrap"><table><thead><tr><th>期次</th><th>狀態</th><th>開始</th><th>截止</th><th>操作</th></tr></thead><tbody>{rounds.map(r=><tr key={r.id}><td>{r.title}</td><td>{r.status}</td><td>{time((r as unknown as {opens_at?:string}).opens_at||r.opensAt)}</td><td>{time((r as unknown as {closes_at?:string}).closes_at||r.closesAt)}</td><td>
          {r.status==='DRAFT'&&<button disabled={busy} onClick={()=>void action('/api/admin/rounds/'+r.id+'/open',{confirm:'OPEN'},'開放本期','已開放報名')}>開放</button>}
          {r.status==='NOTIFIED'&&<button disabled={busy} onClick={()=>void action('/api/admin/rounds/'+r.id+'/archive',{confirm:'ARCHIVE'},'封存期次','已封存')}>封存</button>}</td></tr>)}</tbody></table></div>
        <p className="muted">開始時間必須已到且尚未截止才能開放；請先完成 Cloudflare Access、Turnstile、寄件及隱私聯絡窗口。</p>
      </div>}
      {tab==='audit'&&<div className="admin-panel"><h3>管理操作稽核</h3><div className="admin-table-wrap"><table><thead><tr><th>時間</th><th>管理員</th><th>動作</th><th>期次</th></tr></thead><tbody>{audit.map((e,i)=><tr key={i}><td>{time(e.createdAt)}</td><td>{e.actor}</td><td>{e.action}</td><td>{e.roundId?.slice(0,8)||'—'}</td></tr>)}</tbody></table></div>{audit.length===0&&<p className="muted">尚無操作紀錄。</p>}</div>}
      <footer className="admin-footer">Relou operator console · 不公開個人資料 · 操作前請確認真實期次</footer>
    </main>
  </div>;
}
