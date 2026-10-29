import { PROGRAMS } from '../src/shared/programs';
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
  it('maximizes original score after cardinality, checked against exhaustive search',()=>{
    const people=Array.from({length:10},(_,i)=>person('p'+i,{answers:{...person('base').answers,
      interests:i%2?['音樂']:['羽球','音樂'],dayOffStyle:i%3?'plan':'both',
      chatStyle:i%2?'often':'deep',firstMeet:i%3?'walk':'cafe'}}));
    function best(ids:number[]):[number,number] {
      if(ids.length<2)return [0,0];
      const [a,...rest]=ids;let result=best(rest);
      for(const b of rest){
        const score=scorePair(people[a],people[b]);if(score<55)continue;
        const tail=best(rest.filter(i=>i!==b));
        const candidate:[number,number]=[tail[0]+1,tail[1]+Math.round(score*100)];
        if(candidate[0]>result[0] || candidate[0]===result[0]&&candidate[1]>result[1])result=candidate;
      }
      return result;
    }
    const plan=computePlan(people,55);
    expect([plan.pairs.length,plan.pairs.reduce((sum,p)=>sum+Math.round(p.score*100),0)])
      .toEqual(best(people.map((_,i)=>i)));
  });
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
    expect(compatible(person('h',{answers:{...a.answers,desiredGenders:['man']}}),person('g',{gender:'undisclosed',answers:{...a.answers,desiredGenders:['man']}}))).toBe(false);
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

it('enforces reciprocal same/different department rules across degrees and schools',()=>{
 const undergrad=PROGRAMS.find(p=>p.school==='NTHU'&&p.degree==='bachelor'&&p.name==='資訊工程學系')!;
 const graduate=PROGRAMS.find(p=>p.school==='NTHU'&&p.degree==='master'&&p.name==='資訊工程學系')!;
 const same={...person('a').answers,schoolClaimed:'NTHU' as const,programId:undergrad.id,departmentGroup:undergrad.departmentGroup,departmentPreference:'same_department' as const};
 const a=person('a',{school:'NTHU',answers:same}),b=person('b',{school:'NTHU',answers:{...same,degreeLevel:'master',programId:graduate.id}});
 expect(compatible(a,b)).toBe(true);
 b.answers.departmentPreference='different_department';expect(compatible(a,b)).toBe(false);
 a.answers.departmentPreference='different_department';expect(compatible(a,b)).toBe(false);
 b.answers.departmentGroup='NYCU:獨立研究所';expect(compatible(a,b)).toBe(true);
 a.answers.departmentPreference='same_department';expect(compatible(a,b)).toBe(false);
 b.school='NYCU';b.answers.departmentGroup=undergrad.departmentGroup;expect(compatible(a,b)).toBe(false);
 a.answers.departmentPreference='different_department';expect(compatible(a,b)).toBe(true);
 const unknown=person('legacy');expect(compatible(a,unknown)).toBe(false);
});
