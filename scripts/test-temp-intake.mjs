#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  TEMP_DB_KEY,planTempAcceptance,tempCandidateUpdates,tempDestination,tempReady,findTempMatch
} from '../public/temp-intake-core.mjs';
import {combineCatalog} from '../public/proxy-import-core.mjs';
import {deckChecks,makePayload,payloadURL,sanitizePayload} from '../public/deck-core.mjs';
const html=fs.readFileSync(new URL('../public/card-db.html',import.meta.url),'utf8');
const m=html.match(/<script id="catalog" type="application\/json">([\s\S]*?)<\/script>/);
assert(m);
const catalog=JSON.parse(m[1]);
assert(catalog.reviewed_seed && Object.keys(catalog.reviewed_seed).length>0);
assert.equal(TEMP_DB_KEY,'tcg-lab-card-db-v0.1');

const base={source_url:'https://www.pokebeach.com/2026/11/example-japanese-only',
  discovery_id:'b'.repeat(22),set_name:'Example JP Set',card_number:'21',
  name:'ワンパチ',category:'Pokémon',stage:'Basic',pokemon_types:'Lightning',
  hp:'70',language:'jp',image_url:'https://example.org/real-jp-card.png',
  review_note:'JP source, not translated',status:'provisional'};
const preserved={schema:'tcg-lab-backup-v1',tags:{'ce_legacy':[{id:'tag1',status:'approved'}]},
  rejected:{'ce_legacy::foo':true},tempSets:[{code:'TMPOLD',name:'Existing Set'}],
  tempCards:[{id:'temp:old',setCode:'TMPOLD',name:'Another Card',number:'11',
    category:'Pokémon',stage:'Basic',image:'https://example.org/old.png'}]};
const now='2026-11-10T11:00:00.000Z';
const first=planTempAcceptance(base,preserved,{now});
assert.equal(first.kind,'created');
assert.equal(first.record.name,'ワンパチ');
assert.equal(first.record.status,'provisional');
assert.equal(first.record.translationStatus,'jp-only');
assert.equal(first.record.textEN,'');
assert.equal(first.record.language,'jp');
assert.equal(first.record.image,base.image_url);
assert.equal(first.readiness.manualSimulator,true,'Manual JP-only card blocked');
assert.equal(first.readiness.proxy,true,'Original JP artwork should be proxy ready');
assert.equal(first.store.tempCards.length,2);
assert.equal(first.store.tempSets.length,2);
assert.deepEqual(first.store.tags,preserved.tags,'Existing personal card tags overwritten');
assert.deepEqual(first.store.rejected,preserved.rejected,'Existing rejection decisions changed');
assert.equal(preserved.tempCards.length,1,'Input store mutated');
const again=planTempAcceptance(base,first.store,{now:'2026-11-10T12:00:00.000Z'});
assert.equal(again.kind,'unchanged');
assert.equal(again.store.tempCards.length,2);
assert.equal(again.record.id,first.record.id);
const paired=planTempAcceptance({...base,discovery_id:'c'.repeat(22),name:'Pikachu',card_number:'22'},again.store,{now});
assert.equal(paired.kind,'created','Separate cards from the same article were incorrectly merged');
assert.equal(paired.store.tempCards.length,3);
assert.throws(()=>planTempAcceptance({...base,discovery_id:'d'.repeat(22),
  name:'Wrong Name',card_number:'21'},paired.store,{now}),/Collector number/);

// A newly published translation must require explicit user review before replacing JP-only data.
const update={...base,combined_text:'Unofficial translation: Search your deck for 1 Energy.',
  translation_status:'unofficial',translation_source_url:'https://www.pokebeach.com/2026/11/translation',
  hp:'80'};
const review=planTempAcceptance(update,paired.store,{now:'2026-11-11T01:00:00.000Z'});
assert.equal(review.kind,'update-review-required');
assert(review.changes.some(x=>x.field==='textEN'));
assert(review.changes.some(x=>x.field==='hp'));
assert.equal(paired.store.tempCards[1].textEN,'','Plan must never modify existing data');
const applied=planTempAcceptance(update,paired.store,{now:'2026-11-11T01:00:00.000Z',allowUpdate:true});
assert.equal(applied.kind,'updated');
assert.equal(applied.record.id,first.record.id,'TEMP gameplay identity changed on translation');
assert.equal(applied.record.textEN,update.combined_text);
assert.equal(applied.record.translationStatus,'unofficial');
assert.equal(applied.record.translationHistory.length,1);
assert.equal(applied.record.revisionHistory.length,1);
assert.equal(applied.record.revisionHistory[0].changes.find(x=>x.field==='hp').before,'70');
assert.equal(applied.record.hp,'80');
assert.equal(applied.record.number,'21');
assert.deepEqual(applied.store.tags,preserved.tags);
const news=tempCandidateUpdates(first.store,[update]);
assert.equal(news.length,1);
assert(news[0].changes.some(c=>c.field==='textEN'));

// The same existing TEMP set must be reused when user selects it.
const aliasStore={...preserved,
  tempSets:[{code:'TMPAURASEEKERM7',name:'Flowing Fists'}],
  tempCards:[{id:'temp:auraseekerm7018',setCode:'TMPAURASEEKERM7',name:'Quagsire',number:'018',
    category:'Pokémon',stage:'Stage 1',hp:'130',image:'https://example.org/local-curated.png',
    notes:'Personal playtesting notes',research:'testing',status:'provisional'}]};
const quag={...base,name:'Quagsire',card_number:'18',set_name:'Aura Seeker',
  image_url:'https://www.pokebeach.com/news/2026/11/jp-quagsire.webp',discovery_id:'e'.repeat(22)};
const alias=planTempAcceptance(quag,aliasStore,{now});
assert.equal(alias.kind,'update-review-required','Existing Aura Seeker card was duplicated');
assert.equal(alias.store.tempCards.length,1);
assert.equal(alias.record.id,'temp:auraseekerm7018');
assert.equal(alias.set.code,'TMPAURASEEKERM7');
assert.equal(alias.record.image,'https://example.org/local-curated.png','Curated existing artwork silently replaced');
const quagApplied=planTempAcceptance(quag,aliasStore,{now,allowUpdate:true});
assert.equal(quagApplied.record.notes,'Personal playtesting notes');
assert.equal(quagApplied.record.id,'temp:auraseekerm7018');
assert.equal(quagApplied.store.tempCards.length,1);
const explicit=planTempAcceptance({...base,name:'Trainer JP',category:'Trainer',card_number:''},
  preserved,{setCode:'TMPOLD',now});
assert.equal(explicit.set.code,'TMPOLD');
assert.throws(()=>planTempAcceptance({...base,category:''},preserved),/Choose Pokémon/);

// On first browser use, seed personal tag store from the Card DB catalogue.
assert.throws(()=>planTempAcceptance(base,{}),/Load the Master DB/);
const seeded=planTempAcceptance(base,{}, {seedTags:catalog.reviewed_seed,now});
assert.deepEqual(seeded.store.tags,catalog.reviewed_seed);
assert(seeded.store.tempCards[0].id.startsWith('temp:reveal:'));

// The unchanged Proxy Workshop and Deck Builder understand native TEMP objects.
const integrated=combineCatalog(catalog,applied.store);
const card=integrated.cards.find(x=>x.entity_id===first.record.id);
assert(card&&card.temp&&card.printings[0].image_url===base.image_url);
const row={...card,qty:1,printing_id:card.printings[0].printing_id,
  set_code:card.printings[0].set_code,card_number:card.printings[0].card_number,
  image:card.printings[0].image_url,combined_text:card.combined_text||''};
const payload=makePayload({id:'jp-test',name:'JP-only practice',size:60,mode:'practice'},
  [row],'https://example.org/deck-builder.html','quick');
assert.equal(payload.cards[0].image,base.image_url);
assert.equal(payload.cards[0].textEN,update.combined_text);
assert.equal(payload.cards[0].temp,true);
assert.equal(sanitizePayload(payload).rows[0].snapshot.entity_id,first.record.id);
const encoded=payloadURL(payload,'https://prerelease-lab.pages.dev/simulator.html');
assert(encoded.includes('#import='));
const jpOnly=combineCatalog(catalog,first.store).cards.find(x=>x.entity_id===first.record.id);
const jpPayload=makePayload({id:'jp',name:'JP card',size:60,mode:'practice'},[{
  ...jpOnly,qty:1,printing_id:jpOnly.printings[0].printing_id,
  set_code:jpOnly.printings[0].set_code,card_number:jpOnly.printings[0].card_number,
  image:jpOnly.printings[0].image_url
}], 'https://example.org/deck-builder.html');
assert.equal(jpPayload.cards[0].textEN,'','Manual Simulator payload must allow JP-only without English text');
assert.equal(jpPayload.cards[0].image,base.image_url);
assert.equal(jpPayload.cards[0].temp,true);
console.log('PASS TEMP bridge: JP-only acceptance, duplicate/alias safety, preserved tags and identity, explicit translation revisions, catalog and simulator payload compatibility.');
