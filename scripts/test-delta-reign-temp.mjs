// Run: node scripts/test-delta-reign-temp.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const seed=JSON.parse(readFileSync(new URL('../public/data/delta-reign-temp-seed.json',import.meta.url),'utf8'));
assert.equal(seed.schema,'tcg-lab-delta-reign-temp-seed-v1');
assert.equal(seed.cards.length,113);
assert.equal(seed.supplementalCardsOmitted,22);
assert.match(seed.set.code,/^TMP[A-Z0-9]{5,40}$/);
assert.equal(new Set(seed.cards.map(c=>c.id)).size,113);
const nums=seed.cards.map(c=>Number(c.id.slice(-3))).sort((a,b)=>a-b);
assert.deepEqual(nums,Array.from({length:113},(_,i)=>i+1));
for(const c of seed.cards){
 assert.match(c.id,/^temp:[a-z0-9]{5,60}$/);
 assert.equal(c.setCode,seed.set.code);
 assert.ok(['Pokémon','Trainer','Energy'].includes(c.category));
 assert.ok(c.name?.trim() && c.textEN?.trim());
 assert.ok(c.image.startsWith('https://'));
 assert.equal(c.status,'provisional');
}
const norm=v=>String(v||'').toLowerCase().trim().replace(/\s+/g,' ');
const number=v=>String(v||'').split('/')[0].replace(/^0+/,'')||'0';
const duplicate=(items,c,codes)=>items.some(x=>x.id===c.id||(codes.has(x.setCode)&&number(x.number)===number(c.number)&&norm(x.name)===norm(c.name)));
function merge(store){
 const output=structuredClone(store);
 const known=output.tempSets.filter(s=>/delta[\s-]?reign|storm[\s-]?emeralda/i.test(s.name)||s.code===seed.set.code);
 const set=known[0]||{code:seed.set.code,name:seed.set.name};
 if(!known.length)output.tempSets.push(set);
 const codes=new Set([...known.map(s=>s.code),set.code]);let added=0;
 for(const c of seed.cards)if(!duplicate(output.tempCards,c,codes)){
  output.tempCards.push({...c,setCode:set.code});added++;
 }
 return {output,added};
}
const existing={tags:{'temp:originaltest1':[{id:'note',label:'Keep'}]},rejected:{},
 tempSets:[{code:'TMPOTHERCARD',name:'Other TEMP'}],
 tempCards:[{id:'temp:originaltest1',setCode:'TMPOTHERCARD',name:'Unrelated',number:'7'}]};
const once=merge(existing);assert.equal(once.added,113);
const twice=merge(once.output);assert.equal(twice.added,0);
assert.deepEqual(once.output.tags,existing.tags);
assert.deepEqual(once.output.rejected,existing.rejected);
assert.deepEqual(once.output.tempCards[0],existing.tempCards[0]);
assert.deepEqual(once.output.tempSets[0],existing.tempSets[0]);
console.log('Delta Reign TEMP seed: 113 valid printings, no duplicate reimport, local records preserved.');
