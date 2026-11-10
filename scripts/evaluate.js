// Real-market evaluation (run in GitHub Actions): walks forward through real Binance candles, takes every setup the site would have shown
// (SMC, Fibonacci, each chart pattern) and measures what really happened (TP1 before SL, expectancy in R).
const fs=require('fs'),path=require('path'),root=path.join(__dirname,'..');
const SMC=require(path.join(root,'smc-core.js')),FIB=require(path.join(root,'fib-core.js')),PAT=require(path.join(root,'pat-core.js'));
const HOSTS=['https://data-api.binance.vision','https://api.binance.us','https://api.binance.com'];
const TFS=(process.env.TFS||'15m,1h,4h').split(','),NC=+process.env.COINS||30,STEP=+process.env.STEP||6;
const DEFAULT=['BTC','ETH','BNB','SOL','XRP','DOGE','ADA','AVAX','LINK','DOT','LTC','BCH','TRX','NEAR','UNI','ATOM','APT','ARB','OP','INJ','SUI','AAVE','FIL','ETC','XLM','HBAR','ICP','RUNE','FET','SEI'];
async function kl(sym,tf,lim=1000){for(const h of HOSTS){try{const r=await fetch(`${h}/api/v3/klines?symbol=${sym}USDT&interval=${tf}&limit=${lim}`);if(!r.ok)continue;const k=await r.json();
 if(Array.isArray(k)&&k.length>300)return k.map(x=>({time:Math.floor(x[0]/1000),open:+x[1],high:+x[2],low:+x[3],close:+x[4],vol:+x[5]}))}catch(e){}}return null}
async function coins(){try{for(const h of HOSTS){const r=await fetch(h+'/api/v3/ticker/24hr');if(!r.ok)continue;return(await r.json()).filter(t=>t.symbol.endsWith('USDT')&&!/UP|DOWN|USDC|FDUSD|TUSD|USDP|BUSD|EUR|^USD/.test(t.symbol)).sort((a,b)=>b.quoteVolume-a.quoteVolume).slice(0,NC).map(t=>t.symbol.replace('USDT',''))}}catch(e){}return DEFAULT.slice(0,NC)}
const agg={};const add=(name,a,u,m)=>{const g=agg[name]=agg[name]||{n:0,w:0,tp2:0,tp3:0,l:0,sU:0,nU:0,sM:0,nM:0};g.n++;if(a.hit>=1)g.w++;if(a.hit>=2)g.tp2++;if(a.hit>=3)g.tp3++;if(!a.hit)g.l++;if(u){g.sU+=u.R;g.nU++}if(m){g.sM+=m.R;g.nM++}};
(async()=>{
 const list=await coins();let series=0,candles=0;const t0=Date.now();console.log(`Evaluating ${list.length} coins x ${TFS.join(',')} (step ${STEP})`);
 for(const sym of list)for(const tf of TFS){const c=await kl(sym,tf);if(!c){console.log('no data',sym,tf);continue}series++;candles+=c.length;const seen=new Set();
  for(let t=150;t<c.length-5;t+=STEP){const sl=c.slice(0,t+1),A4=SMC.analyze(sl,/m$/.test(tf)?5:4),A6=SMC.analyze(sl,6),cand=[];
   const T=SMC.setup(sl,A4);if(T&&!T.none){cand.push({name:'SMC: OB/FVG zone',S:T,key:'S'+T.d+'_'+T.z.i});if(T.conf)cand.push({name:'SMC: OB+FVG confluence',S:T,key:'C'+T.d+'_'+T.z.i})}
   const F=FIB.fib(sl,A6,FIB.DEF);if(F&&!F.broken)cand.push({name:'Fibonacci 0.5-0.62 zone',S:F,key:'F'+F.d+'_'+F.leg.a.i});
   PAT.detect(sl,A6).filter(p=>p.dir&&p.tps).forEach(p=>cand.push({name:'Pattern: '+p.names[0],S:{d:p.dir,entry:p.entry,sl:p.sl,tps:p.tps,brk:p.brk},key:'P'+p.id}));
   for(const x of cand){if(seen.has(x.key))continue;seen.add(x.key);const a=SMC.sim(x.S,c,t,2);if(!a)continue;add(x.name,a,SMC.sim(x.S,c,t,0),SMC.sim(x.S,c,t,1))}}}
 const pc=(a,b)=>b?(a/b*100).toFixed(0)+'%':'-',sg=v=>(v>=0?'+':'')+v.toFixed(2),rows=Object.entries(agg).map(([k,g])=>({k,...g,eU:g.nU?g.sU/g.nU:0,eM:g.nM?g.sM/g.nM:0})).sort((a,b)=>b.n-a.n);
 const line=r=>`| ${r.k} | ${r.n} | ${pc(r.w,r.n)} | ${pc(r.tp2,r.n)} | ${pc(r.l,r.n)} | ${sg(r.eU)}R | ${sg(r.eM)}R | ${r.n<30?'few trades':r.eM>0.15?'✅ works':r.eM<0?'⚠ negative':'– weak'} |`;
 let md=`## Real-market evaluation\n${series} series (${list.length} coins × ${TFS.join('/')}), ${candles} candles, ${((Date.now()-t0)/60000).toFixed(1)} min. Setups taken at first appearance, no fees.\n\n| Method | Trades | TP1 before SL | TP2 | SL first | Exp. exit at TP1 | Exp. managed | Verdict |\n|---|---|---|---|---|---|---|---|\n`+rows.map(line).join('\n')+'\n';
 console.log(md);if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,md);
})().catch(e=>{console.error(e);process.exit(1)});
