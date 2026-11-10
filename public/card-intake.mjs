import {
  INTAKE_SCHEMA,MAX_INTAKE_CARDS,safeHTTPS,parseCardURL,normalizeCandidate,
  classifyCandidate,completeness,importBatch,exportBatch,readCSV,intakeIdentity,importDiscoveryFeed
} from './card-intake-core.mjs';
import {setupCardLoupe} from './card-intake-loupe.mjs';
import {TEMP_DB_KEY,planTempAcceptance,planBulkTempAcceptance,tempCandidateUpdates,tempReady} from './temp-intake-core.mjs';
import {loadCentralTemp,mergeTempStores,createTempProposal} from './temp-central-core.mjs';

const STORAGE_KEY='tcg-lab-card-intake-v1';
const $=id=>document.getElementById(id);
const form=$('cardForm');
const loupe=setupCardLoupe();
$('previewSelected').addEventListener('click',()=>{
  openLoupeFor({name:getElement('name').value,image_url:getElement('image_url').value},selected);
});
let queue=[],selected=-1,catalog=null;
const bulkSelected=new Set(); // transient queue indices, never saved or uploaded

let pendingTempUpdates=[];
let centralTemp=null;
function readTempStore(){try{return JSON.parse(localStorage.getItem(TEMP_DB_KEY)||'null')||{}}catch{throw Error('Existing Card DB TEMP storage cannot be read. Export a backup before continuing.')}}
function tempRecord(candidate=queue[selected]){
  if(!candidate)return null;
  const store=readTempStore();
  const rows=[...(store.tempCards||[]),...(centralTemp?.cards||[])];
  return rows.find(c=>candidate.temp_entity_id&&c.id===candidate.temp_entity_id)||
    rows.find(c=>candidate.discovery_id&&
       (c.discoveryId===candidate.discovery_id||c.discoveryIds?.includes(candidate.discovery_id)))||null;
}
function updateTempDestination(){
  const select=$('tempDestination'),previous=select.value;
  let store;
  try{store=readTempStore()}
  catch(error){select.disabled=true;$('tempStatus').textContent='TEMP unavailable: '+error.message;return}
  select.disabled=selected<0;
  select.replaceChildren();
  const auto=document.createElement('option');auto.value='';auto.textContent='Auto: match set name / create TEMP set';select.append(auto);
  for(const set of [...(centralTemp?.sets||[]),...(store.tempSets||[])]){
    if(!set?.code||set.code==='TMPDELTAREIGN')continue;
    const option=document.createElement('option');option.value=set.code;option.textContent='TEMP — '+set.name;
    select.append(option);
  }
  const linked=tempRecord(),code=linked?.setCode||previous;
  if(code&&[...select.options].some(o=>o.value===code))select.value=code;
}
function refreshTempStatus(){
  const label=$('tempStatus');
  let row;
  try{row=tempRecord()}
  catch(error){
    label.textContent='TEMP unavailable: '+error.message;
    $('addTempDeck').disabled=true;$('openTempProxy').disabled=true;
    $('tempReviewChanges').textContent='';$('loadTempSuggestion').hidden=true;
    return;
  }
  const ready=tempReady(row);
  const published=!!row&&!!centralTemp?.cards?.some(c=>c.id===row.id);
  label.textContent=row?((published?'Shared TEMP published: ':'TEMP draft saved locally (not yet published): ')+row.name+' · '+row.setCode+
    ' · Manual Simulator '+(ready.manualSimulator?'ready':'missing name/category')+
    ' · Proxy '+(ready.proxy?'image ready':'needs artwork')+
    ' · Translation '+ready.translation+
    '. English Master approval is separate.'):
    'Not accepted to TEMP yet. Japanese-only and unofficial translations are allowed.';
  $('addTempDeck').disabled=!ready.manualSimulator;
  $('openTempProxy').disabled=!ready.proxy;
  const report=pendingTempUpdates.find(u=>row&&u.recordId===row.id);
  $('tempReviewChanges').textContent=report?
    'New source information to review (not applied):\n'+
    report.changes.map(d=>d.label+': '+(d.before||'(empty)')+' → '+(d.after||'(empty)')).join('\n'):
    '';
  $('loadTempSuggestion').hidden=!report;
}
function notice(message,kind=''){const el=$('feedback');el.textContent=message;el.className=kind}
function saveLocal(){
  try {localStorage.setItem(STORAGE_KEY,JSON.stringify(exportBatch(queue)));return true}
  catch(error){notice('Browser queue could not be saved. Export a backup now: '+error.message,'bad');return false}
}
function restoreLocal(){
  try{const raw=localStorage.getItem(STORAGE_KEY);return raw?importBatch(JSON.parse(raw)):[]}
  catch(error){notice('Intake backup could not be read: '+error.message,'bad');return []}
}
function download(filename,object){
  const blob=new Blob([JSON.stringify(object,null,2)+'\n'],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function getElement(name){return form.elements.namedItem(name)}
function collect(){
  const raw={...queue[selected]};
  const keys=[
    'source_url','name','name_jp','category','language','translation_status','translation_source_url','release_jp','release_en','set_code','set_name','card_number','stage','pokemon_types','hp',
    'evolves_from','weakness','resistance','retreat_cost','regulation_mark','release_date','rarity','image_url',
    'combined_text','rules_text','existing_entity_id','status','review_note'
  ];
  for(const key of keys)raw[key]=getElement(key).value.trim();
  for(const key of ['source_verified','artwork_verified','reviewed_distinct_gameplay'])raw[key]=getElement(key).checked;
  for(const [input,output]of [['attacks_json','attacks'],['abilities_json','abilities']]){
    const value=getElement(input).value.trim();
    let arr=[];
    if(value){try{arr=JSON.parse(value)}catch{throw Error('Invalid '+output+' JSON');}
      if(!Array.isArray(arr))throw Error(output+' must be an array.');}
    raw[output]=arr;
  }
  return normalizeCandidate(raw);
}
function fill(c){
  const raw=c||{};
  const keys=['source_url','name','name_jp','category','language','translation_status','translation_source_url','release_jp','release_en','set_code','set_name','card_number','stage','pokemon_types','hp',
    'evolves_from','weakness','resistance','retreat_cost','regulation_mark','release_date','rarity','image_url',
    'combined_text','rules_text','existing_entity_id','status','review_note'];
  for(const key of keys)getElement(key).value=raw[key]??(key==='language'?'unknown':key==='status'?'discovered':'');
  for(const key of ['source_verified','artwork_verified','reviewed_distinct_gameplay'])getElement(key).checked=raw[key]===true;
  getElement('attacks_json').value=raw.attacks?.length?JSON.stringify(raw.attacks,null,2):'';
  getElement('abilities_json').value=raw.abilities?.length?JSON.stringify(raw.abilities,null,2):'';
  form.querySelectorAll('input,select,textarea,button').forEach(el=>{el.disabled=!c});
  $('formTitle').textContent=c?(c.name||'New card candidate'):'Select a candidate';
  $('previewSelected').hidden=!safeHTTPS(raw.image_url);
  updateTempDestination();
  refreshTempStatus();
  check();
}
function check(){
  if(selected<0){$('diagnostic').textContent='Select an intake candidate to review.';return}
  try{
    const c=collect();
    if(!catalog){$('diagnostic').textContent='Master DB unavailable. You can save this candidate, but approval requires the catalogue.';return}
    const match=classifyCandidate(c,catalog);
    const problems=completeness(c,match);
    // Same source+number in queue should not silently enter a second record.
    const duplicates=queue.filter((q,i)=>i!==selected&&(
      intakeIdentity(q)===intakeIdentity(c) ||
      (q.set_code&&q.card_number&&q.set_code===c.set_code&&q.card_number===c.card_number)
    ));
    if(duplicates.length)problems.push('Already staged in this intake queue');
    if(c.existing_entity_id) {
      const existing=catalog.entities.find(e=>e.entity_id===c.existing_entity_id);
      if(!existing)problems.push('Linked gameplay ID not found');
      else if(existing.name.trim().toLowerCase()!==c.name.toLowerCase()||existing.card_type!==c.category||
        String(existing.combined_text||'').trim().replace(/\s+/g,' ')!==c.combined_text.replace(/\s+/g,' '))
        problems.push('Linked card name, category or complete text differs from Master DB');
    }
    $('diagnostic').textContent='Database classification: '+match.kind+
      (match.entity_id?' → '+match.entity_id:'')+
      (match.reason?' · '+match.reason:'')+
      (problems.length?'\nPublication blockers:\n• '+[...new Set(problems)].join('\n• '):'\nReady for explicit approval. This does not publish anything.');
    $('diagnostic').className=problems.length?'warn':'good';
  }catch(error){$('diagnostic').textContent='Review error: '+error.message;$('diagnostic').className='bad'}
}
function visibleQueueEntries(){
  const search=$('filter').value.toLowerCase(),status=$('statusFilter').value;
  return queue.map((c,i)=>({...c,_index:i})).filter(c=>
    (!status||c.status===status)&&(!search||[c.name,c.set_code,c.card_number,c.source_url].join(' ').toLowerCase().includes(search)));
}
function openLoupeFor(record,queueIndex){
  const entries=visibleQueueEntries().filter(c=>safeHTTPS(c.image_url));
  let position=entries.findIndex(c=>c._index===queueIndex);
  if(position<0){
    entries.push({...record,_index:queueIndex});
    position=entries.length-1;
  }else{
    // The selected form can contain a newly edited, unsaved image URL. Preview
    // those current values without writing them into the underlying queue.
    entries[position]={...entries[position],...record};
  }
  return loupe.open(record,{items:entries,index:position});
}
function updateBulkControls(){
  const count=bulkSelected.size;
  const visible=visibleQueueEntries();
  const selectedVisible=visible.filter(c=>bulkSelected.has(c._index)).length;
  $('bulkSelectionStatus').textContent=count+' selected'+
    (visible.length && selectedVisible!==count?' ('+selectedVisible+' visible)':'');
  $('bulkAcceptTemp').disabled=count===0;
  $('bulkClear').disabled=count===0;
  $('bulkSelectVisible').disabled=!visible.length || selectedVisible===visible.length;
}
function renderQueue(){
  const box=$('queueList');box.replaceChildren();
  const candidates=visibleQueueEntries();
  for(const c of candidates){
    const btn=document.createElement('button');btn.type='button';btn.className='candidate'+(selected===c._index?' active':'');
    const image=document.createElement('img');image.alt='';if(safeHTTPS(c.image_url))image.src=c.image_url;
    const text=document.createElement('span');text.style.flex='1';text.textContent=c.name||'(Unidentified reveal)';
    const sub=document.createElement('small');sub.textContent=[c.set_code,c.card_number?'#'+c.card_number:'',c.language].filter(Boolean).join(' · ');text.appendChild(sub);
    const badge=document.createElement('span');badge.className='pill';badge.textContent=c.temp_entity_id?'TEMP · '+c.status:c.status;
    btn.append(image,text,badge);
    btn.addEventListener('click',()=>{selected=c._index;fill(queue[selected]);renderQueue()});
    const wrap=document.createElement('div');
    wrap.className='candidate-wrap';
    const pickLabel=document.createElement('label');
    pickLabel.className='candidate-pick';
    pickLabel.title='Select this card for bulk TEMP acceptance';
    const pick=document.createElement('input');
    pick.type='checkbox';
    pick.className='candidate-bulk-check';
    pick.checked=bulkSelected.has(c._index);
    pick.setAttribute('aria-label','Select '+(c.name||'unnamed card')+' for bulk TEMP acceptance');
    pick.addEventListener('change',()=>{
      if(pick.checked)bulkSelected.add(c._index);
      else bulkSelected.delete(c._index);
      updateBulkControls();
    });
    pickLabel.append(pick);
    wrap.append(pickLabel,btn);
    if(safeHTTPS(c.image_url)){
      const magnify=document.createElement('button');
      magnify.type='button';magnify.className='candidate-loupe-trigger';
      magnify.setAttribute('aria-label','Enlarge '+(c.name||'card')+' artwork');
      magnify.title='Enlarge card artwork';
      magnify.addEventListener('click',()=>openLoupeFor(c,c._index));
      wrap.append(magnify);
    }
    box.append(wrap);
  }
  if(!candidates.length){const empty=document.createElement('p');empty.className='empty';empty.textContent=queue.length?'No matches for this filter.':'No cards staged yet. Add a reveal URL to begin.';box.appendChild(empty)}
  $('queueCount').textContent=queue.length+' staged · '+queue.filter(x=>x.status==='approved').length+' approved';
  updateBulkControls();
}
function showSelected(){if(selected>=queue.length)selected=queue.length-1;fill(queue[selected]||null);renderQueue()}
function mergeImported(cards){
  const staged=[];
  let skipped=0;
  // Validate the entire incoming batch before changing the browser-local queue.
  for(const c of cards){
    const id=intakeIdentity(c);
    const already=[...queue,...staged].some(x=>intakeIdentity(x)===id ||
      (x.set_code && c.set_code && x.card_number && c.card_number &&
        x.set_code===c.set_code && x.card_number===c.card_number));
    if(already){skipped++;continue}
    if(queue.length+staged.length>=MAX_INTAKE_CARDS)
      throw Error('500-candidate queue limit reached. Export/clear older batches.');
    staged.push(c);
  }
  queue.push(...staged);
  saveLocal();if(staged.length)selected=queue.length-staged.length;showSelected();
  return {added:staged.length,skipped};
}
// Public GitHub staging branch, not the authoritative Master DB or private tag store.
// Discovery publishing updates this isolated feed branch; it NEVER changes main.
const DISCOVERY_URL='https://raw.githubusercontent.com/MckTCG/toolbelt/automation/card-discovery-feed/public/data/card-discoveries-v1.json';
$('loadDiscoveries').addEventListener('click',async()=>{
  const button=$('loadDiscoveries');button.disabled=true;
  $('discoveryStatus').textContent='Checking the unverified discovery staging feed…';
  try{
    const response=await fetch(DISCOVERY_URL+'?v='+Date.now(),{cache:'no-store',credentials:'omit',mode:'cors'});
    if(!response.ok)throw Error('Staging feed HTTP '+response.status+' (feed may not be initialized yet)');
    const raw=await response.text();
    if(raw.length>1_800_000)throw Error('Staging feed exceeds size limit');
    const payload=JSON.parse(raw);
    const cards=importDiscoveryFeed(payload);
    const results=mergeImported(cards);
    try{pendingTempUpdates=tempCandidateUpdates(centralTemp?mergeTempStores(readTempStore(),centralTemp).view:readTempStore(),cards)}
    catch(error){pendingTempUpdates=[];notice('Discoveries loaded, but existing TEMP storage could not be compared: '+error.message,'warn')}
    refreshTempStatus();
    $('discoveryStatus').textContent='Discovery feed '+(payload.generated_at||'unknown update')+
      ' · '+cards.length+' reviewed-source candidates available · '+results.added+' newly staged · '+results.skipped+' already present.'+
      (payload.errors?.length?' Some sources reported errors; see the intake feed report.':'')+
      (pendingTempUpdates.length?' · '+pendingTempUpdates.length+' TEMP record(s) have changes to review.':'');
    notice('Discovered cards are still provisional/unverified. Review them before approval.','good');
  }catch(error){
    $('discoveryStatus').textContent='Discovery feed unavailable: '+error.message+
      '. You can continue adding sources or importing JSON backups manually.';
    notice('No existing cards or review decisions were changed.','warn');
  }finally{button.disabled=false}
});

$('addSource').addEventListener('click',()=>{
  try{
    const parsed=parseCardURL($('sourceInput').value);
    if(queue.length>=MAX_INTAKE_CARDS)throw Error('Intake queue full. Export a backup first.');
    const c=normalizeCandidate({...parsed,status:parsed.language==='jp'?'provisional':'discovered'});
    const r=mergeImported([c]);
    $('sourceInput').value='';notice(r.added?'Source staged. Complete the card details and Save draft.':'This source is already in the queue.',r.added?'good':'warn');
  }catch(error){notice(error.message,'bad')}
});
$('sourceInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('addSource').click()}});
form.addEventListener('submit',e=>{
  e.preventDefault();if(selected<0)return;
  try{
    const c=collect();
    if(c.status==='approved'){
      const problems=completeness(c,catalog?classifyCandidate(c,catalog):{kind:'incomplete'});
      if(problems.length)throw Error('Approved card has unresolved requirements: '+problems.join(', '));
    }
    queue[selected]=c;saveLocal();showSelected();notice('Draft saved locally. No Master DB changes made.','good');
  }catch(error){notice(error.message,'bad')}
});
$('bulkSelectVisible').addEventListener('click',()=>{
  for(const c of visibleQueueEntries())bulkSelected.add(c._index);
  renderQueue();
});
$('bulkClear').addEventListener('click',()=>{
  bulkSelected.clear();$('bulkTempReport').textContent='';renderQueue();
});
$('bulkAcceptTemp').addEventListener('click',()=>{
  if(!bulkSelected.size)return;
  try{
    const indexes=[...bulkSelected].sort((a,b)=>a-b);
    const oldStoreRaw=localStorage.getItem(TEMP_DB_KEY);
    const oldQueueRaw=localStorage.getItem(STORAGE_KEY);
    const local=readTempStore();
    const base=structuredClone(local);
    base.tempSets=Array.isArray(base.tempSets)?base.tempSets:[];
    for(const set of centralTemp?.sets||[]){
      if(!base.tempSets.some(x=>x.code===set.code))base.tempSets.push(set);
    }
    // Only the saved queue is processed: unsaved edits in the single-card
    // form must be saved first. Existing record conflicts are skipped.
    const result=planBulkTempAcceptance(queue,indexes,base,{
      seedTags:catalog?.reviewed_seed,now:new Date().toISOString(),
      centralCards:centralTemp?.cards||[]
    });
    if(!result.accepted.length){
      $('bulkTempReport').textContent='No cards accepted. '+
        result.skipped.slice(0,12).map(x=>x.name+': '+x.reason).join('\n');
      notice(result.skipped.length+' selected card(s) need individual review or missing details. Nothing changed.','warn');
      return;
    }
    const nextQueue=queue.map(x=>({...x}));
    const acceptedAt=new Date().toISOString();
    for(const row of result.accepted){
      nextQueue[row.index].temp_entity_id=row.id;
      nextQueue[row.index].temp_accepted_at=acceptedAt;
    }
    const encodedTemp=JSON.stringify(result.store);
    const encodedQueue=JSON.stringify(exportBatch(nextQueue));
    try {
      localStorage.setItem(TEMP_DB_KEY,encodedTemp);
      localStorage.setItem(STORAGE_KEY,encodedQueue);
    }catch(error){
      // Best effort rollback if the second storage write failed.
      try{
        if(oldStoreRaw===null)localStorage.removeItem(TEMP_DB_KEY);
        else localStorage.setItem(TEMP_DB_KEY,oldStoreRaw);
        if(oldQueueRaw===null)localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY,oldQueueRaw);
      }catch{}
      throw Error('Bulk save failed; please back up your cards before retrying: '+error.message);
    }
    queue=nextQueue;
    for(const row of result.accepted)bulkSelected.delete(row.index);
    showSelected();
    $('bulkTempReport').textContent='Accepted '+result.accepted.length+' TEMP draft(s), '+
      result.skipped.length+' skipped. '+
      (result.skipped.length?'Review individually:\n'+result.skipped.slice(0,20)
        .map(x=>x.name+': '+x.reason).join('\n'):'All selected cards were processed.');
    notice('Accepted '+result.accepted.length+' card(s) into local TEMP. '+
      result.skipped.length+' need review. Use Export central TEMP proposal for reviewed GitHub publication.','good');
  }catch(error){notice('Bulk TEMP acceptance failed: '+error.message,'bad')}
});
$('acceptTemp').addEventListener('click',()=>{
  if(selected<0)return;
  try{
    const c=collect(),now=new Date().toISOString(),opts={setCode:$('tempDestination').value,now,seedTags:catalog?.reviewed_seed};
    const local=readTempStore();
    const code=opts.setCode,centralSet=centralTemp?.sets?.find(x=>x.code===code);
    const base=structuredClone(local);
    if(centralSet){
      base.tempSets=Array.isArray(base.tempSets)?base.tempSets:[];
      if(!base.tempSets.some(x=>x.code===code))base.tempSets.push(centralSet);
    }
    let result=planTempAcceptance(c,base,opts);
    if(result.kind==='update-review-required'){
      const summary=result.changes.map(d=>d.label+': '+(d.before||'(empty)')+' → '+(d.after||'(empty)')).join('\n');
      if(!confirm('Update an existing TEMP card? Its gameplay identity and tags will be preserved. Changes:\n'+summary))return;
      result=planTempAcceptance(c,base,{...opts,allowUpdate:true});
    }
    // Commit both storages only after all candidate validations completed.
    try{localStorage.setItem(TEMP_DB_KEY,JSON.stringify(result.store))}
    catch(error){throw Error('Could not save TEMP. Export your Card DB backups: '+error.message)}
    c.temp_entity_id=result.record.id;c.temp_accepted_at=now;
    queue[selected]=c;saveLocal();showSelected();
    notice((result.kind==='created'?'Accepted new':result.kind==='updated'?'Updated':'Already accepted')+
      ' TEMP draft. It is playable in this browser; export a central TEMP proposal and merge its reviewed GitHub PR to share across devices. English Master remains unchanged.','good');
  }catch(error){notice(error.message,'bad')}
});
$('exportCentralTemp').addEventListener('click',()=>{
  try{
    const proposal=createTempProposal(readTempStore());
    download('TCG_Lab_Central_TEMP_Proposal.json',proposal);
    notice('Exported '+proposal.cards.length+' TEMP card(s) without personal tags or notes. Publication requires the reviewed GitHub TEMP publisher and an approved PR. No shared records were changed.','good');
  }catch(error){notice('Could not prepare central TEMP proposal: '+error.message,'bad')}
});
$('addTempDeck').addEventListener('click',()=>{
  const row=tempRecord();if(!tempReady(row).manualSimulator)return;
  const hash='#add='+encodeURIComponent(JSON.stringify({entityId:row.id,printingId:row.id+':printing'}));
  window.open('./deck-builder.html'+hash,'_blank','noopener');
});
$('openTempProxy').addEventListener('click',()=>{
  if(!tempReady(tempRecord()).proxy)return;
  window.open('./proxy-workshop.html','_blank','noopener');
});
$('loadTempSuggestion').addEventListener('click',()=>{
  const row=tempRecord(),report=pendingTempUpdates.find(u=>row&&u.recordId===row.id);
  if(!report)return;
  if(!confirm('Load the latest unverified source fields into this form for review? Your saved TEMP record will remain unchanged until you click Accept to TEMP.'))return;
  const existing=collect();
  const next={...existing};
  for(const [key,value]of Object.entries(report.candidate)){
    if(value!==undefined&&value!==null&&String(value).trim()&&
      !['status','source_verified','artwork_verified','reviewed_distinct_gameplay','temp_entity_id','temp_accepted_at'].includes(key)){
      next[key]=value;
    }
  }
  next.status='provisional';next.source_verified=false;next.artwork_verified=false;
  fill(next);
  notice('Source suggestions loaded into form only. Verify differences, then Accept to TEMP to apply and record a revision.','warn');
});

$('approveCard').addEventListener('click',()=>{
  if(selected<0||!catalog)return;
  try{
    const c=collect(),match=classifyCandidate(c,catalog),problems=completeness(c,match);
    if(queue.some((q,i)=>i!==selected&&(intakeIdentity(q)===intakeIdentity(c)||(q.set_code&&q.card_number&&q.set_code===c.set_code&&q.card_number===c.card_number))))problems.push('Duplicate intake record');
    if(c.existing_entity_id){
      const e=catalog.entities.find(e=>e.entity_id===c.existing_entity_id);
      if(!e||e.name!==c.name||e.card_type!==c.category||e.combined_text.trim().replace(/\s+/g,' ')!==c.combined_text.trim().replace(/\s+/g,' '))problems.push('Linked existing gameplay data mismatch');
    }
    if(problems.length)throw Error('Cannot approve:\n• '+problems.join('\n• '));
    c.status='approved';queue[selected]=c;saveLocal();showSelected();notice('Approved for export — publication still requires reviewed GitHub changes.','good');
  }catch(error){notice(error.message,'bad')}
});
$('rejectCard').addEventListener('click',()=>{if(selected<0)return;try{const c=collect();c.status='rejected';queue[selected]=c;saveLocal();showSelected();notice('Candidate rejected; preserved in your intake history.','warn')}catch(e){notice(e.message,'bad')}});
$('deleteCard').addEventListener('click',()=>{
  if(selected<0||!confirm('Remove this candidate from local intake?'))return;
  const removed=selected;
  queue.splice(removed,1);
  const retained=[...bulkSelected].filter(i=>i!==removed).map(i=>i>removed?i-1:i);
  bulkSelected.clear();
  for(const index of retained)bulkSelected.add(index);
  saveLocal();showSelected();notice('Candidate removed.','good');
});
$('importFile').addEventListener('click',()=>$('filePicker').click());
$('filePicker').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
    const text=await file.text(),data=/\.csv$/i.test(file.name)?readCSV(text):importBatch(JSON.parse(text));
    const r=mergeImported(data);notice('Imported '+r.added+' candidate(s); '+r.skipped+' already staged.','good');
  }catch(error){notice('Import failed: '+error.message,'bad')}finally{e.target.value=''}
});
$('exportQueue').addEventListener('click',()=>{download('TCG_Lab_Card_Intake_Backup.json',exportBatch(queue));notice('Queue backup downloaded.','good')});
$('exportApproved').addEventListener('click',()=>{
  const approved=queue.filter(c=>c.status==='approved');
  if(!approved.length){notice('No approved candidates to export.','warn');return}
  download('TCG_Lab_Card_Intake_Approved.json',exportBatch(approved));
  notice('Exported '+approved.length+' reviewed candidate(s) for GitHub validation and PR. Nothing was published.','good');
});
for(const id of ['filter','statusFilter'])$(id).addEventListener(id==='filter'?'input':'change',renderQueue);
form.addEventListener('input',check);form.addEventListener('change',check);
window.addEventListener('storage',e=>{
  if(e.key===TEMP_DB_KEY){try{updateTempDestination();refreshTempStatus()}catch{}}
});
getElement('image_url').addEventListener('input',()=>{
  $('previewSelected').hidden=!safeHTTPS(getElement('image_url').value);
});
queue=restoreLocal();showSelected();
(async()=>{
  try{
    const response=await fetch('./card-db.html',{cache:'no-cache'});
    if(!response.ok)throw Error('HTTP '+response.status);
    const doc=new DOMParser().parseFromString(await response.text(),'text/html');
    const node=doc.querySelector('script#catalog[type="application/json"]');
    if(!node)throw Error('Master catalogue script not found.');
    const data=JSON.parse(node.textContent);
    if(data.schema!=='tcg-lab-catalog-v2'||!Array.isArray(data.entities))throw Error('Unexpected catalogue format.');
    catalog=data;
    try{
      centralTemp=await loadCentralTemp();
      $('centralTempStatus').textContent='Central TEMP: '+centralTemp.cards.length+' shared cards in '+centralTemp.sets.length+' sets. Browser drafts are still private until published through GitHub.';
    }catch(error){
      centralTemp=null;
      $('centralTempStatus').textContent='Central TEMP unavailable ('+error.message+'). Local playtesting drafts still work; central publication cannot be verified here.';
    }
    updateTempDestination();refreshTempStatus();
    const printings=data.entities.reduce((n,c)=>n+(c.printings||[]).length,0);
    $('catalogStatus').textContent='Connected to Master Card DB · '+data.entities.length.toLocaleString()+' gameplay records · '+printings.toLocaleString()+' printings. Review is local; publication is separate.';
    $('catalogStatus').className='stats good';
    check();
  }catch(error){
    $('catalogStatus').textContent='Master DB unavailable: '+error.message+'. You may capture drafts and export backups; approval is disabled until catalogue is reachable.';
    $('catalogStatus').className='stats bad';
    check();
  }
})();
