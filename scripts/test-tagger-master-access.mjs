#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';

const html = await readFile('public/card-db.html', 'utf8');
const match = html.match(/<script id="catalog" type="application\/json">([\s\S]*?)<\/script>/);
assert(match, 'Master Card DB must expose its version 2 catalog script');
const catalog = JSON.parse(match[1]);
assert.equal(catalog.schema, 'tcg-lab-catalog-v2', 'Tagger requires catalog-v2');
assert(Array.isArray(catalog.entities) && Array.isArray(catalog.sets), 'Master DB arrays missing');
const entityIds = new Set(), printingIds = new Set(), dlr = [];
for (const entity of catalog.entities) {
  assert(entity.entity_id && !entityIds.has(entity.entity_id), 'Duplicate gameplay ID: '+entity.entity_id);
  entityIds.add(entity.entity_id);
  for (const p of entity.printings || []) {
    assert(p.printing_id && !printingIds.has(p.printing_id), 'Duplicate printing ID: '+p.printing_id);
    printingIds.add(p.printing_id);
    if (p.set_code === 'DLR') dlr.push(p);
  }
}
assert.equal(dlr.length, 141, 'All 141 Delta Reign printings must be in Master DB');
assert.equal(new Set(dlr.map(x=>Number(x.card_number))).size,141,'DLR printing numbers must be unique');
for (let n=1; n<=141; n++) assert(dlr.some(x=>Number(x.card_number)===n), 'DLR missing #'+n);
const artManifest = JSON.parse(await readFile('public/data/card-art-manifest.json','utf8'));
assert.equal(artManifest.schema, 'tcg-lab-card-art-manifest-v1');
const art = new Map(artManifest.entries.map(entry=>[entry.printingId,entry]));
for (const p of dlr) {
  const entry = art.get(p.printing_id);
  assert(entry && entry.status === 'verified' && entry.sha256 && entry.path, 'No verified local art: '+p.printing_id);
  await access('public/'+entry.path.replace(/^\.\//,''));
}
const headerFile = await readFile('public/_headers','utf8');
assert(/\/card-db\.html\s*\n\s+Access-Control-Allow-Origin:\s*\*/.test(headerFile), 'CORS header rule must cover card-db.html');
console.log('PASS: Master DB has '+entityIds.size+' gameplay records, '+printingIds.size+' unique printings, all 141 numbered DLR printings, 141 locally verified artworks, and read-only CORS access.');
