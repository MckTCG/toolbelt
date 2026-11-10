#!/usr/bin/env node
import assert from 'node:assert/strict';
import {planBulkTempAcceptance} from '../public/temp-intake-core.mjs';

const url='https://www.pokebeach.com/2026/11/three-reveals';
function card(id,name,num,extra={}){
 return {discovery_id:id.repeat(22),source_url:url,name,set_name:'Example Japanese Expansion',
 card_number:String(num),category:'Pokémon',language:'jp',stage:'Basic',
 image_url:'https://example.org/'+id+'.png',status:'provisional',...extra};
}
const queue=[
 card('a','ワンパチ',21),
 card('b','パルスワン',22),
 card('c','Unnamed type',23,{category:''}),
 card('d','Different name',21),
 card('e','Previously published',29),
 card('f','Reviewed changed',24,{hp:'110'})
];
const old={schema:'tcg-lab-backup-v1',
 tags:{private_tag:[{label:'Personal'}]},rejected:{old:true},
 tempSets:[{code:'TMPPRE',name:'Other Expansion'}],
 tempCards:[{id:'temp:reveal:reviewed',setCode:'TMPPRE',name:'Reviewed changed',
 number:'24',hp:'80',category:'Pokémon',discoveryId:'f'.repeat(22)}]};
const baseline=JSON.stringify(old);
const run=planBulkTempAcceptance(queue,[0,1,2,3,4,5,0],old,{
 seedTags:{},now:'2026-11-10T12:00:00Z',
 centralCards:[{id:'temp:published',discoveryId:'e'.repeat(22)}]
});
assert.equal(run.requested,6);
assert.equal(run.accepted.length,2);
assert.deepEqual(run.accepted.map(c=>c.index),[0,1]);
assert.equal(run.skipped.length,4);
assert(run.skipped.some(x=>x.index===2&&x.reason.includes('Choose Pokémon')));
assert(run.skipped.some(x=>x.index===3&&x.reason.includes('Collector number')));
assert(run.skipped.some(x=>x.index===4&&x.reason.includes('Already published')));
assert(run.skipped.some(x=>x.index===5&&x.reason.includes('review')));
assert.equal(run.store.tempCards.length,3);
assert.equal(run.store.tempCards.find(x=>x.name==='Reviewed changed').hp,'80',
  'Existing record silently updated');
assert.equal(run.store.tempCards.find(x=>x.name==='ワンパチ').textEN,'');
assert.deepEqual(run.store.tags,old.tags);
assert.deepEqual(run.store.rejected,old.rejected);
assert.equal(JSON.stringify(old),baseline,'Planning mutated original storage');
const again=planBulkTempAcceptance(queue,[0,1],run.store,{seedTags:{}});
assert(again.accepted.every(x=>x.kind==='unchanged'),'Repeat acceptance duplicated a card');
assert.equal(again.store.tempCards.length,3);
assert.throws(()=>planBulkTempAcceptance(queue,[6],old),/invalid queue indexes/);
assert.throws(()=>planBulkTempAcceptance(queue,Array(501).fill(0),old),/oversized/);
const subset=planBulkTempAcceptance(queue,[1],old,{seedTags:{}});
assert.equal(subset.accepted.length,1);
assert.equal(subset.store.tempCards.length,2);
assert.equal(subset.store.tempCards.find(x=>x.name==='パルスワン').card_number,undefined);
console.log('PASS bulk TEMP: independent JP-only selections, duplicate suppression, conflict skip, central skip, source integrity and idempotence.');
