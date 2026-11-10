import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {PDFDocument} from 'pdf-lib';

const root=path.resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.jpg':'image/jpeg'};
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://local.test').pathname),file=path.resolve(root,'.'+pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
 fs.readFile(file,(err,buffer)=>{if(err){res.writeHead(404).end();return}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.writeHead(200).end(buffer)});
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
page.on('pageerror',error=>{throw error});
const onePixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9SAtZpMAAAAASUVORK5CYII=','base64');
try{
 await page.goto(base+'/proxy-workshop.html',{waitUntil:'domcontentloaded'});
 assert(await page.locator('#openImporter').count(),'Native import module did not load');
 assert.equal((await page.evaluate(()=>window.__proxyDiagnostics())).cards,0);
 await page.locator('#files').setInputFiles({name:'manual.png',mimeType:'image/png',buffer:onePixel});
 await page.locator('#copies').fill('10');await page.locator('#add').click();
 assert.equal((await page.evaluate(()=>window.__proxyDiagnostics())).cards,10);
 await page.selectOption('#paperSize','letter');
 assert.equal((await page.evaluate(()=>window.__proxyDiagnostics())).pages,2);
 assert.equal((await page.evaluate(()=>window.__proxyDiagnostics())).capacity,9);
 await page.selectOption('#overlaySize','overlay');await page.locator('#cutGuides').check();
 assert.equal((await page.evaluate(()=>window.__proxyDiagnostics())).overlay,'overlay');
 assert.equal((await page.evaluate(()=>window.__proxyDiagnostics())).cutGuides,true);
 await page.selectOption('#paperSize','tabloid');
 assert.equal((await page.evaluate(()=>window.__proxyDiagnostics())).pages,1);
 await page.locator('#openImporter').click();
 await page.waitForFunction(()=>document.querySelector('#piResultCount').textContent.includes('gameplay cards'),{timeout:30000});
 await page.locator('#piSearch').fill('Buddy-Buddy Poffin');
 await page.selectOption('#piCategory','Trainer');await page.selectOption('#piSubtype','Item');
 await page.waitForFunction(()=>document.querySelector('#piResults').textContent.includes('Buddy-Buddy Poffin'));
 assert(await page.locator('.pi-card').filter({hasText:'Buddy-Buddy Poffin'}).count()>0);
 await page.selectOption('#piCategory','');await page.locator('#piSearch').fill('Rayquaza');
 await page.waitForFunction(()=>document.querySelectorAll('.pi-card').length>=2);
 const ray=page.locator('.pi-card').filter({hasText:'Mega Rayquaza ex'}).first();
 const ids=await ray.locator('select option').evaluateAll(nodes=>nodes.map(n=>n.value));
 for(const id of ['DLR-084','DLR-138','DLR-141'])assert(ids.includes(id),'Missing print '+id);
 await ray.locator('select').selectOption('DLR-138');
 await ray.locator('[data-quick-qty="2"]').click();
 await page.waitForFunction(()=>window.__proxyDiagnostics().cards===12,{timeout:20000});
 await page.locator('[data-tab="queue"]').click();
 const groups=await page.evaluate(()=>window.__proxyQueue.groups());
 assert.equal(groups.reduce((sum,g)=>sum+g.qty,0),12);
 assert(groups.some(g=>g.printingId==='DLR-138'&&g.qty===2));
 await page.locator('[data-queue-qty="1"]').fill('3');await page.locator('[data-queue-qty="1"]').dispatchEvent('change');
 assert.equal((await page.evaluate(()=>window.__proxyDiagnostics())).cards,13);
 await page.locator('[data-tab="decks"]').click();
 const testPayload={format:'tcg-lab-deck-v1',name:'Ray Test',deckSize:60,cards:[{entity_id:'ce_dlr_084',printing_id:'DLR-141',name:'Mega Rayquaza ex',qty:2,type:'Pokémon',stage:'Basic',setCode:'DLR',number:'141',image:base+'/assets/card-art/DLR/141.png'}]};
 await page.locator('#piDeckFile').setInputFiles({name:'test-deck.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(testPayload))});
 await page.waitForFunction(()=>document.querySelectorAll('[data-deck-row]').length===1);
 await page.locator('#piAddDeck').click();
 await page.waitForFunction(()=>window.__proxyDiagnostics().cards===15,{timeout:20000});
 await page.selectOption('#paperSize','letter');
 assert.equal((await page.evaluate(()=>window.__proxyDiagnostics())).pages,2);
 await page.locator('#closeImporter').click();
 await page.waitForFunction(()=>[...document.querySelectorAll('.slot img')].every(i=>i.complete&&i.naturalWidth>0),{timeout:25000});
 const buffer=await page.pdf({printBackground:true,preferCSSPageSize:true});
 assert(buffer.length>6000,'Rendered PDF too small');
 assert(buffer.subarray(0,4).toString()==='%PDF');
 const letterDoc=await PDFDocument.load(buffer);
 assert.equal(letterDoc.getPageCount(),2,'15 cards should use exactly two Letter pages, no extra blank pages');
 for(const p of letterDoc.getPages()){assert(Math.abs(p.getWidth()-612)<1);assert(Math.abs(p.getHeight()-792)<1)}
 await page.selectOption('#paperSize','tabloid');
 const tabloidPdf=await PDFDocument.load(await page.pdf({printBackground:true,preferCSSPageSize:true}));
 assert.equal(tabloidPdf.getPageCount(),1,'15 cards should fit one Tabloid sheet');
 assert(Math.abs(tabloidPdf.getPages()[0].getWidth()-792)<1);
 assert(Math.abs(tabloidPdf.getPages()[0].getHeight()-1224)<1);
 // A complete saved Deck Builder entry is read without writing back to its source.
 await page.evaluate(()=>{
  const saved={id:'proxy-qa',name:'Saved QA 60',size:60,mode:'practice',updatedAt:'2026-11-10T00:00:00Z',rows:[
   {entityId:'ce_dlr_084',printingId:'DLR-084',qty:4},
   {entityId:'ce_dlr_090',printingId:'DLR-090',qty:56}
  ]};
  const key='tcg-lab-decks-v1';localStorage.setItem(key,JSON.stringify({format:'tcg-lab-deck-library-v1',decks:[saved]}));
  window.dispatchEvent(new StorageEvent('storage',{key}));
 });
 await page.locator('#openImporter').click();await page.locator('[data-tab="decks"]').click();
 await page.selectOption('#piSaved','0');await page.locator('#piLoadSaved').click();
 await page.waitForFunction(()=>document.querySelectorAll('[data-deck-row]').length===2);
 await page.selectOption('#piScope','pokemon');await page.locator('#piAddDeck').click();
 await page.waitForFunction(()=>window.__proxyDiagnostics().cards===19,{timeout:20000});
 assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('tcg-lab-decks-v1')).decks[0].rows[0].qty)),4,'Saved deck must not be mutated');
 console.log('PASS: Chromium manual upload; Letter/Tabloid reflow; overlay/guides; Buddy-Buddy Poffin and Trainer filter; Rayquaza 84/138/141 printing picker; unified queue; JSON and saved deck import; Letter 2-page PDF (612×792 pt) and Tabloid 1-page PDF (792×1224 pt), no blank pages.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
