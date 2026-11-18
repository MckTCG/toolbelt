#!/usr/bin/env node
/** Verify real Flowing Fists TEMP entries in Card Explorer and Deck Builder's
 * existing Manual Simulator transfer format. No simulator code modification. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript',
 '.json':'application/json','.css':'text/css','.jpg':'image/jpeg','.png':'image/png'};
const server=http.createServer((req,res)=>{
 const target=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
 if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return}
 fs.readFile(target,(err,data)=>{
  if(err){res.writeHead(404).end();return}
  res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream'}).end(data);
 });
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1250,height:870},acceptDownloads:true});
const errors=[];
try{
 const explorer=await context.newPage();explorer.on('pageerror',e=>errors.push('explorer: '+e.message));
 await explorer.goto(url+'/card-db.html',{waitUntil:'domcontentloaded',timeout:45000});
 await explorer.waitForFunction(()=>[...document.querySelectorAll('#setFilter option')].some(x=>x.value==='TMPFLO'),{timeout:35000});
 await explorer.locator('#setFilter').selectOption('TMPFLO');
 assert((await explorer.locator('#resultCount').textContent()).includes('18'),'Card Explorer missing 18 TEMP printings');
 assert((await explorer.locator('#cardResults').textContent()).includes('Regigigas'));
 await explorer.close();

 const builder=await context.newPage();builder.on('pageerror',e=>errors.push('builder: '+e.message));
 await builder.goto(url+'/deck-builder.html',{waitUntil:'domcontentloaded',timeout:45000});
 await builder.waitForFunction(()=>[...document.querySelectorAll('#setFilter option')].some(x=>x.value==='TMPFLO'),{timeout:35000});
 await builder.locator('#setFilter').selectOption('TMPFLO');
 assert((await builder.locator('#resultCount').textContent()).includes('18'),'Deck Builder missing 18 TEMP printings');

 // Same-name Mega Lucario printings must survive separately in the deck.
 for(const num of ['097','111','113']){
  await builder.locator('#search').fill(num);
  await builder.waitForFunction(()=>document.querySelectorAll('#cardResults [data-add]').length===1,{timeout:10000});
  await builder.locator('#cardResults [data-add]').first().click();
 }
 assert.equal(await builder.locator('#deckList [data-print-row]').count(),3);
 const raw=await builder.evaluate(()=>JSON.parse(localStorage.getItem('tcg-lab-deck-builder-draft-v1')));
 assert.equal(raw.rows.length,3);
 assert.equal(new Set(raw.rows.map(x=>x.printingId)).size,3);
 const ready=builder.waitForEvent('download',{timeout:10000});
 await builder.locator('#exportJSON').click();
 const download=await ready;
 const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
 assert.equal(exported.format,'tcg-lab-deck-v1');
 assert.equal(exported.cards.length,3);
 assert(exported.cards.every(c=>c.temp===true&&c.image?.includes('/assets/flowing-fists-leaks/cards/')));
 assert(exported.cards.every(c=>c.textEN===''), 'No unverified game mechanics should be invented');
 assert.deepEqual(exported.cards.map(c=>String(Number(c.number))).sort(),['97','111','113'].sort());
 assert.deepEqual(errors,[]);
 console.log('PASS Flowing Fists Explorer+Deck Builder: 18 TEMP printings, two same-name Lucario artworks, valid manual simulator payload with exact provisional images.');
}finally{
 await browser.close();await new Promise(resolve=>server.close(resolve))
}
