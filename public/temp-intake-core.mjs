/**
 * Card Intake → existing same-origin Card DB TEMP overlay.
 * No network calls, no automatic approval, no Master catalogue mutations.
 * All operations return a new store; the caller owns localStorage persistence.
 */
import {normalizeCandidate,safeHTTPS} from './card-intake-core.mjs';

export const TEMP_DB_KEY='tcg-lab-card-db-v0.1';
const TXT_LIMIT=9000,NOTES_LIMIT=9000;
const norm=x=>String(x||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
const str=(x,n=10000)=>String(x??'').trim().slice(0,n);
const number=x=>str(x,32).replace(/^0+(?=\d)/,'');
const CATS=new Set(['Pokémon','Trainer','Energy']);
export const COMPARE_FIELDS=[
  ['name','Name'],['nameJP','Japanese name'],['category','Category'],['stage','Stage'],
  ['pokemonType','Pokémon type'],['hp','HP'],['evolvesFrom','Evolves from'],
  ['image','Artwork URL'],['textEN','Translation / gameplay text'],
  ['weakness','Weakness'],['resistance','Resistance'],['retreatCost','Retreat cost'],
  ['releaseJP','Japanese release'],['releaseEN','English release']
];
function hash(x){
  // Stable, short, browser/Node-compatible non-cryptographic ID suffix.
  let h=2166136261;for(const c of String(x)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}
  return (h>>>0).toString(36);
}
const alias=x=>/^(flowing fists|aura seeker|ハドウシーカー)$/i.test(str(x))?'aura-seeker':norm(x);
export function tempReady(row){
  return {manualSimulator:!!str(row?.name)&&CATS.has(row?.category),
    proxy:!!str(row?.name)&&!!safeHTTPS(row?.image),
    translation:row?.translationStatus||(!str(row?.textEN)?'jp-only':'unofficial')};
}
export function tempDestination(candidate,store,requested=''){
  const sets=Array.isArray(store?.tempSets)?store.tempSets:[];
  if(requested){
    const existing=sets.find(x=>x.code===requested&&x.code!=='TMPDELTAREIGN');
    if(!existing)throw Error('The selected TEMP set is not available. Refresh and choose again.');
    return {set:existing,newSet:false};
  }
  const name=str(candidate.set_name||'Unassigned reveals',110);
  const existing=sets.find(x=>x?.code!=='TMPDELTAREIGN'&&alias(x.name)===alias(name));
  if(existing)return {set:existing,newSet:false};
  let code='TMP'+(candidate.set_code?/^[A-Z0-9]{2,12}$/.test(candidate.set_code)?candidate.set_code:'':hash(name).toUpperCase());
  if(code==='TMP')code='TMP'+hash(name).toUpperCase();
  let serial=2;while(sets.some(s=>s.code===code))code='TMP'+hash(name+'-'+serial++).toUpperCase();
  return {set:{code,name,createdAt:new Date().toISOString(),provisional:true},newSet:true};
}
export function findTempMatch(candidate,store,setCode){
  const cards=Array.isArray(store?.tempCards)?store.tempCards:[];
  const n=number(candidate.card_number),name=norm(candidate.name);
  const byDiscovery=cards.find(x=>candidate.discovery_id&&
    (x.discoveryId===candidate.discovery_id||x.discoveryIds?.includes(candidate.discovery_id)));
  if(byDiscovery)return byDiscovery;
  // The same article can include 3+ cards: source URL alone is never identity.
  const sameSet=cards.filter(x=>x.setCode===setCode);
  const byNumber=n?sameSet.find(x=>number(x.number)===n):null;
  if(byNumber&&name&&norm(byNumber.name)!==name && norm(byNumber.nameJP)!==name)
    throw Error('Collector number already belongs to '+byNumber.name+'. Review before combining printings.');
  if(byNumber)return byNumber;
  if(name) {
    const byName=sameSet.filter(x=>norm(x.name)===name||norm(x.nameJP)===name);
    if(byName.length===1 && (!n||!number(byName[0].number)||number(byName[0].number)===n))return byName[0];
  }
  return null;
}
export function candidateToTemp(candidate){
  const c=normalizeCandidate(candidate);
  if(!c.name)throw Error('Enter a card name (Japanese or provisional English is fine).');
  if(!CATS.has(c.category))throw Error('Choose Pokémon, Trainer, or Energy for Manual Simulator.');
  const translationStatus=['jp-only','unofficial','official'].includes(c.translation_status)?
    c.translation_status:(c.combined_text?'unofficial':'jp-only');
  return {
    name:c.name,nameJP:c.name_jp||(c.language==='jp'?c.name:''),
    number:c.card_number||'',category:c.category,stage:c.stage||'',
    pokemonType:c.pokemon_types||'',hp:c.hp||'',evolvesFrom:c.evolves_from||'',
    image:c.image_url||'',source:c.source_url||'',textEN:str(c.combined_text,TXT_LIMIT),
    weakness:c.weakness||'',resistance:c.resistance||'',retreatCost:c.retreat_cost||'',
    language:c.language||'unknown',translationStatus,
    translationSource:safeHTTPS(c.translation_source_url)||c.source_url||'',
    releaseJP:c.release_jp||'',releaseEN:c.release_en||'',
    sourceSetCode:c.set_code||'',sourceSetName:c.set_name||'',
    discoveryId:c.discovery_id||'',status:'provisional',research:'testing',
    notes:str(c.review_note,NOTES_LIMIT),
  };
}
export function diffTemp(existing,proposed){
  if(!existing)return [];
  return COMPARE_FIELDS.filter(([key])=>{
    const value=str(proposed[key]);
    return value && norm(existing[key])!==norm(value);
  }).map(([key,label])=>({field:key,label,before:str(existing[key]),after:str(proposed[key])}));
}
export function planTempAcceptance(rawCandidate,rawStore,options={}){
  const candidate=normalizeCandidate(rawCandidate);
  const proposed=candidateToTemp(candidate);
  const store=rawStore&&typeof rawStore==='object'&&!Array.isArray(rawStore)?
    structuredClone(rawStore):{};
  if(store.tags!==undefined && (!store.tags||typeof store.tags!=='object'||Array.isArray(store.tags)))
    throw Error('Card DB tag storage is invalid. Export a backup before editing.');
  if(store.rejected!==undefined && (!store.rejected||typeof store.rejected!=='object'||Array.isArray(store.rejected)))
    throw Error('Card DB rejection history is invalid. Export a backup first.');
  store.schema=store.schema||'tcg-lab-backup-v1';
  store.tags=store.tags||{};store.rejected=store.rejected||{};
  store.tempSets=Array.isArray(store.tempSets)?store.tempSets:[];
  store.tempCards=Array.isArray(store.tempCards)?store.tempCards:[];
  const {set,newSet}=tempDestination(candidate,store,options.setCode||'');
  if(newSet)store.tempSets.push(set);
  const old=findTempMatch(candidate,store,set.code),time=options.now||new Date().toISOString();
  if(!old){
    const idBase='temp:reveal:'+(candidate.discovery_id||hash([candidate.source_url,candidate.name,candidate.card_number,set.code].join('|')));
    let id=idBase,index=2;
    while(store.tempCards.some(x=>x.id===id))id=idBase+'-'+index++;
    const record={...proposed,id,setCode:set.code,addedAt:time,updatedAt:time,
      reviewState:'accepted-temp',translationHistory:proposed.textEN?
      [{at:time,kind:proposed.translationStatus,source:proposed.translationSource,text:proposed.textEN}]:[],
      revisionHistory:[],discoveryIds:candidate.discovery_id?[candidate.discovery_id]:[],
      lastCheckedAt:time};
    store.tempCards.push(record);
    return {store,record,kind:'created',changes:[],readiness:tempReady(record),set};
  }
  // Preserve stable ID, existing tags and manually annotated notes/research.
  const changes=diffTemp(old,proposed);
  if(changes.length&&!options.allowUpdate)
    return {store,record:old,kind:'update-review-required',changes,readiness:tempReady(old),set};
  const record={...old};
  for(const {field,after} of changes)record[field]=after;
  record.status=old.status||'provisional';
  record.research=old.research||'testing';
  record.reviewState='accepted-temp';
  record.updatedAt=changes.length?time:old.updatedAt||time;
  record.lastCheckedAt=time;
  record.discoveryIds=[...new Set([...(old.discoveryIds||[]),old.discoveryId,candidate.discovery_id].filter(Boolean))];
  if(changes.some(x=>x.field==='textEN')){
    record.translationHistory=[...(old.translationHistory||[]),
      {at:time,kind:proposed.translationStatus,source:proposed.translationSource,text:proposed.textEN}].slice(-30);
  }
  if(changes.length){
    record.revisionHistory=[...(old.revisionHistory||[]),
      {at:time,source:candidate.source_url,changes}].slice(-40);
  }
  // Optional language/translation upgrades only after explicit action.
  if(changes.some(x=>x.field==='textEN')||!old.translationStatus){
    record.translationStatus=proposed.translationStatus;
    record.translationSource=proposed.translationSource;
  }
  if(!old.language&&proposed.language)record.language=proposed.language;
  if(!old.source&&proposed.source)record.source=proposed.source;
  if(!old.sourceSetName&&proposed.sourceSetName)record.sourceSetName=proposed.sourceSetName;
  if(!old.sourceSetCode&&proposed.sourceSetCode)record.sourceSetCode=proposed.sourceSetCode;
  const idx=store.tempCards.findIndex(x=>x.id===old.id);
  store.tempCards[idx]=record;
  return {store,record,kind:changes.length?'updated':'unchanged',changes,readiness:tempReady(record),set};
}
export function tempCandidateUpdates(store,candidates){
  const reports=[];
  for(const raw of candidates){
    let candidate,proposed;
    try{candidate=normalizeCandidate(raw);proposed=candidateToTemp(candidate)}catch{continue}
    const sets=(store?.tempSets||[]).filter(x=>alias(x.name)===alias(candidate.set_name));
    // Existing discovery ID is stronger evidence than name or the article URL.
    const existingById=(store?.tempCards||[]).find(x=>candidate.discovery_id&&
      (x.discoveryId===candidate.discovery_id||x.discoveryIds?.includes(candidate.discovery_id)));
    for(const set of sets.length?sets:[{code:existingById?.setCode||''}]){
      let matched=existingById;
      if(!matched && set.code)try{matched=findTempMatch(candidate,store,set.code)}catch{}
      if(!matched)continue;
      const changes=diffTemp(matched,proposed);
      if(changes.length)reports.push({recordId:matched.id,discoveryId:candidate.discovery_id,
        name:matched.name,changes,candidate});
      break;
    }
  }
  return reports;
}
