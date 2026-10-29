import {mkdirSync,writeFileSync} from 'node:fs';
import {resultEmail} from '../src/worker/mail';
import {buildMime} from '../src/worker/smtp';
import {PRIVACY_VERSION} from '../src/shared/schema';
import type {EntryRow} from '../src/shared/schema';
const folder='private/email-previews';mkdirSync(folder,{recursive:true});
function person(id:string,nickname:string,kind:'instagram'|'submitted_email'):EntryRow{
 return {id,round_id:'synthetic-round',normalized_email:id+'@example.invalid',nickname,school_claimed:'NYCU',gender:'undisclosed',contact_kind:kind,
  contact_value:kind==='instagram'?'@synthetic_relou_'+id:id+'@example.invalid',answers_json:JSON.stringify({interests:['音樂','咖啡探店'],firstMeet:'cafe',chatStyle:'deep',topValue:'ease'}),
  adult_attested:1,share_contact_consent:1,privacy_version:PRIVACY_VERSION,status:'eligible',submitted_at:'2026-11-01T00:00:00Z'};
}
const me=person('sample_a','小晴（合成範例）','instagram');
const cases=[{name:'early-ig',title:'提前配對成功 · IG',other:person('sample_b','阿森（合成範例）','instagram'),phase:'early' as const},
 {name:'final-email',title:'期末配對成功 · Email',other:person('sample_c','小安（合成範例）','submitted_email'),phase:'final' as const},
 {name:'unmatched',title:'本期未配對',other:null,phase:'final' as const}];
for(const c of cases){const mail=resultEmail(me,c.other,'support@example.invalid',{roundTitle:'2026 年 11 月期 · 第 1 期',phase:c.phase});
 writeFileSync(folder+'/'+c.name+'.html',mail.html);writeFileSync(folder+'/'+c.name+'.txt',mail.subject+'\n\n'+mail.text);
 writeFileSync(folder+'/'+c.name+'.eml',buildMime({to:me.normalized_email,from:'sender@example.invalid',replyTo:'support@example.invalid',subject:mail.subject,text:mail.text,html:mail.html},'<preview-'+c.name+'@relou.jjmowlab.com>'));
}
writeFileSync(folder+'/index.html','<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relou 結果信合成預覽</title><body style="font-family:system-ui;max-width:700px;margin:40px auto;padding:0 20px;line-height:1.8"><h1>結果信模板預覽</h1><p>以下全部為合成範例，不是真實參與者，也沒有寄出郵件。使用 example.invalid 測試地址。</p>'+cases.map(c=>'<p><strong>'+c.title+'</strong>：<a href="'+c.name+'.html">HTML</a> · <a href="'+c.name+'.txt">純文字</a> · <a href="'+c.name+'.eml">EML 原始郵件</a></p>').join('')+'</body></html>');
console.log('Generated three synthetic email templates (HTML/plain text/EML); no mail sent.');
