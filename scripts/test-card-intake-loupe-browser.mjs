#!/usr/bin/env node
// Regression: image loupe must be usable, accessible, mobile-safe, and read-only.
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
const imageUrl='https://example.org/card-art/quagsire-review.png';
const brokenUrl='https://example.org/card-art/unavailable.png';
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="460" height="640" viewBox="0 0 460 640"><rect width="460" height="640" rx="18" fill="#badcf0"/><rect x="20" y="25" width="420" height="590" rx="16" fill="#f3fbff" stroke="#45769e" stroke-width="6"/><text x="36" y="75" fill="#102740" font-size="38" font-family="sans-serif">Quagsire</text><rect x="34" y="100" width="392" height="320" fill="#77adcf"/><text x="50" y="460" fill="#122942" font-size="22" font-family="sans-serif">Hot-Blooded Head</text><text x="50" y="492" fill="#122942" font-size="20" font-family="sans-serif">20+ damage</text><text x="50" y="565" fill="#122942" font-size="16" font-family="sans-serif">READABLE CARD TEST</text></svg>';
const cards=[
  {discovery_id:'a'.repeat(22),source_url:'https://www.pokebeach.com/2026/11/quagsire-test',
   name:'Quagsire',set_name:'Aura Seeker',card_number:'18',language:'unknown',category:'Pokémon',
   image_url:imageUrl,status:'provisional',source_verified:false,artwork_verified:false},
  {discovery_id:'b'.repeat(22),source_url:'https://www.pokebeach.com/2026/11/source-only-test',
   name:'',status:'provisional'},
  {discovery_id:'c'.repeat(22),source_url:'https://www.pokebeach.com/2026/11/broken-art-test',
   name:'Broken image',image_url:brokenUrl,status:'provisional'}
];
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900},acceptDownloads:true});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('https://example.org/card-art/**',route=>{
  if(route.request().url()===imageUrl)
    return route.fulfill({status:200,contentType:'image/svg+xml',body:svg,
      headers:{'access-control-allow-origin':'*','cache-control':'no-store'}});
  return route.fulfill({status:404,contentType:'text/plain',body:'No image'});
});
async function checkOpened(){
  assert(await page.locator('#cardLoupe').evaluate(x=>x.open),'Loupe did not open');
  await page.waitForFunction(()=>document.querySelector('#cardLoupeImage').naturalWidth===460,{timeout:10000});
  assert.equal(await page.locator('#cardLoupeSource').getAttribute('href'),imageUrl);
  assert((await page.locator('#cardLoupeTitle').textContent()).includes('Quagsire'));
}
try{
  await page.goto(base+'/card-intake.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#catalogStatus').textContent.includes('gameplay records'),{timeout:30000});
  await page.evaluate(data=>{
    localStorage.setItem('tcg-lab-card-intake-v1',JSON.stringify({schema:'tcg-lab-card-intake-v1',cards:data}));
    localStorage.setItem('tcg-lab-card-db-v0.1','KEEP_EXISTING_USER_TAGS');
  },cards);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#catalogStatus').textContent.includes('gameplay records'),{timeout:30000});
  assert.equal(await page.locator('.candidate').count(),3);
  assert.equal(await page.locator('.candidate-loupe-trigger').count(),2,'Magnifier should only appear with image URLs');
  const savedBefore=await page.evaluate(()=>localStorage.getItem('tcg-lab-card-intake-v1'));

  await page.getByRole('button',{name:'Enlarge Quagsire artwork'}).click();
  await checkOpened();
  assert.equal(await page.locator('#formTitle').textContent(),'Select a candidate','Magnifier unexpectedly changed selected card');
  await page.locator('#cardLoupeIn').click();
  assert.equal(await page.locator('#cardLoupeZoom').textContent(),'150%');
  await page.locator('#cardLoupeFit').click();
  assert.equal(await page.locator('#cardLoupeZoom').textContent(),'Fit');
  const stage=page.locator('#cardLoupeStage');
  await stage.hover();
  await page.mouse.wheel(0,-330);
  await page.waitForFunction(()=>document.querySelector('#cardLoupeZoom').textContent!=='Fit');
  assert((await page.locator('#cardLoupeZoom').textContent()).includes('%'));
  await page.locator('#cardLoupeIn').click();
  await page.locator('#cardLoupeIn').click();
  const bounds=await stage.boundingBox();
  assert(bounds,'Stage has no bounding box');
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
  await page.mouse.down();
  const oldTransform=await page.locator('#cardLoupeImage').evaluate(el=>el.style.transform);
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2-80,{steps:6});
  await page.mouse.up();
  const newTransform=await page.locator('#cardLoupeImage').evaluate(el=>el.style.transform);
  assert.notEqual(newTransform,oldTransform,'Pan did not respond to drag');
  await page.locator('#cardLoupeFit').click();
  await page.keyboard.press('Escape');
  assert(!(await page.locator('#cardLoupe').evaluate(x=>x.open)),'Escape did not dismiss native dialog');

  await page.locator('.candidate').filter({hasText:'Quagsire'}).click();
  assert(await page.locator('#previewSelected').isVisible(),'Selected card preview action missing');
  await page.locator('#previewSelected').click();
  await checkOpened();
  await page.screenshot({path:'/tmp/card-loupe-desktop.png'});
  await page.locator('#cardLoupeClose').click();
  assert(!(await page.locator('#cardLoupe').evaluate(x=>x.open)));

  await page.locator('.candidate').filter({hasText:'Broken image'}).click();
  await page.locator('#previewSelected').click();
  await page.waitForFunction(()=>!document.querySelector('#cardLoupeError').hidden,{timeout:10000});
  assert((await page.locator('#cardLoupeError').textContent()).includes('could not be loaded'));
  assert.equal(await page.locator('#cardLoupeSource').getAttribute('href'),brokenUrl);
  await page.locator('#cardLoupeClose').click();

  await page.locator('.candidate').filter({hasText:'Unidentified reveal'}).click();
  assert(!(await page.locator('#previewSelected').isVisible()),'Image-less reveal should not display loupe action');

  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Enlarge Quagsire artwork'}).click();
  await checkOpened();
  const dimensions=await page.evaluate(()=>{
    const rect=document.querySelector('#cardLoupe').getBoundingClientRect();
    return {vw:window.innerWidth,vh:window.innerHeight,x:rect.x,y:rect.y,
      width:rect.width,height:rect.height};
  });
  assert(dimensions.x>=-2&&dimensions.y>=-2 &&
    dimensions.width<=dimensions.vw+2&&dimensions.height<=dimensions.vh+2,
    'Viewer overflows mobile viewport: '+JSON.stringify(dimensions));
  await page.screenshot({path:'/tmp/card-loupe-mobile.png'});
  await page.locator('#cardLoupeClose').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('tcg-lab-card-db-v0.1')),'KEEP_EXISTING_USER_TAGS');
  assert.equal(await page.evaluate(()=>localStorage.getItem('tcg-lab-card-intake-v1')),savedBefore,
    'Loupe unexpectedly modified candidate records');
  assert.deepEqual(errors,[],'Browser JS errors: '+errors.join(' | '));
  console.log('PASS Card Loupe: thumbnail and selected preview, image load, +/−/Fit, wheel, drag, Escape, broken-image fallback, image-less records, mobile, storage integrity.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
