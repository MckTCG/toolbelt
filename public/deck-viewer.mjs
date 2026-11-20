import {safeURL,deckChecks,makePayload,payloadURL,sanitizePayload} from './deck-core.mjs';
import {parseViewerDeck} from './deck-viewer-import.mjs';
import {isBasic,missingStage,expandRows,sampleSeven,deckMetrics,anyHit,pairedHit,runOpeningExperiment,cardIdentity,cardLabel} from './opening-hand-core.mjs';
import {indexedArt,localArtworkFor} from './card-art-resolver.mjs';
import {loadCentralTemp,mergeTempStores} from './temp-central-core.mjs';

const $ = id => document.getElementById(id);
const SIM_URL = 'https://prerelease-lab.pages.dev/simulator.html';
const DB_KEY = 'tcg-lab-card-db-v0.1';
const VIEW_KEY = 'tcg-lab-deck-viewer-last-v1';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let catalog = [], byId = new Map(), deck = null, resolved = [], expanded = [];
let currentHand = [], previousValid = false, mulligans = 0, handDraws = 0;
let zoomCards = [], zoomAt = 0, artIndex = new Map(), catalogueReady = false;

const imageFallbacks = p => {
  const code = String(p?.set_code || '').toUpperCase(), num = String(p?.card_number || '').padStart(3,'0');
  if (!code || code.startsWith('TMP') || num === '?') return [];
  return ['https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/','https://limitlesstcg.nyc3.digitaloceanspaces.com/tpci/']
    .map(base => base + code + '/' + code + '_' + num + '_R_EN.png');
};
function setStatus(text, isError = false) {
  $('importStatus').textContent = text;
  $('importStatus').className = 'status' + (isError ? ' error' : text ? ' good' : '');
}
function readStored(key) {try {return JSON.parse(localStorage.getItem(key) || 'null')} catch {return null}}
function writeStored() {try {if (deck) localStorage.setItem(VIEW_KEY, JSON.stringify(deck)); else localStorage.removeItem(VIEW_KEY)} catch {}}
function makeTempEntity(r) {
  const pid = r.id + ':printing';
  return {entity_id:r.id,name:r.name,card_type:r.category,stage:r.stage || '',subtypes:[],pokemon_types:r.pokemonType || '',hp:r.hp || '',
    combined_text:r.textEN || '',temp:true,printings:[{printing_id:pid,set_code:r.setCode,card_number:r.number || '?',
    image_url:localArtworkFor(artIndex,pid) || r.image || '',image_fallbacks:[]}]};
}
async function loadCatalog() {
  $('catalogStatus').textContent = 'Loading Standard catalogue and TEMP cards…';
  try {
    const resp = await fetch('./card-db.html', {cache:'no-cache'});
    if (!resp.ok) throw Error('Card DB returned HTTP ' + resp.status);
    const doc = new DOMParser().parseFromString(await resp.text(), 'text/html');
    const json = doc.querySelector('script#catalog[type="application/json"]');
    if (!json) throw Error('Card DB catalogue was not found');
    const standard = JSON.parse(json.textContent);
    if (!Array.isArray(standard.entities)) throw Error('Invalid Card DB catalogue');
    try {
      const artResponse = await fetch('./data/card-art-manifest.json', {cache:'no-cache'});
      if (artResponse.ok) artIndex = indexedArt(await artResponse.json());
    } catch {}
    let shared = null;
    try {shared = await loadCentralTemp()} catch (e) {console.warn('Shared TEMP catalogue unavailable', e)}
    const browser = readStored(DB_KEY) || {};
    const tempDB = shared ? mergeTempStores(browser, shared).view : browser;
    const validSets = new Set((tempDB.tempSets || []).map(s => s.code));
    const temp = (tempDB.tempCards || []).filter(r => r && typeof r.name === 'string' &&
      typeof r.id === 'string' && r.setCode !== 'TMPDELTAREIGN' && validSets.has(r.setCode)).map(makeTempEntity);
    catalog = standard.entities.map(c => ({...c,printings:(c.printings || []).map(p => ({
      ...p, image_url:localArtworkFor(artIndex,p.printing_id) || p.image_url,
      image_fallbacks:imageFallbacks(p)
    }))})).concat(temp);
    byId = new Map(catalog.map(c => [c.entity_id,c]));
    catalogueReady = true;
    $('catalogStatus').textContent = standard.entities.length.toLocaleString() + ' Standard entries · ' + temp.length + ' TEMP entries ready';
    if (deck) render();
    return true;
  } catch (error) {
    catalogueReady = false;
    $('catalogStatus').textContent = 'Catalogue unavailable: ' + error.message + '. TCG Lab JSON imports can still be viewed.';
    return false;
  }
}
function snapshot(c, p) {
  return {entity_id:c.entity_id,name:c.name,card_type:c.card_type,stage:c.stage || '',subtypes:c.subtypes || [],
    pokemon_types:c.pokemon_types || '',hp:c.hp || '',combined_text:c.combined_text || '',basic_energy_type:c.basic_energy_type || null,
    temp:!!c.temp,printings:[p]};
}
function resolveRow(row) {
  const live = byId.get(row.entityId);
  const c = live || row.snapshot;
  if (!c) return {entity_id:row.entityId,name:'Unrecognized card',card_type:'Unknown',stage:'',qty:row.qty,image:'',set_code:'UNKNOWN',card_number:'?',printing_id:row.printingId};
  const p = c.printings?.find(x => x.printing_id === row.printingId) ||
    row.snapshot?.printings?.find(x => x.printing_id === row.printingId) || c.printings?.[0] || {};
  return {...c,entity_id:row.entityId,printing_id:p.printing_id || row.printingId,qty:row.qty,
    set_code:p.set_code || 'CUSTOM',card_number:p.card_number || '?',image:p.image_url || '',
    imageFallbacks:p.image_fallbacks || [],subtypes:c.subtypes || [],snapshotOnly:!live};
}
function restoreLast() {
  const saved = readStored(VIEW_KEY);
  if (!saved || !Array.isArray(saved.rows) || !saved.rows.length || ![40,60].includes(saved.size)) return;
  try {
    if (saved.rows.length > 300 || saved.rows.some(r => typeof r.entityId !== 'string' || typeof r.printingId !== 'string')) return;
    const rows = saved.rows.map(r => ({...r,qty:Number(r.qty)}));
    expandRows(rows);
    deck = {name:String(saved.name || 'Restored deck').slice(0,120),size:saved.size,mode:'practice',rows};
  } catch {}
}
function useDeck(next) {
  if (!next || !Array.isArray(next.rows) || !next.rows.length) throw Error('No cards found');
  expandRows(next.rows);
  deck = {...next,name:String(next.name || 'Imported deck').slice(0,120),mode:'practice'};
  mulligans = 0; previousValid = false; handDraws = 0; currentHand = [];
  writeStored();
  render();
  $('pastePanel').open = false;
  $('handPanel').open = true;
  setStatus('Imported ' + expanded.length + ' cards. Use Shuffle & Draw 7 to test an opening hand.');
}
function importText(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) throw Error('Paste a deck list first');
  if (trimmed.startsWith('{')) return importJSON(JSON.parse(trimmed));
  if (!catalogueReady) throw Error('Card catalogue is still loading. Try again after it finishes.');
  const result = parseViewerDeck(trimmed,catalog);
  const size = result.totalCards===40?40:60;
  useDeck({name:'Imported deck',size,rows:result.rows,provisionalCount:result.provisionalCount,unknownStages:result.unknownStages});
  if(result.provisionalCount){
    setStatus('Imported '+result.totalCards+' cards. '+result.provisionalCount+' printings were not in the local catalogue; artwork is being fetched from the matching set/number. These cards are viewer-only and do not change the Master DB.'+(result.unknownStages.length?' Basic stage uncertain: '+result.unknownStages.join(', '):''));
  }
}
function importJSON(payload) {
  const d = sanitizePayload(payload);
  useDeck({name:d.name,size:d.size,rows:d.rows});
}
function imgMarkup(card, scope, index, qty = null) {
  const source = safeURL(card.image);
  const fallbacks = JSON.stringify((card.imageFallbacks || []).map(safeURL).filter(Boolean));
  const image = source ? '<img loading="lazy" src="' + esc(source) + '" alt="' + esc(card.name) + '" data-fallbacks="' + esc(fallbacks) + '">' :
    '<div class="fallback">Image unavailable</div>';
  return '<article class="card ' + (isBasic(card)?'basic ':'') + (card.temp?'temp':'') + '">' +
    '<button type="button" class="image" data-zoom-scope="' + scope + '" data-zoom-index="' + index + '" aria-label="Zoom ' + esc(card.name) + '">' +
    image + (qty != null ? '<span class="qty">×' + qty + '</span>' : '') + '</button>' +
    '<span class="label">' + esc(card.name) + '</span>' +
    '<span class="meta">' + esc(card.set_code || '') + ' #' + esc(card.card_number || '?') + (card.importFallback?' · External printing':'') + '</span></article>';
}
function renderDeckGrid() {
  $('deckGrid').innerHTML = resolved.length ? resolved.map((c,i) => imgMarkup(c,'deck',i,c.qty)).join('') :
    '<div class="empty" style="grid-column:1/-1">Import a deck to see card artwork and quantities.</div>';
}
function renderHand() {
  $('handGrid').innerHTML = currentHand.length ? currentHand.map((c,i) => imgMarkup(c,'hand',i)).join('') :
    '<div class="empty" style="grid-column:1/-1">Your seven cards will appear here.</div>';
  $('mulliganBadge').textContent = 'Mulligans: ' + mulligans;
  $('handCount').textContent = handDraws ? handDraws + ' draws · each draw reshuffles the full deck' : 'Each draw shuffles the complete deck.';
}
function renderExactStats() {
  if (!expanded.length) {
    $('exactStats').innerHTML = '<div class="empty">Import a deck to see the exact probabilities.</div>';
    return;
  }
  const m = deckMetrics(expanded);
  const fmt = p => p == null || !Number.isFinite(p) ? 'n/a' : (100*p).toFixed(2) + '%';
  const values = [
    ['At least one Basic',m.complete && m.total>=7 ? fmt(1-m.mulliganProbability) : 'n/a','Raw seven-card hand'],
    ['Mulligan probability',fmt(m.mulliganProbability),m.unknown ? 'Some stages are unknown' : 'Raw seven-card hand'],
    ['At least one Supporter',fmt(m.supporterProbability),'Raw seven-card hand'],
    ['At least one Energy',fmt(m.energyProbability),'Raw seven-card hand']
  ];
  $('exactStats').innerHTML = values.map(([label,val,note]) => '<div class="metric"><strong>' + esc(val) +
    '</strong>' + esc(label) + '<br><small>' + esc(note) + '</small></div>').join('');
}
function renderSelectors() {
  // Every distinct printing has its own ID, even when the card names match.
  const options = [...new Map(resolved.map(c => [cardIdentity(c),c])).values()]
    .sort((a,b) => cardLabel(a).localeCompare(cardLabel(b)));
  const ids = new Set(options.map(cardIdentity));
  const oldX=$('cardX').value,oldY=$('cardY').value;
  $('cardX').replaceChildren(...options.map(c => new Option(cardLabel(c),cardIdentity(c))));
  $('cardY').replaceChildren(new Option('None',''),...options.map(c => new Option(cardLabel(c),cardIdentity(c))));
  if(ids.has(oldX))$('cardX').value=oldX;
  if(ids.has(oldY))$('cardY').value=oldY;
}
function render() {
  resolved = deck ? deck.rows.map(resolveRow) : [];
  expanded = expandRows(resolved);
  const count = expanded.length, m=deckMetrics(expanded);
  $('deckTitle').textContent = deck ? deck.name : 'No deck imported';
  $('deckCount').textContent = count + (deck ? ' / ' + deck.size : '') + ' cards';
  $('deckNote').textContent = deck ? (count===deck.size ? 'Complete deck list' : 'Incomplete list — import a full deck to test accurately') + (deck.provisionalCount?' · '+deck.provisionalCount+' printings absent from local Card DB; using external artwork and provisional metadata.':'') : 'Import a deck list to begin.';
  const checks = deck ? deckChecks(resolved,deck.size,'practice') : {errors:[]};
  const badges = deck ? [
    count + ' cards',m.basics + ' Basic Pokémon',resolved.filter(r=>r.card_type==='Pokémon').reduce((n,r)=>n+r.qty,0) + ' Pokémon',
    resolved.filter(r=>r.card_type==='Trainer').reduce((n,r)=>n+r.qty,0) + ' Trainers',
    resolved.filter(r=>r.card_type==='Energy').reduce((n,r)=>n+r.qty,0) + ' Energy'
  ] : [];
  if (deck && resolved.some(r => r.temp)) badges.push('TEMP / provisional');
  if (deck?.provisionalCount) badges.push(deck.provisionalCount+' external printings');
  if (deck && m.unknown) badges.push(m.unknown + ' unknown card stages/types');
  $('deckBadges').innerHTML=badges.map(t=>'<span class="pill">' + esc(t) + '</span>').join('');
  const testable = count >= 7 && (count===40 || count===60);
  $('drawBtn').disabled = !testable;
  $('resetHandBtn').disabled = !currentHand.length;
  $('runStatsBtn').disabled = !testable;
  $('playBtn').disabled = !deck || checks.errors.length > 0;
  if (!deck) $('handStatus').textContent='Draw seven cards from your imported deck.';
  else if (!testable) $('handStatus').textContent='Import a complete 40- or 60-card list to test a proper opening.';
  else if (!currentHand.length) $('handStatus').textContent=m.unknown ? 'Unknown card stages: mulligan detection may be incomplete.' : 'Ready to shuffle and draw seven.';
  renderHand();renderDeckGrid();renderExactStats();renderSelectors();
  $('labResults').textContent = m.unknown ? 'Some cards have missing Pokémon stage/type metadata. Mulligan statistics will be unavailable, but raw draws can still be sampled.' : 'Choose a sample size and run a consistency experiment.';
}
function drawHand() {
  if ($('drawBtn').disabled) return;
  if (previousValid) mulligans = 0; // A valid opening completes the current game.
  currentHand = sampleSeven(expanded);
  handDraws++;
  const meta = deckMetrics(expanded), basicCount = currentHand.filter(isBasic).length;
  if (!meta.complete) {
    previousValid = false;
    $('handStatus').textContent = 'Basic Pokémon detection uncertain: one or more cards lack stage/type metadata.';
    $('handStatus').className = 'handMessage bad';
  } else if (!meta.basics) {
    previousValid = false;
    $('handStatus').textContent = 'No Basic Pokémon exists in this deck. Correct the deck list.';
    $('handStatus').className = 'handMessage bad';
  } else if (!basicCount) {
    mulligans++;
    previousValid = false;
    $('handStatus').textContent = 'No Basic Pokémon — mulligan! Draw again.';
    $('handStatus').className = 'handMessage bad';
  } else {
    previousValid = true;
    $('handStatus').textContent = 'Playable opening: ' + basicCount + ' Basic Pokémon' + (basicCount===1?'':'s') + '.';
    $('handStatus').className = 'handMessage good';
  }
  $('resetHandBtn').disabled = false;
  renderHand();
}
function clearHand() {
  currentHand=[];mulligans=0;previousValid=false;handDraws=0;
  $('handStatus').textContent = 'Ready for a new opening hand.';
  $('handStatus').className='handMessage';
  $('resetHandBtn').disabled=true;renderHand();
}
function runStats() {
  if ($('runStatsBtn').disabled) return;
  try {
    const count = Number($('sampleSize').value),first = $('cardX').value,second = $('cardY').value;
    const r = runOpeningExperiment(expanded,count,first,second);
    const meta = deckMetrics(expanded);
    const pc = v => (v * 100).toFixed(2) + '%';
    const samples = r.accepted ? r.samples.map((x,i) => (i+1) + '. ' + esc(x.cards.join(' · ')) +
      ' (' + x.basics + ' Basics, ' + x.mulligans + ' mulligans)').join('<br>') : 'No accepted hands';
    const set = [
      ['Accepted openings',r.accepted.toLocaleString(),'Independent games'],
      ['Raw X frequency',pc(r.rawFirst/r.raw),'All seven-card draws'],
      [second ? 'Raw X + Y' : 'Raw mulligan rate',second ? pc(r.rawPair/r.raw) :
        r.conditioned ? pc(r.invalid/r.raw) : 'n/a',second ? 'Both selected cards, before mulligans' : 'Before reshuffling'],
      ['Average mulligans',r.conditioned ? (r.mulligans/Math.max(1,r.accepted)).toFixed(3) : 'n/a','Per accepted game']
    ];
    const summary='<div class="metricgrid">' + set.map(([label,value,note]) => '<div class="metric"><strong>' +
      esc(value) + '</strong>' + esc(label) + '<br><small>' + esc(note) + '</small></div>').join('') + '</div>';
    const xLabel = cardLabel(resolved.find(c=>cardIdentity(c)===first)||{name:first});
    const yLabel = second ? cardLabel(resolved.find(c=>cardIdentity(c)===second)||{name:second}) : '';
    const theoretical = first ? 'Theoretical raw ' + xLabel + ': ' +
      pc(anyHit(expanded.filter(c=>cardIdentity(c)===first).length,expanded.length)) +
      (second ? ' · '+xLabel+' + '+yLabel+': ' + pc(pairedHit(expanded,first,second)) : '') : '';
    const starters = Object.entries(r.starterCounts).sort((a,b)=>b[1]-a[1]).slice(0,10)
      .map(([name,n]) => esc(name) + ': ' + pc(n/Math.max(1,r.accepted))).join(' · ');
    $('labResults').innerHTML = summary +
      '<p>' + r.raw.toLocaleString() + ' raw draws from ' + r.accepted.toLocaleString() + ' accepted openings. ' + esc(theoretical) + '</p>' +
      (r.conditioned ? '<p>Games needing ≥1 mulligan: ' + pc(r.gamesWithMulligan/Math.max(1,r.accepted)) + '.</p>' :
        '<p class="warn">Mulligan statistics unavailable: missing Basic metadata or no Basic Pokémon in deck.</p>') +
      (starters ? '<p><strong>Potential starters in accepted hands:</strong> ' + starters + '</p>' : '') +
      '<p><strong>Sample opening hands:</strong></p><p>' + samples + '</p>' +
      '<p>Draw probabilities only; these results do not predict turn-one plays, prizes, or win rates.</p>';
  } catch (error) {
    $('labResults').textContent='Consistency test failed: ' + error.message;
  }
}
function zoomCard(scope,index) {
  zoomCards = scope==='hand' ? currentHand : resolved;
  zoomAt = Number(index);
  if (!Number.isInteger(zoomAt) || zoomAt < 0 || zoomAt >= zoomCards.length) return;
  renderZoom();
  $('zoomDialog').showModal();
}
function renderZoom() {
  const c=zoomCards[zoomAt];
  $('zoomName').textContent=c.name;
  $('zoomImage').src=safeURL(c.image);
  $('zoomImage').dataset.fallbacks=JSON.stringify((c.imageFallbacks||[]).map(safeURL).filter(Boolean));
  $('zoomImage').alt=c.name;
  $('zoomDetails').textContent=(c.set_code||'') + ' #' + (c.card_number||'?') + (isBasic(c)?' · Basic Pokémon':'') +
    (c.temp?' · PROVISIONAL':'') + (c.importFallback?' · EXTERNAL PRINTING':'') + ' · ' + (zoomAt+1) + '/' + zoomCards.length;
  $('zoomPrev').disabled=zoomCards.length<2;
  $('zoomNext').disabled=zoomCards.length<2;
}
function advanceZoom(delta) {if (!zoomCards.length) return;zoomAt=(zoomAt+delta+zoomCards.length)%zoomCards.length;renderZoom()}
document.addEventListener('error',e => {
  if (!(e.target instanceof HTMLImageElement)) return;
  const img=e.target;
  let urls=[];try {urls=JSON.parse(img.dataset.fallbacks||'[]')}catch {}
  const next=urls.shift();img.dataset.fallbacks=JSON.stringify(urls);
  if (next) img.src=next;
},true);
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-zoom-scope]');
  if (b) zoomCard(b.dataset.zoomScope,Number(b.dataset.zoomIndex));
});
$('zoomPrev').onclick=()=>advanceZoom(-1);
$('zoomNext').onclick=()=>advanceZoom(1);
$('zoomClose').onclick=()=>$('zoomDialog').close();
document.addEventListener('keydown',e=>{
  if (!$('zoomDialog').open) return;
  if (e.key==='ArrowLeft') {e.preventDefault();advanceZoom(-1)}
  if (e.key==='ArrowRight'){e.preventDefault();advanceZoom(1)}
});
$('drawBtn').onclick=drawHand;
$('resetHandBtn').onclick=clearHand;
$('runStatsBtn').onclick=runStats;
$('importBtn').onclick=()=>{try {importText($('importText').value)}catch(error){setStatus(error.message,true)}};
$('pasteBtn').onclick=async()=>{
  try {
    if (!navigator.clipboard?.readText) throw Error('Clipboard access unavailable. Paste into the text box with Ctrl+V.');
    const text=await navigator.clipboard.readText();
    if (!text.trim()) throw Error('Clipboard is empty');
    $('importText').value=text;
    setStatus('Clipboard pasted. Click Import deck.');
  } catch(error) {setStatus(error.message + ' You can always use Ctrl+V.',true)}
};
$('clearBtn').onclick=()=>{
  $('importText').value='';deck=null;clearHand();writeStored();render();setStatus('Viewer cleared.');
};
$('loadJson').onclick=()=>$('jsonFile').click();
$('jsonFile').onchange=async e=>{
  const f=e.target.files?.[0];e.target.value='';if (!f) return;
  try {
    if (f.size > 10000000) throw Error('File is too large');
    importJSON(JSON.parse(await f.text()));
  } catch(error) {setStatus(error.message,true)}
};
$('playBtn').onclick=()=>{
  if (!deck) return;
  const check = deckChecks(resolved,deck.size,'practice');
  if (check.errors.length) {setStatus(check.errors.join('\n'),true);return}
  const payload = makePayload({...deck,id:'deck-viewer'},resolved,location.href,$('simMode').value);
  const url = payloadURL(payload,SIM_URL);
  window.open(url,'_blank','noopener');
};
restoreLast();render();loadCatalog();
