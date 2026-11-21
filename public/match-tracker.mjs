import {inspectBattleLog,recordsCSV,statsCSV} from './match-tracker-core.mjs';
const $=id=>document.getElementById(id);
let token='',page=0,total=0,pageRows=[],current=null,statistics=null;
const pageSize=50;
function status(id,message,type=''){const e=$(id);e.textContent=message;e.className='status '+type}
function dateToday(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
$('playedAt').value=dateToday();
function enabled(yes){
 for(const id of ['save','refresh','refreshStats','exportJson','exportCsv','exportTxt','statsCsv','restoreFile'])$(id).disabled=!yes;
 $('restore').disabled=!yes||!$('restoreFile').files.length;
}
async function request(path,options={}){
 const headers={Authorization:'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{})};
 let response;
 try{response=await fetch('/api/match-tracker'+path,{...options,headers,cache:'no-store'})}
 catch{throw Error('Unable to contact the Cloudflare Worker. Check the deployment.')}
 let payload={};
 try{payload=await response.json()}catch{throw Error('Server returned a non-JSON response. Has the Worker API been deployed?')}
 if(!response.ok)throw Error(payload.error||'Request failed ('+response.status+')');
 return payload;
}
async function checkConfiguration(){
 try{
  const r=await fetch('/api/match-tracker/health',{cache:'no-store'});
  const data=await r.json();
  if(!r.ok||!data.configured)status('authStatus','Cloud archive is not provisioned yet. Create the D1 database, bind it, and set the Worker secret.','error');
  else status('authStatus','Cloud D1 backend is configured. Enter your private access key to connect.');
 }catch{status('authStatus','The D1 API is not deployed yet. This is a staged interface, not connected storage.','error')}
}
$('connect').addEventListener('click',async()=>{
 const candidate=$('token').value;
 if(!candidate.trim()){status('authStatus','Enter the private access key.','error');return}
 token=candidate;
 try{
  await request('/matches?limit=1');
  $('token').value='';
  enabled(true);
  status('authStatus','Connected to your private Cloudflare D1 archive. Access key held only in tab memory.','good');
  await Promise.all([loadHistory(),loadStats()]);
 }catch(e){token='';enabled(false);status('authStatus',e.message,'error')}
});
$('disconnect').addEventListener('click',()=>{
 token='';$('token').value='';enabled(false);pageRows=[];statistics=null;total=0;renderHistory([]);
 status('authStatus','Disconnected. The access key was cleared from this tab.');
});
$('inspect').addEventListener('click',()=>{
 const log=$('rawLog').value;
 if(!log.trim()){status('parseStatus','Paste a log first.','error');return}
 const info=inspectBattleLog(log,$('myPlayer').value.trim());
 if(info.result)$('result').value=info.result;
 if(info.wentFirst!==null)$('wentFirst').value=String(info.wentFirst);
 if(info.players.length===2&&$('myPlayer').value.trim()&&!$('opponentPlayer').value){
  $('opponentPlayer').value=info.players.find(x=>x!==$('myPlayer').value.trim())||'';
 }
 status('parseStatus',[
  'Detected players: '+(info.players.join(' / ')||'not found'),
  'First player: '+(info.firstPlayer||'unknown'),
  'Winner: '+(info.winner||'unknown'),
  'Turn headings: '+info.turns,
  ...info.warnings
 ].join('\n'),info.warnings.length?'':'good');
});
function getPayload(){
 const playedAt=$('playedAt').value;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(playedAt))throw Error('Choose a valid played date.');
 if(!$('result').value)throw Error('Select a result.');
 const rawLog=$('rawLog').value,source=$('source').value;
 if(source==='ptcgl'&&!rawLog.trim())throw Error('PTCGL imports require the original battle log. Select Manual for games without a log.');
 return {
  playedAt,source,matchType:$('matchType').value,format:$('format').value,
  result:$('result').value,rawLog,
  wentFirst:$('wentFirst').value===''?null:$('wentFirst').value==='true',
  myPlayer:$('myPlayer').value.trim(),opponentPlayer:$('opponentPlayer').value.trim(),
  myDeck:$('myDeck').value.trim(),myDeckVersion:$('deckVersion').value.trim(),
  opponentDeck:$('opponentDeck').value.trim(),sessionName:$('sessionName').value.trim(),
  notes:$('notes').value,
  parsed:rawLog.trim()?inspectBattleLog(rawLog,$('myPlayer').value.trim()):{}
 };
}
$('save').addEventListener('click',async()=>{
 $('save').disabled=true;
 try{
  const saved=await request('/matches',{method:'POST',body:JSON.stringify(getPayload())});
  status('saveStatus','Saved to Cloudflare D1. ID: '+saved.id,'good');
  $('rawLog').value='';$('notes').value='';$('parseStatus').textContent='';
  page=0;await Promise.all([loadHistory(),loadStats()]);
 }catch(e){status('saveStatus',e.message,'error')}
 finally{$('save').disabled=!token}
});
$('clear').addEventListener('click',()=>{
 for(const id of ['myDeck','deckVersion','opponentDeck','myPlayer','opponentPlayer','sessionName','notes','rawLog'])$(id).value='';
 $('playedAt').value=dateToday();$('result').value='';$('wentFirst').value='';
 $('source').value='ptcgl';$('matchType').value='ladder';$('format').value='bo1';
 status('parseStatus','');status('saveStatus','');
});
function el(tag,content){const n=document.createElement(tag);if(content!==undefined)n.textContent=String(content);return n}
function rate(w,n){return n?(100*w/n).toFixed(1)+'%':'0.0%'}
async function loadStats(){
 if(!token)return;
 try{
  statistics=await request('/stats');
  const counts=Object.fromEntries((statistics.totals||[]).map(x=>[x.result,Number(x.n)||0]));
  const wins=counts.win||0,losses=counts.loss||0,ties=counts.tie||0,n=wins+losses+ties;
  $('games').textContent=n.toLocaleString();
  $('wins').textContent=wins+' / '+losses+' / '+ties;
  $('rate').textContent=rate(wins,n);
  const tbody=$('matchups');tbody.replaceChildren();
  for(const m of statistics.matchups||[]){
   const tr=el('tr');
   for(const value of [m.my_deck||'Unspecified',m.opponent_deck||'Unspecified',m.total,m.wins+'–'+m.losses+'–'+m.ties,rate(m.wins,m.total)])tr.append(el('td',value));
   tbody.append(tr);
  }
  if(!(statistics.matchups||[]).length){const tr=el('tr'),td=el('td','No saved games yet.');td.colSpan=5;tr.append(td);tbody.append(tr)}
  $('statsCsv').disabled=false;
 }catch(e){status('historyStatus','Statistics error: '+e.message,'error')}
}
function renderHistory(rows){
 pageRows=rows;
 const tbody=$('history');tbody.replaceChildren();
 for(const r of rows){
  const tr=el('tr');
  for(const value of [r.playedAt,r.myDeck||'Unspecified',r.opponentDeck||'Unspecified',r.result,r.wentFirst===null?'?':r.wentFirst?'Yes':'No'])tr.append(el('td',value));
  const td=el('td'),b=el('button','View');b.type='button';b.addEventListener('click',()=>showDetail(r.id));
  td.append(b);tr.append(td);tbody.append(tr);
 }
 if(!rows.length){const tr=el('tr'),td=el('td','No matching games.');td.colSpan=6;tr.append(td);tbody.append(tr)}
 $('pageText').textContent=total?((page*pageSize+1)+'–'+Math.min(total,(page+1)*pageSize)+' of '+total)+' games':'0 games';
 $('prev').disabled=!token||page===0;
 $('next').disabled=!token||(page+1)*pageSize>=total;
}
async function loadHistory(){
 if(!token)return;
 try{
  const data=await request('/matches?limit='+pageSize+'&offset='+(page*pageSize));
  total=data.total;renderHistory(data.matches||[]);
  status('historyStatus','Online archive ready. '+total+' total saved game(s).','good');
 }catch(e){status('historyStatus',e.message,'error')}
}
$('refresh').addEventListener('click',loadHistory);
$('refreshStats').addEventListener('click',loadStats);
$('prev').addEventListener('click',()=>{if(page>0){page--;loadHistory()}});
$('next').addEventListener('click',()=>{if((page+1)*pageSize<total){page++;loadHistory()}});
async function showDetail(id){
 try{
  const data=await request('/matches/'+id);current=data.match;
  $('detailTitle').textContent=(current.myDeck||'Unspecified')+' vs '+(current.opponentDeck||'Unspecified');
  $('detailMeta').textContent=current.playedAt+' · '+current.result+' · '+current.source+' · '+(current.sessionName||'No session')+(current.notes?' · '+current.notes:'');
  $('detailLog').textContent=current.rawLog||'(No original log: manually recorded game)';
  $('detail').showModal();
 }catch(e){status('historyStatus',e.message,'error')}
}
$('detailClose').addEventListener('click',()=>$('detail').close());
$('detailDownload').addEventListener('click',()=>{if(current)download('match-'+current.id+'.txt',current.rawLog||'','text/plain')});
$('detailDelete').addEventListener('click',async()=>{
 if(!current||!window.confirm('Permanently delete this game from D1? Export a backup first if necessary.'))return;
 try{await request('/matches/'+current.id,{method:'DELETE'});$('detail').close();current=null;await Promise.all([loadHistory(),loadStats()])}
 catch(e){status('historyStatus',e.message,'error')}
});
function download(name,content,type){
 const blob=new Blob([content],{type:type+';charset=utf-8'});
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function getArchive(){
 const matches=[];let offset=0,expected=null;
 while(expected===null||offset<expected){
  const part=await request('/archive?limit=100&offset='+offset);
  expected=part.total;
  matches.push(...(part.matches||[]));
  if(!(part.matches||[]).length)break;
  offset+=part.matches.length;
  status('historyStatus','Exporting '+matches.length+' / '+expected+' matches…');
 }
 if(matches.length!==expected)throw Error('Archive is incomplete ('+matches.length+' / '+expected+'). Retry export.');
 return matches;
}
async function exportAs(kind){
 const target=$('export'+kind);
 target.disabled=true;
 try{
  const rows=await getArchive();
  const day=dateToday();
  if(kind==='Json')download('toolbelt-matches-'+day+'.json',JSON.stringify({format:'toolbelt-match-tracker-backup',schemaVersion:1,exportedAt:new Date().toISOString(),matches:rows},null,2),'application/json');
  if(kind==='Csv')download('toolbelt-matches-'+day+'.csv',recordsCSV(rows),'text/csv');
  if(kind==='Txt')download('toolbelt-original-logs-'+day+'.txt',rows.filter(x=>x.rawLog).map(x=>'===== '+x.id+' · '+x.playedAt+' =====\n'+x.rawLog).join('\n\n'),'text/plain');
  status('historyStatus','Exported '+rows.length+' matches. Keep JSON backups in a safe place.','good');
 }catch(e){status('historyStatus',e.message,'error')}
 finally{target.disabled=!token}
}
for(const key of ['Json','Csv','Txt'])$('export'+key).addEventListener('click',()=>exportAs(key));
$('statsCsv').addEventListener('click',()=>{if(statistics)download('toolbelt-matchups-'+dateToday()+'.csv',statsCSV(statistics),'text/csv')});
$('printStats').addEventListener('click',()=>window.print());
$('restoreFile').addEventListener('change',()=>{$('restore').disabled=!token||!$('restoreFile').files.length});
$('restore').addEventListener('click',async()=>{
 const file=$('restoreFile').files[0];if(!file||!token)return;
 if(file.size>100*1024*1024){status('historyStatus','Archive exceeds 100 MiB; split into smaller files.','error');return}
 $('restore').disabled=true;
 try{
  const data=JSON.parse(await file.text());
  if(data.format!=='toolbelt-match-tracker-backup'||data.schemaVersion!==1||!Array.isArray(data.matches))throw Error('Invalid Toolbelt Match Tracker backup.');
  if(!window.confirm('Restore '+data.matches.length+' matches to your Cloudflare archive? Identical logs and IDs will be skipped.'))return;
  let added=0,skipped=0,failed=0;
  for(const m of data.matches){
   try{await request('/matches',{method:'POST',body:JSON.stringify(m)});added++}
   catch(e){if(/Duplicate/i.test(e.message))skipped++;else failed++}
   if((added+skipped+failed)%10===0)status('historyStatus','Restoring '+(added+skipped+failed)+' / '+data.matches.length+'…');
  }
  status('historyStatus','Restore finished. Added: '+added+'; duplicates skipped: '+skipped+'; failures: '+failed,failed?'error':'good');
  page=0;await Promise.all([loadHistory(),loadStats()]);
 }catch(e){status('historyStatus',e.message,'error')}
 finally{$('restore').disabled=!token||!$('restoreFile').files.length}
});
enabled(false);checkConfiguration();
