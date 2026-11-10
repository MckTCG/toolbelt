#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {
  INTAKE_SCHEMA,parseCardURL,safeHTTPS,normalizeCandidate,classifyCandidate,completeness,
  mechanicsSignature,keyFor,exportBatch,importBatch,readCSV
} from '../public/card-intake-core.mjs';

const html=await fs.readFile('public/card-db.html','utf8');
const match=html.match(/<script id="catalog" type="application\/json">([\s\S]*?)<\/script>/);
assert(match,'Master DB catalogue script missing');
const master=JSON.parse(match[1]);
assert.equal(master.schema,'tcg-lab-catalog-v2');
assert(master.entities.length>2000);

assert.deepEqual(parseCardURL('https://limitlesstcg.com/cards/en/DLR/138').set_code,'DLR');
assert.equal(parseCardURL('https://limitlesstcg.com/cards/en/DLR/138').language,'en');
assert.equal(parseCardURL('https://www.pokebeach.com/example').source_kind,'article-or-other');
assert.throws(()=>parseCardURL('javascript:alert(1)'),/HTTPS/);
assert.throws(()=>parseCardURL('https://user:secret@limitlesstcg.com/cards/en/DLR/138'),/HTTPS/);
assert.equal(safeHTTPS('http://example.com'),'');
assert.throws(()=>normalizeCandidate({source_url:'https://limitlesstcg.com/cards/en/DLR/84',set_code:'ASC'}),/differs/);
const ray=normalizeCandidate({source_url:'https://limitlesstcg.com/cards/en/DLR/84',name:'Mega Rayquaza ex',category:'Pokémon'});
assert.equal(classifyCandidate(ray,master).kind,'duplicate-printing');
assert.equal(keyFor(ray),'DLR#84');

const testCard=normalizeCandidate({
  source_url:'https://www.pokebeach.com/2026/11/test-item-reveal',
  language:'en',set_code:'TST',set_name:'Test Set',card_number:'1',
  name:'Intake Test Item',category:'Trainer',stage:'Item',
  rules_text:'Draw a card.',combined_text:'Draw a card.',
  regulation_mark:'J',rarity:'Uncommon',release_date:'2026/11/10',
  image_url:'https://example.org/approved-image.png',
  source_verified:true,artwork_verified:true,status:'approved'
});
assert.equal(classifyCandidate(testCard,master).kind,'new-gameplay');
assert.deepEqual(completeness(testCard,classifyCandidate(testCard,master)),[]);
assert(completeness({...testCard,source_verified:false}, {kind:'new-gameplay'}).length>0);
assert(completeness({...testCard,language:'jp'}, {kind:'new-gameplay'}).includes('Verified English language'));
assert.throws(()=>importBatch({schema:'invalid',cards:[]}),/Expected/);
assert.equal(importBatch(exportBatch([testCard]))[0].name,'Intake Test Item');
const csv='source_url,name,category,set_code,card_number,combined_text\n"https://www.pokebeach.com/x","Professor, Example",Trainer,TST,3,"Line one\nLine two"';
const parsed=readCSV(csv);assert.equal(parsed[0].name,'Professor, Example');assert(parsed[0].combined_text.includes('\n'));
assert.throws(()=>readCSV('name,category\n"unfinished,Trainer'),/Unclosed/);
const newPrint={...testCard,card_number:'2',source_url:'https://www.pokebeach.com/2026/11/test-item-reveal-alt'};
const base = await fs.mkdtemp(path.join(os.tmpdir(),'tcg-intake-test-'));
const dbFile=path.join(base,'db.html'),batchFile=path.join(base,'batch.json'),reportFile=path.join(base,'report.json');
try {
  await fs.copyFile('public/card-db.html',dbFile);
  async function run(batch,apply=false){
    await fs.writeFile(batchFile,JSON.stringify({schema:INTAKE_SCHEMA,cards:batch}));
    return spawnSync(process.execPath,['scripts/publish-card-intake.mjs','--batch',batchFile,'--db',dbFile,'--report',reportFile,...(apply?['--apply']:[])],{encoding:'utf8',timeout:30000});
  }
  const digest=await fs.readFile(dbFile,'utf8');
  let command=await run([testCard]);
  assert.equal(command.status,0,command.stderr);
  assert.equal(await fs.readFile(dbFile,'utf8'),digest,'dry run mutated database');
  command=await run([{...testCard,source_verified:false}],true);
  assert.notEqual(command.status,0,'unverified record was allowed to publish');
  assert.equal(await fs.readFile(dbFile,'utf8'),digest,'rejected batch mutated database');
  command=await run([testCard],true);
  assert.equal(command.status,0,command.stderr);
  let updated=JSON.parse((await fs.readFile(dbFile,'utf8')).match(/<script id="catalog" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(updated.entities.length,master.entities.length+1);
  assert.equal(updated.entities.flatMap(e=>e.printings).length,master.entities.flatMap(e=>e.printings).length+1);
  assert.equal(updated.sets.find(s=>s.set_code==='TST').imported_printings,1);
  const entity=updated.entities.find(e=>e.name==='Intake Test Item');
  assert(entity?.entity_id.startsWith('ce_intake_'));
  assert.equal(entity.printings[0].printing_id,'TST-001');
  assert.equal(classifyCandidate(newPrint,updated).kind,'new-printing');
  command=await run([newPrint],true);
  assert.equal(command.status,0,command.stderr);
  updated=JSON.parse((await fs.readFile(dbFile,'utf8')).match(/<script id="catalog" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(updated.entities.filter(e=>e.name==='Intake Test Item').length,1,'alternate printing duplicated gameplay');
  assert.equal(updated.entities.find(e=>e.name==='Intake Test Item').printings.length,2);
  assert.equal(updated.sets.find(s=>s.set_code==='TST').imported_printings,2);
  command=await run([testCard],true);
  assert.notEqual(command.status,0,'duplicate printing was allowed to re-import');
  command=await run([testCard,{...newPrint,card_number:'3',source_verified:false}],true);
  assert.notEqual(command.status,0,'partial batch was allowed to publish');
  updated=JSON.parse((await fs.readFile(dbFile,'utf8')).match(/<script id="catalog" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(updated.sets.find(s=>s.set_code==='TST').imported_printings,2,'partial failure mutated database');
  assert.equal(mechanicsSignature(entity),mechanicsSignature(updated.entities.find(e=>e.name==='Intake Test Item')));
} finally {await fs.rm(base,{recursive:true,force:true})}
console.log('PASS Card Intake: source validation, exact printing dedupe, ambiguous identity gate, CSV/JSON, dry-run safety, approved publication, alternate printing grouping, full batch atomicity.');
