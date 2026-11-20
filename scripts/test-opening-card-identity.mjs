import assert from 'node:assert/strict';
import {cardIdentity,cardLabel,expandRows,pairedHit,noHit,twoCopies,runOpeningExperiment} from '../public/opening-hand-core.mjs';

// Two different Pokémon cards share the printed name Bouffalant.
// X+Y must mean one of EACH ID, not any two cards named Bouffalant.
const a={id:'BOUFF-A',printing_id:'ASC-123',name:'Bouffalant',set_code:'ASC',card_number:'123',card_type:'Pokémon',stage:'Basic',qty:2};
const b={id:'BOUFF-B',printing_id:'TEF-051',name:'Bouffalant',set_code:'TEF',card_number:'051',card_type:'Pokémon',stage:'Basic',qty:3};
const e={id:'ENERGY',name:'Basic Grass Energy',card_type:'Energy',qty:55};
const deck=expandRows([a,b,e]);
assert.equal(deck.length,60);
assert.equal(a.name,b.name);
assert.notEqual(cardIdentity(a),cardIdentity(b));
assert.notEqual(cardLabel(a),cardLabel(b));
assert.match(cardLabel(a),/ASC.*123/);
assert.match(cardLabel(b),/TEF.*051/);
const expected=1-noHit(2,60)-noHit(3,60)+noHit(5,60);
assert.ok(Math.abs(pairedHit(deck,'ASC-123','TEF-051')-expected)<1e-12);
assert.ok(Math.abs(pairedHit(deck,'ASC-123','ASC-123')-twoCopies(2,60))<1e-12);
assert.ok(pairedHit(deck,'ASC-123','ASC-123') < pairedHit(deck,'ASC-123','TEF-051'));
const experiment=runOpeningExperiment(deck,10000,'ASC-123','TEF-051');
assert.equal(experiment.accepted,10000);
assert.ok(Math.abs(experiment.rawPair/experiment.raw-expected)<0.025);
assert.ok(experiment.samples[0].cards.some(s=>s.includes('Bouffalant')||s.includes('Energy')));
assert.ok(Object.keys(experiment.starterCounts).every(s=>!s || s.includes('Bouffalant')));
console.log('Same-name distinct-card X+Y regression passed.');
