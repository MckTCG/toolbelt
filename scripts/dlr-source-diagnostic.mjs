#!/usr/bin/env node
import fs from 'node:fs/promises';
const pages=['https://limitlesstcg.com/cards/en/DLR/2','https://limitlesstcg.com/cards/en/DLR/84','https://limitlesstcg.com/cards/en/DLR/141'];
const report=[];
for(const url of pages){
 try{
 const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; TCG-Lab-master-catalogue/1.0)','Accept':'text/html'}});
 const h=await r.text();
 const tags=[...h.matchAll(/<(?:h1|h2|h3|img|meta|section|table|article|div|a)\b[^>]{0,500}>/gi)].map(x=>x[0]).filter(x=>/card|name|type|rarity|img|set|title|attack|main|text|energy|detail|print|data-/i.test(x)).slice(0,140);
 report.push({url,http:r.status,length:h.length,title:h.match(/<title>([^<]+)/i)?.[1]||'',tags,bodyExtract:h.slice(Math.max(0,h.search(/Surskit|Rayquaza/i)-500),h.search(/Surskit|Rayquaza/i)+3200)});
 }catch(e){report.push({url,error:String(e)})}
}
await fs.mkdir('artifacts/dlr-diagnostic',{recursive:true});
await fs.writeFile('artifacts/dlr-diagnostic/report.json',JSON.stringify(report,null,2));
