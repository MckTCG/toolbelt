#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404).end();return}
    res.setHeader('Content-Type',/\.(html)$/.test(file)?'text/html':/\.(js|mjs)$/.test(file)?'text/javascript':/\.(json)$/.test(file)?'application/json':'application/octet-stream');
    res.writeHead(200).end(data);
  });
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const imageURL='https://example.org/reveal/only-jp.png';
const sourceURL='https://www.pokebeach.com/2026/11/test-jp-only';
const jpOnly={
  source_url:sourceURL,discovery_id:'a'.repeat(22),source_kind:'pokebeach-card-spoiler',
  name:'ワンパチ',set_name:'Example Japanese Set',card_number:'21',category:'Pokémon',
  stage:'Basic',pokemon_types:'Lightning',hp:'70',language:'jp',image_url:imageURL,
  review_note:'Japanese card without translated text; independent source not yet verified.',
  status:'provisional',source_verified:false,artwork_verified:false
};
const context=await chromium.launch({headless:true});
const page=await context.newPage({viewport:{width:1260,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',d=>d.accept());
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="460" height="640"><rect width="460" height="640" fill="#aaccdd"/><text x="40" y="80" font-size="40">JP only</text></svg>';
await page.route('https://example.org/**',route=>route.fulfill({status:200,contentType:'image/svg+xml',body:svg}));
try{
 await page.goto(base+'/card-intake.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#catalogStatus').textContent.includes('gameplay records'),{timeout:35000});
 await page.evaluate(card=>{
   localStorage.setItem('tcg-lab-card-intake-v1',JSON.stringify({schema:'tcg-lab-card-intake-v1',cards:[card]}));
 },jpOnly);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#catalogStatus').textContent.includes('gameplay records'),{timeout:35000});
 assert.equal(await page.locator('.candidate').count(),1);
 await page.locator('.candidate').first().click();
 assert.equal(await page.locator('textarea[name=combined_text]').inputValue(),'');
 assert.equal(await page.locator('input[name=set_code]').inputValue(),'');
 assert.equal(await page.locator('input[name=release_date]').inputValue(),'');
 assert((await page.locator('#diagnostic').textContent()).includes('Publication blockers'));
 await page.locator('#acceptTemp').click();
 await page.waitForFunction(()=>document.querySelector('#tempStatus').textContent.includes('TEMP saved:'),{timeout:10000});
 const store=JSON.parse(await page.evaluate(()=>localStorage.getItem('tcg-lab-card-db-v0.1')));
 assert(store.tags&&store.rejected&&store.tempSets.length===1);
 assert.equal(store.tempCards.length,1);
 const row=store.tempCards[0];
 assert.equal(row.name,'ワンパチ');
 assert.equal(row.textEN,'');
 assert.equal(row.translationStatus,'jp-only');
 assert.equal(row.status,'provisional');
 assert.equal(row.image,imageURL);
 assert.equal(row.category,'Pokémon');
 assert((await page.locator('#tempStatus').textContent()).includes('Manual Simulator ready'));
 assert((await page.locator('#tempStatus').textContent()).includes('Proxy image ready'));
 assert(await page.locator('#addTempDeck').isEnabled());
 assert(await page.locator('#openTempProxy').isEnabled());
 const intake=JSON.parse(await page.evaluate(()=>localStorage.getItem('tcg-lab-card-intake-v1')));
 assert.equal(intake.cards[0].temp_entity_id,row.id,'Intake review record not linked to TEMP card');
 assert.equal(intake.cards[0].status,'provisional');
 assert(!(intake.cards[0].source_verified));
 await page.locator('#approveCard').click();
 assert((await page.locator('#feedback').textContent()).includes('Cannot approve'),'Unverified JP card bypassed Master approval gate');
 const simHash='#add='+encodeURIComponent(JSON.stringify({entityId:row.id,printingId:row.id+':printing'}));
 const builder=await page.context().newPage(); // same-origin TEMP storage must be shared
 await builder.goto(base+'/deck-builder.html'+simHash,{waitUntil:'domcontentloaded'});
 await builder.waitForFunction(()=>{
   const raw=localStorage.getItem('tcg-lab-deck-builder-draft-v1');
   return raw&&raw.includes('temp:reveal:');
 },{timeout:35000});
 const draft=JSON.parse(await builder.evaluate(()=>localStorage.getItem('tcg-lab-deck-builder-draft-v1')));
 assert.equal(draft.deck.rows[0].entityId,row.id);
 assert.equal(draft.deck.rows[0].snapshot.name,'ワンパチ');
 assert.equal(draft.deck.rows[0].snapshot.combined_text,'');
 assert.equal(draft.deck.rows[0].snapshot.printings[0].image_url,imageURL);
 await builder.close();
 const before=await page.evaluate(()=>localStorage.getItem('tcg-lab-card-db-v0.1'));
 const updated={...jpOnly,combined_text:'Unofficial translation: Draw one card.',translation_status:'unofficial'};
 await page.route('https://raw.githubusercontent.com/MckTCG/toolbelt/automation/card-discovery-feed/**',
   route=>route.fulfill({status:200,contentType:'application/json',
     headers:{'access-control-allow-origin':'*'},
     body:JSON.stringify({schema:'tcg-lab-card-discovery-feed-v1',candidates:[updated],
       generated_at:'2026-11-10T12:00:00Z',errors:[]})}));
 await page.locator('#loadDiscoveries').click();
 await page.waitForFunction(()=>document.querySelector('#discoveryStatus').textContent.includes('TEMP record(s) have changes'),{timeout:15000});
 assert.equal(await page.evaluate(()=>localStorage.getItem('tcg-lab-card-db-v0.1')),before,'Source recheck silently changed TEMP card');
 assert(await page.locator('#loadTempSuggestion').isVisible());
 await page.locator('#loadTempSuggestion').click();
 assert((await page.locator('textarea[name=combined_text]').inputValue()).includes('Unofficial translation'));
 assert.equal(await page.evaluate(()=>localStorage.getItem('tcg-lab-card-db-v0.1')),before,'Suggested text was applied without acceptance');
 await page.locator('#acceptTemp').click();
 const store2=JSON.parse(await page.evaluate(()=>localStorage.getItem('tcg-lab-card-db-v0.1')));
 assert.equal(store2.tempCards.length,1);
 assert.equal(store2.tempCards[0].id,row.id);
 assert.equal(store2.tempCards[0].textEN,updated.combined_text);
 assert.equal(store2.tempCards[0].translationHistory.length,1);
 assert.equal(store2.tempCards[0].revisionHistory.length,1);
 assert.equal(store2.tempCards[0].translationStatus,'unofficial');
 assert.equal((await page.locator('#tempStatus').textContent()).includes('Translation unofficial'),true);
 assert.deepEqual(errors,[],'Browser errors: '+errors.join('; '));
 console.log('PASS JP TEMP browser: no-English acceptance, shared storage, instant Deck Builder availability, Master approval gate, update preview before explicit revision, no duplicate IDs.');
}finally{await context.close();await new Promise(resolve=>server.close(resolve))}
