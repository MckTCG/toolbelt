#!/usr/bin/env node
// Stages card artwork; never promotes candidate images to verified production assets.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const root=process.cwd();
const seedPath=path.join(root,'public/data/delta-reign-temp-seed.json');
const output=path.join(root,'artifacts/delta-reign-staging');
const seed=JSON.parse(await fs.readFile(seedPath,'utf8'));
if(seed.schema!=='tcg-lab-delta-reign-temp-seed-v1'||seed.cards?.length!==113||new Set(seed.cards.map(c=>c.id)).size!==113)throw Error('Unexpected Delta Reign seed');
const maxBytes=12*1024*1024,minWidth=250,minHeight=340;
await fs.mkdir(path.join(output,'images'),{recursive:true});

function geometry(buf){
 if(buf.length<32)return null;
 if(buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {mime:'image/png',ext:'png',width:buf.readUInt32BE(16),height:buf.readUInt32BE(20)};
 if(buf[0]===255&&buf[1]===216){
  let at=2;
  while(at+9<buf.length){
   if(buf[at]!==255){at++;continue;}
   const marker=buf[at+1];at+=2;
   if(marker===216||marker===217||marker===1)continue;
   if(at+2>buf.length)break;
   const len=buf.readUInt16BE(at);if(len<2||at+len>buf.length)break;
   if([192,193,194,195,198,199,201,202].includes(marker)){
    return {mime:'image/jpeg',ext:'jpg',width:buf.readUInt16BE(at+5),height:buf.readUInt16BE(at+3)};
   }
   at+=len;
  }
 }
 if(buf.subarray(0,4).toString('ascii')==='RIFF'&&buf.subarray(8,12).toString('ascii')==='WEBP')return null; // No decoder: reject
 return null;
}
async function load(url){
 const parsed=new URL(url);
 if(parsed.protocol!=='https:')throw Error('HTTPS required');
 const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),15000);
 try{
  const res=await fetch(url,{signal:ctrl.signal,headers:{'User-Agent':'TCGLabArtworkAudit/1.0 (+manual printing research)'},redirect:'follow'});
  if(!res.ok)throw Error('HTTP '+res.status);
  const len=Number(res.headers.get('content-length')||0);if(len>maxBytes)throw Error('Too large');
  const bytes=Buffer.from(await res.arrayBuffer());if(bytes.length>maxBytes)throw Error('Too large');
  const image=geometry(bytes);
  if(!image)throw Error('Unsupported or invalid image header');
  if(image.width<minWidth||image.height<minHeight)throw Error('Low resolution: '+image.width+'x'+image.height);
  if(image.width>12000||image.height>12000)throw Error('Unreasonable image dimensions');
  return {bytes,image};
 }finally{clearTimeout(timer)}
}

// Discover official M6 artwork URLs by the *printed card number*, using a
// catalogue only to discover source addresses. Never infer URLs from names.
async function discoverM6Official(){
 const map=new Map(),errors=[];
 const request=async url=>{
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),16000);
  try{
   const response=await fetch(url,{signal:ctrl.signal,headers:{'User-Agent':'Mozilla/5.0 (compatible; TCG-Lab-artwork-ingest/1.0)'}});
   if(!response.ok)throw Error('HTTP '+response.status);
   return await response.text();
  }finally{clearTimeout(timer)}
 };
 try{
  const index=await request('https://dexli.st/sets/japan/m6');
  const paths=[...new Set([...index.matchAll(/\/cards\/ja\/japan-\d+/g)].map(x=>x[0]))];
  if(paths.length<90)errors.push('Index yielded only '+paths.length+' card links');
  let nextPage=0;
  async function lookup(){
   while(nextPage<paths.length){
    const href=paths[nextPage++];
    try{
     const page=await request('https://dexli.st'+href);
     const heading=(page.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||page.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').replace(/<[^>]+>/g,' ').replace(/&[^;]+;/g,' ');
     const number=heading.match(/\b(\d{3})\s*\/\s*76\b/);
     const raw=page.match(/www\.pokemon-card\.com(?:%2F|\/)assets(?:%2F|\/)images(?:%2F|\/)card_images(?:%2F|\/)large(?:%2F|\/)M6(?:%2F|\/)[A-Za-z0-9_%.-]+\.jpg/i);
     if(!number||!raw)continue;
     const official='https://'+decodeURIComponent(raw[0]);
     const n=Number(number[1]);
     if(n>=1&&n<=113&&/^https:\/\/www\.pokemon-card\.com\/assets\/images\/card_images\/large\/M6\/\d+_[PT]_[a-z0-9_.-]+\.jpg$/i.test(official)){
      if(!map.has(n))map.set(n,official);
     }
    }catch(e){errors.push(href+' '+String(e.message).slice(0,75))}
   }
  }
  await Promise.all(Array.from({length:6},()=>lookup()));
 }catch(e){errors.push('Index: '+String(e.message).slice(0,160))}
 return {map,errors};
}
const discovery=await discoverM6Official();
console.log('Number-matched official URL candidates: '+discovery.map.size+'/113; lookup errors: '+discovery.errors.length);

const rows=new Array(seed.cards.length);
let next=0;
async function worker(){
 while(next<seed.cards.length){
 const i=next++,card=seed.cards[i];
 const number=String(i+1).padStart(3,'0');
 if(!card.id.endsWith(number)||Number(card.number.split('/')[0])!==i+1)throw Error('Seed order mismatch at '+number);
 const candidates=[...new Set([discovery.map.get(i+1),card.imageJP,card.image].filter(Boolean))];
 let selected=null;const attempts=[];
 for(const url of candidates){
  try{
   const {bytes,image}=await load(url);
   const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
   const file=number+'.'+image.ext;
   await fs.writeFile(path.join(output,'images',file),bytes);
   selected={path:'images/'+file,source:url,sha256,...image,bytes:bytes.length};
   attempts.push({url,status:'staged'});break;
  }catch(e){attempts.push({url,status:'failed',error:String(e.message).slice(0,180)})}
 }
 rows[i]={entityId:card.id,printingId:card.id+':printing',name:card.name,setCode:card.setCode,number:card.number,status:selected?'needs-visual-review':'missing',asset:selected,attempts};
 process.stdout.write('['+(i+1)+'/113] '+card.name+' '+(selected?'staged':'missing')+'\n');
 }
}
await Promise.all(Array.from({length:8},()=>worker()));
const manifest={schema:'tcg-lab-card-art-staging-v1',generatedAt:new Date().toISOString(),setCode:seed.set.code,discoveredOfficial:discovery.map.size,discoveryErrors:discovery.errors.slice(0,40),verifiedCount:0,stagedCount:rows.filter(r=>r.asset).length,missingCount:rows.filter(r=>!r.asset).length,rows};
await fs.writeFile(path.join(output,'staging-report.json'),JSON.stringify(manifest,null,2));
const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const cards=rows.map(r=>'<article><h3>'+esc(r.number)+' '+esc(r.name)+'</h3>'+(r.asset?'<img loading="lazy" src="'+esc(r.asset.path)+'" alt="'+esc(r.name)+'">':'<p>MISSING</p>')+'<p>'+esc(r.status)+'</p><small>'+esc(r.asset?.source||r.attempts.map(a=>a.error).join(' | '))+'</small></article>').join('');
const page='<!doctype html><meta charset="utf-8"><title>Delta Reign candidate review</title><style>body{font:14px system-ui;background:#101c2d;color:#fff;padding:20px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}article{border:1px solid #4c607b;padding:10px;overflow-wrap:anywhere}img{max-width:100%;height:255px;object-fit:contain}small{color:#bbc8d8}</style><h1>Delta Reign — unverified artwork candidates</h1><p>Loading and resolution do NOT verify printing identity. Review every card manually before promotion. Missing entries are not silently substituted.</p><main>'+cards+'</main>';
await fs.writeFile(path.join(output,'review.html'),page);
console.log('Staged: '+manifest.stagedCount+'; missing: '+manifest.missingCount+'; verified: 0. Review artifact before promotion.');
