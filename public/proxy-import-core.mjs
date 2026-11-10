import {normalizeName,isBasicEnergy,parseTextDeck,sanitizePayload,mergeLines,safeURL} from './deck-core.mjs';

export const DB_KEY='tcg-lab-card-db-v0.1';
export const LIB_KEY='tcg-lab-decks-v1';
export const DRAFT_KEY='tcg-lab-deck-builder-draft-v1';
export const CATEGORY_VALUES=['','Pokémon','Trainer','Energy'];
export const SUBTYPES={
 'Pokémon':['Basic','Stage 1','Stage 2','Pokémon ex'],
 'Trainer':['Item','Supporter','Pokémon Tool','Stadium'],
 'Energy':['Basic','Special']
};
export function tempEntity(r){
 return {entity_id:r.id,name:r.name,card_type:r.category,stage:r.stage||'',pokemon_types:r.pokemonType||'',hp:r.hp||'',temp:true,printings:[{printing_id:r.id+':printing',set_code:r.setCode,card_number:r.number||'?',rarity:'TEMP',image_url:r.image||''}]};
}
export function combineCatalog(standard,dbStore={}){
 if(!Array.isArray(standard?.entities)||!Array.isArray(standard?.sets))throw Error('Invalid Card DB catalogue.');
 const tempSets=new Set((dbStore.tempSets||[]).filter(s=>s?.code&&s.code!=='TMPDELTAREIGN').map(s=>s.code));
 const temp=(dbStore.tempCards||[]).filter(r=>r&&typeof r.id==='string'&&typeof r.name==='string'&&tempSets.has(r.setCode)).map(tempEntity);
 return {cards:[...standard.entities,...temp],sets:[...standard.sets.map(s=>({code:s.set_code,name:s.name})),...(dbStore.tempSets||[]).filter(s=>tempSets.has(s.code)).map(s=>({code:s.code,name:'TEMP — '+s.name}))]};
}
export function subtypeOf(c){
 if(c.card_type==='Energy')return isBasicEnergy(c)?'Basic':'Special';
 if(c.card_type==='Trainer'){const stage=String(c.stage||'');return /Pokémon Tool|Pokemon Tool|Tool/i.test(stage)?'Pokémon Tool':/Supporter/i.test(stage)?'Supporter':/Stadium/i.test(stage)?'Stadium':/Item/i.test(stage)?'Item':''}
 if(c.card_type==='Pokémon'){return /Stage 2/i.test(c.stage||'')?'Stage 2':/Stage 1/i.test(c.stage||'')?'Stage 1':/Basic/i.test(c.stage||'')?'Basic':''}
 return '';
}
export function matchCard(c,filters={}){
 const q=normalizeName(filters.query||''),set=filters.set||'',category=filters.category||'',subtype=filters.subtype||'',type=filters.type||'';
 if(set&&!(c.printings||[]).some(p=>p.set_code===set))return false;
 if(category&&c.card_type!==category)return false;
 if(type&&!String(c.pokemon_types||'').split(/[|,]/).some(t=>t.trim()===type))return false;
 if(subtype==='Pokémon ex'){if(c.card_type!=='Pokémon'||!/\bex\b/i.test(c.name||''))return false}
 else if(subtype&&subtypeOf(c)!==subtype)return false;
 if(!q)return true;
 const search=[c.name,c.combined_text,c.pokemon_types,...(c.printings||[]).map(p=>[p.set_code,p.card_number,p.rarity].join(' '))].join(' ');
 return normalizeName(search).includes(q);
}
export function findPrinting(c,printingId,setCode=''){
 return c?.printings?.find(p=>p.printing_id===printingId)||c?.printings?.find(p=>p.set_code===setCode)||c?.printings?.[0]||null;
}
export function imageCandidates(p,localArt){
 const candidates=[],seen=new Set(),add=v=>{const url=safeURL(v);if(url&&!seen.has(url)){seen.add(url);candidates.push(url)}};
 add(localArt?.get(String(p?.printing_id)));
 add(p?.image_url);
 const code=String(p?.set_code||'').toUpperCase(),num=String(p?.card_number||'').replace(/^0+(?=\d)/,'').padStart(3,'0');
 if(code&&!code.startsWith('TMP')&&num!=='?'){
  add('https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/'+code+'/'+code+'_'+num+'_R_EN.png');
  add('https://limitlesstcg.nyc3.digitaloceanspaces.com/tpci/'+code+'/'+code+'_'+num+'_R_EN.png');
 }
 return candidates;
}
export function rowsFromDeck(deck,cards){
 const map=new Map(cards.map(c=>[c.entity_id,c]));
 if(!Array.isArray(deck?.rows))throw Error('Invalid saved deck.');
 return deck.rows.map((r,i)=>{
  const live=map.get(r.entityId),c=live||r.snapshot;
  if(!c)throw Error('Card #'+(i+1)+' has no catalogue or saved metadata.');
  const p=findPrinting(c,r.printingId);
  if(!p)throw Error('No printing for '+c.name);
  const qty=Number(r.qty);
  if(!Number.isInteger(qty)||qty<1||qty>100)throw Error('Invalid quantity for '+c.name);
  return {entityId:c.entity_id,printingId:p.printing_id,name:c.name,category:c.card_type,qty,card:c,printing:p};
 });
}
export function loadDeckDocument(input,cards){
 let value=input;
 if(typeof input==='string'&&!input.trim().startsWith('{'))return rowsFromDeck({rows:parseTextDeck(input,cards)},cards);
 if(typeof input==='string')value=JSON.parse(input);
 if(value?.format==='tcg-lab-deck-v1')return rowsFromDeck(sanitizePayload(value),cards);
 if(value?.format==='tcg-lab-deck-library-v1'){
  const arr=(value.decks||[]).map(d=>({id:d.id||d.payload?.deckId||'',name:d.payload?.name||d.name||'Imported deck',rows:d.payload?rowsFromDeck(sanitizePayload(d.payload),cards):rowsFromDeck(d,cards)}));
  return {decks:arr};
 }
 if(value?.rows&&Array.isArray(value.rows))return rowsFromDeck(value,cards);
 if(value?.deck?.rows)return rowsFromDeck(value.deck,cards);
 throw Error('Use a TCG Lab deck JSON, Deck Builder backup or Pokémon decklist text.');
}
export function chooseRows(rows,scope='all',selectedIds=null){
 const eligible=rows.filter((r,i)=>{
  if(selectedIds&&!selectedIds.has(i))return false;
  if(scope==='pokemon')return r.category==='Pokémon';
  if(scope==='trainer')return r.category==='Trainer';
  if(scope==='energy')return r.category==='Energy';
  return true;
 });
 return eligible.filter(r=>Number.isInteger(r.qty)&&r.qty>0);
}
export function queueSummary(groups){
 return {cards:groups.reduce((sum,g)=>sum+g.qty,0),unique:groups.length};
}
export function copyRows(rows){return rows.map(r=>({...r}));}
