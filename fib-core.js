(function(root){
// TradingView-style defaults (settings picture): 0, 0.5, 0.62, 1 on; others available
const COL={0:'#8a9bb0',0.25:'#8a9bb0',0.382:'#6ea8ff',0.5:'#e6edf3',0.62:'#f0b429',0.702:'#ff9f43',0.79:'#f0b429',1:'#8a9bb0'};
const DEF={zone:[0.5,0.62],levels:[0,0.25,0.382,0.5,0.62,0.702,0.79,1,-0.28,-0.62,4.236,1.272,1.414,2.272,2.414,2].map(r=>({r,on:[0,0.5,0.62,1].includes(r),col:COL[r]||(r<0?'#2ecc9a':'#b388ff')}))};
// swing leg: uptrend = swing low -> swing high, downtrend = swing high -> swing low
function leg(c,A){
 const H=A.piv.filter(p=>p.t==='H'),L=A.piv.filter(p=>p.t==='L');if(!H.length||!L.length)return null;
 const up=l=>{let b={i:l.i,p:c[l.i].high};for(let j=l.i;j<c.length;j++)if(c[j].high>=b.p)b={i:j,p:c[j].high};return{d:1,a:{i:l.i,p:l.p},b}};
 const dn=h=>{let b={i:h.i,p:c[h.i].low};for(let j=h.i;j<c.length;j++)if(c[j].low<=b.p)b={i:j,p:c[j].low};return{d:-1,a:{i:h.i,p:h.p},b}};
 const lh=H[H.length-1],ll=L[L.length-1];
 if(A.trend>0){const l=L.filter(p=>p.i<lh.i).pop();if(l)return up(l)}
 if(A.trend<0){const h=H.filter(p=>p.i<ll.i).pop();if(h)return dn(h)}
 return ll.i<lh.i?up(ll):dn(lh);
}
function fib(c,A,cfg){
 cfg=cfg||DEF;const g=leg(c,A);if(!g)return null;const{d,a,b}=g,R=Math.abs(b.p-a.p),last=c[c.length-1].close;if(!(R>0))return null;
 const pr=r=>d>0?b.p-r*R:b.p+r*R,z0=pr(cfg.zone[0]),z1=pr(cfg.zone[1]);
 const levels=cfg.levels.filter(l=>l.on).map(l=>({r:l.r,p:pr(l.r),col:l.col}));
 const zone={lo:Math.min(z0,z1),hi:Math.max(z0,z1)},entry=(z0+z1)/2,sl=d>0?a.p-A.atr*0.25:a.p+A.atr*0.25,risk=Math.abs(entry-sl);
 const tps=[pr(0),pr(-0.28),pr(-0.62)].map(p=>({p,rr:Math.abs(p-entry)/risk}));
 const state=last>zone.hi?'above':last<zone.lo?'below':'inside',broken=d>0?last<a.p:last>a.p;
 const conf=[...A.obs.filter(o=>!o.mit&&o.d===d).map(o=>({t:'OB',o})),...A.fvg.filter(f=>!f.mit&&f.d===d).map(o=>({t:'FVG',o}))].filter(x=>x.o.bot<zone.hi&&x.o.top>zone.lo).map(x=>x.t);
 return{d,leg:g,R,levels,zone,zr:cfg.zone,entry,sl,tps,last,state,broken,conf:[...new Set(conf)],small:R<A.atr*3};
}
root.FIB={fib,DEF};if(typeof module!=='undefined')module.exports=root.FIB;
})(typeof window!=='undefined'?window:globalThis);
