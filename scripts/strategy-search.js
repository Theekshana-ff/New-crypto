// Finds simple rule-based signals (strat-core.js) that work on REAL history, with fees, and writes strategy.json.
// Every rule is measured on three separate periods (train 50% / validation 25% / test 25%). A rule is enabled only if it is
// profitable in all three, has enough trades, is not carried by one or two coins, and is statistically convincing.
const fs=require('fs'),path=require('path'),root=path.join(__dirname,'..'),STRAT=require(path.join(root,'strat-core.js'));
const NC=+process.env.NCOINS||20,TFS=(process.env.TFS||'15m,1h,4h').split(',').map(s=>s.trim()).filter(Boolean),CANDLES=+process.env.CANDLES||3000,FEE=process.env.FEE?+process.env.FEE:0.0012;
const TOKEN=process.env.TELEGRAM_BOT_TOKEN,CHAT=process.env.TELEGRAM_CHAT_ID,HOSTS=['https://data-api.binance.vision','https://api.binance.us','https://api.binance.com'];
async function get(p){for(const h of HOSTS){try{const r=await fetch(h+p);if(r.ok)return await r.json()}catch(e){}}throw new Error('no data for '+p)}
async function klines(sym,tf,total){let out=[],end=Date.now();while(out.length<total){const k=await get(`/api/v3/klines?symbol=${sym}USDT&interval=${tf}&limit=1000&endTime=${end}`);if(!k.length)break;out=k.concat(out);end=k[0][0]-1;if(k.length<1000)break}
 return out.filter(x=>x[6]<=Date.now()).slice(-total).map(x=>({time:Math.floor(x[0]/1000),open:+x[1],high:+x[2],low:+x[3],close:+x[4],vol:+x[5]}))}
const st=a=>{const n=a.length,m=n?a.reduce((s,x)=>s+x,0)/n:0,sd=n>1?Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/(n-1)):0;return{n,m,t:sd?m/(sd/Math.sqrt(n)):0}};
const r2=x=>Math.round(x*100)/100,sg=x=>(x>=0?'+':'')+x.toFixed(2)+'R';
(async()=>{
 const coins=(await get('/api/v3/ticker/24hr')).filter(t=>t.symbol.endsWith('USDT')&&!/UP|DOWN|USDC|FDUSD|TUSD|USDP|BUSD|EUR|^USD/.test(t.symbol)).sort((a,b)=>b.quoteVolume-a.quoteVolume).slice(0,NC).map(t=>t.symbol.replace('USDT',''));
 const grid=STRAT.grid(),all=[],enabled=[];let tested=0;
 for(const tf of TFS){const charts=[];for(const sym of coins){try{const c=await klines(sym,tf,CANDLES);if(c.length>=700)charts.push({sym,c,P:STRAT.prep(c)})}catch(e){console.log('skip',sym,tf,e.message)}}
  console.log(`${tf}: ${charts.length} coins loaded`);
  for(const g of grid){tested++;const seg={tr:[],va:[],te:[]};let pos=0,cn=0,wins=0,total=0;
   for(const ch of charts){const tr=STRAT.backtest(ch.c,ch.P,g,FEE,STRAT.H);let s=0;for(const x of tr){const f=x.i/ch.c.length;(f<0.5?seg.tr:f<0.75?seg.va:seg.te).push(x.R);s+=x.R;if(x.R>0)wins++;total++}if(tr.length){cn++;if(s>0)pos++}}
   const A=st(seg.tr),B=st(seg.va),C=st(seg.te),VT=st([...seg.va,...seg.te]),spread=cn?pos/cn:0;
   const pass=A.n>=40&&B.n>=20&&C.n>=20&&A.m>0.03&&B.m>0.03&&C.m>0.03&&VT.t>=2&&spread>=0.55;
   const row={name:g.name,tf,cfg:g,stats:{trades:total,hitRate:total?r2(wins/total):0,expTrain:r2(A.m),expValidation:r2(B.m),expTest:r2(C.m),tVal:r2(VT.t),coinsPositive:r2(spread)},pass};all.push(row);if(pass)enabled.push(row)}}
 enabled.sort((a,b)=>(b.stats.expValidation+b.stats.expTest)-(a.stats.expValidation+a.stats.expTest));
 const top=enabled.slice(0,6).map(({pass,...x})=>x);
 const out={generated:new Date().toISOString(),coins,fee:FEE,candles:CANDLES,tested,enabled:top,note:top.length?'Rules passed train / validation / test with fees.':'No rule passed the real-data tests, so no strategy alerts are sent. That is a valid result.'};
 fs.writeFileSync(path.join(root,'strategy.json'),JSON.stringify(out,null,1));
 const best=[...all].sort((a,b)=>(b.stats.expValidation+b.stats.expTest)-(a.stats.expValidation+a.stats.expTest)).slice(0,5);
 const L=[`# Strategy search`,`${tested} rule settings tested on ${coins.length} coins × ${TFS.join('/')} (${CANDLES} candles each, fee ${(FEE*100).toFixed(2)}% round trip)`,'',`**Passed all tests: ${enabled.length}** (enabled: ${top.length})`,'',...top.map(e=>`- ✅ ${e.name} · ${e.tf} · SL ${e.cfg.k}×ATR, TP ${e.cfg.m}R · ${e.stats.trades} trades · train ${sg(e.stats.expTrain)} / val ${sg(e.stats.expValidation)} / test ${sg(e.stats.expTest)}`),'','Best even though not all passed:',...best.map(e=>`- ${e.pass?'✅':'✗'} ${e.name} · ${e.tf} · k${e.cfg.k} m${e.cfg.m} · ${e.stats.trades} trades · train ${sg(e.stats.expTrain)} / val ${sg(e.stats.expValidation)} / test ${sg(e.stats.expTest)} · t ${e.stats.tVal}`)];
 const md=L.join('\n');console.log('\n'+md);if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,md+'\n');
 if(TOKEN&&CHAT)await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:CHAT,text:md.replace(/[#*]/g,'').slice(0,3900)})}).catch(()=>{});
})().catch(e=>{console.error(e);process.exit(1)});
