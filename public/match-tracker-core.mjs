// Match Tracker: conservative PTCGL text extractor and portable CSV helpers.
// The original log remains untouched. Never infer a result from incomplete evidence.
export function inspectBattleLog(source,myPlayer=''){
 const log=String(source||'');
 const lines=log.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const players=new Set();
 for(const line of lines){
  const draw=line.match(/^(.+?) drew 7 cards for the opening hand\./i);
  if(draw)players.add(draw[1]);
 }
 const first=lines.map(x=>x.match(/^(.+?) decided to go first\./i)).find(Boolean);
 const win=lines.map(x=>x.match(/^(.+?) (?:won the game|wins the game|won the match)[.!]?$/i)).find(Boolean);
 const lose=lines.map(x=>x.match(/^(.+?) (?:lost the game|conceded)[.!]?$/i)).find(Boolean);
 const turns=lines.filter(x=>/^.+?'s Turn$/i.test(x)).length;
 let result=null;
 if(myPlayer&&win)result=win[1]===myPlayer?'win':'loss';
 else if(myPlayer&&lose)result=lose[1]===myPlayer?'loss':'win';
 const wentFirst=myPlayer&&first?first[1]===myPlayer:null;
 const warnings=[];
 if(!players.size)warnings.push('No opening-hand players detected. Is this a full PTCGL log?');
 if(!myPlayer)warnings.push('Specify your player name to check the winner and turn order.');
 if(result===null)warnings.push('Result could not be verified automatically; select it manually.');
 return {players:[...players],firstPlayer:first?.[1]||'',winner:win?.[1]||'',turns,result,wentFirst,warnings};
}
function safeCell(x){
 let v=String(x??'');
 // Excel/Sheets formula injection: force values that begin with a formula prefix to text.
 if(/^[\s]*[=+\-@]/.test(v))v="'"+v;
 return '"'+v.replace(/"/g,'""')+'"';
}
export function makeCSV(rows,columns){
 return '\uFEFF'+columns.map(c=>safeCell(c[0])).join(',')+'\r\n'+rows.map(row=>columns.map(c=>safeCell(row[c[1]])).join(',')).join('\r\n')+'\r\n';
}
export function recordsCSV(records){
 return makeCSV(records,[
  ['ID','id'],['Played date','playedAt'],['Created at','createdAt'],['Source','source'],
  ['Match type','matchType'],['Format','format'],['Result','result'],['My player','myPlayer'],
  ['Opponent player','opponentPlayer'],['My deck','myDeck'],['Deck version','myDeckVersion'],
  ['Opponent deck','opponentDeck'],['Went first','wentFirst'],['Session','sessionName'],['Notes','notes']
 ]);
}
export function statsCSV(stats){
 const rows=(stats.matchups||[]).map(x=>({
  deck:x.my_deck,opponent:x.opponent_deck,games:x.total,wins:x.wins,losses:x.losses,ties:x.ties,
  winRate:x.total?((100*x.wins/x.total).toFixed(2)+'%'):'0%'
 }));
 return makeCSV(rows,[['My deck','deck'],['Opposing deck','opponent'],['Games','games'],['Wins','wins'],['Losses','losses'],['Ties','ties'],['Win rate','winRate']]);
}
