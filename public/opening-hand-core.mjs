// Shared, side-effect-free opening-hand math for 40/60-card practice decks.
// Keep all draws independent; never mutate the deck being tested.
export const isBasic = card => card.card_type === 'Pokémon' && /^basic$/i.test(String(card.stage || '').split(',')[0].trim());
export const missingStage = card => (card.card_type === 'Pokémon' && !String(card.stage || '').trim()) || card.card_type === 'Unknown';
export function expandRows(rows) {
  if (!Array.isArray(rows)) throw Error('Invalid deck rows');
  const total = rows.reduce((n, r) => n + Number(r.qty || 0), 0);
  if (!Number.isSafeInteger(total) || total < 0 || total > 120) throw Error('Deck must contain 0–120 cards');
  return rows.flatMap(r => {
    if (!Number.isInteger(r.qty) || r.qty < 1 || r.qty > 100) throw Error('Invalid card quantity');
    return Array.from({length:r.qty}, () => r);
  });
}
export function sampleSeven(cards, rng = Math.random) {
  if (cards.length < 7) throw Error('At least seven cards are needed');
  const pool = cards.slice();
  for (let i = 0; i < 7; i++) {
    const j = i + Math.min(pool.length - i - 1, Math.floor(rng() * (pool.length - i)));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 7);
}
// Exactly P(0 copies) in a sample without replacement.
export function noHit(count, total, draw = 7) {
  if (!Number.isInteger(total) || total < 0 || !Number.isInteger(count) || count < 0 || count > total || draw < 0 || draw > total) return NaN;
  if (draw === 0) return 1;
  if (total - count < draw) return 0;
  let p = 1;
  for (let i = 0; i < draw; i++) p *= (total - count - i) / (total - i);
  return p;
}
export function anyHit(count, total, draw = 7) { return 1 - noHit(count, total, draw); }
export function twoCopies(count, total, draw = 7) {
  const p0 = noHit(count, total, draw);
  if (!Number.isFinite(p0)) return NaN;
  if (!count) return 0;
  const p1 = draw * (count / total) * noHit(count - 1, total - 1, draw - 1);
  return Math.max(0, Math.min(1, 1 - p0 - p1));
}
// IDs refer to distinct cards/printings; names are not unique (e.g., Bouffalant).
export function cardIdentity(c) { return String(c?.printing_id || c?.id || c?.entity_id || c?.name || ''); }
export function cardLabel(c) {
  const name=String(c?.name || 'Unknown card');
  const set=String(c?.set_code || '').trim();
  const num=String(c?.card_number || c?.cardNumber || '').trim();
  return num ? name+' ('+(set ? set+' ' : '')+'#'+num+')' : name+(c?.id?' ('+c.id+')':'');
}
export function pairedHit(cards, first, second, keyOf = cardIdentity) {
  const total = cards.length;
  if (!first || !second || total < 7) return NaN;
  const a = cards.filter(c => keyOf(c) === first).length;
  const b = cards.filter(c => keyOf(c) === second).length;
  if (first === second) return twoCopies(a, total);
  return Math.max(0, Math.min(1, 1 - noHit(a, total) - noHit(b, total) + noHit(a + b, total)));
}
export function deckMetrics(cards) {
  const total = cards.length, basics = cards.filter(isBasic).length;
  const unknown = cards.filter(missingStage).length, complete = unknown === 0;
  return {
    total, basics, unknown, complete,
    mulliganProbability: complete && total >= 7 ? noHit(basics, total) : null,
    supporterProbability: total >= 7 ? anyHit(cards.filter(c => c.card_type === 'Trainer' && /supporter/i.test(String(c.subtypes || c.stage || ''))).length, total) : null,
    energyProbability: total >= 7 ? anyHit(cards.filter(c => c.card_type === 'Energy').length, total) : null
  };
}
export function runOpeningExperiment(cards, trials = 1000, first = '', second = '', rng = Math.random, keyOf = cardIdentity) {
  if (!Number.isInteger(trials) || trials < 1 || trials > 10000) throw Error('Choose 1–10,000 simulated games');
  if (cards.length < 7) throw Error('Need at least seven cards');
  const meta = deckMetrics(cards);
  const conditional = meta.complete && meta.basics > 0;
  const result = {
    trials, total:cards.length, basics:meta.basics, metadataComplete:meta.complete, conditioned:conditional,
    raw:0, invalid:0, accepted:0, gamesWithMulligan:0, mulligans:0,
    first, second, rawFirst:0, rawPair:0, acceptedFirst:0, acceptedPair:0,
    starterCounts:{}, samples:[]
  };
  for (let i = 0; i < trials; i++) {
    let hand = [], mulligans = 0, isValid = false;
    for (let attempt = 0; attempt < 300; attempt++) {
      hand = sampleSeven(cards, rng);
      const basics = hand.filter(isBasic).length;
      const firstCount = first ? hand.filter(c => keyOf(c) === first).length : 0;
      const secondCount = second ? hand.filter(c => keyOf(c) === second).length : 0;
      const pair = second ? first === second ? firstCount >= 2 : firstCount > 0 && secondCount > 0 : false;
      result.raw++;
      if (firstCount > 0) result.rawFirst++;
      if (pair) result.rawPair++;
      isValid = basics > 0;
      if (conditional && !isValid) {
        result.invalid++; mulligans++;
        continue;
      }
      break;
    }
    if (conditional && !isValid) continue;
    result.accepted++;
    result.mulligans += mulligans;
    if (mulligans) result.gamesWithMulligan++;
    const firstCount = first ? hand.filter(c => keyOf(c) === first).length : 0;
    const secondCount = second ? hand.filter(c => keyOf(c) === second).length : 0;
    if (firstCount) result.acceptedFirst++;
    if (second && (first === second ? firstCount >= 2 : firstCount > 0 && secondCount > 0)) result.acceptedPair++;
    for (const label of new Set(hand.filter(isBasic).map(cardLabel)))
      result.starterCounts[label] = (result.starterCounts[label] || 0) + 1;
    if (result.samples.length < 8) result.samples.push({cards:hand.map(cardLabel), basics:hand.filter(isBasic).length, mulligans});
  }
  return result;
}
