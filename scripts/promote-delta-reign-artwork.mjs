#!/usr/bin/env node
// Promotion is restricted to the 107 source-matched high-resolution M6 printings.
// The six paired Stadium printings remain explicitly missing.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const root=process.cwd();
const source=path.join(root,'candidate-repository/artifacts/delta-reign-staging');
const target=path.join(root,'promotion-repository/public');
const report=JSON.parse(await fs.readFile(path.join(source,'staging-report.json'),'utf8'));
const seed=JSON.parse(await fs.readFile(path.join(root,'public/data/delta-reign-temp-seed.json'),'utf8'));
const manifestPath=path.join(target,'data/card-art-manifest.json');
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
if(report.schema!=='tcg-lab-card-art-staging-v1'||report.rows?.length!==113||report.stagedCount<107)throw Error('Staged report not complete: require 107 high-quality candidates');
if(seed.cards?.length!==113||manifest.entries?.length!==113)throw Error('113-printing metadata mismatch');
const byId=new Map(report.rows.map(r=>[r.entityId,r]));
if(byId.size!==113)throw Error('Duplicate staged IDs');
let approved=0,missing=0;
const verifiedAssets=[];
const destDir=path.join(target,'assets/card-art/TMPDELTAREIGN');
await fs.mkdir(destDir,{recursive:true});
for(const [i,card] of seed.cards.entries()){
 const entry=manifest.entries[i],row=byId.get(card.id),num=String(i+1).padStart(3,'0');
 if(!entry||entry.entityId!==card.id||entry.printingId!==card.id+':printing'||!row||row.number!==card.number)throw Error('Printing identity mismatch at '+num);
 if(!row.asset){entry.status='missing';entry.path=null;entry.sha256=null;missing++;continue;}
 const uri=row.asset.source;
 const official=/^https:\/\/www\.pokemon-card\.com\/assets\/images\/card_images\/large\/M6\/\d+_[PT]_[a-z0-9_.-]+\.jpg$/i.test(uri);
 const energyVerified=[104,105,106].includes(i+1)&&uri==='https://www.serebii.net/card/stormemeralda/'+num+'.jpg';
 if(!official&&!energyVerified)throw Error('Unapproved image source for '+num+': '+uri);
 const ext=row.asset.ext;
 if(!['jpg','png'].includes(ext))throw Error('Unapproved file format '+num);
 const raw=await fs.readFile(path.join(source,'images',num+'.'+ext));
 const sha=crypto.createHash('sha256').update(raw).digest('hex');
 if(sha!==row.asset.sha256||raw.length!==row.asset.bytes)throw Error('Image hash/size mismatch '+num);
 if(row.asset.width<600||row.asset.height<800)throw Error('Insufficient resolution '+num);
 const filename=num+'.'+ext,dest=path.join(destDir,filename);
 await fs.writeFile(dest,raw);
 entry.path='./assets/card-art/TMPDELTAREIGN/'+filename;
 entry.sha256=sha;
 entry.status='verified';
 entry.mimeType=row.asset.mime;
 entry.width=row.asset.width;
 entry.height=row.asset.height;
 entry.language='ja';
 entry.sourceAttribution=uri;
 entry.verificationMethod=official?'indexed-official-M6-image-by-print-number':'number-confirmed-japanese-image';
 approved++;
 verifiedAssets.push({number:card.number,name:card.name,path:entry.path,sha256:sha,width:entry.width,height:entry.height,source:uri});
}
if(approved!==107||missing!==6||manifest.entries.filter(e=>e.status==='verified').length!==107)throw Error('Unexpected promotion counts '+approved+'/'+missing);
manifest.promotion={approved,missing,method:'set-number matching, image integrity and dimension checks; Japanese printings only',sourceReportGeneratedAt:report.generatedAt};
await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
await fs.writeFile(path.join(destDir,'VERIFICATION.json'),JSON.stringify({schema:'tcg-lab-M6-local-art-verification-v1',verifiedAssets,missingNumbers:['071/076','072/076','073/076','074/076','075/076','076/076']},null,2)+'\n');
console.log('Local artwork promotion validated: '+approved+' files; '+missing+' paired Stadium images missing. Ready for PR review.');
