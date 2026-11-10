#!/usr/bin/env node
// End-to-end cross-origin access check for the redirecting Cloudflare Worker.
// Critically, fetch() follows redirects: only FINAL response headers count.
import assert from 'node:assert/strict';
import {setTimeout as pause} from 'node:timers/promises';
const url = 'https://mute-dust-0d50.forcoin99.workers.dev/card-db.html';
const origin = 'https://taggerv1.pages.dev';
let last;
for (let attempt=1; attempt<=18; attempt++) {
  try {
    const response = await fetch(url, {
      headers: {'Origin': origin,'User-Agent':'TCG-Lab-Tagger-Live-CORS-QA/1.0'},
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(25000)
    });
    const allow = response.headers.get('access-control-allow-origin');
    console.log('Check '+attempt+': '+response.status+' '+response.url+' | final ACAO='+JSON.stringify(allow));
    assert(response.ok, 'Master DB HTTP '+response.status);
    assert(allow==='*' || allow===origin,'CORS missing on FINAL redirected response: '+JSON.stringify(allow));
    assert.equal(new URL(response.url).pathname,'/card-db','Expected Cloudflare clean-URL redirect to /card-db');
    const html=await response.text();
    assert(html.includes('DLR-141'),'Live Master DB does not contain Delta Reign #141');
    assert(html.includes('id="catalog"'),'Live Master DB catalogue script missing');
    console.log('PASS: final Worker response is accessible cross-origin from Tagger, with the complete DLR Master DB.');
    process.exit(0);
  } catch(error) {
    last=error;
    console.log('Live Tagger sync endpoint not yet ready: '+error.message);
    if(attempt<18)await pause(10000);
  }
}
console.error('FAIL: Live CORS endpoint not verified after 18 attempts: '+last?.message);
process.exit(1);
