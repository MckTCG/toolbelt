// Viewer-only import adapter. Never inserts unknown printings into the Master Card DB.
// Deck text from Limitless / PTCGL may reference newer printings than our catalogue.
import {normalizeName,mergeLines} from './deck-core.mjs';

const BASIC_ENERGY=/^(?:(?:basic)\s+)?(grass|fire|water|lightning|psychic|fighting|darkness|metal)\s+energy$/i;
const section=/^(Pok[eé]mon|Trainers?|Energ(?:y|ies))\s*(?:[:：–-]\s*|\(\s*|\s+)?\d*\s*\)?\s*$/i;
const total=/^(?:Total\s+Cards?|Deck\s+List|Cards?\s+in\s+Deck)(?:\s*[:：–-]?\s*\d+)?\s*$/i;
const toSet=s=>String(s||'').trim().toUpperCase();
const toNum=s=>String(s||'').trim().replace(/^0+(?=\d)/,'').toLowerCase();
const categoryFromSection=s=>/^pok/i.test(s)?'Pokémon':/^train/i.test(s)?'Trainer':/^energ/i.test(s)?'Energy':'Unknown';
const nameKey=n=>normalizeName(n).replace(/^basic (?=(?:grass|fire|water|lightning|psychic|fighting|darkness|metal) energy$)/,'');
const key=(set,num,name)=>toSet(set)+':'+toNum(num)+':'+nameKey(name);

// These exact printing/stage observations were checked against the linked Limitless pages
// for deck 31282; add only after verification. Entries provide STAGE, not attack text.
const VERIFIED_BASIC_PRINTINGS=new Set([
 'MEG:104:mega kangaskhan ex','POR:62:meowth ex','SSP:76:latias ex',
 'TWM:25:teal mask ogerpon ex','JTG:56:lillie\'s clefairy ex',
 'TEF:25:iron leaves ex','ASC:121:koraidon ex','TWM:141:bloodmoon ursaluna ex',
 'TWM:64:wellspring mask ogerpon ex','SSP:56:chien-pao',
 'SSP:18:paldean tauros','ASC:142:fezandipiti ex'
]);
// Verified Trainer subtypes from Limitless deck 31282 printings.
const VERIFIED_TRAINERS=new Map(Object.entries({
 'SCR:133:crispin':'Supporter','MEG:114:boss\'s orders':'Supporter',
 'SSP:170:cyrano':'Supporter','POR:76:judge':'Supporter',
 'TEF:145:ciphermaniac\'s codebreaking':'Supporter',
 'MEG:131:ultra ball':'Item','MEG:115:energy switch':'Item',
 'ASC:196:night stretcher':'Item','CRI:82:special red card':'Item',
 'TEF:152:hero\'s cape':'Tool','SCR:131:area zero underdepths':'Stadium'
}));
function printArt(set,num){
  if(!/^[A-Z0-9-]{2,14}$/.test(set)||!/^[0-9]{1,4}[a-z]?$/i.test(num))return '';
  const n=String(num).padStart(3,'0');
  return 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/'+set+'/'+set+'_'+n+'_R_EN.png';
}
function artFallback(set,num){
 const img=printArt(set,num);
 return img? [img.replace('limitlesstcg.nyc3.cdn.digitaloceanspaces.com','limitlesstcg.nyc3.digitaloceanspaces.com')]:[];
}
function inferMetadata(name,set,num,sectionType,candidates) {
 const printKey=key(set,num,name);
 const candidateTypes=[...new Set(candidates.map(c=>c.card_type).filter(Boolean))];
 const card_type=sectionType!=='Unknown'?sectionType:
  candidateTypes.length===1?candidateTypes[0]:BASIC_ENERGY.test(name)?'Energy':'Unknown';
 const stages=[...new Set(candidates.filter(c=>c.card_type==='Pokémon').map(c=>String(c.stage||'').split(',')[0].trim()).filter(Boolean))];
 const subs=[...new Set(candidates.flatMap(c=>c.subtypes||[]))];
 const stage=card_type==='Pokémon' ? VERIFIED_BASIC_PRINTINGS.has(printKey)?'Basic':stages.length===1?stages[0]:'' : '';
 const subtype=card_type==='Trainer'?VERIFIED_TRAINERS.get(printKey)|| (subs.length===1?subs[0]:'') : '';
 return {card_type,stage,subtypes:subtype?[subtype]:[],basic_energy_type:card_type==='Energy'&&BASIC_ENERGY.test(name)?name:null};
}
function fallbackRow(name,set,num,qty,sectionType,candidates){
 const meta=inferMetadata(name,set,num,sectionType,candidates);
 const uid='viewer:'+encodeURIComponent(key(set,num,name)).slice(0,118);
 const pid=uid+':printing';
 const img=printArt(set,num);
 const snapshot={entity_id:uid,name,card_type:meta.card_type,stage:meta.stage,subtypes:meta.subtypes,
   basic_energy_type:meta.basic_energy_type,pokemon_types:'',hp:'',combined_text:'',
   importFallback:true,printings:[{printing_id:pid,set_code:set||'UNKNOWN',card_number:num||'?',image_url:img,image_fallbacks:artFallback(set,num)}]};
 return {entityId:uid,printingId:pid,qty,snapshot};
}
export function parseViewerDeck(text,catalog) {
 if(typeof text!=='string'||!text.trim())throw Error('Paste a deck list first');
 const raw=text.replace(/^\uFEFF/,'').trim();
 if(/^https?:\/\/\S+$/i.test(raw))throw Error('This is a webpage URL, not a deck list. On Limitless click “Copy to Clipboard”, then paste the copied deck text here.');
 const rows=[],errors=[],warnings=[],seen=new Map();let currentCategory='Unknown';
 const all=Array.isArray(catalog)?catalog:[];
 for(const lineRaw of raw.split(/\r?\n/)) {
   let line=lineRaw.trim();
   if(!line||/^(?:#|\/\/)/.test(line)||/^\*{2}/.test(line)||/^##/.test(line))continue;
   const sectionMatch=line.match(section);
   if(sectionMatch){currentCategory=categoryFromSection(sectionMatch[1]);continue}
   if(total.test(line))continue;
   line=line.replace(/^\*\s*/,'');
   const m=line.match(/^(\d{1,3})\s+(.+)$/);
   if(!m){errors.push('Could not read: '+line);continue}
   const qty=Number(m[1]);if(qty<1||qty>100){errors.push('Invalid quantity: '+line);continue}
   let rest=m[2].trim(),set='',num='',name=rest;
   const withPrinting=rest.match(/^(.+?)\s+([A-Za-z0-9-]{2,40})\s+([0-9]{1,4}[a-z]?)$/i);
   if(withPrinting){name=withPrinting[1].trim();set=toSet(withPrinting[2]);num=toNum(withPrinting[3])}
   if(!name){errors.push('Missing card name: '+line);continue}
   const choices=all.filter(c=>nameKey(c.name)===nameKey(name));
   const exact= set ? choices.flatMap(c=>(c.printings||[]).filter(p=>toSet(p.set_code)===set&&toNum(p.card_number)===num).map(p=>({c,p}))) : [];
   // Exact edition takes precedence. Unspecified printing can use the first known variant.
   let candidate=exact[0];
   if(!candidate&&!set&&choices.length===1&&choices[0].printings?.length)candidate={c:choices[0],p:choices[0].printings[0]};
   if(candidate){
     // A matching card name and exact printing gives us verified catalog metadata.
     const {c,p}=candidate;
     const pid=p.printing_id;
     rows.push({entityId:c.entity_id,printingId:pid,qty,snapshot:{
       entity_id:c.entity_id,name:c.name,card_type:c.card_type,stage:c.stage||'',subtypes:c.subtypes||[],
       pokemon_types:c.pokemon_types||'',hp:c.hp||'',combined_text:c.combined_text||'',
       basic_energy_type:c.basic_energy_type||null,temp:!!c.temp,printings:[p]}});
   } else {
     rows.push(fallbackRow(name,set,num,qty,currentCategory,choices));
     warnings.push((set?set+' '+num+' · ':'')+name);
   }
   const check=rows[rows.length-1];const group=check.entityId+'|'+check.printingId;
   seen.set(group,(seen.get(group)||0)+qty);
 }
 if(errors.length)throw Error('Could not import these lines:\n'+errors.slice(0,6).join('\n'));
 if(!rows.length)throw Error('No cards found in this list.');
 if(rows.reduce((n,r)=>n+r.qty,0)>120)throw Error('Maximum 120 cards per imported deck.');
 const merged=mergeLines(rows);
 const missing=merged.filter(r=>r.snapshot?.card_type==='Pokémon'&&!r.snapshot?.stage);
 const totalCards=merged.reduce((n,r)=>n+r.qty,0);
 return {rows:merged,totalCards,warnings,unknownStages:missing.map(x=>x.snapshot.name),provisionalCount:warnings.length};
}
