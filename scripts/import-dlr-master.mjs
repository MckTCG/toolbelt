#!/usr/bin/env node
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import {load as cheerioLoad} from 'cheerio';
const ROOT=process.cwd(),DEST=path.join(ROOT,'destination/public'),OUT=path.join(ROOT,'destination/docs/dlr-master-import-audit.json'),HTML=path.join(DEST,'card-db.html'),IMAGES=path.join(DEST,'assets/card-art/DLR'),MANIFEST=path.join(DEST,'data/card-art-manifest.json');
const TOTAL=141,MAX=12000000,energy={G:'Grass',R:'Fire',W:'Water',L:'Lightning',P:'Psychic',F:'Fighting',D:'Darkness',M:'Metal',C:'Colorless',N:'Colorless'};
const pad=n=>String(n).padStart(3,'0'),trim=s=>String(s??'').replace(/\s+/g,' ').trim(),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function get(url){
 let last;for(let i=0;i<3;i++){const c=new AbortController(),t=setTimeout(()=>c.abort(),20000);try{const r=await fetch(url,{signal:c.signal,headers:{'User-Agent':'Mozilla/5.0','Accept':'text/html,image/png,image/*'}});if(!r.ok)throw Error('HTTP '+r.status);return r}catch(e){last=e;await delay(500+i*700)}finally{clearTimeout(t)}}
 throw last;
}
function parse(html,n){
 const $=cheerioLoad(html);
 function txt(el){const c=$(el).clone();c.find('.copy-only').remove();c.find('[data-tooltip]').each((_,x)=>$(x).replaceWith('['+($(x).attr('data-tooltip')||'')+']'));c.find('br').replaceWith('\n');return trim(c.text())}
 const name=txt($('.card-text-name').first()),headline=txt($('.card-text-title').first()),line=txt($('.card-text-type').first()),rarityLine=txt($('.prints-current-details span').last());
 const parsedNumber=Number((rarityLine.match(/#(\d+)/)||[])[1]);if(!name||parsedNumber!==n)throw Error('Bad printing '+n+': '+name+' '+rarityLine);
 const image=$('.card-image img.card').attr('data-src')||'';
 if(!new RegExp('^https://limitlesstcg[.]nyc3[.]cdn[.]digitaloceanspaces[.]com/tpci/DLR/DLR_'+pad(n)+'_R_EN[.]png$').test(image))throw Error('Unexpected image '+n+': '+image);
 const category=/^Pokémon\b/.test(line)?'Pokémon':/^Trainer\b/.test(line)?'Trainer':/^Energy\b/.test(line)?'Energy':null;
 if(!category)throw Error('Unknown category '+n+': '+line);
 const stage=line.split(' - ').slice(1).join(' - '),pokemonType=category==='Pokémon'?(headline.match(/ - (\w+) - \d+ HP/)||[])[1]||'':'',hp=category==='Pokémon'?(headline.match(/(\d+) HP/)||[])[1]||'':'';
 const abilities=$('.card-text-ability').toArray().map(e=>({name:txt($(e).find('.card-text-ability-info')).replace(/^Ability:\s*/,''),text:txt($(e).find('.card-text-ability-effect'))}));
 const attacks=$('.card-text-attack').toArray().map(e=>{const info=$(e).find('.card-text-attack-info').first(),raw=trim(info.find('.ptcg-symbol').first().text());const clone=info.clone();clone.find('.ptcg-symbol').remove();const details=txt(clone),m=details.match(/^(.*?)\s+(\d+\+?|\d+[×x])$/),cost=[...raw].map(a=>energy[a]).filter(Boolean);return {name:m?trim(m[1]):details,cost,converted_energy_cost:cost.length,damage:m?m[2]:'',text:txt($(e).find('.card-text-attack-effect'))}});
 const ruleBlock=$('.card-text-section').eq(1).clone();ruleBlock.find('.card-text-attack,.card-text-ability,.card-text-wrr').remove();const rule=txt(ruleBlock),rules=rule?[rule]:[];
 const wrr=txt($('.card-text-wrr').first()),weakness=trim((wrr.match(/Weakness:\s*(.*?)(?=Resistance:|$)/i)||[])[1]),resistance=trim((wrr.match(/Resistance:\s*(.*?)(?=Retreat:|$)/i)||[])[1]),retreat=Number((wrr.match(/Retreat:\s*(\d+)/)||[])[1]||0);
 if(category==='Pokémon'&&(!stage||!hp||!pokemonType||(!abilities.length&&!attacks.length)))throw Error('Missing Pokémon data '+n);
 if(category!=='Pokémon'&&!rules.length)throw Error('Missing Trainer/Energy effect '+n);
 const regulation=txt($('.regulation-mark').first()).charAt(0)||'J',rarity=rarityLine.split('·').slice(1).join('·').trim()||'Unknown';
 const combinedText=[...abilities.map(a=>'Ability — '+a.name+': '+a.text),...attacks.map(a=>'Attack — '+a.name+' ['+a.cost.join(' ')+'] '+a.damage+(a.text?': '+a.text:'')),...rules].join('\n');
 return {number:n,url:'https://limitlesstcg.com/cards/en/DLR/'+n,name,category,stage,pokemonType,hp,abilities,attacks,rules,weakness,resistance,retreat,regulation,rarity,image,combinedText};
}
const pages=new Array(TOTAL);let next=1;
async function cardWorker(){while(next<=TOTAL){const n=next++;try{pages[n-1]=parse(await(await get('https://limitlesstcg.com/cards/en/DLR/'+n)).text(),n);console.log('Read DLR #'+n+' '+pages[n-1].name)}catch(e){pages[n-1]={number:n,error:String(e)};console.log('FAILED '+n+' '+e)}}}
await Promise.all(Array.from({length:9},()=>cardWorker()));
await fs.mkdir(path.dirname(OUT),{recursive:true});
const failed=pages.filter(x=>x.error);
if(failed.length){await fs.writeFile(OUT,JSON.stringify({status:'blocked',failed},null,2));throw Error('Incomplete Limitless extraction: '+failed.length+' / 141')}
const original=await fs.readFile(HTML,'utf8'),match=original.match(/(<script id="catalog" type="application\/json">)([\s\S]*?)(<\/script>)/);
if(!match)throw Error('Master catalogue missing');
const catalog=JSON.parse(match[2]),oldCount=catalog.entities.length,oldHash=hash(JSON.stringify(catalog.entities));
if(!Array.isArray(catalog.sets)||!Array.isArray(catalog.entities)||catalog.sets.some(x=>x.set_code==='DLR'))throw Error('Master already has DLR or invalid schema');
const grouped=new Map(),entities=[];
for(const r of pages){
 const fingerprint=JSON.stringify([r.name,r.category,r.stage,r.pokemonType,r.hp,r.abilities,r.attacks,r.rules,r.weakness,r.resistance,r.retreat,r.number>=94&&r.number<=99?r.number:0]);
 let e=grouped.get(fingerprint);
 if(!e){e={entity_id:'ce_dlr_'+pad(r.number),name:r.name,supertype:r.category+(r.stage?' – '+r.stage:''),card_type:r.category,stage:r.category==='Pokémon'?r.stage:'',pokemon_types:r.pokemonType,hp:r.hp,evolves_from:'',ability_names:r.abilities.map(a=>a.name).join(' | ')||null,ability_effects:r.abilities.map(a=>a.text).join(' | ')||null,attack_names:r.attacks.map(a=>a.name).join(' | ')||null,attack_costs:r.attacks.map(a=>a.cost.join(' ')).join(' | ')||null,attack_damage:r.attacks.map(a=>a.damage).join(' | ')||null,attack_effects:r.attacks.map(a=>a.text).join(' | ')||null,rules_text:r.rules.join('\n')||null,combined_text:r.combinedText,weakness:r.weakness&&r.weakness.toLowerCase()!=='none'?r.weakness+' ×2':null,resistance:r.resistance&&r.resistance.toLowerCase()!=='none'?r.resistance:null,retreat_cost:r.category==='Pokémon'?String(r.retreat):null,printings:[],subtypes:r.stage?[r.stage]:[],types:r.pokemonType?[r.pokemonType]:[],abilities:r.abilities,attacks:r.attacks,rules:r.rules,weaknesses:r.weakness&&r.weakness.toLowerCase()!=='none'?[{type:r.weakness,value:'×2'}]:[],resistances:r.resistance&&r.resistance.toLowerCase()!=='none'?[{type:r.resistance,value:'-30'}]:[],retreat_energy_cost:Array.from({length:r.retreat},()=> 'Colorless'),basic_energy_type:null,extraction:{status:'source-extracted',date:'2026-11-09',source_url:r.url,notes:[]}};grouped.set(fingerprint,e);entities.push(e)}
 e.printings.push({printing_id:'DLR-'+pad(r.number),set_code:'DLR',card_number:String(r.number),image_url:r.image,rarity:r.rarity,artist:null,regulation_mark:r.regulation,legal_basis:'Current regulation mark J',release_date:'2026/11/06',source_url:r.url});
}
catalog.sets.push({set_code:'DLR',name:'Delta Reign',first_release_date:'2026/11/06',imported_printings:141,scope_note:'Complete English DLR numbered set from Limitless'});
catalog.entities.push(...entities);
if(hash(JSON.stringify(catalog.entities.slice(0,oldCount)))!==oldHash)throw Error('Existing entities changed');
if(entities.reduce((x,e)=>x+e.printings.length,0)!==TOTAL||new Set(entities.flatMap(e=>e.printings.map(p=>p.printing_id))).size!==TOTAL)throw Error('141-printing consistency check failed');
const manifest=JSON.parse(await fs.readFile(MANIFEST,'utf8'));if(manifest.schema!=='tcg-lab-card-art-manifest-v1'||!Array.isArray(manifest.entries))throw Error('Art manifest invalid');
await fs.mkdir(IMAGES,{recursive:true});let imageNext=0;
async function imageWorker(){
 while(imageNext<TOTAL){const r=pages[imageNext++],file=pad(r.number)+'.png';
  let entry={entityId:entities.find(e=>e.printings.some(p=>p.printing_id==='DLR-'+pad(r.number)))?.entity_id,printingId:'DLR-'+pad(r.number),setCode:'DLR',number:String(r.number),status:'missing',path:null,sha256:null,sourceAttribution:r.image};
  try{const response=await get(r.image),buf=Buffer.from(await response.arrayBuffer());if(buf.length>MAX||buf.length<4000||!buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Invalid/oversize PNG');
   const width=buf.readUInt32BE(16),height=buf.readUInt32BE(20);if(width<600||height<800)throw Error('Image too small '+width+'x'+height);
   await fs.writeFile(path.join(IMAGES,file),buf);
   entry={...entry,status:'verified',path:'./assets/card-art/DLR/'+file,sha256:hash(buf),mimeType:'image/png',width,height,language:'en',verificationMethod:'exact English DLR number on Limitless page and source image URL'};
  }catch(e){r.imageError=String(e);entry.error=String(e)}
  manifest.entries.push(entry);
 }
}
await Promise.all(Array.from({length:8},()=>imageWorker()));
const hosted=manifest.entries.filter(x=>x.setCode==='DLR'&&x.status==='verified').length;
if(hosted<120)throw Error('Only '+hosted+' of 141 English images could be downloaded');
let html=original.replace(match[0],match[1]+JSON.stringify(catalog)+match[3]);
const needle='if(verifiedLocalArt.size)render();';
if(!html.includes(needle))throw Error('Master Card DB local art resolver missing');
const replacement="if(verifiedLocalArt.size){for(const entity of CATALOG.entities)for(const printing of entity.printings||[]){const local=verifiedLocalArt.get(printing.printing_id);if(local)printing.image_url=local;}render();}";
html=html.replace(needle,replacement);
await fs.writeFile(HTML,html);await fs.writeFile(MANIFEST,JSON.stringify(manifest,null,2)+'\n');
const audit={schema:'tcg-lab-dlr-import-audit-v1',status:'staged',publishedPrintings:TOTAL,mainPrintings:103,originalEntities:oldCount,addedGameplayEntities:entities.length,addedPrintings:TOTAL,imagesHosted:hosted,missingImages:pages.filter(x=>x.imageError).map(x=>({number:x.number,name:x.name,error:x.imageError})),samples:pages.filter(x=>[2,84,90,94,95,132,138,141].includes(x.number)),groupedPrintings:entities.filter(e=>e.printings.length>1).map(e=>({name:e.name,numbers:e.printings.map(p=>p.card_number)}))};
await fs.writeFile(OUT,JSON.stringify(audit,null,2));
const verify=JSON.parse(html.match(/<script id="catalog" type="application\/json">([\s\S]*?)<\/script>/)[1]);
if(verify.entities.length!==oldCount+entities.length||verify.sets.filter(s=>s.set_code==='DLR').length!==1)throw Error('Post-write validation failed');
console.log('STAGED: '+entities.length+' entities, 141 English printings, '+hosted+' local artwork files.');
