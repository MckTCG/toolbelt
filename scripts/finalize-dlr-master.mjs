#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),dest=path.join(root,'destination/public'),dbPath=path.join(dest,'card-db.html'),deckPath=path.join(dest,'deck-builder.mjs');
const original=await fs.readFile(dbPath,'utf8');
const m=original.match(/(<script id="catalog" type="application\/json">)([\s\S]*?)(<\/script>)/);
if(!m)throw Error('Card DB catalog missing');
const cat=JSON.parse(m[2]);
const dlr=cat.entities.filter(e=>e.printings?.some(p=>p.set_code==='DLR'));
if(!cat.sets.some(s=>s.set_code==='DLR')||dlr.reduce((n,e)=>n+e.printings.filter(p=>p.set_code==='DLR').length,0)!==141)throw Error('English DLR set not complete');
let evolved=0;
for(const e of dlr){
 if(e.card_type!=='Pokémon')continue;
 const match=String(e.stage).match(/^(Stage [12])\s*-\s*Evolves from\s+(.+)$/i);
 if(match){
  e.stage=match[1];
  e.evolves_from=match[2].trim();
  e.subtypes=[e.stage];
  e.supertype='Pokémon – '+e.stage;
  evolved++;
 }
}
let h=original.replace(m[0],m[1]+JSON.stringify(cat)+m[3]);
const needle="if(verifiedLocalArt.size){for(const entity of CATALOG.entities)for(const printing of entity.printings||[]){const local=verifiedLocalArt.get(printing.printing_id);if(local)printing.image_url=local;}render();}";
const replace="if(verifiedLocalArt.size){for(const entity of CATALOG.entities)for(const printing of entity.printings||[]){const local=verifiedLocalArt.get(printing.printing_id);if(local)printing.image_url=local;}for(const printing of PRINTINGS){const local=verifiedLocalArt.get(printing.printing_id);if(local)printing.image_url=local;}render();}";
if(!h.includes(needle))throw Error('Card DB artwork hook not found');
h=h.replace(needle,replace);
await fs.writeFile(dbPath,h);
let deck=await fs.readFile(deckPath,'utf8');
const before="cards=[...standard.entities.map(c=>({...c,printings:c.printings.map(p=>({...p,image_fallbacks:imageFallbacks(p)}))})),...tempCards];";
const after="cards=[...standard.entities.map(c=>({...c,printings:c.printings.map(p=>({...p,image_url:localArtworkFor(localArt,p.printing_id)||p.image_url,image_fallbacks:imageFallbacks(p)}))})),...tempCards];";
if(!deck.includes(before))throw Error('Deck Builder catalogue integration changed unexpectedly');
deck=deck.replace(before,after);
await fs.writeFile(deckPath,deck);
const report=JSON.parse(await fs.readFile(path.join(root,'destination/docs/dlr-master-import-audit.json'),'utf8'));
report.finalized={evolutionLinksNormalized:evolved,cardDBPrintingsClonePatched:true,deckBuilderLocalArtEnabled:true};
await fs.writeFile(path.join(root,'destination/docs/dlr-master-import-audit.json'),JSON.stringify(report,null,2));
console.log('FINALIZED DLR 141 printings; evolved '+evolved+' records. Same-origin artwork enabled in both Card DB views and Deck Builder.');
