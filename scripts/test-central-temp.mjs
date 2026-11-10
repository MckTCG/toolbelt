#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {
  CENTRAL_TEMP_SCHEMA,CENTRAL_TEMP_PROPOSAL_SCHEMA,parseCentralTemp,
  mergeTempStores,createTempProposal,compareCentralProposal
} from '../public/temp-central-core.mjs';
import {planTempAcceptance} from '../public/temp-intake-core.mjs';
import {combineCatalog} from '../public/proxy-import-core.mjs';
const db=await fs.readFile('public/card-db.html','utf8');
const master=JSON.parse(db.match(/<script id="catalog" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const baseline=parseCentralTemp(JSON.parse(await fs.readFile('public/data/temp-catalog-v1.json','utf8')));
assert.equal(baseline.schema,CENTRAL_TEMP_SCHEMA);
assert.equal(baseline.cards.length,0,'First central release must not invent records');
const candidate={source_url:'https://www.pokebeach.com/2026/11/japanese-only-test',
  discovery_id:'f'.repeat(22),set_name:'Unreleased JP Set',card_number:'21',
  name:'ワンパチ',category:'Pokémon',stage:'Basic',language:'jp',
  image_url:'https://example.org/test-jp.jpg',
  review_note:'Personal confidential note should NOT leave the browser',
  status:'provisional'};
const local={schema:'tcg-lab-backup-v1',tags:{secret_private_tag:[{label:'PRIVATE'}]},
  rejected:{secret_note:true},tempSets:[],tempCards:[]};
const first=planTempAcceptance(candidate,local,{seedTags:{},now:'2026-11-10T15:00:00Z'});
assert.equal(first.kind,'created');
const proposal=createTempProposal(first.store);
assert.equal(proposal.schema,CENTRAL_TEMP_PROPOSAL_SCHEMA);
assert.equal(proposal.cards.length,1);
assert(proposal.cards[0].id.startsWith('temp:reveal:'));
assert.equal(proposal.cards[0].textEN,'');
assert.equal(proposal.cards[0].language,'jp');
const serialized=JSON.stringify(proposal);
assert(!serialized.includes('secret_private_tag')&&!serialized.includes('PRIVATE')&&
  !serialized.includes('confidential note')&&!serialized.includes('secret_note'),
  'Proposal leaked personal tags or research notes');
assert(!serialized.includes('"tags"')&&!serialized.includes('"notes"')&&!serialized.includes('"rejected"'));
const planned=compareCentralProposal(baseline,proposal);
assert(planned.ok);
assert.deepEqual(planned.changes.map(x=>x.type),['new']);
assert.equal(planned.catalog.cards.length,1);
const centralized=planned.catalog;
const merged=mergeTempStores(first.store,centralized);
assert.equal(merged.view.tempCards.length,1,'Local unpublished duplicate should collapse with published identity');
assert.equal(merged.hiddenCollisions,1);
assert.deepEqual(merged.view.tags,local.tags);
assert.equal(first.store.tempCards.length,1,'Central merge mutated source local state');
const second={...candidate,discovery_id:'a'.repeat(22),name:'Test Rival',card_number:'22'};
const localOther=planTempAcceptance(second,first.store,{now:'2026-11-10T16:00:00Z'});
const view=mergeTempStores(localOther.store,centralized);
assert.equal(view.view.tempCards.length,2,'Local draft should remain playable alongside central card');
assert.deepEqual(view.view.tempCards.map(x=>x.name).sort(),['Test Rival','ワンパチ'].sort());
assert.equal(combineCatalog(master,view.view).cards.filter(x=>x.temp).length,2);

const collision={...proposal,cards:[{...proposal.cards[0],id:'temp:reveal:separate-identity'}]};
assert.equal(compareCentralProposal(centralized,collision).ok,false,'Identical set+number with another ID must block');
const newer={...proposal,cards:[{...proposal.cards[0],textEN:'Unofficial revision from public source'}]};
assert.equal(compareCentralProposal(centralized,newer).ok,false,'Updates require explicit review');
const update=compareCentralProposal(centralized,newer,{allowUpdates:true});
assert(update.ok&&update.changes[0].type==='updated');
assert.equal(update.catalog.cards[0].textEN,'Unofficial revision from public source');
assert.equal(centralized.cards[0].textEN,'','Previous central version mutated');
assert.throws(()=>parseCentralTemp({...centralized,cards:[...centralized.cards,...centralized.cards]}),/Duplicate/);
assert.throws(()=>parseCentralTemp({...centralized,cards:[{...centralized.cards[0],image:'javascript:alert(1)'}]}),/HTTPS/);
assert.throws(()=>createTempProposal({...local,tempSets:[],tempCards:[]}),/Accept at least one/);

// CLI smoke: dry run must not modify the central file; apply is atomic;
// duplicate/colliding updates must leave file unchanged on error.
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'temp-central-test-'));
const dbFile=path.join(directory,'central.json'),proposalFile=path.join(directory,'proposal.json');
async function run(payload,args=[]){
  await fs.writeFile(proposalFile,JSON.stringify(payload));
  return spawnSync(process.execPath,['scripts/publish-central-temp.mjs',
    '--proposal',proposalFile,'--catalog',dbFile,...args],{encoding:'utf8',timeout:30000});
}
try{
 await fs.writeFile(dbFile,JSON.stringify(baseline));
 let result=await run(proposal);
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(await fs.readFile(dbFile,'utf8')),baseline,'Dry run modified central TEMP');
 result=await run(proposal,['--apply']);
 assert.equal(result.status,0,result.stderr);
 const published=JSON.parse(await fs.readFile(dbFile,'utf8'));
 assert.equal(published.cards.length,1);
 result=await run(collision,['--apply']);
 assert.notEqual(result.status,0,'Collision was published');
 assert.equal(JSON.parse(await fs.readFile(dbFile,'utf8')).cards.length,1);
 result=await run(newer,['--apply']);
 assert.notEqual(result.status,0,'Unreviewed revision was published');
 result=await run(newer,['--allow-updates','--apply']);
 assert.equal(result.status,0,result.stderr);
 assert.equal(JSON.parse(await fs.readFile(dbFile,'utf8')).cards[0].textEN,'Unofficial revision from public source');
}finally{await fs.rm(directory,{recursive:true,force:true})}
console.log('PASS central TEMP: JP-only public proposal, private-data stripping, reviewed atomic publisher, collision and update protection, local+central read-only integration.');
