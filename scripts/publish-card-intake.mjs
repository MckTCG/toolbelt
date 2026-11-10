#!/usr/bin/env node
/**
 * Publish an explicitly approved intake batch to the static Master Card DB.
 * Safe default = dry run. Never merges into main or writes on discovery.
 * Usage: node scripts/publish-card-intake.mjs --batch path.json [--apply] [--db public/card-db.html] [--report path.json]
 */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import {importBatch,classifyCandidate,completeness,mechanicsSignature,keyFor} from '../public/card-intake-core.mjs';
const argv=process.argv.slice(2);
const arg=(key, fallback='')=>{const i=argv.indexOf(key);return i>=0?argv[i+1]||fallback:fallback};
const batchFile=arg('--batch'),dbFile=arg('--db','public/card-db.html'),reportFile=arg('--report'),apply=argv.includes('--apply');
if(!batchFile || argv.includes('--help')){console.log('Usage: node scripts/publish-card-intake.mjs --batch path.json [--apply] [--db path.html] [--report path.json]');process.exit(batchFile?0:2)}
const normalize = s=>String(s||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
const hash = value=>crypto.createHash('sha256').update(String(value)).digest('hex').slice(0,18);
const join = a=>a.map(x=>x||'').join(' | ')||null;
const nonempty = a=>Array.isArray(a)?a.filter(Boolean):[];
const status = {schema:'tcg-lab-card-intake-publish-report-v1',dryRun:!apply,accepted:[],rejected:[],before:{},after:{}};
const original=await fs.readFile(dbFile,'utf8');
const pattern=/(<script id="catalog" type="application\/json">)([\s\S]*?)(<\/script>)/;
const match=original.match(pattern);
if(!match)throw Error('Card DB catalogue not found');
const catalog=JSON.parse(match[2]);
if(catalog.schema!=='tcg-lab-catalog-v2'||!Array.isArray(catalog.entities)||!Array.isArray(catalog.sets))throw Error('Unexpected Master DB schema');
const candidates=importBatch(JSON.parse(await fs.readFile(batchFile,'utf8')));
const idsBefore=new Set(catalog.entities.map(x=>x.entity_id));
const printKeysBefore=new Set(catalog.entities.flatMap(e=>e.printings||[]).map(keyFor));
const idSet=new Set(idsBefore);
const printingIdSet=new Set(catalog.entities.flatMap(e=>(e.printings||[]).map(p=>p.printing_id)));
const entitiesSnapshot=new Map(catalog.entities.map(e=>[e.entity_id,JSON.stringify({...e,printings:undefined})]));
const beforeCount=catalog.entities.reduce((n,e)=>n+(e.printings||[]).length,0);
status.before={entities:catalog.entities.length,printings:beforeCount,sets:catalog.sets.length};
const approved=candidates.filter(x=>x.status==='approved');
if(!approved.length)throw Error('No approved candidates. Review and approve candidates before publishing.');
const candidateKeys=new Set();
function checks(candidate, classification) {
 const problems=completeness(candidate,classification);
 const key=keyFor(candidate);
 if(candidateKeys.has(key))problems.push('Duplicate set+number inside import batch');
 candidateKeys.add(key);
 if(candidate.category==='Pokémon' && !candidate.existing_entity_id && classification.kind!=='new-printing' &&
    !candidate.attacks.length && !candidate.abilities.length)problems.push('Structured Pokémon attacks/Abilities');
 if(candidate.category==='Trainer' && !candidate.existing_entity_id && classification.kind!=='new-printing' &&
    !candidate.rules_text && !candidate.rules.length)problems.push('Structured Trainer rules text');
 if(candidate.category==='Energy' && !candidate.existing_entity_id && classification.kind!=='new-printing' &&
    !candidate.rules_text && !candidate.rules.length)problems.push('Structured Energy rules text');
 const set=catalog.sets.find(s=>s.set_code===candidate.set_code);
 if(set && normalize(set.name)!==normalize(candidate.set_name))problems.push('Set name disagrees with established catalogue: '+set.name);
 if(!/^([A-Z0-9]{2,12})$/.test(candidate.set_code))problems.push('Invalid set code');
 if(!/^[0-9]{1,5}[A-Za-z]?$/.test(candidate.card_number))problems.push('Invalid card number');
 const matchEntity = candidate.existing_entity_id ? catalog.entities.find(e=>e.entity_id===candidate.existing_entity_id):null;
 if(candidate.existing_entity_id && !matchEntity)problems.push('Linked gameplay identity does not exist');
 if(matchEntity) {
    if(normalize(matchEntity.name)!==normalize(candidate.name)||matchEntity.card_type!==candidate.category)
      problems.push('Linked gameplay identity name/category mismatch');
    if(normalize(matchEntity.combined_text)!==normalize(candidate.combined_text))
      problems.push('Linked gameplay identity gameplay text differs; manual equivalence/errata cannot be auto-published');
    for(const field of ['hp','stage','pokemon_types','evolves_from','weakness','resistance','retreat_cost']) {
      if(candidate[field] && normalize(matchEntity[field])!==normalize(candidate[field]))
        problems.push('Linked gameplay identity '+field+' mismatch');
    }
 }
 if(classification.kind==='new-printing' && candidate.existing_entity_id && candidate.existing_entity_id!==classification.entity_id)
   problems.push('Selected gameplay identity conflicts with exact match');
 if(classification.kind==='needs-review' && !candidate.existing_entity_id && !candidate.reviewed_distinct_gameplay)
   problems.push('Ambiguous gameplay identity not explicitly adjudicated');
 if(printKeysBefore.has(key))problems.push('Printing already published');
 return [...new Set(problems)];
}
function createEntity(c) {
 const attacks=nonempty(c.attacks),abilities=nonempty(c.abilities),rules=nonempty(c.rules.length?c.rules:(c.rules_text?[c.rules_text]:[]));
 const value={
   name:c.name,supertype:c.category+(c.stage?' – '+c.stage:''),card_type:c.category,stage:c.stage,
   pokemon_types:c.pokemon_types,hp:c.hp,evolves_from:c.evolves_from,
   ability_names:join(abilities.map(a=>a.name)),ability_effects:join(abilities.map(a=>a.text)),
   attack_names:join(attacks.map(a=>a.name)),attack_costs:join(attacks.map(a=>a.cost?.join?.(' ')||'')),
   attack_damage:join(attacks.map(a=>a.damage)),attack_effects:join(attacks.map(a=>a.text)),
   rules_text:rules.join('\n')||null,combined_text:c.combined_text,
   weakness:c.weakness||null,resistance:c.resistance||null,retreat_cost:c.retreat_cost||null,
   printings:[],subtypes:c.stage?[c.stage]:[],types:c.pokemon_types?[c.pokemon_types]:[],
   abilities,attacks,rules,weaknesses:[],resistances:[],retreat_energy_cost:Array.from({length:Number(c.retreat_cost)||0},()=> 'Colorless'),
   basic_energy_type:null,extraction:{status:'reviewed-source-import',date:new Date().toISOString().slice(0,10),source_url:c.source_url,notes:[c.review_note].filter(Boolean)}
 };
 let eid='ce_intake_'+hash(mechanicsSignature({...c,...value}));
 let suffix=1;while(idSet.has(eid))eid='ce_intake_'+hash(mechanicsSignature({...c,...value})+'-'+suffix++);
 value.entity_id=eid;idSet.add(eid);return value;
}
for (const c of approved) {
 const classification=classifyCandidate(c,catalog);
 const problems=checks(c,classification);
 if(problems.length){status.rejected.push({name:c.name,printing:keyFor(c),problems,classification});continue}
 let entity;
 const linked = c.existing_entity_id || (classification.kind==='new-printing'?classification.entity_id:'');
 if(linked)entity=catalog.entities.find(e=>e.entity_id===linked);
 else if(classification.kind==='new-gameplay'||(classification.kind==='needs-review'&&c.reviewed_distinct_gameplay)) {
   entity=createEntity(c);catalog.entities.push(entity);
 } else {status.rejected.push({name:c.name,printing:keyFor(c),problems:['Unresolved gameplay identity'],classification});continue}
 const baseId=c.set_code+'-'+c.card_number.padStart(3,'0');
 if(printingIdSet.has(baseId)){status.rejected.push({name:c.name,printing:keyFor(c),problems:['Printing ID collision: '+baseId]});continue}
 const printing={
   printing_id:baseId,set_code:c.set_code,card_number:c.card_number,image_url:c.image_url,
   rarity:c.rarity||'Unknown',artist:null,regulation_mark:c.regulation_mark,
   legal_basis:'Regulation mark recorded; eligibility and release date require current tournament-rule verification',
   release_date:c.release_date.replaceAll('-','/'),source_url:c.source_url,
   intake_review:{source_verified:true,artwork_verified:true,review_note:c.review_note||null,artwork_storage:'external-source; local asset not yet verified'}
 };
 entity.printings.push(printing);
 printingIdSet.add(baseId);printKeysBefore.add(keyFor(printing));
 let set=catalog.sets.find(x=>x.set_code===c.set_code);
 if(!set){set={set_code:c.set_code,name:c.set_name,first_release_date:c.release_date.replaceAll('-','/'),imported_printings:0,scope_note:'Reviewed English intake; not necessarily a complete expansion'};catalog.sets.push(set)}
 status.accepted.push({name:c.name,printing_id:baseId,entity_id:entity.entity_id,action:idsBefore.has(entity.entity_id)?'attach-printing':'new-gameplay'});
}
for(const set of catalog.sets){
 const count=catalog.entities.flatMap(e=>e.printings||[]).filter(p=>p.set_code===set.set_code).length;
 if(status.accepted.some(x=>x.printing_id.startsWith(set.set_code+'-')))set.imported_printings=count;
}
for(const e of catalog.entities) {
 if(entitiesSnapshot.has(e.entity_id) && JSON.stringify({...e,printings:undefined})!==entitiesSnapshot.get(e.entity_id))
   throw Error('Unexpected mutation of existing gameplay data: '+e.entity_id);
}
const allIds=catalog.entities.map(e=>e.entity_id),allPrintingKeys=catalog.entities.flatMap(e=>e.printings||[]).map(keyFor);
if(new Set(allIds).size!==allIds.length||new Set(allPrintingKeys).size!==allPrintingKeys.length)
 throw Error('Post-import uniqueness check failed');
status.after={entities:catalog.entities.length,printings:allPrintingKeys.length,sets:catalog.sets.length};
if(reportFile){await fs.mkdir(path.dirname(reportFile),{recursive:true});await fs.writeFile(reportFile,JSON.stringify(status,null,2)+'\n')}
console.log(JSON.stringify(status,null,2));
if(status.rejected.length){console.error('Import blocked: '+status.rejected.length+' approved candidate(s) rejected. No catalogue changes written.');process.exitCode=1}
else if(apply && status.accepted.length){
 const out=original.replace(pattern,(_full,open,_json,close)=>open+JSON.stringify(catalog)+close);
 const dest=dbFile+'.intake-tmp-'+process.pid;
 await fs.writeFile(dest,out,'utf8');
 await fs.rename(dest,dbFile);
 console.log('Applied '+status.accepted.length+' approved printings locally. Review git diff and raise a PR; never auto-merge.');
}
