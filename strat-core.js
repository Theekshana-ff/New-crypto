// Enhanced Rule-based + Market Structure & Volume signal engine. Works only on CLOSED candles.
(function(root){
const NaNs=n=>Array(n).fill(NaN),ok=x=>x!=null&&!isNaN(x);

function ema(a,n){const o=NaNs(a.length);if(a.length<n)return o;const k=2/(n+1);let p=0;for(let i=0;i<n;i++)p+=a[i];p/=n;o[n-1]=p;for(let i=n;i<a.length;i++){p=a[i]*k+p*(1-k);o[i]=p}return o}

function rsi(c,n=14){const o=NaNs(c.length);if(c.length<=n)return o;let g=0,l=0;for(let i=1;i<=n;i++){const d=c[i]-c[i-1];d>0?g+=d:l-=d}g/=n;l/=n;o[n]=l===0?100:100-100/(1+g/l);
 for(let i=n+1;i<c.length;i++){const d=c[i]-c[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n;o[i]=l===0?100:100-100/(1+g/l)}return o}

function atr(h,l,c,n=14){const L=c.length,o=NaNs(L);if(L<=n)return o;let s=0;for(let i=1;i<=n;i++)s+=Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1]));let a=s/n;o[n]=a;
 for(let i=n+1;i<L;i++){a=(a*(n-1)+Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1])))/n;o[i]=a}return o}

function adxFull(h,l,c,n=14){const L=c.length,ax=NaNs(L),pdiArr=NaNs(L),mdiArr=NaNs(L);if(L<2*n+2)return{ax,pdi:pdiArr,mdi:mdiArr};let tr=0,pd=0,md=0;const dx=[];
 for(let i=1;i<L;i++){const up=h[i]-h[i-1],dn=l[i-1]-l[i],t=Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1])),p=up>dn&&up>0?up:0,m=dn>up&&dn>0?dn:0;
  if(i<=n){tr+=t;pd+=p;md+=m}else{tr=tr-tr/n+t;pd=pd-pd/n+p;md=md-md/n+m}
  if(i>=n){const pdi=100*pd/(tr||1),mdi=100*md/(tr||1);pdiArr[i]=pdi;mdiArr[i]=mdi;dx[i]=100*Math.abs(pdi-mdi)/((pdi+mdi)||1)}}
 let a=0;for(let i=n;i<2*n;i++)a+=dx[i];a/=n;ax[2*n-1]=a;for(let i=2*n;i<L;i++){a=(a*(n-1)+dx[i])/n;ax[i]=a}return{ax,pdi:pdiArr,mdi:mdiArr}}

function prep(rawC){
 const c=Array.isArray(rawC)&&rawC.length>2&&rawC[rawC.length-1].isClosed===false?rawC.slice(0,-1):rawC;
 const cl=c.map(x=>x.close),hi=c.map(x=>x.high),lo=c.map(x=>x.low),op=c.map(x=>x.open),vol=c.map(x=>x.vol||0);
 const dmi=adxFull(hi,lo,cl);
 return{
  n:c.length,cl,hi,lo,op,vol,t:c.map(x=>x.time),
  e9:ema(cl,9),e20:ema(cl,20),e21:ema(cl,21),e50:ema(cl,50),e200:ema(cl,200),
  vma:ema(vol,20),
  r:rsi(cl),atr:atr(hi,lo,cl),adx:dmi.ax,pdi:dmi.pdi,mdi:dmi.mdi
 };
}

function signal(P,i,g){
 if(i<15||!ok(P.e200[i])||!ok(P.atr[i])||!ok(P.r[i])||!ok(P.r[i-1]))return 0;
 const C=P.cl[i],O=P.op[i],H=P.hi[i],Lo=P.lo[i],E=P.e200[i],A=P.atr[i],rng=Math.max(H-Lo,1e-9);

 // 200 EMA Slope & HTF Structure Filter
 const slope=(E-P.e200[i-5])/A;
 const upTrend=C>E&&P.e50[i]>E&&slope>0.04;
 const dnTrend=C<E&&P.e50[i]<E&&slope<-0.04;

 // Micro-structure shift confirmation (closes above prior candle high / below prior candle low)
 const mssBull=C>P.hi[i-1]||C>P.e9[i];
 const mssBear=C<P.lo[i-1]||C<P.e9[i];

 // Candle Body & Rejection Quality
 const bullCandle=C>O&&(C-Lo)/rng>=0.55&&(H-C)/rng<0.35;
 const bearCandle=C<O&&(H-C)/rng>=0.55&&(C-Lo)/rng<0.35;

 // Volume Confirmation
 const hasVol=P.vma[i]>0,volOk=!hasVol||P.vol[i]>=P.vma[i]*0.9,volSpike=!hasVol||P.vol[i]>=P.vma[i]*1.25;

 // ADX Directional & Momentum Check
 const adxTrend=P.adx[i]>20&&(P.adx[i]>=P.adx[i-1]-0.5||P.adx[i]>28);
 const diBull=P.pdi[i]>P.mdi[i],diBear=P.mdi[i]>P.pdi[i];

 // 1. Trend Pullback (with EMA slope, candle rejection, RSI hook & micro-MSS)
 if(g.s==='pull'){
  const L=g.lvl;
  if(upTrend&&bullCandle&&mssBull&&P.r[i-1]<L&&P.r[i]>=L&&Lo<=P.e21[i]+A*0.5)return 1;
  if(dnTrend&&bearCandle&&mssBear&&P.r[i-1]>100-L&&P.r[i]<=100-L&&H>=P.e21[i]-A*0.5)return -1;
  return 0;
 }

 // 2. RSI Mean Reversion (Strictly aligned with 50 & 200 EMA trend + structure shift)
 if(g.s==='rev'){
  const L=g.lvl;
  if(upTrend&&bullCandle&&mssBull&&P.r[i-1]<L&&P.r[i]>=L)return 1;
  if(dnTrend&&bearCandle&&mssBear&&P.r[i-1]>100-L&&P.r[i]<=100-L)return -1;
  return 0;
 }

 // 3. Donchian Breakout (Requires Volume Spike, ADX Direction & Anti-Fakeout Close)
 if(g.s==='brk'){
  const N=g.n;if(i<N+1||!adxTrend||!volSpike)return 0;
  let h=-Infinity,l=Infinity;
  for(let j=i-N;j<i;j++){if(P.hi[j]>h)h=P.hi[j];if(P.lo[j]<l)l=P.lo[j]}
  if(C>h&&bullCandle&&diBull&&P.r[i]<72&&(H-Lo)<2.8*A&&(!g.f||upTrend))return 1;
  if(C<l&&bearCandle&&diBear&&P.r[i]>28&&(H-Lo)<2.8*A&&(!g.f||dnTrend))return -1;
  return 0;
 }

 // 4. EMA Cross + ADX Direction + Volume
 if(g.s==='ema'){
  const f=g.fs==='9-21'?P.e9:P.e20,s=g.fs==='9-21'?P.e21:P.e50;
  if(!ok(f[i-1])||!ok(s[i-1])||!ok(s[i])||!adxTrend||!volOk)return 0;
  if(f[i-1]<=s[i-1]&&f[i]>s[i]&&upTrend&&diBull&&bullCandle&&P.r[i]<68)return 1;
  if(f[i-1]>=s[i-1]&&f[i]<s[i]&&dnTrend&&diBear&&bearCandle&&P.r[i]>32)return -1;
  return 0;
 }

 // 5. Market Structure Break & Retest
 if(g.s==='structure'){
  if(!adxTrend||!volOk)return 0;
  const touchedEma20=Lo<=P.e20[i]+A*0.2&&C>P.e20[i];
  const touchedEma20Short=H>=P.e20[i]-A*0.2&&C<P.e20[i];
  if(upTrend&&diBull&&bullCandle&&touchedEma20&&P.r[i]>48&&P.r[i]<68&&C>P.hi[i-1])return 1;
  if(dnTrend&&diBear&&bearCandle&&touchedEma20Short&&P.r[i]<52&&P.r[i]>32&&C<P.lo[i-1])return -1;
  return 0;
 }

 return 0;
}

const plan=(P,i,g,d,entry)=>{
 const A=P.atr[i];
 let swingSL=entry-d*(g.k||1.5)*A;
 if(i>=5){
  let sLo=Infinity,sHi=-Infinity;
  for(let j=i-4;j<=i;j++){if(P.lo[j]<sLo)sLo=P.lo[j];if(P.hi[j]>sHi)sHi=P.hi[j]}
  const structDist=d>0?(entry-(sLo-0.35*A)):((sHi+0.35*A)-entry);
  if(structDist>=0.8*A&&structDist<=2.8*A)swingSL=entry-d*structDist;
 }
 const R=Math.max(Math.abs(entry-swingSL),0.5*A);
 return{entry,sl:entry-d*R,tp:entry+d*g.m*R,R};
};

function sim(c,P,i,g,d,fee,H){const n=c.length;if(i+1>=n)return null;const e=c[i+1].open,p=plan(P,i,g,d,e),cost=fee*e/p.R;let exit=Math.min(n-1,i+H);
 for(let j=i+1;j<=exit;j++){const hi=c[j].high,lo=c[j].low,sl=d>0?lo<=p.sl:hi>=p.sl,tp=d>0?hi>=p.tp:lo<=p.tp;
  if(sl)return{R:-1-cost,x:j};if(tp)return{R:g.m-cost,x:j}}
 return{R:(c[exit].close-e)*d/p.R-cost,x:exit}}

function backtest(c,P,g,fee,H){const out=[];let free=0;for(let i=210;i<c.length-1;i++){if(i<free)continue;const d=signal(P,i,g);if(!d)continue;const r=sim(c,P,i,g,d,fee,H);if(!r)continue;out.push({i,d,R:r.R});free=r.x+1}return out}

const name=g=>g.s==='pull'?`Trend pullback (RSI ${g.lvl})`:g.s==='rev'?`RSI dip/spike with 200 EMA trend (RSI ${g.lvl})`:g.s==='brk'?`Breakout of ${g.n}-candle range${g.f?' with trend':''}`:g.s==='structure'?`Structure EMA20 Bounce + Volume`:`EMA ${g.fs} cross`;

function grid(){const out=[],ks=[1.5,2.0,2.5],ms=[1.5,2,3];const base=[{s:'structure'}];
 for(const lvl of[35,40,45])base.push({s:'pull',lvl});for(const lvl of[25,30])base.push({s:'rev',lvl});
 for(const n of[20,55])for(const f of[0,1])base.push({s:'brk',n,f});for(const fs of['9-21','20-50'])base.push({s:'ema',fs});
 for(const b of base)for(const k of ks)for(const m of ms){const g={...b,k,m};g.id=Object.entries(g).filter(([x])=>x!=='id').map(([a,v])=>a+v).join('_');g.name=name(g);out.push(g)}return out}

root.STRAT={prep,signal,plan,sim,backtest,grid,name,H:60};if(typeof module!=='undefined')module.exports=root.STRAT;
})(typeof window!=='undefined'?window:globalThis);
