import { PRIVACY_VERSION } from '../src/shared/schema';
import { describe,expect,it } from 'vitest';
import { resultEmail } from '../src/worker/mail';
import type { EntryRow } from '../src/shared/schema';
function person(id:string,email:string,kind:'instagram'|'submitted_email',contact:string):EntryRow {
  return {id,round_id:'r1',normalized_email:email,nickname:'暱稱'+id,school_claimed:'NYCU',
    gender:'man',contact_kind:kind,contact_value:contact,answers_json:'{}',adult_attested:1,
    share_contact_consent:1,privacy_version:'v1',status:'eligible',submitted_at:'2026-10-29T00:00:00Z'};
}
describe('result mail privacy',()=>{
  it('uses only shared allowlisted interests for icebreakers and builds a safe IG link',()=>{
    const a=person('a','a@example.invalid','instagram','@a');
    const b=person('b','b@example.invalid','instagram','@b');
    a.answers_json=JSON.stringify({interests:['音樂','閱讀'],openAnswer:'private answer'});
    b.answers_json=JSON.stringify({interests:['音樂','遊戲'],openAnswer:'another private answer'});
    const text=resultEmail(a,b,'support@example.invalid').text;
    expect(text).toContain('共同興趣：音樂');
    expect(text).toContain('https://www.instagram.com/b/');
    expect(text).not.toContain('private answer');
    expect(text).not.toContain('閱讀');
  });
  it('only shares counterpart opt-in IG, not private notification email',()=>{
    const a=person('a','recipient@example.invalid','instagram','@myprivate');
    const b=person('b','other-private@example.invalid','instagram','@public_b');
    const mail=resultEmail(a,b,'support@example.invalid');
    expect(mail.text).toContain('@public_b');
    expect(mail.text).not.toContain('other-private@example.invalid');
    expect(mail.text).not.toContain('@myprivate');
    expect(mail.text).toContain('support@example.invalid');
  });
  it('shares Email only when counterpart explicitly chose Email',()=>{
    const a=person('a','recipient@example.invalid','instagram','@mine');
    const b=person('b','other@example.invalid','submitted_email','other@example.invalid');
    expect(resultEmail(a,b,'').text).toContain('Email：other@example.invalid');
  });
  it('unmatched result does not disclose candidate contacts',()=>{
    const a=person('a','recipient@example.invalid','instagram','@mine');
    const mail=resultEmail(a,null,'');
    expect(mail.text).not.toContain('@mine');
    expect(mail.text).toContain('沒有找到');
  });
});

it('renders only exact shared summaries, period and safe contact in both formats',()=>{
 const a=person('a','recipient@example.invalid','instagram','@mine'),b=person('b','private@example.invalid','instagram','@other');
 a.privacy_version=PRIVACY_VERSION;b.privacy_version=PRIVACY_VERSION;
 a.answers_json=JSON.stringify({interests:['音樂','其他'],firstMeet:'cafe',chatStyle:'deep',topValue:'ease',customInterests:['private custom'],programId:'private program',gender:'private gender'});
 b.answers_json=a.answers_json;
 const mail=resultEmail(a,b,'support@example.invalid',{roundTitle:'2026 年 11 月期 · 第 1 期',phase:'early'});
 for(const body of [mail.text,mail.html]){
  expect(body).toContain('共同興趣：音樂');expect(body).toContain('都想從喝咖啡開始認識');expect(body).toContain('都偏好有話題時深入聊聊');
  expect(body).not.toContain('private@example.invalid');expect(body).not.toContain('private custom');expect(body).not.toContain('private program');
  expect(body).not.toContain('共同興趣：其他');expect(body).toContain('高度契合');
 }
 expect(mail.version).toBe('result-v2');expect(mail.subject).toContain('2026 年 11 月期');expect(mail.html).toContain('https://www.instagram.com/other/');
});
it('escapes stored display text, rejects unsafe contacts and missing sharing consent',()=>{
 const a=person('a','a@example.invalid','instagram','@mine'),b=person('b','b@example.invalid','instagram','@other');
 b.nickname='<img src=x onerror=alert(1)>';
 const mail=resultEmail(a,b,'support@example.invalid');expect(mail.html).toContain('&lt;img');expect(mail.html).not.toContain('<img');
 b.contact_value='javascript:alert(1)';expect(()=>resultEmail(a,b,'')).toThrow('Invalid shared IG');
 b.contact_value='@other';b.share_contact_consent=0;expect(()=>resultEmail(a,b,'')).toThrow('consent');
});
it('does not invent common points and never produces an early unmatched notice',()=>{
 const a=person('a','a@example.invalid','instagram','@mine'),b=person('b','b@example.invalid','instagram','@other');
 const mail=resultEmail(a,b,'');expect(mail.text).toContain('沒有可列出的明確共通點');expect(mail.text).not.toContain('共同興趣：');
 expect(()=>resultEmail(a,null,'',{phase:'early'})).toThrow('forbidden');
 const unmatched=resultEmail(a,null,'support@example.invalid',{roundTitle:'十一月期',phase:'final'});
 expect(unmatched.html).not.toContain('對方同意分享');expect(unmatched.html).toContain('不會自動沿用');
});

it('keeps older consent versions limited to the previously allowed common interests',()=>{
 const a=person('a','a@example.invalid','instagram','@mine'),b=person('b','b@example.invalid','instagram','@other');
 a.privacy_version=PRIVACY_VERSION;
 a.answers_json=b.answers_json=JSON.stringify({interests:['音樂'],firstMeet:'cafe',chatStyle:'deep'});
 const mail=resultEmail(a,b,'');expect(mail.text).toContain('共同興趣：音樂');expect(mail.text).not.toContain('都想從喝咖啡開始認識');
});
