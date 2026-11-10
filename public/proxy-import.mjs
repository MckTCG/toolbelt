import {combineCatalog,matchCard,findPrinting,imageCandidates,rowsFromDeck,loadDeckDocument,chooseRows,LIB_KEY,DRAFT_KEY,DB_KEY,SUBTYPES} from './proxy-import-core.mjs';
import {indexedArt,localArtworkFor} from './card-art-resolver.mjs';
import {loadCentralTemp,mergeTempStores} from './temp-central-core.mjs';

const queue=window.__proxyQueue;
if(!queue)throw Error('Quick Print queue is unavailable.');
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeStore=key=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}};
const css=document.createElement('link');css.rel='stylesheet';css.href='./proxy-import.css';document.head.append(css);
const toggle=document.createElement('button');toggle.type='button';toggle.id='openImporter';toggle.textContent='Import cards / decks';toggle.setAttribute('aria-expanded','false');
document.querySelector('.bar').append(toggle);
const panel=document.createElement('section');panel.id='proxyImporter';panel.hidden=true;panel.setAttribute('aria-label','Card and deck import');
panel.innerHTML='<div class="pi-header"><div><h2>Import cards · TCG Lab</h2><p>Choose exact card artwork and quantities. Quick Print remains available below.</p></div><button type="button" id="closeImporter" aria-label="Close card importer">✕</button></div>'+
 '<nav class="pi-tabs" aria-label="Import sections"><button type="button" data-tab="cards" aria-selected="true">Cards</button><button type="button" data-tab="decks" aria-selected="false">Saved decks / lists</button><button type="button" data-tab="queue" aria-selected="false">Print queue</button></nav>'+
 '<p class="pi-status" id="proxyImportStatus" role="status">Loading the master Card DB…</p>'+
 '<div id="piCards"><div class="pi-toolbar"><label>Search cards<input id="piSearch" type="search" placeholder="Buddy-Buddy Poffin, Rayquaza, DLR 138…"></label><label>Category<select id="piCategory"><option value="">All cards</option><option>Pokémon</option><option>Trainer</option><option>Energy</option></select></label><label>Subtype<select id="piSubtype"><option value="">All subtypes</option></select></label><label>Set<select id="piSet"><option value="">All sets</option></select></label><label>Pokémon type<select id="piType"><option value="">All types</option></select></label></div><div id="piResultCount" class="pi-status"></div><div class="pi-results" id="piResults"></div><button type="button" id="piMore" hidden>Show more cards</button></div>'+
 '<div id="piDecks" hidden><div class="pi-deck-import"><div><h3>Saved Deck Builder decks</h3><label>Choose a saved deck<select id="piSaved"><option value="">Select a deck…</option></select></label><button type="button" id="piLoadSaved">Preview saved deck</button><p class="pi-sub">Reads your existing decks without editing them. Decks saved on other sites or browsers require a JSON export.</p></div><div><h3>Import a list or deck file</h3><label>JSON or TXT<input type="file" id="piDeckFile" accept=".json,.txt,application/json,text/plain"></label><p class="pi-sub">Supports TCG Lab deck JSON, saved-library backups and Pokémon decklist text.</p><label>Or paste a decklist<textarea id="piDeckText" placeholder="4 Buddy-Buddy Poffin TEF 144&#10;2 Ultra Ball SVI 196"></textarea></label><button type="button" id="piParseText">Preview decklist</button></div></div><h3 id="piDeckTitle">Deck preview</h3><div class="pi-toolbar"><label>Choose cards to print<select id="piScope"><option value="all">Entire deck</option><option value="pokemon">Pokémon only</option><option value="trainer">Trainers only</option><option value="energy">Energy only</option><option value="selected">Only checked cards</option></select></label><button type="button" id="piAddDeck" class="primary">Add preview to print queue</button></div><div id="piDeckPreview"><p class="pi-status">Select a saved deck or import a list to preview cards and quantities.</p></div></div>'+
 '<div id="piQueue" hidden><h3>Unified print queue</h3><p class="pi-sub">Manually uploaded images, database cards, and deck imports share the same sheets. Reorder or adjust quantities here, or click a sheet slot below to replace an image.</p><div id="piQueueRows"></div></div>';
document.querySelector('.controls').append(panel);

let allCards=[],cardById=new Map(),sets=[],localArt=new Map(),activeRows=[],savedDecks=[],externalDecks=[],activeDeckTitle='',visible=48,tab='cards',loading=false;
const chosen=new Map(),imagePromises=new Map();
function report(message,error=false){const n=$('proxyImportStatus');n.textContent=message;n.setAttribute('role',error?'alert':'status')}
function show(tabName){tab=tabName;for(const id of ['cards','decks','queue']){$('pi'+id[0].toUpperCase()+id.slice(1)).hidden=id!==tabName;panel.querySelector('[data-tab="'+id+'"]').setAttribute('aria-selected',String(id===tabName))}if(tabName==='queue')renderQueue()}
function updateTabs(){const n=queue.groups().reduce((a,g)=>a+g.qty,0);panel.querySelector('[data-tab="queue"]').textContent='Print queue ('+n+')'}
toggle.onclick=()=>{panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){updateTabs();panel.scrollIntoView({behavior:'smooth',block:'start'})}};
$('closeImporter').onclick=()=>{panel.hidden=true;toggle.setAttribute('aria-expanded','false')};
panel.querySelector('.pi-tabs').onclick=e=>{const b=e.target.closest('[data-tab]');if(b)show(b.dataset.tab)};
function option(p){return '<option value="'+esc(p.printing_id)+'">'+esc(p.set_code)+' #'+esc(p.card_number)+' · '+esc(p.rarity||'Artwork')+'</option>'}
function choices(c,set=''){return (set?c.printings.filter(p=>p.set_code===set):c.printings)||[]}
function previewImage(p){return imageCandidates(p,localArt)}
function artHTML(p,alt){
 const urls=previewImage(p);
 return '<img alt="'+esc(alt)+'" loading="lazy" src="'+esc(urls[0]||'')+'" data-art-fallbacks="'+esc(JSON.stringify(urls.slice(1)))+'">';
}
panel.addEventListener('error',e=>{if(e.target.tagName!=='IMG')return;let urls=[];try{urls=JSON.parse(e.target.dataset.artFallbacks||'[]')}catch{}const next=urls.shift();e.target.dataset.artFallbacks=JSON.stringify(urls);if(next)e.target.src=next;else{e.target.alt+=' (art unavailable)';e.target.style.opacity='.25'}},true);
function updateSubtypes(){
 const type=$('piCategory').value,previous=$('piSubtype').value,opts=SUBTYPES[type]||[];
 $('piSubtype').innerHTML='<option value="">All subtypes</option>'+opts.map(x=>'<option>'+esc(x)+'</option>').join('');
 if(opts.includes(previous))$('piSubtype').value=previous;
}
function renderCards(){
 const filters={query:$('piSearch').value,category:$('piCategory').value,subtype:$('piSubtype').value,set:$('piSet').value,type:$('piType').value};
 const found=allCards.filter(c=>matchCard(c,filters));
 $('piResultCount').textContent=allCards.length?found.length.toLocaleString()+' matching gameplay cards · choose a printing before adding':'Catalogue unavailable; manual Quick Print still works.';
 $('piResults').innerHTML=found.slice(0,visible).map(c=>{
  const opts=choices(c,filters.set);if(!opts.length)return '';
  const selected=opts.find(p=>p.printing_id===chosen.get(c.entity_id))||opts[0];
  return '<article class="pi-card" data-card="'+esc(c.entity_id)+'">'+artHTML(selected,c.name)+
   '<strong>'+esc(c.name)+'</strong><div class="pi-sub">'+esc(c.card_type)+(c.stage?' · '+esc(c.stage):'')+(c.temp?' · TEMP':'')+'</div>'+
   '<select data-card-print="'+esc(c.entity_id)+'" aria-label="Select artwork for '+esc(c.name)+'">'+opts.map(p=>option(p).replace('value="'+esc(p.printing_id)+'"','value="'+esc(p.printing_id)+'"'+(p.printing_id===selected.printing_id?' selected':''))).join('')+'</select>'+
   '<div class="pi-add"><input type="number" data-card-qty="'+esc(c.entity_id)+'" min="1" max="999" value="1" aria-label="Copies of '+esc(c.name)+'"><button type="button" data-add-card="'+esc(c.entity_id)+'" class="primary">Add</button></div>'+
   '<div class="pi-quick"><span class="pi-sub">Quick add:</span>'+[1,2,3,4].map(n=>'<button type="button" data-quick-card="'+esc(c.entity_id)+'" data-quick-qty="'+n+'">'+n+'</button>').join('')+'</div></article>';
 }).join('')||'<p class="pi-status">No matching cards. Try another name, set or filter.</p>';
 $('piMore').hidden=found.length<=visible;
 $('piMore').textContent='Show more ('+Math.min(visible,found.length)+' / '+found.length+')';
}
const controls=['piSearch','piCategory','piSubtype','piSet','piType'];
for(const id of controls)$(id).addEventListener(id==='piSearch'?'input':'change',()=>{if(id==='piCategory')updateSubtypes();visible=48;renderCards()});
$('piMore').onclick=()=>{visible+=48;renderCards()};
function waitForImage(url){
 return new Promise(resolve=>{
  const img=new Image();let done=false;
  const timer=setTimeout(()=>finish(false),8500);
  function finish(ok){if(done)return;done=true;clearTimeout(timer);img.onload=null;img.onerror=null;resolve(ok)}
  img.onload=()=>finish(!!img.naturalWidth);img.onerror=()=>finish(false);img.src=url;
  if(img.complete&&img.naturalWidth)finish(true);
 });
}
async function availableArtwork(p){
 const key=String(p.printing_id),cached=imagePromises.get(key);if(cached)return cached;
 const promise=(async()=>{for(const url of previewImage(p))if(await waitForImage(url))return url;return ''})();
 imagePromises.set(key,promise);
 const value=await promise;if(!value)imagePromises.delete(key);
 return value;
}
async function entryFor(c,p,qty){
 const url=await availableArtwork(p);
 if(!url)throw Error('No printable artwork loaded for '+c.name+' · '+p.set_code+' #'+p.card_number+'. Try another printing or upload an image manually.');
 return {url,name:c.name,entityId:c.entity_id,printingId:p.printing_id,source:c.temp?'temp':'database',qty, fallbacks:previewImage(p).filter(x=>x!==url)};
}
async function addCard(c,p,qty){
 if(loading)return;
 if(!Number.isInteger(qty)||qty<1||qty>999){report('Enter a whole quantity from 1 to 999.',true);return}
 loading=true;report('Checking exact artwork before adding '+c.name+'…');
 try{queue.addEntries([await entryFor(c,p,qty)]);report('Added '+qty+' × '+c.name+' · '+p.set_code+' #'+p.card_number+'.');updateTabs()}
 catch(err){report(err.message,true)}finally{loading=false}
}
$('piResults').onchange=e=>{
 const select=e.target.closest('[data-card-print]');if(!select)return;
 chosen.set(select.dataset.cardPrint,select.value);
 const c=cardById.get(select.dataset.cardPrint),p=findPrinting(c,select.value),tile=select.closest('.pi-card');
 if(c&&p){const img=tile.querySelector('img'),urls=previewImage(p);img.style.opacity='1';img.src=urls[0]||'';img.dataset.artFallbacks=JSON.stringify(urls.slice(1))}
};
$('piResults').onclick=e=>{
 const b=e.target.closest('[data-add-card],[data-quick-card]');if(!b)return;
 const id=b.dataset.addCard||b.dataset.quickCard,c=cardById.get(id),tile=b.closest('.pi-card');if(!c)return;
 const p=findPrinting(c,tile.querySelector('[data-card-print]').value),qty=b.hasAttribute('data-quick-card')?Number(b.dataset.quickQty):Number(tile.querySelector('[data-card-qty]').value);
 addCard(c,p,qty);
};
function getSavedDecks(){
 const raw=safeStore(LIB_KEY),draft=safeStore(DRAFT_KEY);
 savedDecks=Array.isArray(raw?.decks)?raw.decks.filter(d=>d&&Array.isArray(d.rows)).map(d=>({name:d.name||'Saved deck',deck:d})):[];
 if(draft?.deck?.rows?.length)savedDecks.unshift({name:'Current Deck Builder draft',deck:draft.deck});
 const merged=[...savedDecks,...externalDecks];
 $('piSaved').innerHTML='<option value="">Select a deck…</option>'+merged.map((d,i)=>'<option value="'+i+'">'+esc(d.name)+'</option>').join('');
}
function activateRows(rows,name){
 activeRows=rows.map(r=>({...r,selected:true}));activeDeckTitle=name||'Imported deck';$('piDeckTitle').textContent=activeDeckTitle+' · '+activeRows.reduce((n,r)=>n+r.qty,0)+' cards';renderDeck();
 report('Preview loaded. Choose quantities and printings; your original deck remains unchanged.');
}
$('piLoadSaved').onclick=()=>{
 const selected=$('piSaved').value;
 const i=selected===''?-1:Number(selected),item=[...savedDecks,...externalDecks][i];
 if(!item){report('Choose a saved deck first.',true);return}
 try{activateRows(item.rows||rowsFromDeck(item.deck,allCards),item.name)}catch(err){report(err.message,true)}
};
async function importDocument(raw,name){
 if(!allCards.length)throw Error('Card DB unavailable. Load the catalogue before importing a deck.');
 const parsed=loadDeckDocument(raw,allCards);
 if(Array.isArray(parsed))activateRows(parsed,name||'Imported deck');
 else if(parsed?.decks){externalDecks=parsed.decks;getSavedDecks();show('decks');report('Loaded '+externalDecks.length+' decks. Choose one from the saved deck dropdown.')}
}
$('piDeckFile').onchange=async e=>{
 const file=e.target.files?.[0];e.target.value='';if(!file)return;
 try{if(file.size>10_000_000)throw Error('File exceeds the 10 MB limit.');await importDocument(await file.text(),file.name)}
 catch(err){report('Import failed: '+err.message,true)}
};
$('piParseText').onclick=async()=>{try{await importDocument($('piDeckText').value,'Pasted decklist')}catch(err){report('Import failed: '+err.message,true)}};
function renderDeck(){
 const scope=$('piScope').value;
 $('piDeckPreview').innerHTML=activeRows.length?activeRows.map((row,i)=>{
  const p=row.printing,prints=row.card?.printings||[p],enabled=(scope==='all'||scope==='selected'||(scope==='pokemon'&&row.category==='Pokémon')||(scope==='trainer'&&row.category==='Trainer')||(scope==='energy'&&row.category==='Energy'));
  return '<div class="pi-row" data-deck-row="'+i+'" style="opacity:'+(enabled?'1':'.4')+'"><label aria-label="Print '+esc(row.name)+'"><input type="checkbox" data-deck-check="'+i+'" '+(row.selected?'checked':'')+'></label>'+artHTML(p,row.name)+
   '<div class="pi-row-main"><strong>'+esc(row.name)+'</strong><div class="pi-sub">'+esc(row.category)+' · '+esc(p.set_code)+' #'+esc(p.card_number)+'</div>'+
   '<select data-deck-print="'+i+'" aria-label="Printing for '+esc(row.name)+'">'+prints.map(x=>option(x).replace('value="'+esc(x.printing_id)+'"','value="'+esc(x.printing_id)+'"'+(x.printing_id===p.printing_id?' selected':''))).join('')+'</select></div>'+
   '<div class="pi-actions"><label>Copies<input type="number" data-deck-qty="'+i+'" min="0" max="999" value="'+row.qty+'"></label></div></div>';
 }).join(''):'<p class="pi-status">No cards loaded.</p>';
}
$('piScope').onchange=renderDeck;
$('piDeckPreview').onchange=e=>{
 const i=Number(e.target.dataset.deckCheck??e.target.dataset.deckQty??e.target.dataset.deckPrint);
 const row=activeRows[i];if(!row)return;
 if(e.target.hasAttribute('data-deck-check'))row.selected=e.target.checked;
 else if(e.target.hasAttribute('data-deck-qty')){
  const q=Number(e.target.value);if(!Number.isInteger(q)||q<0||q>999){report('Quantities must be whole numbers between 0 and 999.',true);e.target.value=row.qty;return}row.qty=q;
 }else if(e.target.hasAttribute('data-deck-print')){
  const p=findPrinting(row.card,e.target.value);if(p){row.printingId=p.printing_id;row.printing=p;renderDeck()}
 }
};
$('piAddDeck').onclick=async()=>{
 if(loading)return;const scope=$('piScope').value,rows=chooseRows(activeRows,scope,scope==='selected'?new Set(activeRows.map((r,i)=>r.selected?i:-1)) :null);
 if(!rows.length){report('No cards selected for printing.',true);return}
 loading=true;report('Checking '+rows.length+' card artworks. This may require fetching older remote images…');
 try{
  const settled=await Promise.allSettled(rows.map(r=>entryFor(r.card,r.printing,r.qty)));
  const entries=settled.filter(x=>x.status==='fulfilled').map(x=>x.value),missing=settled.filter(x=>x.status==='rejected').map(x=>x.reason.message);
  if(missing.length){report('No cards were queued. Resolve these images first:\n'+missing.slice(0,7).join('\n'),true);return}
  queue.addEntries(entries);updateTabs();show('queue');report('Added '+entries.reduce((n,r)=>n+r.qty,0)+' cards to the print queue.');
 }catch(err){report(err.message,true)}finally{loading=false}
};
function renderQueue(){
 updateTabs();const groups=queue.groups();
 $('piQueueRows').innerHTML=groups.length?groups.map((g,i)=>{
  const c=cardById.get(g.entityId),p=c&&findPrinting(c,g.printingId),prints=c?.printings||[];
  return '<div class="pi-row" data-queue-url="'+esc(g.url)+'"><img src="'+esc(g.url)+'" alt="'+esc(g.name||'Card')+'">'+
   '<div class="pi-row-main"><strong>'+esc(g.name||'Uploaded artwork')+'</strong><div class="pi-sub">'+esc(g.source||'upload')+(p?' · '+esc(p.set_code)+' #'+esc(p.card_number):'')+'</div>'+
   (prints.length>1?'<select data-queue-print="'+i+'" aria-label="Change printing">'+prints.map(x=>option(x).replace('value="'+esc(x.printing_id)+'"','value="'+esc(x.printing_id)+'"'+(x.printing_id===g.printingId?' selected':''))).join('')+'</select>':'')+
   '</div><div class="pi-actions"><label>Copies<input data-queue-qty="'+i+'" type="number" min="0" max="999" value="'+g.qty+'"></label>'+
   '<button type="button" data-queue-move="'+i+'" data-dir="-1" aria-label="Move up">↑</button><button type="button" data-queue-move="'+i+'" data-dir="1" aria-label="Move down">↓</button><button type="button" data-queue-remove="'+i+'">Remove</button></div></div>';
 }).join(''):'<p class="pi-status">The print queue is empty. Upload images or select cards.</p>';
}
$('piQueueRows').onchange=async e=>{
 const g=queue.groups()[Number(e.target.dataset.queueQty??e.target.dataset.queuePrint)];if(!g)return;
 if(e.target.hasAttribute('data-queue-qty')){try{queue.setQuantity(g.url,Number(e.target.value))}catch(err){report(err.message,true);renderQueue()}}
 else if(e.target.hasAttribute('data-queue-print')){
  const c=cardById.get(g.entityId),p=findPrinting(c,e.target.value);if(!p)return;
  report('Checking replacement artwork…');
  try{queue.replaceGroup(g.url,await entryFor(c,p,1));report('Printing replaced with '+p.set_code+' #'+p.card_number+'.')}
  catch(err){report(err.message,true);renderQueue()}
 }
};
$('piQueueRows').onclick=e=>{
 const remove=e.target.closest('[data-queue-remove]'),move=e.target.closest('[data-queue-move]');
 const b=remove||move;if(!b)return;const i=Number(b.dataset.queueRemove??b.dataset.queueMove),g=queue.groups()[i];if(!g)return;
 if(remove)queue.remove(g.url);else queue.moveGroup(g.url,Number(b.dataset.dir));
};
window.addEventListener('proxy-queue-change',()=>{updateTabs();if(tab==='queue')renderQueue()});
window.addEventListener('storage',e=>{if(e.key===LIB_KEY||e.key===DRAFT_KEY)getSavedDecks();if(e.key===DB_KEY)loadCatalog()});
async function loadCatalog(){
 report('Loading existing master Card DB…');
 try{
  const res=await fetch('./card-db.html',{cache:'no-cache'});if(!res.ok)throw Error('HTTP '+res.status);
  const doc=new DOMParser().parseFromString(await res.text(),'text/html'),node=doc.querySelector('script#catalog[type="application/json"]');
  if(!node)throw Error('Master catalogue not found.');
  const standard=JSON.parse(node.textContent);
  let store=safeStore(DB_KEY)||{},centralStatus='local TEMP only';
  try{
    const central=await loadCentralTemp();
    store=mergeTempStores(store,central).view;
    centralStatus=central.cards.length+' centrally published TEMP';
  }catch(error){console.warn('Central TEMP unavailable; preserving local-only cards:',error.message)}
  const merged=combineCatalog(standard,store);
  allCards=merged.cards;sets=merged.sets;cardById=new Map(allCards.map(c=>[c.entity_id,c]));
  try{const art=await fetch('./data/card-art-manifest.json',{cache:'no-cache'});if(art.ok){const index=indexedArt(await art.json());localArt=new Map([...index].map(([pid])=>[pid,localArtworkFor(index,pid)]))}}catch{localArt=new Map()}
  $('piSet').innerHTML='<option value="">All sets</option>'+sets.map(s=>'<option value="'+esc(s.code)+'">'+esc(s.name)+' ('+esc(s.code)+')</option>').join('');
  const types=[...new Set(allCards.flatMap(c=>String(c.pokemon_types||'').split(/[|,]/).map(t=>t.trim()).filter(Boolean)))].sort();
  $('piType').innerHTML='<option value="">All types</option>'+types.map(t=>'<option>'+esc(t)+'</option>').join('');
  getSavedDecks();renderCards();
  report(allCards.length.toLocaleString()+' gameplay records ready, including '+centralStatus+' and browser-local TEMP drafts.');
 }catch(err){report('Card DB could not load ('+err.message+'). Quick Print and manually uploaded images still work.',true);renderCards()}
}
getSavedDecks();updateTabs();show('cards');await loadCatalog();
