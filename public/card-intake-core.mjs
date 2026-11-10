// TCG Lab Card Intake v1: pure browser/Node logic. No database writes or network requests.
export const INTAKE_SCHEMA = 'tcg-lab-card-intake-v1';
export const MAX_INTAKE_CARDS = 500;
const CATEGORIES = ['Pokémon', 'Trainer', 'Energy'];
const STATES = ['discovered', 'provisional', 'ready', 'approved', 'rejected'];
const str = (v, n=10000) => String(v ?? '').trim().slice(0,n);
const comparable = v => str(v).normalize('NFKC').replace(/[’‘]/g,"'").replace(/\s+/g,' ').toLowerCase();
export const keyFor = c => [comparable(c.set_code).toUpperCase(), comparable(c.card_number).replace(/^0+(?=\d)/,'')].join('#');
export function safeHTTPS(value) {
  if (!value) return '';
  try { const u = new URL(String(value)); return u.protocol==='https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
export function parseCardURL(value) {
  const source_url = safeHTTPS(value);
  if (!source_url) throw Error('Use a valid HTTPS source URL.');
  const u = new URL(source_url);
  const m = u.hostname==='limitlesstcg.com' ? u.pathname.match(/^\/cards\/(en|jp)\/([A-Za-z0-9]+)\/(\d+)\/?$/) : null;
  return {source_url,language:m?.[1]||'unknown',set_code:m?.[2]?.toUpperCase()||'',card_number:m?.[3]||'',source_kind:m?'limitless-card':'article-or-other'};
}
function list(value, max=12) {
  if (!Array.isArray(value)) return [];
  return value.slice(0,max).map(x => typeof x==='string'?str(x,500):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).slice(0,12).map(([k,v])=>[k,Array.isArray(v)?v.map(y=>str(y,80)).slice(0,6):str(v,1500)])):null).filter(x=>x!==null);
}
export function normalizeCandidate(input={}) {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw Error('Candidate must be an object.');
  const source_url=safeHTTPS(input.source_url||input.sourceUrl), image_url=safeHTTPS(input.image_url||input.imageUrl);
  const hint=source_url?parseCardURL(source_url):{};
  const status=STATES.includes(input.status)?input.status:'discovered';
  const category=str(input.category||input.card_type,25);
  const record={
    source_url,
    source_kind: str(input.source_kind||hint.source_kind,40),
    language: str(input.language||hint.language||'unknown',12).toLowerCase(),
    set_code: str(input.set_code||input.setCode||hint.set_code,12).toUpperCase(),
    set_name: str(input.set_name||input.setName,140),
    card_number: str(input.card_number||input.cardNumber||hint.card_number,25).replace(/^0+(?=\d)/,''),
    name: str(input.name,140),
    category: CATEGORIES.includes(category)?category:'',
    stage: str(input.stage,100),
    pokemon_types: str(input.pokemon_types||input.pokemonType,90),
    hp: str(input.hp,8),
    evolves_from: str(input.evolves_from||input.evolvesFrom,130),
    ability_names: str(input.ability_names,1000),
    ability_effects: str(input.ability_effects,6000),
    attack_names: str(input.attack_names,1000),
    attack_costs: str(input.attack_costs,1000),
    attack_damage: str(input.attack_damage,1000),
    attack_effects: str(input.attack_effects,6000),
    rules_text: str(input.rules_text,6000),
    combined_text: str(input.combined_text||input.textEN,10000),
    weakness: str(input.weakness,80),
    resistance: str(input.resistance,80),
    retreat_cost: str(input.retreat_cost||input.retreatCost,5),
    rarity: str(input.rarity,80),
    regulation_mark: str(input.regulation_mark||input.regulation,4).toUpperCase(),
    release_date: str(input.release_date,14),
    image_url,
    existing_entity_id: str(input.existing_entity_id||input.entityId,90),
    reviewed_distinct_gameplay: input.reviewed_distinct_gameplay===true,
    source_verified: input.source_verified===true,
    artwork_verified: input.artwork_verified===true,
    review_note: str(input.review_note||input.notes,2000),
    status,
    abilities:list(input.abilities),
    attacks:list(input.attacks),
    rules:list(input.rules,30),
    discovered_at:str(input.discovered_at||input.discoveredAt,35)||new Date().toISOString()
  };
  if(record.source_url && hint.source_kind==='limitless-card') {
    if(record.set_code && record.set_code!==hint.set_code) throw Error('Set code differs from source URL.');
    if(record.card_number && Number(record.card_number)!==Number(hint.card_number)) throw Error('Card number differs from source URL.');
  }
  return record;
}
export function mechanicsSignature(c) {
  // Strict mechanical identity, with structured attack/Ability arrays used only
  // when legacy summary columns were not supplied. Never infer errata equivalence.
  const ab=Array.isArray(c.abilities)?c.abilities:[],at=Array.isArray(c.attacks)?c.attacks:[],rules=Array.isArray(c.rules)?c.rules:[];
  const summary=(value,items,transform)=>comparable(value || items.map(transform).join(' | '));
  return JSON.stringify([
    comparable(c.name),comparable(c.category||c.card_type),comparable(c.stage),
    comparable(c.pokemon_types),comparable(c.hp),comparable(c.evolves_from),
    comparable(c.combined_text),/^(none|n\/a)$/i.test(str(c.weakness))?'':comparable(c.weakness),/^(none|n\/a)$/i.test(str(c.resistance))?'':comparable(c.resistance),
    comparable(c.retreat_cost),
    summary(c.ability_names,ab,a=>a.name),
    summary(c.ability_effects,ab,a=>a.text),
    summary(c.attack_names,at,a=>a.name),
    summary(c.attack_costs,at,a=>Array.isArray(a.cost)?a.cost.join(' '):''),
    summary(c.attack_damage,at,a=>a.damage),
    summary(c.attack_effects,at,a=>a.text),
    comparable(c.rules_text||rules.join('\n'))
  ]);
}
function partialSimilarity(a,b) {
  return comparable(a.name)===comparable(b.name) &&
    comparable(a.category||a.card_type)===comparable(b.category||b.card_type) &&
    comparable(a.combined_text)===comparable(b.combined_text) &&
    !!comparable(a.combined_text);
}
export function classifyCandidate(c, catalog) {
  const entities=catalog?.entities||[];
  if(!Array.isArray(entities)) throw Error('Invalid catalogue.');
  const samePrinting=entities.flatMap(e=>(e.printings||[]).filter(p=>keyFor(p)===keyFor(c) || (p.set_code===c.set_code && String(Number(p.card_number))===String(Number(c.card_number)))).map(p=>({entity:e,printing:p})));
  // A missing set or number must not match others with missing identifiers.
  if(c.set_code && c.card_number && samePrinting.length)
    return {kind:'duplicate-printing',entity_id:samePrinting[0].entity.entity_id,printing_id:samePrinting[0].printing.printing_id};
  const sameName=entities.filter(e=>comparable(e.name)===comparable(c.name) && comparable(e.card_type)===comparable(c.category));
  if(!c.name || !c.category) return {kind:'incomplete',reason:'Name and category required.'};
  const identical=sameName.filter(e=>mechanicsSignature(e)===mechanicsSignature(c));
  if(identical.length===1)return {kind:'new-printing',entity_id:identical[0].entity_id};
  if(identical.length>1)return {kind:'needs-review',reason:'Multiple exact gameplay identities.'};
  if(sameName.length) {
    // Even a close text match cannot establish legality or functional errata equivalence.
    return {kind:'needs-review',reason: sameName.some(e=>partialSimilarity(c,e))?'Matching rules text but different gameplay metadata.':'Existing card name with different or incomplete gameplay text.',similar_entity_ids:sameName.slice(0,8).map(e=>e.entity_id)};
  }
  return {kind:'new-gameplay'};
}
export function completeness(c, match) {
  const problems=[];
  if(!c.source_url)problems.push('HTTPS source URL');
  if(c.language!=='en')problems.push('Verified English language');
  if(!c.set_code||!c.card_number||!c.set_name)problems.push('Set code, set name and card number');
  if(!c.name||!c.category)problems.push('Name and category');
  if(!c.image_url||!c.artwork_verified)problems.push('Reviewed exact-printing artwork URL');
  if(!c.source_verified)problems.push('Source/text explicitly reviewed');
  if(!c.regulation_mark)problems.push('Regulation mark');
  if(!c.release_date||!/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(c.release_date))problems.push('Release date');
  if(match.kind==='duplicate-printing')problems.push('Printing already present');
  if(match.kind==='needs-review' && !c.existing_entity_id && !c.reviewed_distinct_gameplay)problems.push('Explicit gameplay identity decision');
  if(match.kind==='incomplete')problems.push('Gameplay identity fields');
  if(match.kind!=='new-printing' && !c.existing_entity_id) {
    if(!c.combined_text)problems.push('Full verified functional text');
    if(c.category==='Pokémon' && (!c.stage||!c.hp||!c.pokemon_types||!c.retreat_cost))problems.push('Complete Pokémon gameplay attributes');
    if(c.category==='Pokémon' && !c.attack_names && !c.ability_names && !c.attacks.length && !c.abilities.length)problems.push('Pokémon Abilities or attacks');
    if(c.category==='Trainer' && !c.stage)problems.push('Trainer subtype');
  }
  return problems;
}
export function importBatch(payload) {
  if(Array.isArray(payload))payload={schema:INTAKE_SCHEMA,cards:payload};
  if(!payload||payload.schema!==INTAKE_SCHEMA||!Array.isArray(payload.cards)||payload.cards.length>MAX_INTAKE_CARDS)throw Error('Expected a TCG Lab intake batch with up to 500 cards.');
  return payload.cards.map(normalizeCandidate);
}
export function exportBatch(cards) {
  if(!Array.isArray(cards)||cards.length>MAX_INTAKE_CARDS)throw Error('Invalid intake size.');
  return {schema:INTAKE_SCHEMA,exported_at:new Date().toISOString(),cards:cards.map(normalizeCandidate)};
}
export function readCSV(src) {
  const text=String(src).replace(/^\uFEFF/,'');let rows=[],row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){const ch=text[i];
    if(ch==='"'&&quoted&&text[i+1]==='"'){cell+='"';i++}
    else if(ch==='"')quoted=!quoted;
    else if(ch===','&&!quoted){row.push(cell);cell=''}
    else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell=''}
    else cell+=ch;
  }
  if(quoted)throw Error('Unclosed CSV quote.');
  row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
  if(!rows.length)return [];
  const header=rows.shift().map(x=>x.trim().toLowerCase().replace(/[\s-]/g,'_'));
  if(!header.includes('name')&&!header.includes('source_url'))throw Error('CSV requires name or source_url column.');
  if(rows.length>MAX_INTAKE_CARDS)throw Error('Too many CSV rows.');
  return rows.map((r,i)=>{if(r.length!==header.length)throw Error('CSV column count mismatch on row '+(i+2));return normalizeCandidate(Object.fromEntries(header.map((h,j)=>[h,r[j]])))});
}
