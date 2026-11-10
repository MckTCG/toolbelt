import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';

const origin='https://mute-dust-0d50.forcoin99.workers.dev';
const headers={'User-Agent':'TCG-Lab-Deployment-QA/1.0 (+https://github.com/MckTCG/toolbelt)','Accept':'*/*'};
async function retrieve(path){
 const response=await fetch(origin+path,{headers,signal:AbortSignal.timeout(15000),cache:'no-store'});
 if(!response.ok)throw Error(path+' HTTP '+response.status);
 return response;
}
async function verify(){
 const workshop=await (await retrieve('/proxy-workshop.html')).text();
 assert(workshop.includes('src="./proxy-import.mjs"')&&workshop.includes('window.__proxyQueue'),'Live Workshop does not contain Phase 2 integration');
 const importer=await (await retrieve('/proxy-import.mjs')).text();
 assert(importer.includes('piSearch')&&importer.includes('piSaved')&&importer.includes('piQueueRows'),'Live native import script is missing or stale');
 const core=await (await retrieve('/proxy-import-core.mjs')).text();
 assert(core.includes('combineCatalog')&&core.includes('loadDeckDocument'),'Live import helpers are missing');
 const css=await (await retrieve('/proxy-import.css')).text();
 assert(css.includes('#proxyImporter'),'Live CSS missing');
 const image=await retrieve('/assets/card-art/DLR/138.png');
 assert(image.headers.get('content-type')?.includes('image/'),'Live English Rayquaza #138 image missing');
 const homepage=await (await retrieve('/')).text();
 assert(homepage.includes('proxy-workshop.html'),'Toolbelt homepage does not link to Proxy Workshop');
 console.log('PASS: Live Cloudflare Worker serves Phase 2 Workshop, native importer, catalogue bridge, styles, English Rayquaza artwork and homepage link.');
}
let last;
for(let attempt=1;attempt<=24;attempt++){
 try{await verify();process.exit(0)}catch(error){last=error;console.log('Live deployment check '+attempt+'/24: '+error.message);if(attempt<24)await sleep(10000)}
}
console.error('FAILED: Production Worker was not verified: '+last?.message);
process.exit(1);
