#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
 fs.readFile(file,(err,data)=>{
  if(err){res.writeHead(404).end();return}
  res.setHeader('Content-Type',/\.(html)$/.test(file)?'text/html':/\.(js|mjs)$/.test(file)?'text/javascript':/\.(json)$/.test(file)?'application/json':'application/octet-stream');
  res.writeHead(200).end(data);
 });
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const base='http://127.0.0.1:'+server.address().port;
const src='https://www.pokebeach.com/2026/11/bulk-test';
const make=(letter,name,number,extra={})=>({
 source_url:src,discovery_id:letter.repeat(22),name,set_name:'JP Bulk Test',
 card_number:String(number),language:'jp',category:'Pokémon',stage:'Basic',
 image_url:'https://example.org/'+letter+'.png',status:'provisional',...extra
});
const cards=[
 make('a','ワンパチ',21),
 make('b','パルスワン',22),
 make('c','Missing category',23,{category:''}),
 make('d','Wrong number',21)
];
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1200,height:850}});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="460" height="640"><rect width="460" height="640" fill="#acc"/></svg>';
await page.route('https://example.org/**',route=>route.fulfill({status:200,contentType:'image/svg+xml',body:svg}));
try{
 await page.goto(base+'/card-intake.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#catalogStatus')?.textContent.includes('gameplay records'),{timeout:35000});
 await page.evaluate(cards=>localStorage.setItem('tcg-lab-card-intake-v1',JSON.stringify({
  schema:'tcg-lab-card-intake-v1',cards})),cards);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#catalogStatus')?.textContent.includes('gameplay records'),{timeout:35000});
 assert.equal(await page.locator('.candidate').count(),4);
 assert.equal(await page.locator('.candidate-bulk-check').count(),4);
 assert(await page.locator('#bulkAcceptTemp').isDisabled());
 await page.locator('#filter').fill('ワンパチ');
 assert.equal(await page.locator('.candidate-bulk-check').count(),1);
 await page.locator('#bulkSelectVisible').click();
 assert.equal(await page.locator('#bulkSelectionStatus').textContent(),'1 selected');
 await page.locator('#filter').fill('パルスワン');
 await page.locator('#bulkSelectVisible').click();
 assert((await page.locator('#bulkSelectionStatus').textContent()).includes('2 selected'));
 await page.locator('#filter').fill('');
 assert.equal(await page.locator('.candidate-bulk-check:checked').count(),2);
 await page.locator('#bulkAcceptTemp').click();
 await page.waitForFunction(()=>document.querySelector('#bulkTempReport')?.textContent.includes('Accepted 2 TEMP draft(s)'),{timeout:12000});
 let local=JSON.parse(await page.evaluate(()=>localStorage.getItem('tcg-lab-card-db-v0.1')));
 assert.equal(local.tempCards.length,2);
 assert(local.tempCards.every(x=>x.language==='jp'&&x.textEN===''));
 let intake=JSON.parse(await page.evaluate(()=>localStorage.getItem('tcg-lab-card-intake-v1')));
 assert(intake.cards[0].temp_entity_id&&intake.cards[1].temp_entity_id);
 assert(!intake.cards[2].temp_entity_id&&!intake.cards[3].temp_entity_id);
 assert.equal(await page.locator('.candidate-bulk-check:checked').count(),0,
  'Successfully accepted cards should be deselected');
 assert(await page.locator('#bulkAcceptTemp').isDisabled());
 // Select all four, including invalid and potentially conflicting records.
 await page.locator('#bulkSelectVisible').click();
 assert.equal(await page.locator('.candidate-bulk-check:checked').count(),4);
 await page.locator('#bulkAcceptTemp').click();
 await page.waitForFunction(()=>document.querySelector('#bulkTempReport')?.textContent.includes('skipped'),{timeout:12000});
 const summary=await page.locator('#bulkTempReport').textContent();
 assert(summary.includes('Missing category')&&summary.includes('Wrong number'));
 assert.equal(await page.locator('.candidate-bulk-check:checked').count(),2,
  'Skipped records should remain selected for individual review');
 local=JSON.parse(await page.evaluate(()=>localStorage.getItem('tcg-lab-card-db-v0.1')));
 assert.equal(local.tempCards.length,2,'Invalid batch created additional TEMP records');
 await page.locator('#bulkClear').click();
 assert.equal(await page.locator('.candidate-bulk-check:checked').count(),0);
 // Existing loupe and normal single-card selection must remain independent.
 await page.getByRole('button',{name:'Enlarge ワンパチ artwork'}).click();
 assert(await page.locator('#cardLoupe').evaluate(x=>x.open));
 await page.keyboard.press('Escape');
 await page.locator('.candidate').first().click();
 assert((await page.locator('#formTitle').textContent()).includes('ワンパチ'));
 // Fresh reload retains linked draft entries, while ephemeral selection resets.
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#catalogStatus')?.textContent.includes('gameplay records'),{timeout:35000});
 assert.equal(await page.locator('.candidate-bulk-check:checked').count(),0);
 intake=JSON.parse(await page.evaluate(()=>localStorage.getItem('tcg-lab-card-intake-v1')));
 assert.equal(intake.cards.filter(x=>!!x.temp_entity_id).length,2);
 assert.deepEqual(errors,[],'Browser exceptions: '+errors.join('; '));
 console.log('PASS bulk intake Chromium: checkbox selection across filters, batch JP-only acceptance, conflict skips, preserved loupe and persistent links.');
}finally{await browser.close();await new Promise(ok=>server.close(ok))}
