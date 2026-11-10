// Card Intake loupe. Viewing artwork never edits card records or browser storage.
import {safeHTTPS} from './card-intake-core.mjs';
export function setupCardLoupe() {
  const $=id=>document.getElementById(id);
  const dialog=$('cardLoupe'),stage=$('cardLoupeStage'),image=$('cardLoupeImage'),
        title=$('cardLoupeTitle'),percentage=$('cardLoupeZoom'),original=$('cardLoupeSource'),
        error=$('cardLoupeError');
  if(!dialog||!stage||!image)throw Error('Card loupe markup missing');
  let zoom=1,panX=0,panY=0,active=false,loadToken=0,pinch=null;
  const pointers=new Map();
  const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
  function clampPan(){
    const rect=stage.getBoundingClientRect();
    const bx=Math.max(0,(image.offsetWidth*zoom-rect.width)/2);
    const by=Math.max(0,(image.offsetHeight*zoom-rect.height)/2);
    panX=clamp(panX,-bx,bx);panY=clamp(panY,-by,by);
  }
  function paint(){
    clampPan();
    image.style.transform='translate3d('+panX+'px, '+panY+'px, 0) scale('+zoom+')';
    percentage.textContent=zoom===1?'Fit':Math.round(zoom*100)+'%';
    $('cardLoupeOut').disabled=zoom<=1;
    $('cardLoupeIn').disabled=zoom>=5;
    stage.classList.toggle('can-pan',zoom>1);
  }
  function zoomAt(next,clientX,clientY){
    next=clamp(Math.round(next*100)/100,1,5);
    if(next===zoom)return;
    const rect=stage.getBoundingClientRect(),old=zoom;
    const fx=clientX-(rect.left+rect.width/2),fy=clientY-(rect.top+rect.height/2);
    const factor=next/old;
    panX=fx-(fx-panX)*factor;panY=fy-(fy-panY)*factor;
    zoom=next;
    if(next===1){panX=0;panY=0}
    paint();
  }
  function fit(){zoom=1;panX=0;panY=0;paint()}
  function open(record){
    const url=safeHTTPS(record?.image_url);
    if(!url)return false;
    loadToken+=1;const token=loadToken;
    title.textContent=(String(record.name||'Card').trim()||'Card')+' · artwork';
    original.href=url;
    image.hidden=false;
    image.alt='Enlarged artwork: '+String(record.name||'Card');
    error.hidden=true;error.textContent='';
    image.onload=()=>{if(token!==loadToken)return;image.hidden=false;error.hidden=true;fit()};
    image.onerror=()=>{
      if(token!==loadToken)return;
      image.hidden=true;
      error.textContent='Artwork could not be loaded. Try Open original or verify the source link.';
      error.hidden=false;fit();
    };
    image.src=url;
    pointers.clear();pinch=null;active=true;fit();
    if(!dialog.open)dialog.showModal();
    $('cardLoupeClose').focus();
    return true;
  }
  function close(){if(dialog.open)dialog.close()}
  dialog.addEventListener('close',()=>{
    active=false;loadToken+=1;image.onload=null;image.onerror=null;
    image.removeAttribute('src');
    pointers.clear();pinch=null;zoom=1;panX=panY=0;
  });
  dialog.addEventListener('click',e=>{if(e.target===dialog)close()});
  $('cardLoupeClose').addEventListener('click',close);
  $('cardLoupeIn').addEventListener('click',()=>{
    const r=stage.getBoundingClientRect();zoomAt(zoom+0.5,r.left+r.width/2,r.top+r.height/2);
  });
  $('cardLoupeOut').addEventListener('click',()=>{
    const r=stage.getBoundingClientRect();zoomAt(zoom-0.5,r.left+r.width/2,r.top+r.height/2);
  });
  $('cardLoupeFit').addEventListener('click',fit);
  stage.addEventListener('wheel',e=>{
    if(!active)return;
    e.preventDefault();zoomAt(zoom+(e.deltaY<0?0.25:-0.25),e.clientX,e.clientY);
  },{passive:false});
  const center=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  stage.addEventListener('pointerdown',e=>{
    if(!active||(e.pointerType==='mouse'&&e.button!==0))return;
    e.preventDefault();
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    stage.setPointerCapture(e.pointerId);
    if(pointers.size>=2){
      const [a,b]=[...pointers.values()].slice(0,2);
      pinch={distance:Math.max(1,distance(a,b)),zoom,panX,panY,center:center(a,b)};
    }
  });
  stage.addEventListener('pointermove',e=>{
    if(!active||!pointers.has(e.pointerId))return;
    const before=pointers.get(e.pointerId);
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size>=2&&pinch){
      const [a,b]=[...pointers.values()].slice(0,2);
      const next=clamp(pinch.zoom*distance(a,b)/pinch.distance,1,5);
      const c=center(a,b),r=stage.getBoundingClientRect();
      const x0=pinch.center.x-(r.left+r.width/2),y0=pinch.center.y-(r.top+r.height/2);
      const x1=c.x-(r.left+r.width/2),y1=c.y-(r.top+r.height/2);
      zoom=next;panX=x1-(x0-pinch.panX)*(zoom/pinch.zoom);
      panY=y1-(y0-pinch.panY)*(zoom/pinch.zoom);paint();
    }else if(zoom>1){
      panX+=e.clientX-before.x;panY+=e.clientY-before.y;paint();
    }
  });
  const end=e=>{
    pointers.delete(e.pointerId);
    if(pointers.size<2)pinch=null;
    else {
      const [a,b]=[...pointers.values()].slice(0,2);
      pinch={distance:Math.max(1,distance(a,b)),zoom,panX,panY,center:center(a,b)};
    }
  };
  stage.addEventListener('pointerup',end);
  stage.addEventListener('pointercancel',end);
  stage.addEventListener('lostpointercapture',end);
  dialog.addEventListener('keydown',e=>{
    if(e.target?.tagName==='A')return;
    const r=stage.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
    if(e.key==='+'||e.key==='='){e.preventDefault();zoomAt(zoom+0.5,cx,cy)}
    else if(e.key==='-'){e.preventDefault();zoomAt(zoom-0.5,cx,cy)}
    else if(e.key==='0'){e.preventDefault();fit()}
  });
  window.addEventListener('resize',()=>{if(active)paint()});
  return {open,close};
}
