(function(root){
const atrOf=(c,n)=>{let s=0,k=0;for(let i=Math.max(1,c.length-n);i<c.length;i++){s+=Math.max(c[i].high-c[i].low,Math.abs(c[i].high-c[i-1].close),Math.abs(c[i].low-c[i-1].close));k++}return s/k||0};
function analyze(c,L=4){
 const n=c.length,atr=atrOf(c,50),piv=[];
 for(let i=L;i<n-L;i++){let h=1,l=1;for(let j=i-L;j<=i+L;j++){if(j===i)continue;
  if(j<i?c[j].high>=c[i].high:c[j].high>c[i].high)h=0;
  if(j<i?c[j].low<=c[i].low:c[j].low<c[i].low)l=0}
  if(h)piv.push({t:'H',i,p:c[i].high});if(l)piv.push({t:'L',i,p:c[i].low})}
 piv.sort((a,b)=>a.i-b.i);
 for(const p of piv){p.st='open';for(let j=p.i+1;j<n;j++){
  if(p.t==='H'&&c[j].high>p.p){p.at=j;p.st=c[j].close<p.p?'sweep':'broke';break}
  if(p.t==='L'&&c[j].low<p.p){p.at=j;p.st=c[j].close>p.p?'sweep':'broke';break}}}
 // BOS / CHoCH
 const ev=[];let trend=0,hi=null,lo=null,pi=0;
 for(let i=0;i<n;i++){
  while(pi<piv.length&&piv[pi].i+L<=i){const p=piv[pi++];if(p.t==='H')hi={...p,done:0};else lo={...p,done:0}}
  if(hi&&!hi.done&&c[i].close>hi.p){ev.push({k:trend===-1?'CHoCH':'BOS',d:1,p:hi.p,from:hi.i,to:i});hi.done=1;trend=1}
  if(lo&&!lo.done&&c[i].close<lo.p){ev.push({k:trend===1?'CHoCH':'BOS',d:-1,p:lo.p,from:lo.i,to:i});lo.done=1;trend=-1}}
 // Order blocks: last opposite candle at the origin of the break
 const obs=[];
 for(const e of ev){let m=e.from;
  for(let j=e.from;j<=e.to;j++)if(e.d===1?c[j].low<c[m].low:c[j].high>c[m].high)m=j;
  let k=m;for(let j=m;j>=Math.max(0,m-3);j--){if(e.d===1?c[j].close<c[j].open:c[j].close>c[j].open){k=j;break}}
  const o={d:e.d,i:k,top:c[k].high,bot:c[k].low,mit:0,k:e.k};
  for(let j=e.to+1;j<n;j++)if(e.d===1?c[j].close<o.bot:c[j].close>o.top){o.mit=1;o.end=j;break}
  obs.push(o)}
 // Fair value gaps
 const fvg=[],g=atr*0.25;
 for(let i=2;i<n;i++){
  if(c[i].low-c[i-2].high>g)fvg.push({d:1,i:i-1,top:c[i].low,bot:c[i-2].high,mit:0});
  if(c[i-2].low-c[i].high>g)fvg.push({d:-1,i:i-1,top:c[i-2].low,bot:c[i].high,mit:0})}
 for(const f of fvg)for(let j=f.i+2;j<n;j++)if(f.d===1?c[j].close<f.bot:c[j].close>f.top){f.mit=1;f.end=j;break}
 // Liquidity: equal highs/lows + sweeps
 const liq=[];
 for(const t of ['H','L']){const ps=piv.filter(p=>p.t===t&&p.st!=='broke');
  for(let a=0;a<ps.length;a++)for(let b=a+1;b<ps.length;b++)if(Math.abs(ps[a].p-ps[b].p)<atr*0.25&&ps[b].i-ps[a].i>=3){
   liq.push({t,p:t==='H'?Math.max(ps[a].p,ps[b].p):Math.min(ps[a].p,ps[b].p),from:ps[a].i,st:ps[b].st,at:ps[b].at});break}}
 return{atr,piv,ev,obs,fvg,liq,trend,sweeps:piv.filter(p=>p.st==='sweep').slice(-5)};
}
function setup(c,A){
 const last=c[c.length-1].close,d=A.trend;if(!d)return null;
 let z=A.obs.filter(o=>!o.mit&&o.d===d&&(d===1?o.bot<last:o.top>last)).pop(),src='Order Block';
 if(!z){z=A.fvg.filter(f=>!f.mit&&f.d===d&&(d===1?f.bot<last:f.top>last)).pop();src='FVG'}
 if(!z)return{d,none:1};
 const entry=(z.top+z.bot)/2,sl=d===1?z.bot-A.atr*0.25:z.top+A.atr*0.25,risk=Math.abs(entry-sl);
 const lv=A.piv.filter(p=>p.st==='open'&&(d===1?p.t==='H'&&p.p>entry:p.t==='L'&&p.p<entry)).map(p=>p.p).sort((a,b)=>d*(a-b));
 const tps=[];
 for(const p of lv){const prev=tps.length?tps[tps.length-1].p:entry;
  if(tps.length<3&&Math.abs(p-entry)>=risk&&Math.abs(p-prev)>=risk*0.5)tps.push({p,s:'liquidity'})}
 for(const m of [1.5,3,4.5]){if(tps.length>=3)break;
  const p=entry+d*risk*m,prev=tps.length?tps[tps.length-1].p:entry;
  if(d*(p-prev)>risk*0.4)tps.push({p,s:'RR'})}
 tps.forEach(t=>t.rr=Math.abs(t.p-entry)/risk);
 return{d,src,z,entry,sl,tps,last,inside:last<=z.top&&last>=z.bot};
}
root.SMC={analyze,setup};if(typeof module!=='undefined')module.exports=root.SMC;
})(typeof window!=='undefined'?window:globalThis);
