// All boundaries are Taiwan time (UTC+8), with an exclusive close/end instant.
export const FIRST_MONTH = {year:2026,month:11};
const OFFSET=8*3600000;
export function monthlyRound(time=Date.now()) {
  const local=new Date(time+OFFSET);
  let year=local.getUTCFullYear(),month=local.getUTCMonth()+1;
  if(year*12+month<2026*12+11){year=2026;month=11;}
  const at=(day:number,next=0)=>new Date(Date.UTC(year,month-1+next,day)-OFFSET).toISOString();
  const sequence=(year-2026)*12+month-11+1;
  return {id:`monthly-${year}-${String(month).padStart(2,'0')}`,slug:`${year}-${String(month).padStart(2,'0')}`,
    title:`${year} 年 ${month} 月期 · 第 ${sequence} 期`,year,month,sequence,
    opensAt:at(1),closesAt:at(21),endAt:at(1,1),daysInMonth:new Date(Date.UTC(year,month,0)).getUTCDate()};
}
