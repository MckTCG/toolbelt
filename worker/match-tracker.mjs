// Toolbelt Match Tracker backend. Single-owner, secret-gated API; do not embed
// MATCH_TRACKER_TOKEN in client code or commit it to Git.
const PREFIX='/api/match-tracker';
const MAX_BODY=1024*1024; // 1 MiB upper bound for one match JSON request.
const MAX_LOG=750000;
const allowed={
  source:new Set(['ptcgl','manual','simulator']),
  matchType:new Set(['ladder','testing','tournament','casual']),
  format:new Set(['bo1','bo3']),
  result:new Set(['win','loss','tie'])
};
const fields=['id','created_at','played_at','source','match_type','format','result',
 'my_player','opponent_player','my_deck','my_deck_version','opponent_deck',
 'went_first','session_name','notes','raw_log','log_hash','deck_snapshot_json','parsed_json'];
const summaries=fields.filter(x=>!['raw_log','deck_snapshot_json','parsed_json'].includes(x));
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
function err(message,status){return json({error:message},status)}
const s=(v,max=160)=>typeof v==='string'?v.slice(0,max):'';
function validDate(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().startsWith(v)}
function validUTC(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&!Number.isNaN(Date.parse(v))}
function isUUID(v){return typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)}
async function digest(str){const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));return Array.from(new Uint8Array(buf),x=>x.toString(16).padStart(2,'0')).join('')}
async function constantTimeToken(a,b){
 const [x,y]=await Promise.all([digest(a),digest(b)]);
 let diff=0;for(let i=0;i<x.length;i++)diff|=x.charCodeAt(i)^y.charCodeAt(i);
 return diff===0;
}
async function readJSON(req){
 const length=Number(req.headers.get('Content-Length')||0);
 if(length>MAX_BODY)throw new Error('Payload exceeds 1 MiB');
 const content=await req.text();
 if(content.length>MAX_BODY)throw new Error('Payload exceeds 1 MiB');
 try{return JSON.parse(content)}catch{throw new Error('Invalid JSON')}
}
async function prepare(record){
 if(!record||typeof record!=='object'||Array.isArray(record))throw new Error('Expected a match object');
 for(const [k,values] of Object.entries(allowed)){
  if(!values.has(record[k]))throw new Error('Invalid '+k);
 }
 if(!validDate(record.playedAt))throw new Error('Invalid playedAt date (YYYY-MM-DD)');
 if(record.wentFirst!==null&&record.wentFirst!==undefined&&typeof record.wentFirst!=='boolean')throw new Error('wentFirst must be true, false, or null');
 const rawLog=typeof record.rawLog==='string'?record.rawLog:'';
 if(rawLog.length>MAX_LOG)throw new Error('Battle log exceeds 750,000 characters');
 if(record.source==='ptcgl'&&!rawLog.trim())throw new Error('Paste the original PTCGL battle log');
 const snapshot=record.deckSnapshot==null?'':JSON.stringify(record.deckSnapshot);
 const parsed=JSON.stringify(record.parsed||{});
 if(snapshot.length>160000||parsed.length>120000)throw new Error('Deck snapshot or parsed data is too large');
 const id=isUUID(record.id)?record.id:crypto.randomUUID();
 const createdAt=validUTC(record.createdAt)?new Date(record.createdAt).toISOString():new Date().toISOString();
 const hash=rawLog.trim()?await digest(rawLog.replace(/\r\n/g,'\n').trim()):null;
 const values=[
  id,createdAt,record.playedAt,record.source,record.matchType,record.format,record.result,
  s(record.myPlayer),s(record.opponentPlayer),s(record.myDeck),s(record.myDeckVersion,80),
  s(record.opponentDeck),record.wentFirst==null?null:record.wentFirst?1:0,
  s(record.sessionName),s(record.notes,8000),rawLog,hash,snapshot,parsed
 ];
 return {id,values};
}
const selectAll=fields.join(',');
const selectSummary=summaries.join(',');
function map(row){
 if(!row)return null;
 return {
  id:row.id,createdAt:row.created_at,playedAt:row.played_at,source:row.source,
  matchType:row.match_type,format:row.format,result:row.result,
  myPlayer:row.my_player,opponentPlayer:row.opponent_player,
  myDeck:row.my_deck,myDeckVersion:row.my_deck_version,
  opponentDeck:row.opponent_deck,wentFirst:row.went_first==null?null:!!row.went_first,
  sessionName:row.session_name,notes:row.notes,
  ...(Object.hasOwn(row,'raw_log')?{rawLog:row.raw_log}:{}),
  ...(Object.hasOwn(row,'deck_snapshot_json')?{deckSnapshot:row.deck_snapshot_json?JSON.parse(row.deck_snapshot_json):null}:{}),
  ...(Object.hasOwn(row,'parsed_json')?{parsed:JSON.parse(row.parsed_json||'{}')}:{}),
 };
}
function page(url,max=100){
 const limit=Math.min(max,Math.max(1,Number.parseInt(url.searchParams.get('limit')||'50',10)||50));
 const offset=Math.max(0,Math.min(1000000,Number.parseInt(url.searchParams.get('offset')||'0',10)||0));
 return {limit,offset};
}
async function collection(db,url,full=false){
 const {limit,offset}=page(url,full?100:250);
 const filterDeck=s(url.searchParams.get('deck')||'');
 const where=filterDeck?' WHERE my_deck = ?':'';
 const args=filterDeck?[filterDeck]:[];
 const count=await db.prepare('SELECT COUNT(*) AS n FROM matches'+where).bind(...args).first();
 const data=await db.prepare('SELECT '+(full?selectAll:selectSummary)+' FROM matches'+where+' ORDER BY played_at DESC, created_at DESC, id DESC LIMIT ? OFFSET ?').bind(...args,limit,offset).all();
 return json({schemaVersion:1,total:count?.n||0,offset,limit,matches:(data.results||[]).map(map)});
}
async function stats(db){
 const totals=await db.prepare("SELECT result,COUNT(*) AS n FROM matches GROUP BY result").all();
 const byDeck=await db.prepare("SELECT my_deck,COUNT(*) AS total,SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) AS wins,SUM(CASE WHEN result='loss' THEN 1 ELSE 0 END) AS losses,SUM(CASE WHEN result='tie' THEN 1 ELSE 0 END) AS ties FROM matches GROUP BY my_deck ORDER BY total DESC LIMIT 200").all();
 const matchup=await db.prepare("SELECT my_deck,opponent_deck,COUNT(*) AS total,SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) AS wins,SUM(CASE WHEN result='loss' THEN 1 ELSE 0 END) AS losses,SUM(CASE WHEN result='tie' THEN 1 ELSE 0 END) AS ties FROM matches GROUP BY my_deck,opponent_deck ORDER BY total DESC LIMIT 400").all();
 const first=await db.prepare("SELECT went_first,result,COUNT(*) AS n FROM matches GROUP BY went_first,result").all();
 return json({schemaVersion:1,totals:totals.results||[],byDeck:byDeck.results||[],matchups:matchup.results||[],firstSecond:first.results||[]});
}
async function api(req,env,url){
 if(req.method==='GET'&&url.pathname===PREFIX+'/health')
  return json({configured:!!(env.MATCHES_DB&&env.MATCH_TRACKER_TOKEN),schemaVersion:1});
 if(!env.MATCHES_DB||!env.MATCH_TRACKER_TOKEN)return err('D1 database or MATCH_TRACKER_TOKEN not configured',503);
 const auth=req.headers.get('Authorization')||'';
 if(!auth.startsWith('Bearer ')||!(await constantTimeToken(auth.slice(7),env.MATCH_TRACKER_TOKEN)))return err('Unauthorized',401);
 const db=env.MATCHES_DB;
 if(req.method==='GET'&&url.pathname===PREFIX+'/matches')return collection(db,url);
 if(req.method==='GET'&&url.pathname===PREFIX+'/archive')return collection(db,url,true);
 if(req.method==='GET'&&url.pathname===PREFIX+'/stats')return stats(db);
 const match=url.pathname.match(/^\/api\/match-tracker\/matches\/([0-9a-f-]{36})$/i);
 if(match&&req.method==='GET'){
  const row=await db.prepare('SELECT '+selectAll+' FROM matches WHERE id = ?').bind(match[1]).first();
  return row?json({match:map(row)}):err('Match not found',404);
 }
 if(match&&req.method==='DELETE'){
  const outcome=await db.prepare('DELETE FROM matches WHERE id = ?').bind(match[1]).run();
  return json({deleted:!!outcome.meta?.changes});
 }
 if(req.method==='POST'&&url.pathname===PREFIX+'/matches'){
  let input,prepared;
  try{input=await readJSON(req);prepared=await prepare(input)}catch(e){return err(e.message,400)}
  try{
   const qs=fields.map(()=>'?').join(',');
   await db.prepare('INSERT INTO matches ('+selectAll+') VALUES ('+qs+')').bind(...prepared.values).run();
   return json({id:prepared.id,created:true},201);
  }catch(e){
   if(/UNIQUE|PRIMARY KEY|CONSTRAINT/i.test(String(e)))return err('Duplicate match ID or battle log',409);
   throw e;
  }
 }
 return err('Not found',404);
}
export default {
 async fetch(req,env){
  const url=new URL(req.url);
  if(url.pathname.startsWith(PREFIX+'/')||url.pathname===PREFIX){
   // Same-origin front end only. Authorization header also makes form-based CSRF impossible.
   const origin=req.headers.get('Origin');
   if(origin&&origin!==url.origin)return err('Cross-origin requests are not accepted',403);
   try{return await api(req,env,url)}catch(e){console.error('Match tracker API error',e);return err('Database request failed',500)}
  }
  return env.ASSETS.fetch(req);
 }
};
