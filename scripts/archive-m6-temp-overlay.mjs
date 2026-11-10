#!/usr/bin/env node
// Hide obsolete M6 TEMP cards from active browsing after English DLR import.
// Browser-local backups, tags, and saved decks are NOT deleted or rewritten.
import fs from 'node:fs/promises';
const base='destination/public',dbPath=base+'/card-db.html',deckPath=base+'/deck-builder.mjs';
let html=await fs.readFile(dbPath,'utf8');
function replaceOnce(a,b){if(!html.includes(a))throw Error('Card DB patch anchor not found: '+a.slice(0,90));html=html.replace(a,b)}
replaceOnce('function registerTempSet(row){\n if(SETMAP.has(row.code))return;',
'function registerTempSet(row){\n if(row.code===\'TMPDELTAREIGN\')return; // archived Japanese M6, kept in local backups\n if(SETMAP.has(row.code))return;');
replaceOnce('function registerTempCard(row){\n const c=tempEntity(row)',
'function registerTempCard(row){\n if(row.setCode===\'TMPDELTAREIGN\')return;\n const c=tempEntity(row)');
replaceOnce('function syncTempFilters(){\n for(const row of store.tempSets){',
'function syncTempFilters(){\n for(const row of store.tempSets){\n  if(row.code===\'TMPDELTAREIGN\')continue;');
replaceOnce("for(const row of store.tempSets){\n   const opt=document.createElement('option');",
"for(const row of store.tempSets){\n   if(row.code==='TMPDELTAREIGN')continue;\n   const opt=document.createElement('option');");
await fs.writeFile(dbPath,html);
let deck=await fs.readFile(deckPath,'utf8');
const a="const tempCards=(Array.isArray(dbStore.tempCards)?dbStore.tempCards:[]).filter(r=>r&&typeof r.id";
const b="const tempCards=(Array.isArray(dbStore.tempCards)?dbStore.tempCards:[]).filter(r=>r&&r.setCode!=='TMPDELTAREIGN'&&typeof r.id";
if(!deck.includes(a))throw Error('Deck Builder TEMP filter anchor missing');deck=deck.replace(a,b);
const p="...(dbStore.tempSets||[]).map(s=>({code:s.code,name:'TEMP — '+s.name}))";
const q="...(dbStore.tempSets||[]).filter(s=>s.code!=='TMPDELTAREIGN').map(s=>({code:s.code,name:'TEMP — '+s.name}))";
if(!deck.includes(p))throw Error('Deck Builder set filter anchor missing');deck=deck.replace(p,q);
await fs.writeFile(deckPath,deck);
console.log('Archived obsolete TMPDELTAREIGN display records non-destructively; English DLR remains active.');
