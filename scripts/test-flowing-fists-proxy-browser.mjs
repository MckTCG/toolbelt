#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {parseCentralTemp} from '../public/temp-central-core.mjs';

const root=path.resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const photos=path.join(root,'assets/flowing-fists-leaks');
const manifest=JSON.parse(fs.readFileSync(path.join(photos,'manifest-v1.json'),'utf8'));
const catalog=parseCentralTemp(JSON.parse(fs.readFileSync(path.join(root,'data/temp-catalog-v1.json'),'utf8')));
const cards=catalog.cards.filter(c=>c.setCode==='TMPFLO');
assert.equal(cards.length,18,'Four original plus fourteen Phase 2 provisional printings expected');
assert.equal(manifest.cards.length,18,'Eighteen individually cropped sources expected');
assert.equal(new Set(manifest.cards.map(x=>x.sha256)).size,18);
for(const x of manifest.cards){
 const bytes=fs.readFileSync(path.join(photos,x.file));
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),x.sha256);
 assert.deepEqual(x.image_dimensions,[744,1040]);
 assert(x.native_crop_dimensions[1]<1040,'Intrinsic quality should be recorded honestly');
 const central=cards.find(c=>c.name===x.name&&String(Number(c.number))===String(Number(x.number)));
 assert(central,'Missing central TEMP image record: '+x.name);
 assert.equal(central.image,'https://mute-dust-0d50.forcoin99.workers.dev/assets/flowing-fists-leaks/'+x.file);
 assert.equal(central.reviewState,'accepted-temp');
 assert.equal(central.status,'provisional');
 assert(['en','other'].includes(central.language),'Incorrect provisional language');
 assert(!central.textEN,'Do not publish guessed text');
}
const server=http.createServer((req,res)=>{
 const target=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
 if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return}
 fs.readFile(target,(err,buffer)=>{
  if(err){res.writeHead(404).end();return}
  const ext=path.extname(target),mime={
    '.html':'text/html','.mjs':'text/javascript','.js':'text/javascript',
    '.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.png':'image/png'
  };
  res.setHeader('Content-Type',mime[ext]||'application/octet-stream');
  res.writeHead(200).end(buffer);
 });
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1300,height:900}});
const errors=[];
const imageHits=[];
await context.route('https://mute-dust-0d50.forcoin99.workers.dev/assets/flowing-fists-leaks/cards/**',async route=>{
 const name=new URL(route.request().url()).pathname.split('/').at(-1);
 const f=path.resolve(photos,'cards',name);
 if(!f.startsWith(path.resolve(photos,'cards')+path.sep)||!fs.existsSync(f)){
   await route.fulfill({status:404,body:'No exact printing image'});return;
 }
 imageHits.push(name);
 await route.fulfill({status:200,contentType:'image/jpeg',body:fs.readFileSync(f)});
});
const page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto(base+'/proxy-workshop.html',{waitUntil:'domcontentloaded',timeout:45000});
 await page.locator('#openImporter').click();
 await page.waitForFunction(()=>document.querySelector('#proxyImportStatus')?.textContent.includes('ready'),{timeout:35000});
 assert((await page.locator('#proxyImportStatus').textContent()).includes('centrally published TEMP'));
 await page.locator('#piSet').selectOption('TMPFLO');
 assert((await page.locator('#piResultCount').textContent()).includes('18 matching gameplay cards'));
 for(const item of [
  {name:'Mega Lucario Z ex',number:'111',qty:4},
  {name:'Mega Garchomp Z ex',number:'112',qty:1},
  {name:'Blastoise',number:'083',qty:1},
  {name:'Ninetales',number:'082',qty:2},
  {name:'Hawlucha',number:'087',qty:2},
  {name:'Regigigas',number:'091',qty:1},
  {name:'Mega Lucario Z ex',number:'097',qty:1},
  {name:'Mega Absol Z ex',number:'110',qty:1},
  {name:"Korrina's Seriousness",number:'113',qty:1},
  {name:'Mega Glimmora ex',number:'055',qty:1}
 ]){
  await page.locator('#piSearch').fill(item.number);
  await page.waitForFunction(()=>document.querySelectorAll('.pi-card').length===1);
  const tile=page.locator('.pi-card').first();
  assert((await tile.textContent()).includes(item.name));
  const art=tile.locator('img').first();
  await art.evaluate(async img=>{
   if(!img.complete)await new Promise((resolve,reject)=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',reject,{once:true})});
  });
  const dimensions=await art.evaluate(img=>({w:img.naturalWidth,h:img.naturalHeight}));
  assert.deepEqual(dimensions,{w:744,h:1040},'Printed crop dimensions mismatch: '+item.name);
  await tile.locator('[data-quick-qty="'+item.qty+'"]').click();
  await page.waitForFunction(name=>document.querySelector('#proxyImportStatus')?.textContent.includes('Added')&&
    document.querySelector('#proxyImportStatus')?.textContent.includes(name),item.name,{timeout:15000});
 }
 assert.equal(await page.locator('[data-tab="queue"]').textContent(),'Print queue (15)');
 await page.locator('[data-tab="queue"]').click();
 const queue=await page.evaluate(()=>window.__proxyQueue.groups());
 assert.equal(queue.reduce((sum,row)=>sum+row.qty,0),15);
 assert.equal(queue.length,10,'Alternate Flowing Fists printings should not overwrite one another');
 await page.locator('#paperSize').selectOption('letter');
 let paper=await page.evaluate(()=>window.__proxyDiagnostics());
 assert.deepEqual({cards:paper.cards,pages:paper.pages,capacity:paper.capacity,format:paper.format},
  {cards:15,pages:2,capacity:9,format:'letter'});
 await page.locator('#paperSize').selectOption('tabloid');
 paper=await page.evaluate(()=>window.__proxyDiagnostics());
 assert.equal(paper.cards,15);assert.equal(paper.pages,1);assert.equal(paper.capacity,18);
 assert(imageHits.length>=10,'Ten hosted proxy assets were not loaded by the browser');
 assert.deepEqual(errors,[],'JavaScript errors: '+errors.join('; '));
 console.log('PASS Flowing Fists proxy Chromium: 18 indexed photos, 10 distinct printings and 15 queued copies, Letter 9-up and Tabloid 18-up, provenance intact.');
} finally {
 await browser.close();await new Promise(ok=>server.close(ok));
}
