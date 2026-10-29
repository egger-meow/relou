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
