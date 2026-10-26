#!/usr/bin/env python3
"""Extract structured gameplay data without changing catalogue IDs or local user data.
Usage: extract_standard_data.py HTML SOURCE_DIRECTORY RETREAT_CHECKS_JSON [--write]
Source directory: PokemonTCG/pokemon-tcg-data cards/en/*.json.
Retreat checks: [{id, name, url, retreat}], independently checked card pages.
"""
import argparse,collections,hashlib,json,pathlib,re
p=argparse.ArgumentParser(description=__doc__);p.add_argument('html',type=pathlib.Path);p.add_argument('sources',type=pathlib.Path);p.add_argument('retreat_checks',type=pathlib.Path);p.add_argument('--write',action='store_true');args=p.parse_args()
s=args.html.read_text();match=re.search(r'(<script[^>]*application/json[^>]*>)(.*?)(</script>)',s,re.S);assert match
catalog=json.loads(match[2]);cards=catalog['entities'];index={};manifest=[]
for path in sorted(args.sources.glob('*.json')):
 rows=json.loads(path.read_text());assert isinstance(rows,list)
 index.update({r['id']:r for r in rows});manifest.append({'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
checks={r['id']:r for r in json.loads(args.retreat_checks.read_text())}
counts=collections.Counter();missing=[];legacy=[]
modern={}
for c in cards:
 if c['card_type']=='Trainer' and c.get('stage'):modern.setdefault(c['name'],set()).add(c['stage'].split(',')[0])
for c in cards:
 representative=c['printings'][0]['printing_id'];raw=index[representative]
 assert raw['name']==c['name'],representative
 notes=[];source='https://github.com/PokemonTCG/pokemon-tcg-data/blob/39a26a144c8b6ef6c2fb17b2c29d0bb7121e3a11/cards/en/'+representative.rsplit('-',1)[0]+'.json'
 c['subtypes']=list(raw.get('subtypes',[]));c['types']=list(raw.get('types',[]))
 c['abilities']=[{'name':a['name'],'type':a.get('type','Ability'),'text':a.get('text','')} for a in raw.get('abilities',[])]
 c['attacks']=[]
 for a in raw.get('attacks',[]):
  cost=list(a.get('cost',[]));energy_count=sum(x!='Free' for x in cost)
  attack={'name':a['name'],'cost':cost,'converted_energy_cost':energy_count,'damage':a.get('damage',''),'text':a.get('text','')}
  if a.get('convertedEnergyCost')!=energy_count:notes.append('Attack energy count derived from symbols: '+a['name']);counts['normalized_attack_energy_counts']+=1
  c['attacks'].append(attack)
 c['rules']=list(raw.get('rules',[]));c['weaknesses']=list(raw.get('weaknesses',[]));c['resistances']=list(raw.get('resistances',[]))
 if c['card_type']=='Pokémon':
  if c['retreat_cost'] is None:
   check=checks[c['entity_id']];assert check['retreat']==0
   c['retreat_cost']='0';notes.append('Free retreat independently confirmed: '+check['url']);counts['free_retreat_filled']+=1
  c['retreat_energy_cost']=list(raw.get('retreatCost',[]))
  if not c.get('stage') and representative=='me5-42':
   c['stage']='Basic';c['supertype']='Pokémon – Basic';c['subtypes']=['Basic'];notes.append('Basic stage confirmed: https://limitlesstcg.com/cards/PBL/42');counts['pokemon_stage_filled']+=1
  for field in ['name','stage','hp','pokemon_types','attack_names','combined_text','weakness','retreat_cost']:
   # No printed Weakness is legitimate on Dragon Pokémon and some other cards.
   if field=='weakness' and not raw.get('weaknesses'):continue
   if c.get(field) in [None,'']:missing.append({'id':c['entity_id'],'name':c['name'],'field':field})
 elif c['card_type']=='Trainer' and not c.get('stage'):
  subtype=modern.get(c['name'],set())
  if subtype=={'Item'}:
   c['stage']='Item';c['supertype']='Trainer – Item';c['subtypes']=['Item'];counts['legacy_item_category_filled']+=1
   notes.append('Legacy Trainer classified as Item using same-named modern catalogue printings. Printed effect text retained; current wording/errata should be checked for play.')
  else:legacy.append({'id':c['entity_id'],'name':c['name'],'reason':'Legacy Trainer has no printed subtype; unresolved modern classification.'})
 # Basic Energy has no printed attack/Ability/effect text. Mark this explicitly.
 c['basic_energy_type']=None
 if c['card_type']=='Energy' and 'Basic' in c['subtypes']:
  for typ in ['Grass','Fire','Water','Lightning','Psychic','Fighting','Darkness','Metal']:
   if typ in c['name']:c['basic_energy_type']=typ;break
  assert c['basic_energy_type'],c['name'];counts['basic_energy_records']+=1
 # Empty arrays mean no such printed component; absent optional publishing metadata remains null.
 c['extraction']={'status':'source-extracted','date':'2026-10-26','source_printing_id':representative,'source_url':source,'notes':notes}
 for printing in c['printings']:
  record=index[printing['printing_id']];counts['matched_printings']+=1
  for field,key in [('artist','artist'),('rarity','rarity'),('regulation_mark','regulationMark')]:
   if not printing.get(field) and record.get(key):printing[field]=record[key];counts['backfilled_'+field]+=1
 counts['records']+=1;counts['abilities']+=len(c['abilities']);counts['attacks']+=len(c['attacks']);counts['rule_paragraphs']+=len(c['rules'])
assert not missing,missing
counts['remaining_missing_artists']=sum(not p.get('artist') for c in cards for p in c['printings'])
counts['remaining_missing_rarities']=sum(not p.get('rarity') for c in cards for p in c['printings'])
counts['remaining_missing_regulation_marks']=sum(not p.get('regulation_mark') for c in cards for p in c['printings'])
report={'schema':'tcg-lab-standard-extraction-audit-v1','date':'2026-10-26','scope':catalog['scope'],'source_commit':'39a26a144c8b6ef6c2fb17b2c29d0bb7121e3a11','counts':dict(counts),'missing_required_gameplay_fields':missing,'legacy_classification_notes':legacy,'limitations':['Source-level extraction and consistency checks, not a visual review of every printed card.','Snapshot membership and gameplay IDs preserved; this is not a current legality update.','Some upstream printings lack artist, rarity or regulation metadata.','Legacy card effect wording retained; current errata and reprint equivalence not re-audited.'],'source_files':manifest}
catalog['extraction_audit']={k:v for k,v in report.items() if k!='source_files'}
if args.write:
 serialized=json.dumps(catalog,ensure_ascii=False,separators=(',',':')).replace('</','<\\/')
 s=s[:match.start(2)]+serialized+s[match.end(2):];args.html.write_text(s)
 (args.html.parent/'standard-data-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ['source_files','limitations']},ensure_ascii=False,indent=2))
