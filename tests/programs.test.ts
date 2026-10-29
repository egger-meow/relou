import {it,expect} from 'vitest';
import {PROGRAMS} from '../src/shared/programs';
it('catalog includes both schools and three degrees with unique valid identifiers',()=>{
 expect(PROGRAMS.length).toBe(417);expect(new Set(PROGRAMS.map(p=>p.id)).size).toBe(PROGRAMS.length);
 for(const school of ['NYCU','NTHU'])for(const degree of ['bachelor','master','doctor'])
  expect(PROGRAMS.filter(p=>p.school===school&&p.degree===degree).length).toBeGreaterThan(25);
 expect(PROGRAMS.filter(p=>p.sourceYear===115)).toHaveLength(6);
 expect(PROGRAMS.some(p=>p.name==='腦科技跨領域工程碩士學位學程'&&p.degree==='master')).toBe(true);
 expect(PROGRAMS.some(p=>p.name==='藝術學院藝術跨域博士班'&&p.degree==='doctor')).toBe(true);
});
it('groups same departments across degrees without conflating independent institutes',()=>{
 const transport=PROGRAMS.filter(p=>p.school==='NYCU'&&p.name.startsWith('運輸與物流管理學系'));
 expect(transport.length).toBeGreaterThan(2);expect(new Set(transport.map(p=>p.departmentGroup)).size).toBe(1);
 const math=PROGRAMS.find(p=>p.school==='NTHU'&&p.name==='數學系')!;
 const compute=PROGRAMS.find(p=>p.school==='NTHU'&&p.name==='計算與建模科學研究所')!;
 expect(math.departmentGroup).not.toBe(compute.departmentGroup);
});
