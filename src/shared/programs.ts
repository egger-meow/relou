import data from './programs.json';
export type DegreeLevel='bachelor'|'master'|'doctor';
export interface Program {id:string;school:string;degree:string;name:string;departmentGroup:string;sourceYear:number;moeCode:string}
export const PROGRAMS:Program[]=data;
export const PROGRAM_CATALOG_VERSION='moe114-plus115-2026-10-29';
const byId=new Map(PROGRAMS.map(p=>[p.id,p]));
export function programById(id:string|undefined){return id?byId.get(id):undefined;}
