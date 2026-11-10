// Real-market evaluation: downloads real candles, walks forward through history with the same SMC / Fibonacci / Pattern logic as the site,
// and reports detection rates and how setups actually played out (TP1 / SL, expectancy). Meant to run on GitHub Actions (needs internet).
const fs=require('fs'),path=require('path'),root=path.join(__dirname,'..');
const SMC=require(path.join(root,'smc-core.js')),FIB=require(path.join(root,'fib-core.js')),PAT=require(path.join(root,'pat-core.js'));
const COINS=+process.env.COINS||20,TFS=(process.env.TFS||'15m,1h,4h').split(',').map(s=>s.trim()).filter(Boolean),STEP=+process.env.STEP||6,TOKEN=process.env.TELEGRAM_BOT_TOKEN,CHAT=process.env.TELEGRAM_CHAT_ID,SEND=process.env.SEND_TELEGRAM==='1';
const HOSTS=['https://data-api.binance.vision','https://api.binance.us','https://api.binance.com'];
async function get(p){for(const h of HOSTS){try{const r=await fetch(h+p);if(r.ok)return await r.json()}catch(e){}}throw new Error('no data for '+p)}
const kl=async(sym,tf)=>(await get(`/api/v3/klines?symbol=${sym}USDT&interval=${tf}&limit=1000`)).map(x=>({time:Math.floor(x[0]/1000),open:+x[1],high:+x[2],low:+x[3],close:+x[4],vol:+x[5]}));
const pc=(a,b)=>b?(a/b*100).toFixed(0)+'%':'-',sg=x=>(x>=0?'+':'')+x.toFixed(2)+'R';
function agg(rows){const A=rows.map(r=>r.a),U=rows.map(r=>r.u).filter(Boolean),M=rows.map(r=>r.m).filter(Boolean),sm=l=>l.reduce((x,r)=>x+r.R,0),st=A.filter(r=>r.strong);
 return{n:A.length,tp1:A.filter(r=>r.hit>=1).length,tp2:A.filter(r=>r.hit>=2).length,sl:A.filter(r=>!r.hit).length,eU:U.length?sm(U)/U.length:0,eM:M.length?sm(M)/M.length:0,sN:st.length,sW:st.filter(r=>r.hit>=1).length}}
const row=(name,s)=>`| ${name} | ${s.n} | ${pc(s.tp1,s.n)} | ${pc(s.tp2,s.n)} | ${pc(s.sl,s.n)} | ${s.n?sg(s.eU):'-'} | ${s.n?sg(s.eM):'-'} | ${s.sN?pc(s.sW,s.sN)+' ('+s.sN+')':'-'} |`;
const HEAD='| | trades | TP1 | TP2 | SL first | exit all at TP1 | managed | with confluence |\n|---|---|---|---|---|---|---|---|';
(async()=>{
 const tick=(await get('/api/v3/ticker/24hr')).filter(t=>t.symbol.endsWith('USDT')&&!/UP|DOWN|USDC|FDUSD|TUSD|USDP|BUSD|EUR|^USD/.test(t.symbol)).sort((a,b)=>b.quoteVolume-a.quoteVolume).slice(0,COINS).map(t=>t.symbol.replace('USDT',''));
 const rows={smc:[],fib:[],pat:[]},byTf={},byName={},det={charts:0,pat:0,anyPat:0,smc:0,fib:0};let k=0;const log=m=>console.log(m);
 for(const sym of tick)for(const tf of TFS){let c;try{c=await kl(sym,tf)}catch(e){log('skip '+sym+' '+tf+': '+e.message);continue}
  log(`[${++k}/${tick.length*TFS.length}] ${sym} ${tf}`);const L4=/m$/.test(tf)?5:4,seen={smc:new Set(),fib:new Set(),pat:new Set()};byTf[tf]=byTf[tf]||{smc:[],fib:[],pat:[]};
  // detection rates at the latest candle
  {const A4=SMC.analyze(c,L4),A6=SMC.analyze(c,6),T=SMC.setup(c,A4),F=FIB.fib(c,A6,FIB.DEF),P=PAT.detect(c,A6);det.charts++;det.pat+=P.length;if(P.length)det.anyPat++;if(T&&!T.none)det.smc++;if(F&&!F.broken)det.fib++}
  for(let t=150;t<c.length-5;t+=STEP){const sl=c.slice(0,t+1),A4=SMC.analyze(sl,L4),A6=SMC.analyze(sl,6),cand=[];
   const T=SMC.setup(sl,A4);if(T&&!T.none)cand.push(['smc',T.d+'_'+T.z.i,T,'SMC']);
   const F=FIB.fib(sl,A6,FIB.DEF);if(F&&!F.broken)cand.push(['fib',F.d+'_'+F.leg.a.i,{...F,conf:F.conf.length>0},'Fibonacci']);
   PAT.detect(sl,A6).filter(p=>p.dir&&p.tps&&!/breakout|breakdown/.test(p.status)).forEach(p=>cand.push(['pat',p.id,{d:p.dir,entry:p.entry,sl:p.sl,tps:p.tps,conf:false,brk:p.brk},p.names[0]]));
   for(const[m,key,S,name]of cand){if(seen[m].has(key))continue;seen[m].add(key);const a=SMC.sim(S,c,t,2);if(!a)continue;const r={a,u:SMC.sim(S,c,t,0),m:SMC.sim(S,c,t,1)};
    rows[m].push(r);byTf[tf][m].push(r);if(m==='pat')(byName[name]=byName[name]||[]).push(r)}}}
 const L=[];L.push(`# Real-market analysis report`,`${new Date().toISOString().slice(0,16)} UTC · ${tick.length} coins (${tick.join(', ')}) · time frames ${TFS.join(', ')} · up to 1000 candles each · step ${STEP}`,'');
 L.push('## Detection at the latest candle',`- Charts analysed: ${det.charts}`,`- Chart patterns per chart: ${(det.pat/det.charts).toFixed(2)} · charts with at least one: ${pc(det.anyPat,det.charts)}`,`- SMC setup present: ${pc(det.smc,det.charts)} · Fibonacci leg present: ${pc(det.fib,det.charts)}`,'');
 L.push('## How setups played out (walk-forward, no look-ahead)',HEAD,row('SMC',agg(rows.smc)),row('Fibonacci',agg(rows.fib)),row('Chart patterns',agg(rows.pat)),'');
 for(const tf of TFS)if(byTf[tf])L.push(`### ${tf}`,HEAD,row('SMC',agg(byTf[tf].smc)),row('Fibonacci',agg(byTf[tf].fib)),row('Chart patterns',agg(byTf[tf].pat)),'');
 const names=Object.entries(byName).filter(([,v])=>v.length>=8).sort((a,b)=>b[1].length-a[1].length);
 L.push('## By chart pattern (8+ trades)',HEAD.replace('| |','| pattern |'),...names.map(([n,v])=>row(n,agg(v))),names.length?'':'(not enough trades per pattern yet)','');
 L.push('Notes: R = multiples of the risk to the stop. "managed" = 50% closed at TP1, stop moved to entry, rest to TP2. Fees, slippage and funding are not included. A result around 0R means no edge over chance; a small number of trades is not reliable.');
 const md=L.join('\n');console.log('\n'+md);fs.writeFileSync(path.join(root,'report.md'),md);if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,md+'\n');
 if(SEND&&TOKEN&&CHAT){const s=agg(rows.smc),f=agg(rows.fib),p=agg(rows.pat),line=(n,x)=>`${n}: ${x.n} trades, TP1 ${pc(x.tp1,x.n)}, SL ${pc(x.sl,x.n)}, exp ${x.n?sg(x.eU):'-'} / managed ${x.n?sg(x.eM):'-'}`;
  const txt=`📊 Real-market analysis report\n${tick.length} coins × ${TFS.join('/')}\n\n${line('SMC',s)}\n${line('Fibonacci',f)}\n${line('Patterns',p)}\n\nPatterns per chart: ${(det.pat/det.charts).toFixed(2)} (${pc(det.anyPat,det.charts)} of charts)\nFull table: GitHub → Actions → this run → Summary`;
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:CHAT,text:txt})}).catch(()=>{})}
})().catch(e=>{console.error(e);process.exit(1)});
