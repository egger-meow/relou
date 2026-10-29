import { describe,expect,it } from 'vitest';
import { contactForMatch,entrySchema,normalizeEmail,PRIVACY_VERSION } from '../src/shared/schema';
const valid={
  schoolClaimed:'NYCU',nickname:'小魚',gender:'woman',desiredGenders:['man'],intent:'either',
  campusPreference:'either_school',interests:['音樂'],dayOffStyle:'both',conflictStyle:'depends',
  chatStyle:'deep',firstMeet:'cafe',topValue:'ease',notificationEmail:'Student@Gmail.COM',
  contactKind:'instagram',contactValue:'@littlefish',adultAttested:true,shareContactConsent:true,
  privacyConsentVersion:PRIVACY_VERSION,turnstileToken:'synthetic-token'
};
describe('single submit contract',()=>{
  it('accepts ordinary Gmail with no campus email or verification field',()=>{
    expect(entrySchema.safeParse(valid).success).toBe(true);
    expect(normalizeEmail(' Student@Gmail.COM ')).toBe('Student@gmail.com');
  });
  it('separates notification address from shared IG',()=>{
    const p=entrySchema.parse(valid);
    expect(contactForMatch(p)).toBe('@littlefish');
    const email=entrySchema.parse({...valid,contactKind:'submitted_email',contactValue:''});
    expect(contactForMatch(email)).toBe('Student@gmail.com');
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
