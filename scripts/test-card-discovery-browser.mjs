#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const MIME={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json'};
const server=http.createServer((req,res)=>{
  const target=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
  if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return}
  fs.readFile(target,(err,buf)=>{
    if(err){res.writeHead(404).end();return}
    res.setHeader('Content-Type',MIME[path.extname(target)]||'application/octet-stream');
    res.writeHead(200).end(buf);
  });
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const source='https://www.pokebeach.com/2026/11/meowth-and-persian-revealed-from-aura-seeker';
const cards=[
  {discovery_id:'a'.repeat(22),source_url:source,source_kind:'pokebeach-card-spoiler',name:'Meowth',card_number:'69',set_name:'Aura Seeker',status:'approved',source_verified:true,artwork_verified:true,language:'unknown'},
  {discovery_id:'b'.repeat(22),source_url:source,source_kind:'pokebeach-card-spoiler',name:'Persian',card_number:'70',set_name:'Aura Seeker',status:'approved',source_verified:true,artwork_verified:true,language:'unknown'}
];
const payload={schema:'tcg-lab-card-discovery-feed-v1',generated_at:'2026-11-10T08:15:00Z',candidates:cards,errors:[]};
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1240,height:860},acceptDownloads:true});
const errs=[];page.on('pageerror',e=>errs.push(String(e)));
try {
  await page.route('https://raw.githubusercontent.com/MckTCG/toolbelt/automation/card-discovery-feed/**',
    route=>route.fulfill({status:200,contentType:'application/json',
      headers:{'access-control-allow-origin':'*'},body:JSON.stringify(payload)}));
  await page.goto(base+'/card-intake.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#catalogStatus').textContent.includes('gameplay records'),{timeout:30000});
  await page.evaluate(()=>localStorage.setItem('tcg-lab-card-db-v0.1','KEEP_MY_TAGS'));
  await page.locator('#loadDiscoveries').click();
  await page.waitForFunction(()=>document.querySelector('#discoveryStatus').textContent.includes('2 newly staged'));
  assert.equal(await page.locator('.candidate').count(),2,'Cards sharing article must be separate');
  const raw=JSON.parse(await page.evaluate(()=>localStorage.getItem('tcg-lab-card-intake-v1')));
  assert.equal(raw.cards.length,2);
  assert.equal(raw.cards.filter(x=>x.status==='approved').length,0,'Source feed forced approval');
  assert(raw.cards.every(x=>!x.source_verified&&!x.artwork_verified));
  assert.equal(new Set(raw.cards.map(x=>x.discovery_id)).size,2);
  assert.equal(await page.evaluate(()=>localStorage.getItem('tcg-lab-card-db-v0.1')),'KEEP_MY_TAGS');
  await page.locator('#loadDiscoveries').click();
  await page.waitForFunction(()=>document.querySelector('#discoveryStatus').textContent.includes('0 newly staged'));
  assert.equal(await page.locator('.candidate').count(),2,'Repeated sync duplicated cards');
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('.candidate').count(),2,'Intake candidates lost on reload');
  assert.deepEqual(errs,[], 'Browser errors: '+errs.join('; '));
  console.log('PASS: browser loaded two reveals from one article, forced provisional review, deduped on recheck, persisted safely, preserved existing Card DB browser tags.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
