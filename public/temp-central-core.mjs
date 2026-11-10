/**
 * Shared Git-versioned TEMP catalogue for Japanese-only and provisional cards.
 * Browser storage remains for drafts, caches and personal tags. This module never
 * writes to GitHub and never marks a card as English Master verified.
 */
import {safeHTTPS} from './card-intake-core.mjs';
export const CENTRAL_TEMP_SCHEMA='tcg-lab-central-temp-v1';
export const CENTRAL_TEMP_PROPOSAL_SCHEMA='tcg-lab-central-temp-proposal-v1';
export const CENTRAL_TEMP_URL='./data/temp-catalog-v1.json';
export const CENTRAL_TEMP_LIMIT=5000;
const str=(v,n=9000)=>String(v??'').trim().slice(0,n);
const norm=v=>str(v,200).normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
const LIST_KEYS=['id','setCode','number','name','nameJP','category','stage','pokemonType','hp',
  'evolvesFrom','image','source','textEN','language','translationStatus','translationSource',
  'weakness','resistance','retreatCost','releaseJP','releaseEN','sourceSetCode','sourceSetName',
  'discoveryId','addedAt','updatedAt','status','reviewState','lastCheckedAt'];
const SET_KEYS=['code','name','createdAt','provisional'];
const PUBLIC_ENUMS={
  category:new Set(['Pokémon','Trainer','Energy']),
  translationStatus:new Set(['jp-only','unofficial','official']),
  language:new Set(['en','jp','other','unknown'])
};
const safeURL=x=>safeHTTPS(x)||'';
function cleanRecord(row){
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('TEMP card is not an object');
  const out=Object.fromEntries(LIST_KEYS.map(key=>[key,str(row[key],key==='textEN'?9000:1000)]));
  out.id=str(row.id,120);out.setCode=str(row.setCode,40);out.name=str(row.name,160);
  if(!/^temp:[a-z0-9:_-]{3,115}$/i.test(out.id))throw Error('Invalid shared TEMP card ID: '+out.id);
  if(!/^TMP[A-Z0-9]{3,35}$/.test(out.setCode)||out.setCode==='TMPDELTAREIGN')
    throw Error('Invalid shared TEMP set code: '+out.setCode);
  if(!out.name||!PUBLIC_ENUMS.category.has(out.category))throw Error('TEMP needs name and category');
  if(!PUBLIC_ENUMS.translationStatus.has(out.translationStatus))out.translationStatus=out.textEN?'unofficial':'jp-only';
  if(!PUBLIC_ENUMS.language.has(out.language))out.language='unknown';
  if(out.image&&!safeURL(out.image))throw Error('Artwork must be HTTPS');
  if(out.source&&!safeURL(out.source))throw Error('Card source must be HTTPS');
  if(out.translationSource&&!safeURL(out.translationSource))throw Error('Translation source must be HTTPS');
  for(const key of ['image','source','translationSource'])out[key]=safeURL(out[key]);
  out.status='provisional';out.reviewState='accepted-temp';
  out.translationHistory=Array.isArray(row.translationHistory)?row.translationHistory.slice(-30).map(h=>({
    at:str(h.at,40),kind:str(h.kind,32),source:safeURL(h.source),text:str(h.text,9000)
  })):[];
  out.revisionHistory=Array.isArray(row.revisionHistory)?row.revisionHistory.slice(-40).map(h=>({
    at:str(h.at,40),source:safeURL(h.source),
    changes:Array.isArray(h.changes)?h.changes.slice(0,25).map(x=>({
      field:str(x.field,80),label:str(x.label,100),before:str(x.before,9000),after:str(x.after,9000)
    })):[]
  })):[];
  out.discoveryIds=[...new Set([...(Array.isArray(row.discoveryIds)?row.discoveryIds:[]),out.discoveryId].filter(Boolean).map(x=>str(x,80)))].slice(-100);
  // Deliberately do NOT copy tags, personal notes, research, approval flags, credentials.
  return out;
}
function cleanSet(row){
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('TEMP set must be an object');
  const item={code:str(row.code,40),name:str(row.name,140),
    createdAt:str(row.createdAt,40),provisional:true};
  if(!/^TMP[A-Z0-9]{3,35}$/.test(item.code)||item.code==='TMPDELTAREIGN')
    throw Error('Invalid TEMP set code: '+item.code);
  if(!item.name)throw Error('TEMP set name is required');
  return item;
}
function unique(collection,field){
  const values=collection.map(x=>x[field]);
  if(new Set(values).size!==values.length)throw Error('Duplicate '+field+' in TEMP catalogue');
}
export function parseCentralTemp(raw){
  if(!raw||raw.schema!==CENTRAL_TEMP_SCHEMA||!Array.isArray(raw.cards)||
     !Array.isArray(raw.sets)||raw.cards.length>CENTRAL_TEMP_LIMIT||raw.sets.length>1000)
    throw Error('Invalid central TEMP catalogue format');
  const sets=raw.sets.map(cleanSet),cards=raw.cards.map(cleanRecord);
  unique(sets,'code');unique(cards,'id');
  const setCodes=new Set(sets.map(x=>x.code));
  for(const c of cards)if(!setCodes.has(c.setCode))throw Error('Missing TEMP set: '+c.setCode);
  const printing=new Set();
  for(const c of cards) {
    const n=str(c.number).replace(/^0+(?=\d)/,'');
    if(!n)continue;
    const key=c.setCode+'#'+n;
    if(printing.has(key))throw Error('Duplicate TEMP printing: '+key);
    printing.add(key);
  }
  return {schema:CENTRAL_TEMP_SCHEMA,updated_at:str(raw.updated_at,40),
    sets,cards,note:str(raw.note,500)};
}
export async function loadCentralTemp(fetcher=fetch){
  const response=await fetcher(CENTRAL_TEMP_URL,{cache:'no-cache'});
  if(!response.ok)throw Error('Central TEMP catalogue HTTP '+response.status);
  const raw=await response.text();
  if(raw.length>4_000_000)throw Error('Central TEMP catalogue too large');
  return parseCentralTemp(JSON.parse(raw));
}
function samePrinting(a,b){
  if(a.setCode!==b.setCode||!a.number||!b.number)return false;
  return str(a.number).replace(/^0+(?=\d)/,'')===str(b.number).replace(/^0+(?=\d)/,'') &&
    norm(a.name)===norm(b.name);
}
export function mergeTempStores(localStore={},centralStore){
  // Central catalogue is authoritative for its IDs. Keep all personal tags and
  // drafts in their original localStorage key; this is a read-only derived view.
  const central=parseCentralTemp(centralStore);
  const local=localStore&&typeof localStore==='object'&&!Array.isArray(localStore)?localStore:{};
  const localSets=Array.isArray(local.tempSets)?local.tempSets:[];
  const localCards=Array.isArray(local.tempCards)?local.tempCards:[];
  const sets=[...central.sets];
  for(const x of localSets)if(x?.code&&!sets.some(y=>y.code===x.code))sets.push(x);
  const cards=[...central.cards];
  let hiddenCollisions=0;
  for(const x of localCards){
    if(!x?.id||!x?.setCode)continue;
    if(cards.some(y=>y.id===x.id||samePrinting(y,x))){hiddenCollisions++;continue}
    cards.push(x);
  }
  return {view:{...local,tempSets:sets,tempCards:cards},
    centralIds:new Set(central.cards.map(c=>c.id)),
    centralCount:central.cards.length,localCount:localCards.length,
    hiddenCollisions};
}
export function createTempProposal(localStore={},ids=[]){
  const store=localStore&&typeof localStore==='object'?localStore:{};
  const all=Array.isArray(store.tempCards)?store.tempCards:[];
  const choose=new Set(ids);
  const cards=all.filter(x=>!choose.size||choose.has(x.id)).filter(x=>x?.reviewState==='accepted-temp')
    .map(cleanRecord);
  if(!cards.length)throw Error('Accept at least one TEMP card before exporting a central proposal');
  unique(cards,'id');
  const needed=new Set(cards.map(c=>c.setCode));
  const sets=(Array.isArray(store.tempSets)?store.tempSets:[]).filter(s=>needed.has(s.code)).map(cleanSet);
  const found=new Set(sets.map(s=>s.code));
  for(const code of needed)if(!found.has(code))throw Error('The selected card is missing a TEMP set: '+code);
  return {schema:CENTRAL_TEMP_PROPOSAL_SCHEMA,created_at:new Date().toISOString(),
    publication_note:'Proposal only. Not centrally published until a reviewed GitHub PR is merged.',
    sets,cards};
}
export function compareCentralProposal(catalog,proposal,{allowUpdates=false}={}){
  const central=parseCentralTemp(catalog);
  if(!proposal||proposal.schema!==CENTRAL_TEMP_PROPOSAL_SCHEMA||!Array.isArray(proposal.cards)||
     !Array.isArray(proposal.sets)||proposal.cards.length>CENTRAL_TEMP_LIMIT)
    throw Error('Invalid central TEMP publication proposal');
  const incoming=proposal.cards.map(cleanRecord),newSets=proposal.sets.map(cleanSet);
  unique(incoming,'id');unique(newSets,'code');
  const sets=[...central.sets],cards=[...central.cards],issues=[],changes=[];
  for(const set of newSets){
    const prior=sets.find(s=>s.code===set.code);
    if(prior){if(norm(prior.name)!==norm(set.name))issues.push('TEMP set name conflict '+set.code)}
    else sets.push(set);
  }
  for(const row of incoming){
    if(!sets.some(x=>x.code===row.setCode)){issues.push('Unknown TEMP set '+row.setCode);continue}
    const existing=cards.find(x=>x.id===row.id);
    const collision=cards.find(x=>x.id!==row.id&&samePrinting(x,row));
    if(collision){issues.push('Printing identity collision '+row.setCode+'#'+row.number+' ('+collision.id+')');continue}
    if(existing){
      if(existing.setCode!==row.setCode){issues.push('Existing TEMP identity changed set: '+row.id);continue}
      const before=JSON.stringify(existing),after=JSON.stringify(row);
      if(before!==after){
        if(!allowUpdates){issues.push('Update requires reviewed --allow-updates: '+row.id);continue}
        const idx=cards.findIndex(x=>x.id===row.id);
        cards[idx]=row;changes.push({type:'updated',id:row.id,name:row.name});
      }
    }else{
      cards.push(row);changes.push({type:'new',id:row.id,name:row.name});
    }
  }
  if(issues.length)return {ok:false,issues,changes:[],catalog:central};
  const result=parseCentralTemp({...central,sets,cards});
  return {ok:true,issues:[],changes,catalog:result};
}
