#!/usr/bin/env node
/** Browser smoke for centrally published JP-only TEMP across three existing tools. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png'};
const server=http.createServer((req,res)=>{
 const name=decodeURIComponent(new URL(req.url,'http://local').pathname);
 const target=path.resolve(root,'.'+name);
 if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return}
 fs.readFile(target,(err,buf)=>{
  if(err){res.writeHead(404).end();return}
  res.setHeader('Content-Type',mime[path.extname(target)]||'application/octet-stream');
  res.writeHead(200).end(buf);
 });
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const host='http://127.0.0.1:'+server.address().port;
const id='temp:reveal:central-jp-001';
const card={id,setCode:'TMPCTRJP1',name:'JP Central Test Card',nameJP:'仮ポケモン',
  number:'021',category:'Pokémon',stage:'Basic',pokemonType:'Lightning',hp:'70',
  evolvesFrom:'',image:'https://example.org/jp-central.jpg',
  source:'https://www.pokebeach.com/2026/11/test-central-temp',
  textEN:'',language:'jp',translationStatus:'jp-only',translationHistory:[],
  revisionHistory:[],sourceSetName:'Test JP Expansion',status:'provisional',
  reviewState:'accepted-temp',discoveryId:'d'.repeat(22)};
const fixture={schema:'tcg-lab-central-temp-v1',updated_at:'2026-11-10T15:00:00Z',
  sets:[{code:'TMPCTRJP1',name:'Test JP Expansion',createdAt:'2026-11-10T15:00:00Z',provisional:true}],
  cards:[card]};
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1220,height:870}});
await context.route('**/data/temp-catalog-v1.json',route=>route.fulfill({
  status:200,contentType:'application/json',body:JSON.stringify(fixture)}));
const errors=[];
const open=async path=>{
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(path+': '+e.message));
 await page.goto(host+path,{waitUntil:'domcontentloaded',timeout:45000});
 return page;
};
try{
 // Show a central record in Card Explorer on a fresh browser with no local TEMP.
 const explorer=await open('/card-db.html');
 await explorer.waitForFunction(()=>[...document.querySelectorAll('#setFilter option')].some(o=>o.value==='TMPCTRJP1'),{timeout:40000});
 await explorer.locator('#setFilter').selectOption('TMPCTRJP1');
 assert((await explorer.locator('#resultCount').textContent()).includes('1'),'Published TEMP absent from Card Explorer');
 assert((await explorer.locator('#cardResults').textContent()).includes('JP Central Test Card'));
 const explorerStore=JSON.parse(await explorer.evaluate(()=>localStorage.getItem('tcg-lab-card-db-v0.1')));
 assert(!(explorerStore?.tempCards||[]).some(c=>c.id===id),
   'Published central TEMP entry was incorrectly written into the personal browser store');
 const originalBrowserStore=await explorer.evaluate(()=>localStorage.getItem('tcg-lab-card-db-v0.1'));
 await explorer.close();

 const builder=await open('/deck-builder.html');
 await builder.waitForFunction(()=>{
  const el=document.querySelector('#loadStatus')||document.querySelector('#resultCount');
  return document.body.textContent.includes('JP Central Test Card') ||
    [...document.querySelectorAll('option')].some(o=>o.value==='TMPCTRJP1');
 },{timeout:40000});
 await builder.locator('#search').fill('JP Central Test Card');
 await builder.waitForTimeout(300);
 assert((await builder.locator('body').textContent()).includes('JP Central Test Card'));
 // Existing draft handoff can refer to the published stable TEMP ID.
 await builder.close();

 const proxy=await open('/proxy-workshop.html');
 await proxy.locator('#openImporter').click();
 await proxy.waitForFunction(()=>document.querySelector('#proxyImportStatus')?.textContent.includes('ready'),{timeout:35000});
 await proxy.locator('#piSearch').fill('JP Central Test Card');
 await proxy.waitForTimeout(400);
 assert((await proxy.locator('#piResults').textContent()).includes('JP Central Test Card'),
   'Proxy importer did not receive central JP artwork');
 await proxy.close();

 const intake=await open('/card-intake.html');
 await intake.waitForFunction(()=>document.querySelector('#centralTempStatus')?.textContent.includes('1 shared cards'),{timeout:35000});
 assert.equal(await intake.evaluate(()=>localStorage.getItem('tcg-lab-card-db-v0.1')),originalBrowserStore,
   'Card Intake central fetch changed private Card DB storage');
 const queue={schema:'tcg-lab-card-intake-v1',cards:[{
   source_url:card.source,discovery_id:card.discoveryId,name:card.name,set_name:card.sourceSetName,
   category:'Pokémon',language:'jp',status:'provisional',image_url:card.image,temp_entity_id:id
 }]};
 await intake.evaluate(q=>localStorage.setItem('tcg-lab-card-intake-v1',JSON.stringify(q)),queue);
 await intake.reload({waitUntil:'domcontentloaded'});
 await intake.waitForFunction(()=>document.querySelector('#centralTempStatus')?.textContent.includes('1 shared cards'),{timeout:35000});
 await intake.locator('.candidate').first().click();
 assert((await intake.locator('#tempStatus').textContent()).includes('Shared TEMP published'),
   'Intake mislabels a centrally published card as a local draft');
 assert(await intake.locator('#addTempDeck').isEnabled(),'Published JP card not eligible for Manual Simulator');
 assert(await intake.locator('#openTempProxy').isEnabled(),'Published JP artwork not eligible for proxies');
 await intake.close();

 assert.deepEqual(errors,[],'Browser JS errors: '+errors.join(' | '));
 console.log('PASS central TEMP Chromium: published Japanese-only card available across Card Explorer, Deck Builder, Proxy importer and Card Intake without touching personal store.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
