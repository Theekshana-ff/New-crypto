// File: fib-core.js
(function(root){
const COL={0:'#8a9bb0',0.25:'#8a9bb0',0.382:'#6ea8ff',0.5:'#e6edf3',0.62:'#f0b429',0.702:'#ff9f43',0.79:'#f0b429',1:'#8a9bb0'};
const DEF={zone:[0.5,0.62],levels:[0,0.25,0.382,0.5,0.62,0.702,0.79,1,-0.28,-0.62,4.236,1.272,1.414,2.272,2.414,2].map(r=>({r,on:[0,0.5,0.62,1].includes(r),col:COL[r]||(r<0?'#2ecc9a':'#b388ff')}))};
const CL=[0.382,0.5,0.62,0.79];
const zigzag=A=>{const z=[];for(const p of A.piv){const l=z[z.length-1];if(l&&l.t===p.t){if(p.t==='H'?p.p>l.p:p.p<l.p)z[z.length-1]=p}else z.push(p)}return z};
const levelPrices=(g,rs)=>{const R=Math.abs(g.b.p-g.a.p);return rs.map(r=>({r,p:g.d>0?g.b.p-r*R:g.b.p+r*R}))};

function leg(c,A){
 if(!Array.isArray(c)||c.length<10||!A||!A.piv)return null;
 const H=A.piv.filter(p=>p.t==='H'),L=A.piv.filter(p=>p.t==='L');if(!H.length||!L.length)return null;

 // Build impulse leg from anchor and verify whether origin was violated after peak
 const up=l=>{
  let b={i:l.i,p:c[l.i].high};
  for(let j=l.i;j<c.length;j++)if(c[j].high>=b.p)b={i:j,p:c[j].high};
  return{d:1,a:{i:l.i,p:l.p},b};
 };
 const dn=h=>{
  let b={i:h.i,p:c[h.i].low};
  for(let j=h.i;j<c.length;j++)if(c[j].low<=b.p)b={i:j,p:c[j].low};
  return{d:-1,a:{i:h.i,p:h.p},b};
 };
 const validUp=g=>{
  if(g.b.i<=g.a.i)return false;
  for(let j=g.b.i+1;j<c.length;j++)if(c[j].close<g.a.p)return false;
  return true;
 };
 const validDn=g=>{
  if(g.b.i<=g.a.i)return false;
  for(let j=g.b.i+1;j<c.length;j++)if(c[j].close>g.a.p)return false;
  return true;
 };

 const lh=H[H.length-1],ll=L[L.length-1];
 if(A.trend>0){
  const cands=L.filter(p=>p.i<lh.i).slice(-3).reverse();
  for(const l of cands){const g=up(l);if(validUp(g))return g}
  if(cands.length)return up(cands[0]);
 }
 if(A.trend<0){
  const cands=H.filter(p=>p.i<ll.i).slice(-3).reverse();
  for(const h of cands){const g=dn(h);if(validDn(g))return g}
  if(cands.length)return dn(cands[0]);
 }
 return ll.i<lh.i?up(ll):dn(lh);
}

function prevLeg(A,g){const z=zigzag(A),k=z.findIndex(p=>p.i===g.a.i);if(k<2||z[k-2].t!==z[k].t)return null;return{d:g.d,a:{i:z[k-2].i,p:z[k-2].p},b:{i:z[k-1].i,p:z[k-1].p}}}

// ov = manual leg override, extra = other legs' levels [{name,levels:[{r,p}]}] for cluster detection
function fib(c,A,cfg,ov,extra){
 if(!Array.isArray(c)||!c.length||!A)return null;
 cfg=cfg||DEF;const g=ov||leg(c,A);if(!g)return null;const{d,a,b}=g,R=Math.abs(b.p-a.p),last=c[c.length-1].close;if(!(R>0)||(!ov&&R<2.5*A.atr))return null;
 const pr=r=>d>0?b.p-r*R:b.p+r*R,z0=pr(cfg.zone[0]),z1=pr(cfg.zone[1]);
 const levels=cfg.levels.filter(l=>l.on).map(l=>({r:l.r,p:pr(l.r),col:l.col}));
 const zone={lo:Math.min(z0,z1),hi:Math.max(z0,z1)},entry=(z0+z1)/2;
 // Wider structure-safe SL buffer (0.55 ATR beyond leg origin to prevent stop-hunts)
 const sl=d>0?a.p-A.atr*0.55:a.p+A.atr*0.55,risk=Math.abs(entry-sl);
 const tps=[pr(0),pr(-0.28),pr(-0.62)].map(p=>({p,rr:Math.abs(p-entry)/risk}));

 // Direction-aware state:
 // 'above' = waiting for pullback into zone, 'inside' = in OTE zone, 'below' = overshot past zone toward SL
 const state=last>=zone.lo&&last<=zone.hi?'inside':(d>0?(last>zone.hi?'above':'below'):(last<zone.lo?'above':'below'));

 // Check if leg origin was broken after leg peak
 let broken=d>0?last<a.p:last>a.p;
 for(let j=b.i+1;j<c.length;j++){
  if(d>0?c[j].close<a.p:c[j].close>a.p){broken=true;break}
 }

 const conf=[...(A.obs||[]).filter(o=>!o.mit&&o.d===d).map(o=>({t:'OB',o})),...(A.fvg||[]).filter(f=>!f.mit&&f.d===d).map(o=>({t:'FVG',o}))].filter(x=>x.o.bot<zone.hi&&x.o.top>zone.lo).map(x=>x.t);
 const pl=ov?null:prevLeg(A,g),oth=[...(extra||[]),...(pl?[{name:'prev leg',levels:levelPrices(pl,CL)}]:[])],clusters=[];
 for(const m of levelPrices(g,CL))for(const o of oth){if(o.levels.some(x=>Math.abs(x.p-m.p)<A.atr*0.3)){clusters.push({r:m.r,p:m.p,with:o.name});break}}
 return{d,leg:g,R,levels,zone,zr:cfg.zone,entry,sl,tps,last,state,broken,conf:[...new Set(conf)],small:R<A.atr*3,aligned:A.trend===d,clusters,
  clusterInZone:clusters.some(x=>x.p>=zone.lo-A.atr*0.1&&x.p<=zone.hi+A.atr*0.1)};
}

// history: after price retraced at least to a level, how often did it make a new extreme before breaking the leg start
function reactions(c,A,d){
 const z=zigzag(A),out={0.5:{n:0,ok:0},0.62:{n:0,ok:0},0.79:{n:0,ok:0}};
 for(let k=0;k+2<z.length;k++){const a=z[k],b=z[k+1],e=z[k+2];if((d>0)!==(a.t==='L'))continue;
  const R=Math.abs(b.p-a.p);if(R<A.atr*3)continue;const pr=r=>d>0?b.p-r*R:b.p+r*R;
  let res=0;for(let j=b.i+1;j<Math.min(c.length,e.i+150);j++){if(d>0?c[j].low<a.p:c[j].high>a.p){res=-1;break}if(j>=e.i&&(d>0?c[j].high>b.p:c[j].low<b.p)){res=1;break}}
  if(!res)continue;
  for(const r of[0.5,0.62,0.79])if(d>0?e.p<=pr(r):e.p>=pr(r)){out[r].n++;if(res>0)out[r].ok++}}
 return out}

function grade(F,rx){if(!F)return null;const r=rx&&rx[0.62],good=!!r&&r.n>=4&&r.ok/r.n>=0.6;
 const pts=(F.conf.length?2:0)+(F.state==='inside'?2:0)+(F.aligned?2:0)+(F.broken?0:1)+(F.small?0:1)+(F.clusterInZone?1:0)+(good?1:0);
 return{g:pts>=8?'A+':pts>=6?'A':pts>=4?'B':'C',pts,max:10}}

root.FIB={fib,DEF,CL,levelPrices,reactions,grade};if(typeof module!=='undefined')module.exports=root.FIB;
})(typeof window!=='undefined'?window:globalThis);
