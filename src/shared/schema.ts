import { z } from 'zod';

export const PRIVACY_VERSION = '2026-10-29-v1';
export const INTERESTS = ['運動健身','籃球','羽球','音樂','電影影集','遊戲','咖啡探店','美食','戶外旅行','攝影','閱讀','科技 AI','其他'] as const;

export const entrySchema = z.object({
  schoolClaimed: z.enum(['NYCU', 'NTHU']),
  nickname: z.string().trim().min(2).max(16).regex(/^[^\r\n<>]+$/),
  gender: z.enum(['man', 'woman', 'nonbinary', 'other', 'undisclosed']),
  desiredGenders: z.array(z.enum(['man', 'woman', 'nonbinary_or_other', 'all'])).min(1).max(4),
  intent: z.enum(['friends', 'dating', 'either']),
  campusPreference: z.enum(['same_school', 'either_school']),
  interests: z.array(z.enum(INTERESTS)).min(1).max(4),
  dayOffStyle: z.enum(['plan', 'spontaneous', 'both']),
  conflictStyle: z.enum(['listen', 'direct', 'depends']),
  chatStyle: z.enum(['often', 'deep', 'meet']),
  firstMeet: z.enum(['cafe', 'walk', 'sports', 'food', 'chat_first']),
  topValue: z.enum(['honesty', 'ease', 'growth', 'passion']),
  openAnswer: z.string().trim().max(100).optional(),
  mbti: z.string().trim().regex(/^(?:[EI][NS][TF][JP]|unknown)$/).nullable().optional(),
  notificationEmail: z.email().max(254),
  contactKind: z.enum(['instagram', 'submitted_email']),
  contactValue: z.string().trim().max(31).optional(),
  adultAttested: z.literal(true),
  shareContactConsent: z.literal(true),
  privacyConsentVersion: z.literal(PRIVACY_VERSION),
  turnstileToken: z.string().min(1).max(2048),
  website: z.string().max(200).optional()
}).strict().superRefine((v, ctx) => {
  if (v.contactKind === 'instagram' && !/^@?[a-zA-Z0-9._]{1,30}$/.test(v.contactValue || '')) {
    ctx.addIssue({ code: 'custom', path: ['contactValue'], message: '請輸入有效的 IG 帳號' });
  }
  if (v.contactKind === 'submitted_email' && v.contactValue) {
    ctx.addIssue({ code: 'custom', path: ['contactValue'], message: '選擇 Email 時不需另填聯絡方式' });
  }
  if (v.desiredGenders.includes('all') && v.desiredGenders.length !== 1) {
    ctx.addIssue({ code: 'custom', path: ['desiredGenders'], message: '選擇都可以時不需再選其他項目' });
  }
  if (new Set(v.interests).size !== v.interests.length || new Set(v.desiredGenders).size !== v.desiredGenders.length) {
    ctx.addIssue({ code: 'custom', message: '選項不可重複' });
  }
});
export type EntryInput = z.infer<typeof entrySchema>;

export type MatchAnswers = Pick<EntryInput,
  'schoolClaimed' | 'gender' | 'desiredGenders' | 'intent' | 'campusPreference' |
  'interests' | 'dayOffStyle' | 'conflictStyle' | 'chatStyle' | 'firstMeet' | 'topValue'>;

export interface EntryRow {
  id: string;
  round_id: string;
  normalized_email: string;
  nickname: string;
  school_claimed: 'NYCU' | 'NTHU';
  gender: string;
  contact_kind: 'instagram' | 'submitted_email';
  contact_value: string;
  answers_json: string;
  adult_attested: number;
  share_contact_consent: number;
  privacy_version: string;
  status: 'eligible' | 'excluded' | 'withdrawn';
  submitted_at: string;
}
export interface RoundRow {
  id: string;
  slug: string;
  title: string;
  status: 'DRAFT' | 'OPEN' | 'LOCKED' | 'MATCHED' | 'NOTIFIED' | 'ARCHIVED';
  opens_at: string;
  closes_at: string;
  notification_target_at: string | null;
  min_pair_score: number;
  snapshot_hash: string | null;
  send_paused: number;
  created_at: string;
}

export const roundCreateSchema = z.object({
  title: z.string().trim().min(2).max(60),
  slug: z.string().regex(/^[a-z0-9-]{3,40}$/),
  opensAt: z.iso.datetime({ offset: true }),
  closesAt: z.iso.datetime({ offset: true }),
  notificationTargetAt: z.iso.datetime({ offset: true }).nullable().optional(),
  minPairScore: z.number().int().min(0).max(100).default(55)
}).strict().refine(v => Date.parse(v.opensAt) < Date.parse(v.closesAt), { message: '開始必須早於截止' });

export function normalizeEmail(email: string): string {
  const [local, domain] = email.trim().split('@');
  return local + '@' + domain.toLowerCase();
}

export function contactForMatch(v: Pick<EntryInput, 'contactKind' | 'contactValue' | 'notificationEmail'>): string {
  return v.contactKind === 'instagram' ? '@' + (v.contactValue || '').replace(/^@/, '') : normalizeEmail(v.notificationEmail);
}

export function publicRound(r: RoundRow | null) {
  return r ? {
    slug: r.slug,
    title: r.title,
    status: r.status,
    opensAt: r.opens_at,
    closesAt: r.closes_at,
    notificationTargetAt: r.notification_target_at
  } : null;
}
