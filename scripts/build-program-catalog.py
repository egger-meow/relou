"""Rebuild the public program catalog from reviewed, non-personal official source rows.
Run: python scripts/build-program-catalog.py
Raw MOE download: https://stats.moe.gov.tw/files/opendata/students.csv
Keep only identifiers from academic year 114; merge reviewed 115 additions separately.
"""
import csv, hashlib, json, re
from pathlib import Path
root=Path(__file__).resolve().parent.parent
rows=list(csv.DictReader((root/'data/programs-moe114.csv').open(encoding='utf-8')))
patches=json.loads((root/'data/programs-115-additions.json').read_text(encoding='utf-8'))
for patch in patches:
 rows.append({**patch,'moeCode':''})
def group_name(name):
 # Same named department across degrees; do not equate independent institutes by fuzzy similarity.
 if ('碩士' in name or '博士' in name) and '學系' in name:
  return name[:name.index('學系')+2]
 return re.sub(r'(?:碩士|博士)(?:在職)?(?:學位學程|學程|班|專班)$','',name)
programs={}
for row in rows:
 school,degree,name=row['school'],row['degree'],row['name']
 key=(school,degree,name)
 programs[key]={'id':school+'-'+degree+'-'+hashlib.sha256(name.encode()).hexdigest()[:12],
  'school':school,'degree':degree,'name':name,'departmentGroup':school+':'+group_name(name),
  'sourceYear':row.get('sourceYear',115) if key in {(p['school'],p['degree'],p['name']) for p in patches} else 114,
  'moeCode':row.get('moeCode','')}
programs=sorted(programs.values(),key=lambda p:(p['school'],p['degree'],p['name']))
assert len({p['id'] for p in programs})==len(programs)
(root/'src/shared/programs.json').write_text(json.dumps(programs,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
with (root/'data/programs.csv').open('w',encoding='utf-8',newline='') as f:
 writer=csv.DictWriter(f,fieldnames=list(programs[0]));writer.writeheader();writer.writerows(programs)
for school in ['NYCU','NTHU']:
 print(school,{degree:sum(p['school']==school and p['degree']==degree for p in programs) for degree in ['bachelor','master','doctor']})
