import { programById } from '../shared/programs';
import blossom from 'edmonds-blossom';
import type { EntryRow, MatchAnswers } from '../shared/schema';

export const ALGORITHM_VERSION = 'blossom-reciprocal-v3-department';

export interface Candidate {
  id: string;
  school: 'NYCU' | 'NTHU';
  gender: MatchAnswers['gender'];
  contactKind: 'instagram' | 'submitted_email';
  contactValue: string;
  adultAttested: boolean;
  shareContactConsent: boolean;
  status: 'eligible' | 'excluded' | 'withdrawn';
  answers: MatchAnswers;
}
export interface Pair { a: string; b: string; score: number; }
export interface MatchPlan {
  pairs: Pair[];
  eligibleCount: number;
  validEdges: number;
  unmatchedCount: number;
  matchRate: number;
  meanScore: number | null;
  medianScore: number | null;
}

export function fromRow(row: EntryRow): Candidate {
  return {
    id: row.id,
    school: row.school_claimed,
    gender: row.gender as MatchAnswers['gender'],
    contactKind: row.contact_kind,
    contactValue: row.contact_value,
    adultAttested: row.adult_attested === 1,
    shareContactConsent: row.share_contact_consent === 1,
    status: row.status,
    answers: JSON.parse(row.answers_json) as MatchAnswers
  };
}

function accepts(desired: MatchAnswers['desiredGenders'], gender: MatchAnswers['gender']): boolean {
  if (desired.includes('all')) return true;
  if (gender === 'undisclosed') return false;
  if (gender === 'nonbinary' || gender === 'other') return desired.includes('nonbinary_or_other');
  return desired.includes(gender);
}
function intentSet(i: MatchAnswers['intent']): string[] {
  return i === 'either' ? ['friends','dating'] : [i];
}

export function compatible(a: Candidate, b: Candidate): boolean {
  if (a.id === b.id || a.status !== 'eligible' || b.status !== 'eligible') return false;
  if (!a.adultAttested || !b.adultAttested || !a.shareContactConsent || !b.shareContactConsent) return false;
  if (!a.contactValue || !b.contactValue) return false;
  if (!accepts(a.answers.desiredGenders, b.gender) || !accepts(b.answers.desiredGenders, a.gender)) return false;
  if (!intentSet(a.answers.intent).some(i => intentSet(b.answers.intent).includes(i))) return false;
  if (a.school !== b.school && (a.answers.campusPreference === 'same_school' || b.answers.campusPreference === 'same_school')) return false;
  const ap=a.answers.departmentPreference||'either_department',bp=b.answers.departmentPreference||'either_department';
  if(ap!=='either_department'||bp!=='either_department') {
    const ag=a.answers.departmentGroup||programById(a.answers.programId)?.departmentGroup;
    const bg=b.answers.departmentGroup||programById(b.answers.programId)?.departmentGroup;
    if(!ag||!bg)return false; // Legacy unknown departments cannot satisfy a hard department constraint.
    const same=a.school===b.school&&ag===bg;
    if((ap==='same_department'||bp==='same_department')&&!same)return false;
    if((ap==='different_department'||bp==='different_department')&&same)return false;
  }
  return true;
}

function sameOrFlexible(a: string, b: string, flexible: string): number {
  return a === b ? 1 : a === flexible || b === flexible ? 0.75 : 0.2;
}
function chatScore(a: string, b: string): number {
  if (a === b) return 1;
  const key = [a,b].sort().join(':');
  return key === 'deep:often' ? 0.6 : key === 'deep:meet' ? 0.5 : 0.2;
}
function firstMeetScore(a: string, b: string): number {
  if (a === b) return 1;
  const casual = ['cafe','walk','food'];
  return casual.includes(a) && casual.includes(b) ? 0.65 : a === 'chat_first' || b === 'chat_first' ? 0.45 : 0.2;
}
export function scorePair(a: Candidate, b: Candidate): number {
  const x = a.answers, y = b.answers;
  const common = x.interests.filter(tag => y.interests.includes(tag)).length;
  const interests = 2 * common / (x.interests.length + y.interests.length);
  const values = (
    sameOrFlexible(x.dayOffStyle, y.dayOffStyle, 'both') +
    sameOrFlexible(x.conflictStyle, y.conflictStyle, 'depends') +
    (x.topValue === y.topValue ? 1 : 0.35)
  ) / 3;
  const weighted = 20 * interests + 30 * values + 20 * chatScore(x.chatStyle,y.chatStyle) + 15 * firstMeetScore(x.firstMeet,y.firstMeet);
  return Math.round(10000 * weighted / 85) / 100;
}

function tieBreak(a: string, b: string): number {
  const key = [a,b].sort().join('|');
  let h = 2166136261;
  for (let i=0;i<key.length;i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0) % 1000;
}

export function solveEdges(n: number, edges: [number,number,number][]): [number,number][] {
  if (n < 2 || edges.length === 0) return [];
  // Integer weights preserve score precision, with deterministic tiny tie breakers.
  const mate = blossom(edges, true);
  const out: [number,number][] = [];
  for (let i=0;i<n;i++) {
    const j = mate[i] ?? -1;
    if (j > i) {
      if (mate[j] !== i || !edges.some(([a,b]) => a === i && b === j)) throw new Error('Blossom invariant violated');
      out.push([i,j]);
    }
  }
  return out;
}

export function computePlan(candidates: Candidate[], minScore = 55, acceptPair: (a:Candidate,b:Candidate)=>boolean = ()=>true): MatchPlan {
  const eligible = candidates.filter(c => c.status === 'eligible' && c.adultAttested && c.shareContactConsent && c.contactValue).sort((a,b) => a.id.localeCompare(b.id));
  if (eligible.length > 300) throw new Error('Round exceeds safe synchronous matching limit (300); use offline reviewed batch');
  const edges: [number,number,number][] = [];
  const scores = new Map<string,number>();
  for (let i=0;i<eligible.length;i++) for (let j=i+1;j<eligible.length;j++) {
    if (!compatible(eligible[i],eligible[j]) || !acceptPair(eligible[i],eligible[j])) continue;
    const score = scorePair(eligible[i],eligible[j]);
    if (score < minScore) continue;
    scores.set(i + ':' + j, score);
    // The sum of all tie breakers must never outweigh one hundredth of score.
    const scoreScale = Math.floor(eligible.length / 2) * 999 + 1;
    edges.push([i,j,Math.round(score*100)*scoreScale + tieBreak(eligible[i].id,eligible[j].id)]);
  }
  const pairs = solveEdges(eligible.length,edges).map(([i,j]) => ({
    a: eligible[i].id,
    b: eligible[j].id,
    score: scores.get(i + ':' + j)!
  })).sort((a,b) => a.a.localeCompare(b.a) || a.b.localeCompare(b.b));
  const selectedScores = pairs.map(p => p.score).sort((a,b)=>a-b);
  const sum = selectedScores.reduce((a,b)=>a+b,0);
  const mid = Math.floor(selectedScores.length/2);
  const median = selectedScores.length % 2 ? selectedScores[mid] : (selectedScores[mid-1]+selectedScores[mid])/2;
  const used = new Set(pairs.flatMap(p=>[p.a,p.b]));
  if (used.size !== pairs.length*2) throw new Error('Duplicate match member');
  return {
    pairs, eligibleCount: eligible.length, validEdges: edges.length,
    unmatchedCount: eligible.length - used.size,
    matchRate: eligible.length ? Math.round(10000*used.size/eligible.length)/100 : 0,
    meanScore: selectedScores.length ? Math.round(100*sum/selectedScores.length)/100 : null,
    medianScore: selectedScores.length ? Math.round(100*median)/100 : null
  };
}

export async function sha256(data: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function snapshotHash(rows: EntryRow[]): Promise<string> {
  const sorted = [...rows].sort((a,b)=>a.id.localeCompare(b.id));
  return sha256(JSON.stringify(sorted.map(r => [r.id,r.round_id,r.status,r.school_claimed,r.gender,
    r.adult_attested,r.share_contact_consent,r.nickname,r.answers_json,r.contact_kind,
    r.contact_value,r.normalized_email,r.privacy_version])));
}
export async function planDigest(roundId: string, snapshot: string, plan: MatchPlan): Promise<string> {
  return sha256(JSON.stringify([ALGORITHM_VERSION,roundId,snapshot,plan.pairs]));
}
