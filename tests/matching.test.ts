import { describe, expect, it } from 'vitest';
import { compatible, computePlan, scorePair, solveEdges } from '../src/matching/engine';
import type { Candidate } from '../src/matching/engine';

function person(id:string, overrides:Partial<Candidate>={}):Candidate {
  const base:Candidate={
    id,school:'NYCU',gender:'man',status:'eligible',contactKind:'instagram',contactValue:'@sample',
    adultAttested:true,shareContactConsent:true,
    answers:{schoolClaimed:'NYCU',gender:'man',desiredGenders:['all'],intent:'either',
      campusPreference:'either_school',interests:['音樂','咖啡探店'],dayOffStyle:'both',
      conflictStyle:'depends',chatStyle:'deep',firstMeet:'cafe',topValue:'ease'}
  };
  return {...base,...overrides,answers:{...base.answers,...overrides.answers}};
}
describe('reciprocal matching',()=>{
  it('requires BOTH sides to accept gender',()=>{
    const a=person('a',{answers:{...person('a').answers,desiredGenders:['woman']}});
    const b=person('b',{gender:'woman',answers:{...person('b').answers,gender:'woman',desiredGenders:['woman']}});
    expect(compatible(a,b)).toBe(false);
    expect(compatible(a,person('c',{gender:'woman',answers:{...b.answers,desiredGenders:['man']}}))).toBe(true);
  });
  it('enforces intent, school, consent, age and undisclosed rules',()=>{
    const a=person('a',{answers:{...person('a').answers,intent:'friends'}});
    const b=person('b',{answers:{...person('b').answers,intent:'dating'}});
    expect(compatible(a,b)).toBe(false);
    expect(compatible(a,person('c',{answers:{...b.answers,intent:'either'}}))).toBe(true);
    expect(compatible(a,person('d',{school:'NTHU',answers:{...a.answers,campusPreference:'same_school'}}))).toBe(false);
    expect(compatible(a,person('e',{adultAttested:false}))).toBe(false);
    expect(compatible(a,person('f',{shareContactConsent:false}))).toBe(false);
    expect(compatible(a,person('g',{gender:'undisclosed',answers:{...a.answers,desiredGenders:['man']}}))).toBe(false);
  });
  it('is symmetric and bounded',()=>{
    const a=person('a');
    const b=person('b',{answers:{...person('b').answers,interests:['羽球'],chatStyle:'often',firstMeet:'walk'}});
    expect(scorePair(a,b)).toBe(scorePair(b,a));
    expect(scorePair(a,b)).toBeGreaterThanOrEqual(0);
    expect(scorePair(a,b)).toBeLessThanOrEqual(100);
  });
  it('finds two pairs where greedy finds only one',()=>{
    const pairs=solveEdges(4,[[0,1,100],[0,2,1],[1,3,1]]);
    expect(pairs).toEqual([[0,2],[1,3]]);
    expect(solveEdges(5,[[0,1,5],[1,2,5],[2,3,5],[3,4,5]]).length).toBe(2);
  });
  it('does not reuse a participant and is deterministic',()=>{
    const people=[person('d'),person('a'),person('c'),person('b'),person('e')];
    const a=computePlan(people,0),b=computePlan([...people].reverse(),0);
    expect(a.pairs).toEqual(b.pairs);
    expect(a.pairs.length).toBe(2);
    expect(new Set(a.pairs.flatMap(x=>[x.a,x.b])).size).toBe(4);
    expect(a.unmatchedCount).toBe(1);
  });
});
