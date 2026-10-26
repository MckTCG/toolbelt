export const normalizeName=s=>String(s||'').normalize('NFKC').replace(/[’‘]/g,"'").trim().toLowerCase();
export const safeURL=v=>{try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}};
export const baseStage=c=>String(c.stage||'').split(',')[0].trim();
export const isBasicEnergy=c=>c.card_type==='Energy'&&(!!c.basic_energy_type||/^Basic\s+(Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal)\s+Energy$/i.test(c.name)||/^(Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal) Energy$/i.test(c.name));
export function deckChecks(rows,size=60,mode='practice'){
 const total=rows.reduce((n,r)=>n+r.qty,0),errors=[],warnings=[],counts=new Map();
 if(total!==size)errors.push(`${total}/${size} cards — ${total<size?'add '+(size-total):'remove '+(total-size)}.`);
 if(!rows.some(r=>r.card_type==='Pokémon'&&baseStage(r)==='Basic'))errors.push('Add at least one Basic Pokémon.');
 for(const r of rows){if(!Number.isInteger(r.qty)||r.qty<1||r.qty>100)errors.push('Invalid quantity: '+r.name);if(!isBasicEnergy(r)){const key=normalizeName(r.name);counts.set(key,(counts.get(key)||0)+r.qty)}}
 if(size===60)for(const [name,n] of counts)if(n>4)errors.push(`${name}: ${n} copies (normally max. 4 across printings).`);
 const ace=rows.filter(r=>/(?:^|,\s*)ACE SPEC(?:,|$)/i.test(r.stage||'')||(r.subtypes||[]).includes('ACE SPEC')).reduce((n,r)=>n+r.qty,0);
 if(ace>1)errors.push('More than one ACE SPEC card.');
 const temp=rows.filter(r=>r.temp).reduce((n,r)=>n+r.qty,0);
 if(temp){(mode==='standard'?errors:warnings).push(`${temp} unreleased TEMP cards — practice only.`)}
 const missing=rows.filter(r=>!safeURL(r.image));if(missing.length)warnings.push('Missing artwork: '+missing.map(r=>r.name).join(', '));
 if(mode==='standard')warnings.push('Checks use the Aug 31, 2026 snapshot, not live legality or every card-specific exception.');
 if(rows.some(r=>r.snapshotOnly))warnings.push('Some cards use imported/saved metadata outside the current catalogue.');
 return {total,temp,errors,warnings,ready:errors.length===0};
}
export function makePayload(deck,rows,origin,launch='quick'){
 if(!rows.length)throw Error('Add cards to the deck first.');
 return {format:'tcg-lab-deck-v1',name:deck.name||'Untitled deck',deckId:deck.id,deckSize:deck.size,practiceMode:deck.mode,origin,originName:'Deck Builder',launch,set:{code:'CUSTOM',name:deck.name||'Custom practice deck'},cards:rows.map(r=>({id:r.entity_id,entity_id:r.entity_id,printing_id:r.printing_id,name:r.name,qty:r.qty,type:r.card_type,subtype:r.card_type==='Pokémon'?'':baseStage(r),stage:r.card_type==='Pokémon'?baseStage(r):'',image:safeURL(r.image),imageFallbacks:(r.imageFallbacks||[]).map(safeURL).filter(Boolean),textEN:r.combined_text||'',textStatus:r.temp?'preliminary':'catalogue',textKind:r.temp?'summary':'translation',textLabel:r.temp?'PROVISIONAL MECHANICS':'CATALOGUE CARD TEXT',setCode:r.set_code,number:r.card_number,pokemonType:r.pokemon_types||'',hp:r.hp||'',temp:!!r.temp,basicEnergy:isBasicEnergy(r)}))};
}
export function payloadURL(payload,simURL){const bytes=new TextEncoder().encode(JSON.stringify(payload));let bin='';for(const b of bytes)bin+=String.fromCharCode(b);return simURL+'#import='+encodeURIComponent(btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''))}
export function parseTextDeck(text,cards){
 const rows=[],errors=[];
 for(let line of String(text).split(/\r?\n/)){
  line=line.trim();if(!line||/^\*{2}/.test(line)||/^##/.test(line)||/^(Pok[eé]mon|Trainer|Energy)(?:\s*:\s*\d+)?$/i.test(line)||/^(Total Cards|Deck List):?/i.test(line))continue;
  line=line.replace(/^\*\s*/, '');const m=line.match(/^(\d+)\s+(.+?)(?:\s+([A-Za-z0-9-]{2,40})\s+(\d{1,4}[a-z]?))?$/);
  if(!m){errors.push('Could not read: '+line);continue}const qty=Number(m[1]),name=m[2],set=m[3],num=m[4];
  if(qty<1||qty>100){errors.push('Invalid quantity: '+name);continue}
  const candidates=cards.filter(c=>normalizeName(c.name)===normalizeName(name)).flatMap(c=>c.printings.filter(p=>(!set||p.set_code.toUpperCase()===set.toUpperCase())&&(!num||String(p.card_number).replace(/^0+(?=\d)/,'')===num.replace(/^0+(?=\d)/,''))).map(p=>({c,p})));
  const identities=new Set(candidates.map(x=>x.c.entity_id));
  if(!candidates.length){errors.push('Not found in Card DB: '+line);continue}if(identities.size>1){errors.push('Specify set and card number for '+name);continue}
  const {c,p}=candidates[0];rows.push({entityId:c.entity_id,printingId:p.printing_id,qty});
 }
 if(errors.length)throw Error(errors.slice(0,5).join('\n'));
 if(!rows.length)throw Error('No cards found in this list.');return mergeLines(rows);
}
export function mergeLines(rows){const out=new Map();for(const r of rows){const key=r.entityId+'|'+r.printingId;const old=out.get(key);if(old){old.qty+=r.qty;if(old.qty>100)throw Error('Maximum 100 copies per printing.')}else out.set(key,{...r})}return [...out.values()]}
export function sanitizePayload(x){
 if(x?.format!=='tcg-lab-deck-v1'||!Array.isArray(x.cards)||!x.cards.length||x.cards.length>300)throw Error('Choose a TCG Lab deck JSON file.');
 const cards=x.cards.map((r,i)=>{
  if(!r||typeof r.name!=='string'||!r.name.trim()||!Number.isInteger(r.qty)||r.qty<1||r.qty>100)throw Error('Invalid card row '+(i+1));
  const id=String(r.entity_id||r.id||'import:'+i).slice(0,120),pid=String(r.printing_id||id+':printing').slice(0,160);
  return {entityId:id,printingId:pid,qty:r.qty,snapshot:{entity_id:id,name:r.name.slice(0,140),card_type:['Pokémon','Trainer','Energy'].includes(r.type)?r.type:'Unknown',stage:String(r.stage||r.subtype||'').slice(0,80),pokemon_types:String(r.pokemonType||'').slice(0,80),hp:String(r.hp||'').slice(0,10),combined_text:String(r.textEN||'').slice(0,15000),temp:!!r.temp,basic_energy_type:r.basicEnergy?r.pokemonType||'Basic':null,printings:[{printing_id:pid,set_code:String(r.setCode||'CUSTOM').slice(0,40),card_number:String(r.number||'?').slice(0,32),image_url:safeURL(r.image)}]}};
 });
 if(cards.reduce((n,r)=>n+r.qty,0)>120)throw Error('Maximum 120 cards per imported deck.');
 return {name:String(x.name||'Imported deck').slice(0,120),size:[40,60].includes(x.deckSize)?x.deckSize:60,mode:x.practiceMode==='standard'?'standard':'practice',rows:mergeLines(cards)};
}
