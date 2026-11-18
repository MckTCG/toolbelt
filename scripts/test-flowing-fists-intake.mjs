#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {importBatch} from '../public/card-intake-core.mjs';

const root=path.resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const raw=JSON.parse(fs.readFileSync(path.join(root,'data/flowing-fists-leak-intake-20261118.json'),'utf8'));
const cards=importBatch(raw);
assert.equal(cards.length,8);
assert.equal(new Set(cards.map(x=>x.discovery_id)).size,8);
assert.equal(new Set(cards.map(x=>x.name)).size,8);
assert(cards.every(x=>x.set_code==='FLO'&&x.set_name==='Flowing Fists'&&x.status==='provisional'));
assert(cards.every(x=>x.artwork_verified===false&&x.source_verified===false));
assert.equal(cards.filter(x=>x.image_url).length,4);
assert.equal(cards.filter(x=>x.temp_entity_id).length,4);
assert(cards.filter(x=>x.image_url).every(x=>x.image_url.startsWith('https://mute-dust-0d50.forcoin99.workers.dev/assets/flowing-fists-leaks/cards/')));
assert.deepEqual(cards.filter(x=>x.card_number).map(x=>x.card_number).sort(),['111','112','82','83']);
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!p.startsWith(root+path.sep)){res.writeHead(403).end();return}
 fs.readFile(p,(err,data)=>{
  if(err){res.writeHead(404).end();return}
  res.setHeader('Content-Type',p.endsWith('.html')?'text/html':p.endsWith('.json')?'application/json':p.endsWith('.mjs')?'text/javascript':'application/octet-stream');
  res.writeHead(200).end(data);
 });
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/card-intake.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#catalogStatus')?.textContent.includes('gameplay records'),{timeout:35000});
 await page.locator('#loadFlowingFists').click();
 await page.waitForFunction(()=>document.querySelectorAll('.candidate').length===8,{timeout:15000});
 assert.equal(await page.locator('.candidate-bulk-check').count(),8);
 const storage=JSON.parse(await page.evaluate(()=>localStorage.getItem('tcg-lab-card-intake-v1')));
 assert.equal(storage.cards.length,8);
 assert.equal(storage.cards.filter(x=>x.temp_entity_id).length,4);
assert.equal(await page.locator('#centralTempStatus').textContent().then(x=>x.includes('4 shared cards')),true);
 await page.locator('#loadFlowingFists').click();
 assert.equal(await page.locator('.candidate').count(),8,'Reload duplicated cards');
 await page.locator('#bulkSelectVisible').click();
 assert.equal(await page.locator('.candidate-bulk-check:checked').count(),8);
 assert.deepEqual(errors,[]);
 console.log('PASS Flowing Fists intake: eight distinct candidates, four linked provisional image cards, no autoaccept, repeat import dedupes, multi-select ready.');
}finally{await browser.close();await new Promise(ok=>server.close(ok))}
