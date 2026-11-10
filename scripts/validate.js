// Walk-forward validation on REAL market data (run it in GitHub Actions). For every coin / time frame it replays history candle by candle,
// takes the signals SMC, Fibonacci and Chart patterns would have given (using only past candles) and checks what happened next.
const fs=require('fs'),path=require('path'),root=path.join(__dirname,'..');
const SMC=require(path.join(root,'smc-core.js')),FIB=require(path.join(root,'fib-core.js')),PAT=require(path.join(root,'pat-core.js'));
const TFS=(process.env.TFS||'1h,4h').split(',').map(s=>s.trim()),TOTAL=+process.env.CANDLES||3000,NCOINS=+process.env.NCOINS||20,STEP=+process.env.STEP||6,WIN=500;
const HOSTS=['https://data-api.binance.vision','https://api.binance.us','https://api.binance.com'];
async function page(sym,tf,end){for(const h of HOSTS){try{const r=await fetch(`${h}/api/v3/klines?symbol=${sym}USDT&interval=${tf}&limit=1000`+(end?`&endTime=${end}`:''));if(!r.ok)continue;const k=await r.json();if(Array.isArray(k)&&k.length)return k}catch(e){}}return null}
async function history(sym,tf){let out=[],end=null;while(out.length<TOTAL){const k=await page(sym,tf,end);if(!k)break;out=k.concat(out);end=k[0][0]-1;if(k.length<1000)break}
 return out.slice(-TOTAL).map((x,i)=>({time:Math.floor(x[0]/1000),open:+x[1],high:+x[2],low:+x[3],close:+x[4],vol:+x[5]}))}
async function coins(){if(process.env.COINS)return process.env.COINS.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
 for(const h of HOSTS){try{const r=await fetch(h+'/api/v3/ticker/24hr');if(!r.ok)continue;return(await r.json()).filter(t=>t.symbol.endsWith('USDT')&&!/UP|DOWN|USDC|FDUSD|TUSD|USDP|BUSD|EUR|^USD/.test(t.symbol)).sort((a,b)=>b.quoteVolume-a.quoteVolume).slice(0,NCOINS).map(t=>t.symbol.replace('USDT',''))}catch(e){}}
 return['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','LINK','AVAX','LTC'].slice(0,NCOINS)}
const B={};const add=(key,a,u,m)=>{const b=B[key]=B[key]||{n:0,h1:0,h2:0,h3:0,sl:0,sU:0,sM:0};b.n++;if(a.hit>=1)b.h1++;if(a.hit>=2)b.h2++;if(a.hit>=3)b.h3++;if(!a.hit)b.sl++;b.sU+=u?u.R:a.R;b.sM+=m?m.R:a.R};
(async()=>{const list=await coins();console.log('coins:',list.join(','),'| time frames:',TFS.join(','),'| candles:',TOTAL);let series=0;
 for(const sym of list)for(const tf of TFS){let c;try{c=await history(sym,tf)}catch(e){continue}if(!c||c.length<WIN+100){console.log('skip',sym,tf);continue}series++;const seen=new Set();
  for(let t=WIN-1;t<c.length-60;t+=STEP){const w=c.slice(t-WIN+1,t+1),off=t-WIN+1,A4=SMC.analyze(w,/m$/.test(tf)?5:4),A6=SMC.analyze(w,6),sig=[];
   const T=SMC.setup(w,A4);if(T&&!T.none)sig.push({k:`SMC${T.d}_${off+T.z.i}`,m:'SMC',S:T,strong:!!T.conf,name:'SMC '+T.src});
   const F=FIB.fib(w,A6,FIB.DEF);if(F&&!F.broken)sig.push({k:`FIB${F.d}_${off+F.leg.a.i}`,m:'FIB',S:{d:F.d,entry:F.entry,sl:F.sl,tps:F.tps,conf:F.conf.length>0},strong:F.conf.length>0,name:'Fibonacci'});
   for(const p of PAT.detect(w,A6))if(p.dir&&p.tps&&!/breakout|breakdown/.test(p.status))sig.push({k:`PAT_${p.names[0]}_${off+p.start}`,m:'PAT',S:{d:p.dir,entry:p.entry,sl:p.sl,tps:p.tps,conf:false},name:p.names[0]});
   for(const s of sig){if(seen.has(s.k))continue;seen.add(s.k);
    const S={d:s.S.d,entry:s.S.entry,sl:s.S.sl,tps:s.S.tps,conf:s.S.conf},a=SMC.sim(S,c,t,2);if(!a)continue;const u=SMC.sim(S,c,t,0),m=SMC.sim(S,c,t,1);
    add('ALL',a,u,m);add('Method: '+s.m,a,u,m);add('Signal: '+s.name,a,u,m);add('Time frame: '+tf,a,u,m);add('Direction: '+(S.d>0?'long':'short'),a,u,m);if(s.strong)add('With OB/FVG confluence ('+s.m+')',a,u,m)}}
  process.stdout.write(`${sym} ${tf} done\n`)}
 const pc=(a,b)=>b?(a/b*100).toFixed(0)+'%':'-',sg=x=>(x>=0?'+':'')+x.toFixed(2),rows=Object.entries(B).filter(([k,b])=>k==='ALL'||b.n>=15).sort((x,y)=>(x[0]==='ALL'?-1:y[1].n-x[1].n));
 let md=`## Real-market validation\n${series} series (${list.length} coins x ${TFS.join('/')}), ${TOTAL} candles each, signals from past data only, fees and slippage not included.\n\n| Group | Trades | TP1 hit | TP2 | SL first | Exp. (all at TP1) | Exp. (managed) |\n|---|---|---|---|---|---|---|\n`;
 md+=rows.map(([k,b])=>`| ${k} | ${b.n} | ${pc(b.h1,b.n)} | ${pc(b.h2,b.n)} | ${pc(b.sl,b.n)} | ${sg(b.sU/b.n)}R | ${sg(b.sM/b.n)}R |`).join('\n');
 const bad=Object.entries(B).filter(([k,b])=>k.startsWith('Signal: ')&&b.n>=15&&b.sU/b.n<0).map(([k])=>k.slice(8));
md+='\n\n**Suggested skipPatterns for watch.json** (negative expectancy, 15+ trades): '+(bad.length?JSON.stringify(bad):'none')+'\n';
md+='\n\nRead it like this: expectancy above 0R means the signal made money on average in this history; the more trades, the more reliable. Groups with under 15 trades are hidden.\n';
 console.log('\n'+md);if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,md);fs.writeFileSync(path.join(root,'validate-report.json'),JSON.stringify(B,null,1));
 if(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_CHAT_ID){const a=B.ALL;const txt=`📊 Real-market validation\n${series} series, ${a?a.n:0} trades\n`+rows.slice(0,14).map(([k,b])=>`${k}: n=${b.n}, TP1 ${pc(b.h1,b.n)}, SL ${pc(b.sl,b.n)}, exp ${sg(b.sU/b.n)}R / managed ${sg(b.sM/b.n)}R`).join('\n');
  try{await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:process.env.TELEGRAM_CHAT_ID,text:txt.slice(0,4000)})})}catch(e){}}
})().catch(e=>{console.error(e);process.exit(1)});
