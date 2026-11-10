#!/usr/bin/env node
/**
 * Validate untrusted discovery feed before branch publication.
 * This is NOT a Master DB publishing command.
 */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {DISCOVERY_FEED_SCHEMA,importDiscoveryFeed,classifyCandidate,MAX_INTAKE_CARDS} from '../public/card-intake-core.mjs';

const file=process.argv[2];
if(!file)throw Error('Usage: node scripts/verify-card-discovery-feed.mjs feed.json');
const raw=await fs.readFile(file,'utf8');
assert(raw.length<1_800_000,'Feed payload exceeded size limit');
const feed=JSON.parse(raw);
assert.equal(feed.schema,DISCOVERY_FEED_SCHEMA);
assert(Array.isArray(feed.candidates));
assert(feed.candidates.length<=MAX_INTAKE_CARDS);
assert(Array.isArray(feed.errors));
assert(feed.seen_ids?.length<=12000);
const seen=new Set();
const allowed=new Set(['www.pokebeach.com','pokebeach.com','www.pokemonproxies.com','limitlesstcg.com','www.limitlesstcg.com']);
for(const c of feed.candidates){
  assert(/^[a-f0-9]{22}$/.test(c.discovery_id||''),'Invalid stable discovery ID');
  assert(!seen.has(c.discovery_id),'Repeated discovery ID '+c.discovery_id);
  seen.add(c.discovery_id);
  const url=new URL(c.source_url);
  assert(url.protocol==='https:'&&allowed.has(url.hostname),'Unexpected candidate source host');
  if(c.image_url){const image=new URL(c.image_url);assert.equal(image.protocol,'https:')}
  assert(c.status==='discovered'||c.status==='provisional','Discovery cannot be approved/rejected by automation');
  assert(c.source_verified===false && c.artwork_verified===false,'Discovery may not claim verification');
  assert(c.reviewed_distinct_gameplay!==true && !c.existing_entity_id,'Discovery cannot decide gameplay identity');
}
const imported=importDiscoveryFeed(feed);
assert.equal(imported.length,feed.candidates.length,'Browser intake normalization dropped candidates');
const html=await fs.readFile('public/card-db.html','utf8');
const m=html.match(/<script id="catalog" type="application\/json">([\s\S]*?)<\/script>/);
assert(m,'Master DB catalogue not found');
const catalog=JSON.parse(m[1]);
const duplicates=imported.filter(c=>classifyCandidate(c,catalog).kind==='duplicate-printing');
assert.equal(duplicates.length,0,'Existing printings should not be staged as discoveries: '+duplicates.slice(0,6).map(x=>x.set_code+'#'+x.card_number).join(','));
console.log('PASS: '+imported.length+' unverified staged discoveries, '+feed.seen_ids.length+' history IDs, no preapproved records, no existing printings, acceptable provenance.');
