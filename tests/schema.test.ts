import { PROGRAMS } from '../src/shared/programs';
import { describe,expect,it } from 'vitest';
import { contactForMatch,entrySchema,normalizeEmail,PRIVACY_VERSION } from '../src/shared/schema';
const valid={
  schoolClaimed:'NYCU',degreeLevel:'bachelor',programId:PROGRAMS.find(p=>p.school==='NYCU'&&p.degree==='bachelor')!.id,departmentPreference:'either_department',nickname:'小魚',gender:'woman',desiredGenders:['man'],intent:'either',
  campusPreference:'either_school',interests:['音樂'],dayOffStyle:'both',conflictStyle:'depends',
  chatStyle:'deep',firstMeet:'cafe',topValue:'ease',notificationEmail:'Student@CS.NYCU.EDU.TW',
  contactKind:'instagram',contactValue:'@littlefish',adultAttested:true,shareContactConsent:true,
  privacyConsentVersion:PRIVACY_VERSION,turnstileToken:'synthetic-token'
};
describe('single submit contract',()=>{
  it('accepts school email subdomains without a verification step',()=>{
    expect(entrySchema.safeParse(valid).success).toBe(true);
    for(const email of ['a@nycu.edu.tw','a@nthu.edu.tw','a@cs.nthu.edu.tw']) expect(entrySchema.safeParse({...valid,notificationEmail:email}).success).toBe(true);
    for(const email of ['a@gmail.com','a@nycu.edu','a@fakenycu.edu.tw','a@nycu.edu.tw.evil.com']) expect(entrySchema.safeParse({...valid,notificationEmail:email}).success).toBe(false);
    expect(normalizeEmail(' Student@CS.NYCU.EDU.TW ')).toBe('Student@cs.nycu.edu.tw');
  });
  it('separates notification address from shared IG',()=>{
    const p=entrySchema.parse(valid);
    expect(contactForMatch(p)).toBe('@littlefish');
    const email=entrySchema.parse({...valid,contactKind:'submitted_email',contactValue:''});
    expect(contactForMatch(email)).toBe('Student@cs.nycu.edu.tw');
  });
  it('requires consent and blocks fake IG handles',()=>{
    expect(entrySchema.safeParse({...valid,adultAttested:false}).success).toBe(false);
    expect(entrySchema.safeParse({...valid,shareContactConsent:false}).success).toBe(false);
    expect(entrySchema.safeParse({...valid,privacyConsentVersion:''}).success).toBe(false);
    expect(entrySchema.safeParse({...valid,contactValue:'https://evil.example'}).success).toBe(false);
    expect(entrySchema.safeParse({...valid,contactValue:'@bad..handle'}).success).toBe(false);
    expect(entrySchema.safeParse({...valid,desiredGenders:['all','man']}).success).toBe(false);
  });
});

it('accepts up to three optional custom interests only with Other selected',()=>{
  const input={...valid,interests:['其他'],customInterests:[' 桌遊 ','烘焙','陶藝']};
  expect(entrySchema.parse(input).customInterests).toEqual(['桌遊','烘焙','陶藝']);
  expect(entrySchema.safeParse({...input,customInterests:[]}).success).toBe(true);
  expect(entrySchema.safeParse({...input,customInterests:['a','b','c','d']}).success).toBe(false);
  expect(entrySchema.safeParse({...input,customInterests:['字'.repeat(31)]}).success).toBe(false);
  expect(entrySchema.safeParse({...input,customInterests:['<script>']}).success).toBe(false);
  expect(entrySchema.safeParse({...input,interests:['音樂']}).success).toBe(false);
});

it('requires a real school-degree-program combination',()=>{
 const nth=PROGRAMS.find(p=>p.school==='NTHU'&&p.degree==='bachelor')!;
 expect(entrySchema.safeParse({...valid,programId:nth.id}).success).toBe(false);
 expect(entrySchema.safeParse({...valid,degreeLevel:'master'}).success).toBe(false);
 expect(entrySchema.safeParse({...valid,programId:'fake-program'}).success).toBe(false);
 expect(entrySchema.safeParse({...valid,programId:''}).success).toBe(false);
});
