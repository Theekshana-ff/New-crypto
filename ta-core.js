(function(root){
// 26 indicators (11 oscillators + 15 moving averages) -> buy / sell / neutral, like a technical rating gauge
const NaNs=n=>Array(n).fill(NaN),ok=x=>x!=null&&!isNaN(x);
const sma=(a,n)=>a.map((_,i)=>{if(i<n-1)return NaN;let s=0;for(let j=i-n+1;j<=i;j++){if(!ok(a[j]))return NaN;s+=a[j]}return s/n});
function ema(a,n){const o=NaNs(a.length),s=a.findIndex(ok);if(s<0||a.length-s<n)return o;const k=2/(n+1);let p=0;for(let i=s;i<s+n;i++)p+=a[i];p/=n;o[s+n-1]=p;for(let i=s+n;i<a.length;i++){p=a[i]*k+p*(1-k);o[i]=p}return o}
function wma(a,n){return a.map((_,i)=>{if(i<n-1)return NaN;let s=0,w=0;for(let j=0;j<n;j++){const v=a[i-n+1+j];if(!ok(v))return NaN;s+=v*(j+1);w+=j+1}return s/w})}
function rsi(c,n=14){const o=NaNs(c.length);if(c.length<=n)return o;let g=0,l=0;for(let i=1;i<=n;i++){const d=c[i]-c[i-1];d>0?g+=d:l-=d}g/=n;l/=n;o[n]=l===0?100:100-100/(1+g/l);
 for(let i=n+1;i<c.length;i++){const d=c[i]-c[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n;o[i]=l===0?100:100-100/(1+g/l)}return o}
const hh=(a,i,n)=>Math.max(...a.slice(i-n+1,i+1)),ll=(a,i,n)=>Math.min(...a.slice(i-n+1,i+1));
function stoch(v,hi,lo,n){const raw=v.map((x,i)=>{if(i<n-1||!ok(x))return NaN;const H=hi?hh(hi,i,n):hh(v,i,n),L=lo?ll(lo,i,n):ll(v,i,n);return H===L?50:(x-L)/(H-L)*100});const k=sma(raw,3);return{k,d:sma(k,3)}}
function adx(h,l,c,n=14){const L=c.length,pdi=NaNs(L),mdi=NaNs(L),ax=NaNs(L);if(L<2*n+2)return{adx:ax,pdi,mdi};let tr=0,pd=0,md=0;const dx=[];
 for(let i=1;i<L;i++){const up=h[i]-h[i-1],dn=l[i-1]-l[i],t=Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1])),p=up>dn&&up>0?up:0,m=dn>up&&dn>0?dn:0;
  if(i<=n){tr+=t;pd+=p;md+=m}else{tr=tr-tr/n+t;pd=pd-pd/n+p;md=md-md/n+m}
  if(i>=n){pdi[i]=100*pd/tr;mdi[i]=100*md/tr;dx[i]=100*Math.abs(pdi[i]-mdi[i])/((pdi[i]+mdi[i])||1)}}
 let a=0;for(let i=n;i<2*n;i++)a+=dx[i];a/=n;ax[2*n-1]=a;for(let i=2*n;i<L;i++){a=(a*(n-1)+dx[i])/n;ax[i]=a}return{adx:ax,pdi,mdi}}
const lastTwo=a=>{const n=a.length-1;return[a[n],a[n-1]]};
function rate(c){
 const cl=c.map(x=>x.close),hi=c.map(x=>x.high),lo=c.map(x=>x.low),vo=c.map(x=>x.vol||0),n=c.length-1,P=cl[n],items=[],add=(name,s)=>items.push({name,s});
 // oscillators
 const r=lastTwo(rsi(cl)),st=stoch(cl,hi,lo,14),cci=(()=>{const tp=c.map(x=>(x.high+x.low+x.close)/3),m=sma(tp,20);return tp.map((v,i)=>{if(!ok(m[i]))return NaN;let d=0;for(let j=i-19;j<=i;j++)d+=Math.abs(tp[j]-m[i]);return(v-m[i])/(0.015*(d/20)||1)})})(),
  cc=lastTwo(cci),ad=adx(hi,lo,cl),md=c.map(x=>(x.high+x.low)/2),ao=sma(md,5).map((v,i)=>v-sma(md,34)[i]),mom=cl.map((v,i)=>i<10?NaN:v-cl[i-10]),
  e12=ema(cl,12),e26=ema(cl,26),macd=e12.map((v,i)=>v-e26[i]),sig=ema(macd,9),rs=rsi(cl),srs=stoch(rs,null,null,14),
  wr=cl.map((v,i)=>i<13?NaN:(hh(hi,i,14)-v)/((hh(hi,i,14)-ll(lo,i,14))||1)*-100),e13=ema(cl,13);
 add('RSI(14)',r[0]<30&&r[0]>r[1]?1:r[0]>70&&r[0]<r[1]?-1:0);
 add('Stochastic %K',st.k[n]<20&&st.d[n]<20&&st.k[n]>st.d[n]?1:st.k[n]>80&&st.d[n]>80&&st.k[n]<st.d[n]?-1:0);
 add('CCI(20)',cc[0]<-100&&cc[0]>cc[1]?1:cc[0]>100&&cc[0]<cc[1]?-1:0);
 add('ADX(14)',ad.adx[n]>20&&ad.pdi[n]>ad.mdi[n]?1:ad.adx[n]>20&&ad.mdi[n]>ad.pdi[n]?-1:0);
 add('Awesome Osc.',ao[n]>0&&ao[n]>ao[n-1]?1:ao[n]<0&&ao[n]<ao[n-1]?-1:0);
 add('Momentum(10)',mom[n]>mom[n-1]?1:mom[n]<mom[n-1]?-1:0);
 add('MACD(12,26)',macd[n]>sig[n]?1:macd[n]<sig[n]?-1:0);
 add('Stoch RSI',srs.k[n]<20&&srs.d[n]<20&&srs.k[n]>srs.d[n]?1:srs.k[n]>80&&srs.d[n]>80&&srs.k[n]<srs.d[n]?-1:0);
 add('Williams %R',wr[n]<-80&&wr[n]>wr[n-1]?1:wr[n]>-20&&wr[n]<wr[n-1]?-1:0);
 const bull=hi[n]-e13[n],bear=lo[n]-e13[n],bull1=hi[n-1]-e13[n-1],bear1=lo[n-1]-e13[n-1];
 add('Bull Bear Power',e13[n]>e13[n-1]&&bear<0&&bear>bear1?1:e13[n]<e13[n-1]&&bull>0&&bull<bull1?-1:0);
 const bp=cl.map((v,i)=>i?v-Math.min(lo[i],cl[i-1]):NaN),trr=cl.map((v,i)=>i?Math.max(hi[i],cl[i-1])-Math.min(lo[i],cl[i-1]):NaN),sm=(a,k)=>{let s=0;for(let j=n-k+1;j<=n;j++)s+=a[j];return s},
  uo=100*(4*sm(bp,7)/sm(trr,7)+2*sm(bp,14)/sm(trr,14)+sm(bp,28)/sm(trr,28))/7;
 add('Ultimate Osc.',uo>70?1:uo<30?-1:0);
 // moving averages
 for(const k of[10,20,30,50,100,200]){const s=sma(cl,k)[n],e=ema(cl,k)[n];add('SMA '+k,!ok(s)?0:P>s?1:P<s?-1:0);add('EMA '+k,!ok(e)?0:P>e?1:P<e?-1:0)}
 const ten=(hh(hi,n,9)+ll(lo,n,9))/2,kij=(hh(hi,n,26)+ll(lo,n,26))/2;add('Ichimoku base',P>kij&&ten>kij?1:P<kij&&ten<kij?-1:0);
 let pv=0,vv=0;for(let j=n-19;j<=n;j++){pv+=cl[j]*vo[j];vv+=vo[j]}const vw=vv?pv/vv:NaN;add('VWMA(20)',!ok(vw)?0:P>vw?1:P<vw?-1:0);
 const hm=wma(cl.map((_,i)=>2*wma(cl,4)[i]-wma(cl,9)[i]),3);add('Hull MA(9)',hm[n]>hm[n-1]?1:hm[n]<hm[n-1]?-1:0);
 const buy=items.filter(x=>x.s>0).length,sell=items.filter(x=>x.s<0).length,neu=items.length-buy-sell,score=(buy-sell)/items.length;
 return{buy,sell,neutral:neu,total:items.length,score,label:score<=-0.5?'Strong Sell':score<-0.1?'Sell':score<=0.1?'Neutral':score<0.5?'Buy':'Strong Buy',items};
}
root.TA={rate,sma,ema};if(typeof module!=='undefined')module.exports=root.TA;
})(typeof window!=='undefined'?window:globalThis);
