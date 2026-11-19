import assert from 'node:assert/strict';
import {parseViewerDeck} from '../public/deck-viewer-import.mjs';
import {expandRows,deckMetrics} from '../public/opening-hand-core.mjs';

// Real deck #31282 from Limitless, Basic Box (Buenos Aires).
const basicBox = [
'Pokémon (20)',
'4 Mega Kangaskhan ex MEG 104',
'3 Meowth ex POR 62',
'2 Latias ex SSP 76',
'2 Teal Mask Ogerpon ex TWM 25',
"2 Lillie's Clefairy ex JTG 56",
'1 Iron Leaves ex TEF 25',
'1 Koraidon ex ASC 121',
'1 Bloodmoon Ursaluna ex TWM 141',
'1 Wellspring Mask Ogerpon ex TWM 64',
'1 Chien-Pao SSP 56',
'1 Paldean Tauros SSP 18',
'1 Fezandipiti ex ASC 142',
'Trainer (26)',
'4 Crispin SCR 133',
"3 Boss's Orders MEG 114",
'2 Cyrano SSP 170',
'1 Judge POR 76',
"1 Ciphermaniac's Codebreaking TEF 145",
'4 Ultra Ball MEG 131',
'4 Energy Switch MEG 115',
'2 Night Stretcher ASC 196',
'1 Special Red Card CRI 82',
"1 Hero's Cape TEF 152",
'3 Area Zero Underdepths SCR 131',
'Energy (14)',
'7 Grass Energy MEE 9',
'3 Psychic Energy MEE 13',
'2 Fighting Energy MEE 14',
'1 Water Energy MEE 11',
'1 Fire Energy MEE 10',
'Total Cards: 60'].join('\n');
const r=parseViewerDeck(basicBox,[]);
assert.equal(r.totalCards,60);
assert.equal(r.rows.length,28);
const expanded=expandRows(r.rows.map(x=>({...x.snapshot,qty:x.qty})));
assert.equal(expanded.length,60);
assert.equal(expanded.filter(c=>c.card_type==='Pokémon').length,20);
assert.equal(expanded.filter(c=>c.card_type==='Trainer').length,26);
assert.equal(expanded.filter(c=>c.card_type==='Energy').length,14);
assert.equal(deckMetrics(expanded).basics,20);
assert.equal(deckMetrics(expanded).complete,true);
assert.equal(expanded.filter(c=>c.subtypes?.includes('Supporter')).length,11);
assert.equal(r.unknownStages.length,0);
assert.equal(r.rows[1].snapshot.printings[0].set_code,'POR');
assert.equal(r.rows[1].snapshot.printings[0].card_number,'62');
assert.match(r.rows[1].snapshot.printings[0].image_url,/POR_062_R_EN\.png$/);

// Exact Card DB metadata must take precedence over fallback.
const official={
 entity_id:'core:meowth-ex',name:'Meowth ex',card_type:'Pokémon',stage:'Basic',
 printings:[{printing_id:'printing:por62',set_code:'POR',card_number:'62',image_url:'https://example.org/card.png'}]
};
const single=parseViewerDeck('Pokémon: 3\n3 Meowth ex POR 62',[official]);
assert.equal(single.rows[0].entityId,official.entity_id);
assert.equal(single.provisionalCount,0);

const alternate=parseViewerDeck('Pokémon: 1\n1 New Evolution Pokémon XYZ 77',[]);
assert.equal(alternate.unknownStages.length,1,'Unknown Pokémon stage must not become Basic');
assert.equal(alternate.rows[0].snapshot.card_type,'Pokémon');
assert.throws(()=>parseViewerDeck('https://limitlesstcg.com/decks/list/31282',[]),/Copy to Clipboard/);
assert.throws(()=>parseViewerDeck('4 Missing Set Name ??????',[]),/Could not import/);
console.log('Deck Viewer import regression tests passed: Basic Box 60/60, 20 Basics, 26 Trainers, 14 Energy.');
