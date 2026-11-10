#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const MIME={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.png':'image/png'};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://local.test').pathname);
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
  fs.readFile(file,(error,buffer)=>{
    if(error){res.writeHead(404).end();return}
    res.setHeader('Content-Type',MIME[path.extname(file)]||'application/octet-stream');
    res.writeHead(200).end(buffer);
  });
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1240,height:950},acceptDownloads:true});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
try{
  await page.goto(base+'/card-intake.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#catalogStatus').textContent.includes('gameplay records'),{timeout:30000});
  await page.evaluate(()=>localStorage.setItem('tcg-lab-card-db-v0.1','DO_NOT_TOUCH'));
  await page.locator('#sourceInput').fill('https://www.pokebeach.com/2026/11/test-item-reveal');
  await page.locator('#addSource').click();
  assert.equal(await page.locator('.candidate').count(),1);
  assert.equal(await page.locator('input[name=source_url]').inputValue(),'https://www.pokebeach.com/2026/11/test-item-reveal');
  await page.locator('input[name=name]').fill('Intake Test Item');
  await page.selectOption('select[name=category]','Trainer');
  await page.selectOption('select[name=language]','en');
  await page.locator('input[name=set_code]').fill('TST');
  await page.locator('input[name=set_name]').fill('Test Set');
  await page.locator('input[name=card_number]').fill('1');
  await page.locator('input[name=stage]').fill('Item');
  await page.locator('input[name=regulation_mark]').fill('J');
  await page.locator('input[name=release_date]').fill('2026/11/10');
  await page.locator('input[name=image_url]').fill('https://example.org/test-item.png');
  await page.locator('textarea[name=combined_text]').fill('Draw a card.');
  await page.locator('textarea[name=rules_text]').fill('Draw a card.');
  await page.locator('input[name=source_verified]').check();
  await page.locator('input[name=artwork_verified]').check();
  await page.locator('#approveCard').click();
  await page.waitForFunction(()=>document.querySelector('#queueCount').textContent.includes('1 approved'));
  assert((await page.locator('#diagnostic').textContent()).includes('new-gameplay'));
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#exportApproved').click()]);
  const json=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  assert.equal(json.schema,'tcg-lab-card-intake-v1');
  assert.equal(json.cards.length,1);
  assert.equal(json.cards[0].status,'approved');
  assert.equal(json.cards[0].name,'Intake Test Item');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#catalogStatus').textContent.includes('gameplay records'),{timeout:30000});
  assert.equal(await page.locator('.candidate').count(),1,'Intake queue lost after reload');
  assert.equal(await page.evaluate(()=>localStorage.getItem('tcg-lab-card-db-v0.1')),'DO_NOT_TOUCH','Existing Card DB browser store was changed');
  await page.locator('#sourceInput').fill('https://limitlesstcg.com/cards/en/DLR/84');
  await page.locator('#addSource').click();
  assert.equal(await page.locator('input[name=set_code]').inputValue(),'DLR');
  assert.equal(await page.locator('input[name=card_number]').inputValue(),'84');
  await page.locator('input[name=name]').fill('Mega Rayquaza ex');
  await page.selectOption('select[name=category]','Pokémon');
  assert((await page.locator('#diagnostic').textContent()).includes('duplicate-printing'),'Existing DLR printing was not detected');
  await page.locator('#approveCard').click();
  assert((await page.locator('#feedback').textContent()).includes('Cannot approve'),'Duplicate DLR approval was allowed');
  await page.setViewportSize({width:390,height:844});
  const overflowInfo=await page.evaluate(()=>({
    width:window.innerWidth,scroll:document.documentElement.scrollWidth,
    offenders:[...document.querySelectorAll('*')].map(el=>({tag:el.tagName,id:el.id,cls:String(el.className||'').slice(0,70),right:Math.round(el.getBoundingClientRect().right),width:Math.round(el.getBoundingClientRect().width)}))
      .filter(x=>x.right>window.innerWidth+3).slice(0,24)
  }));
  console.log('Mobile layout diagnostics:',JSON.stringify(overflowInfo));
  assert(overflowInfo.scroll<=overflowInfo.width+3,'Card Intake has excessive horizontal overflow on mobile');
  assert.deepEqual(errors,[],'Browser script exception: '+errors.join(' | '));
  console.log('PASS Card Intake Chromium: live Master DB parsing, reveal capture, reviewed approval, JSON export, queue persistence, no tag mutation, DLR dedupe, mobile layout.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
