#!/usr/bin/env node
/**
 * Publish reviewed TEMP proposals into the shared, versioned catalogue.
 * Default is DRY RUN; runs only in a Git checkout, never in the web client.
 *
 * node scripts/publish-central-temp.mjs --proposal exported.json
 * node scripts/publish-central-temp.mjs --proposal exported.json --apply
 * node scripts/publish-central-temp.mjs --proposal exported.json --allow-updates --apply
 *
 * Review the diff and submit a GitHub PR. Never auto-merge or write main.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseCentralTemp,compareCentralProposal} from '../public/temp-central-core.mjs';
const args=process.argv.slice(2);
const flag=name=>args.includes(name);
const val=(name,fallback='')=>{const at=args.indexOf(name);return at>=0?args[at+1]||fallback:fallback};
const proposalFile=val('--proposal'),target=val('--catalog','public/data/temp-catalog-v1.json');
const reportFile=val('--report'),apply=flag('--apply'),updates=flag('--allow-updates');
if(flag('--help')||!proposalFile){
  console.log('Usage: node scripts/publish-central-temp.mjs --proposal PATH [--catalog PATH] [--report PATH] [--allow-updates] [--apply]');
  process.exitCode=proposalFile?0:2;
}else{
  const before=await fs.readFile(target,'utf8');
  const central=parseCentralTemp(JSON.parse(before));
  const proposal=JSON.parse(await fs.readFile(proposalFile,'utf8'));
  const outcome=compareCentralProposal(central,proposal,{allowUpdates:updates});
  const report={schema:'tcg-lab-central-temp-publish-report-v1',dry_run:!apply,
    baseline:{sets:central.sets.length,cards:central.cards.length},
    result:{sets:outcome.catalog.sets.length,cards:outcome.catalog.cards.length},
    changes:outcome.changes,issues:outcome.issues,
    note:'Only this TEMP catalogue file is eligible for modification; English Master DB and personal browser storage are never written.'};
  if(reportFile){await fs.mkdir(path.dirname(reportFile),{recursive:true});await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n')}
  console.log(JSON.stringify(report,null,2));
  if(!outcome.ok){
    console.error('Rejected central TEMP proposal. No catalogue changes written.');
    process.exitCode=1;
  }else if(apply&&outcome.changes.length){
    const updated={...outcome.catalog,updated_at:new Date().toISOString(),
      note:'Reviewed shared TEMP catalogue; provisional cards are not published English Master records.'};
    // Safe atomic replacement: validate once more before filesystem changes.
    parseCentralTemp(updated);
    const tmp=target+'.tmp-'+process.pid;
    try {
      await fs.writeFile(tmp,JSON.stringify(updated,null,2)+'\n');
      await fs.rename(tmp,target);
    }catch(e){await fs.rm(tmp,{force:true}).catch(()=>{});throw e}
    console.log('Applied '+outcome.changes.length+' reviewed TEMP record changes. Commit only on a feature branch; open a PR for merging.');
  }
}
