(function(root){
const atrOf=(c,n)=>{let s=0,k=0;for(let i=Math.max(1,c.length-n);i<c.length;i++){s+=Math.max(c[i].high-c[i].low,Math.abs(c[i].high-c[i-1].close),Math.abs(c[i].low-c[i-1].close));k++}return s/k||0};
function analyze(c,L=4){
 const n=c.length,atr=atrOf(c,50),piv=[];
 for(let i=L;i<n-L;i++){let h=1,l=1;for(let j=i-L;j<=i+L;j++){if(j===i)continue;
  if(j<i?c[j].high>=c[i].high:c[j].high>c[i].high)h=0;
  if(j<i?c[j].low<=c[i].low:c[j].low<c[i].low)l=0}
  if(h)piv.push({t:'H',i,p:c[i].high});if(l)piv.push({t:'L',i,p:c[i].low})}
 piv.sort((a,b)=>a.i-b.i);
 // keep only meaningful swings: each swing must move at least k x local ATR from the previous one (removes noise pivots)
 const trs=c.map((x,i)=>i?Math.max(x.high-x.low,Math.abs(x.high-c[i-1].close),Math.abs(x.low-c[i-1].close)):x.high-x.low),atrAt=i=>{let a=0,m=0;for(let j=Math.max(0,i-13);j<=i;j++){a+=trs[j];m++}return a/m};
 const kS=L<=3?1:L<=5?1.5:L<=6?2:3,zz=[];
 for(const p of piv){const l=zz[zz.length-1];if(!l){zz.push(p);continue}
  if(l.t===p.t){if(p.t==='H'?p.p>l.p:p.p<l.p)zz[zz.length-1]=p;continue}
  if(Math.abs(p.p-l.p)>=kS*atrAt(p.i))zz.push(p)}
 const pivRaw=piv.slice();piv.length=0;zz.forEach(p=>piv.push(p));
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
  const o={d:e.d,i:k,top:c[k].high,bot:c[k].low,mit:0,k:e.k,to:e.to};
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
 // an order block must come with displacement (an impulse candle or a fair value gap) and not be oversized
 for(let k=obs.length-1;k>=0;k--){const o=obs[k];if(!(fvg.some(f=>f.d===o.d&&f.i>o.i&&f.i<=o.to)||c.slice(o.i+1,o.to+1).some(x=>(o.d===1?x.close-x.open:x.open-x.close)>=1.2*atr))||o.top-o.bot>3*atr)obs.splice(k,1)}
 // OB + FVG confluence
 for(const o of obs)o.conf=fvg.some(f=>!f.mit&&f.d===o.d&&f.bot<o.top&&f.top>o.bot&&f.i>=o.i-1&&f.i<=o.i+10);
 // IDM (inducement): last minor pullback inside the leg that made each break
 const p2=[];for(let i=2;i<n-2;i++){if([-2,-1,1,2].every(k=>c[i].high>c[i+k].high))p2.push({t:'H',i,p:c[i].high});if([-2,-1,1,2].every(k=>c[i].low<c[i+k].low))p2.push({t:'L',i,p:c[i].low})}
 const idm=[];
 for(const e of ev.slice(-6)){const q=p2.filter(p=>p.t===(e.d===1?'L':'H')&&p.i>e.from&&p.i<e.to).pop();if(!q)continue;
  let to=e.to;for(let j=q.i+1;j<=e.to;j++)if(e.d===1?c[j].low<q.p:c[j].high>q.p){to=j;break}
  idm.push({d:e.d,p:q.p,i:q.i,to:Math.max(to,q.i+1)})}
 const lastH=[...piv].reverse().find(p=>p.t==='H'),lastL=[...piv].reverse().find(p=>p.t==='L');let hh,ll;
 if(lastH&&lastL&&lastH.p>lastL.p){hh=lastH.p;ll=lastL.p}else{const w=c.slice(-100);hh=Math.max(...w.map(x=>x.high));ll=Math.min(...w.map(x=>x.low))}
 const sweepsAll=piv.filter(p=>p.st==='sweep');
 return{atr,piv,pivRaw,ev,obs,fvg,liq,idm,trend,range:{hh,ll,eq:(hh+ll)/2},sweepsAll,sweeps:sweepsAll.slice(-5)};
}
function setup(c,A){
 const last=c[c.length-1].close,d=A.trend;if(!d)return null;
 const side=z=>d===1?z.bot<last:z.top>last,pd=z=>d===1?(z.top+z.bot)/2<=A.range.eq:(z.top+z.bot)/2>=A.range.eq;
 const ob=A.obs.filter(o=>!o.mit&&o.d===d&&side(o)),fg=A.fvg.filter(f=>!f.mit&&f.d===d&&side(f));
 const t=[ob.filter(o=>o.conf&&pd(o)),ob.filter(pd),ob.filter(o=>o.conf),ob,fg.filter(pd),fg].find(x=>x.length);
 if(!t)return{d,none:1};
 const z=t[t.length-1],src=z.k?'Order Block':'FVG';
 const entry=(z.top+z.bot)/2,sl=d===1?z.bot-A.atr*0.25:z.top+A.atr*0.25,risk=Math.abs(entry-sl);
 if(Math.abs(last-entry)>8*A.atr)return{d,none:1,far:1};
 const lv=A.piv.filter(p=>p.st==='open'&&(d===1?p.t==='H'&&p.p>entry:p.t==='L'&&p.p<entry)).map(p=>p.p).sort((a,b)=>d*(a-b));
 const tps=[];
 for(const p of lv){const prev=tps.length?tps[tps.length-1].p:entry;
  if(tps.length<3&&Math.abs(p-entry)>=risk*1.5&&Math.abs(p-prev)>=risk*0.5)tps.push({p,s:'liquidity'})}
 for(const m of [1.5,3,4.5]){if(tps.length>=3)break;
  const p=entry+d*risk*m,prev=tps.length?tps[tps.length-1].p:entry;
  if(d*(p-prev)>risk*0.4)tps.push({p,s:'RR'})}
 tps.forEach(x=>x.rr=Math.abs(x.p-entry)/risk);
 const sw=A.sweepsAll.filter(x=>x.t===(d===1?'L':'H')&&x.at>=z.i-15).pop();
 return{d,src,z,entry,sl,tps,last,inside:last<=z.top&&last>=z.bot,conf:!!z.conf,pd:pd(z),sweep:!!sw,sweepAgo:sw?c.length-1-sw.at:0};
}
// Top-down: daily bias -> 4H sweep -> 1H OB -> 15M MSS
function topDown(D){
 const ago=(c,i)=>c.length-1-i,A1=analyze(D['1d']),dir=A1.trend,items=[],e1=A1.ev[A1.ev.length-1];
 items.push({tf:'1D',ok:!!dir,label:'Daily bias',detail:dir?`${dir>0?'Bullish':'Bearish'} · last ${e1.k} ${e1.d>0?'↑':'↓'}`:'No clear structure'});
 const c4=D['4h'],A4=analyze(c4),s4=dir?A4.sweepsAll.filter(s=>s.t===(dir>0?'L':'H')&&ago(c4,s.at)<=30).pop():null;
 items.push({tf:'4H',ok:!!s4,label:'Liquidity sweep',detail:s4?`${dir>0?'Sell-side':'Buy-side'} liquidity swept ${ago(c4,s4.at)} bars ago`:'No recent sweep in bias direction (last 30 bars)'});
 const c1=D['1h'],A1h=analyze(c1),last=c1[c1.length-1].close,ob=dir?A1h.obs.filter(o=>!o.mit&&o.d===dir).pop():null;
 const near=!!ob&&(dir>0?last<=ob.top*1.003:last>=ob.bot*0.997);
 items.push({tf:'1H',ok:near,label:'Order Block',detail:ob?`${dir>0?'Bullish':'Bearish'} OB ${ob.bot.toPrecision(6)} – ${ob.top.toPrecision(6)} · ${near?'price at zone':'waiting for pullback'}`:'No unmitigated OB in bias direction'});
 const c15=D['15m'],A15=analyze(c15,5),e=dir?A15.ev.filter(x=>x.d===dir&&ago(c15,x.to)<=24).pop():null;
 items.push({tf:'15M',ok:!!e,label:'MSS / entry trigger',detail:e?`${e.k} ${e.d>0?'↑':'↓'} ${ago(c15,e.to)} bars ago`:'No structure shift in bias direction yet'});
 return{dir,items,score:items.filter(i=>i.ok).length,setup:setup(c1,A1h)};
}
// Setup quality: confluence, sweep, premium/discount, zone type, top-down alignment (max 10)
function grade(T,td){if(!T||T.none)return null;
 const al=!!td&&td.dir===T.d,pts=(T.conf?2:0)+(T.sweep?2:0)+(T.pd?1:0)+(T.src==='Order Block'?1:0)+(al?td.score:0);
 return{g:pts>=8?'A+':pts>=6?'A':pts>=4?'B':'C',pts,max:10,aligned:al}}
// Status of a saved setup, c = candles after it was saved
function evalSaved(s,c){
 const long=s.d===1;let st='pending',hit=0;
 for(const k of c){const lo=k.low,hi=k.high,en=long?lo<=s.entry:hi>=s.entry,slh=long?lo<=s.sl:hi>=s.sl;
  if(st==='pending'){if(en){st='entered';if(slh){st='sl';break}continue}
   if(long?hi>=s.tps[0]:lo<=s.tps[0]){st='missed';break}}
  else{if(slh){st='sl';break}s.tps.forEach((p,i)=>{if(long?hi>=p:lo<=p)hit=Math.max(hit,i+1)})}}
 if(hit&&st==='entered')st='tp';
 return{st,hit};
}
// Walk-forward backtest (no look-ahead). Modes: 0 = exit all at TP1, 1 = managed (50% at TP1, stop to breakeven, runner to TP2), 2 = stats (TP reach before original SL)
function sim(S,c,t,mg){
 const long=S.d===1,rr=S.tps.map(x=>x.rr);let fill=-1,hit=0,stop=S.sl;const out=(h,R,sl)=>({hit:h,R,sl,strong:!!S.conf});
 for(let j=t+1;j<Math.min(c.length,t+400);j++){const k=c[j],lo=k.low,hi=k.high;
  if(fill<0){if(j>t+60)return null;
   if(long?lo<=S.entry:hi>=S.entry){fill=j;if(long?lo<=S.sl:hi>=S.sl)return out(0,-1,1)}
   else if(long?hi>=S.tps[0].p:lo<=S.tps[0].p)return null;
   continue}
  if(long?lo<=stop:hi>=stop)return hit?out(hit,mg===1?0.5*rr[0]:rr[0],0):out(0,-1,1);
  S.tps.forEach((q,i)=>{if(long?hi>=q.p:lo<=q.p)hit=Math.max(hit,i+1)});
  if(mg===1&&hit>=1)stop=S.entry;
  if(mg===1?hit>=2:mg===0?hit>=1:hit>=3)return out(hit,mg===1?0.5*rr[0]+0.5*rr[1]:rr[0],0)}
 return mg===2&&hit?out(hit,rr[0],0):null;
}
function backtest(c,step=4,gen){
 const seen=new Set(),rows=[];
 for(let t=150;t<c.length-5;t+=step){
  const sl=c.slice(0,t+1),A=analyze(sl),S=gen?gen(sl,A):setup(sl,A);
  if(!S||S.none)continue;const key=S.key||(S.d+'_'+S.z.i);if(seen.has(key))continue;seen.add(key);
  const a=sim(S,c,t,2);if(a)rows.push({a,u:sim(S,c,t,0),m:sim(S,c,t,1)})}
 const A=rows.map(r=>r.a),U=rows.map(r=>r.u).filter(Boolean),M=rows.map(r=>r.m).filter(Boolean),sm=l=>l.reduce((x,r)=>x+r.R,0),st=A.filter(r=>r.strong);
 return{setups:seen.size,filled:A.length,resolved:A.length,wins:A.filter(r=>r.hit>=1).length,tp2:A.filter(r=>r.hit>=2).length,tp3:A.filter(r=>r.hit>=3).length,losses:A.filter(r=>!r.hit).length,
  sU:sm(U),nU:U.length,sM:sm(M),nM:M.length,exp:U.length?sm(U)/U.length:0,expM:M.length?sm(M)/M.length:0,strongN:st.length,strongWin:st.filter(r=>r.hit>=1).length};
}
function mergeStats(l){const s=l.reduce((a,r)=>{for(const k of['setups','filled','resolved','wins','tp2','tp3','losses','sU','nU','sM','nM','strongN','strongWin'])a[k]=(a[k]||0)+r[k];return a},{});
 s.exp=s.nU?s.sU/s.nU:0;s.expM=s.nM?s.sM/s.nM:0;return s}
root.SMC={analyze,setup,topDown,grade,evalSaved,backtest,mergeStats,sim};if(typeof module!=='undefined')module.exports=root.SMC;
})(typeof window!=='undefined'?window:globalThis);
