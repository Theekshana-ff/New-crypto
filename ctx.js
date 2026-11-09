// Shared: market context (BTC trend, volume, volatility, funding/OI, news), trade journal helpers, multi-coin backtest UI
const Ctx=(()=>{
 const ls={get:(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
 const memo={};const cached=async(k,ttl,fn)=>{const e=memo[k];if(e&&Date.now()-e.t<ttl)return e.v;let v=null;try{v=await fn()}catch(x){}memo[k]={t:Date.now(),v};return v};
 async function kl(sym,tf,lim,start){const r=await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}USDT&interval=${tf}&limit=${lim}`+(start?`&startTime=${start}`:''));if(!r.ok)throw 0;
  return(await r.json()).map(x=>({time:Math.floor(x[0]/1000),open:+x[1],high:+x[2],low:+x[3],close:+x[4],vol:+x[5]}))}
 const pf=p=>p>=100?p.toFixed(2):p>=1?p.toFixed(4):p.toPrecision(5);
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const btc=()=>cached('btc',300000,async()=>{const[h4,d1]=await Promise.all([kl('BTC','4h',300),kl('BTC','1d',200)]),w=h4.slice(-50),
   er=Math.abs(w[w.length-1].close-w[0].close)/(w.slice(1).reduce((s,x,i)=>s+Math.abs(x.close-w[i].close),0)||1);
  return{t4:SMC.analyze(h4,6).trend,t1:SMC.analyze(d1,6).trend,er,range:er<0.2}});
 const deriv=sym=>cached('d_'+sym,120000,async()=>{const r=await fetch('/api/deriv?symbol='+sym+'USDT');if(!r.ok)throw 0;return r.json()});
 const events=()=>cached('ev',1800000,async()=>{const r=await fetch('/api/events');if(!r.ok)throw 0;return r.json()});
 const tr=(c,i)=>Math.max(c[i].high-c[i].low,Math.abs(c[i].high-c[i-1].close),Math.abs(c[i].low-c[i-1].close)),avgTR=(c,n)=>{let s=0;for(let i=c.length-n;i<c.length;i++)s+=tr(c,i);return s/n};
 async function get(sym,c,tf){if(!c||c.length<60)c=await kl(sym,tf||'1h',80);
  const[b,d,ev]=await Promise.all([btc(),deriv(sym),events()]),n=c.length-1,avg=c.slice(n-20,n).reduce((s,x)=>s+(x.vol||0),0)/20,rv=avg?c[n-1].vol/avg:null,now=Date.now();
  return{btc:b,deriv:d,rv,atrR:avgTR(c,14)/avgTR(c,Math.min(50,n)),near:(ev||[]).find(e=>e.t-now<=3600e3&&now-e.t<=1800e3)||null,hasEv:!!ev}}
 // score a setup direction against the context: pts -3..+3, notes, and blocking flags for alert filters
 function evalCtx(cx,dir,sym){const notes=[],block={};let pts=0;const T=t=>t>0?'Bullish':t<0?'Bearish':'Neutral';
  if(cx.btc){const b=cx.btc;notes.push({ok:null,text:`BTC 4h ${T(b.t4)} · 1d ${T(b.t1)} · ${b.range?'ranging':'trending'}`});
   if(dir&&sym!=='BTC'){const al=(b.t4===dir)+(b.t1===dir),op=(b.t4===-dir)+(b.t1===-dir);if(al===2){pts++;notes.push({ok:true,text:'Setup follows BTC trend'})}else if(op>=1){pts--;block.btc=true;notes.push({ok:false,text:'Setup is against BTC trend'})}}
   if(b.range){block.range=true;notes.push({ok:false,text:'BTC is in a range (low trend strength)'})}}
  if(cx.rv!=null){const ok=cx.rv>=1.3?true:cx.rv<0.7?false:null;if(ok===true)pts++;if(ok===false)pts--;notes.push({ok,text:`Volume ${cx.rv.toFixed(1)}× average`})}
  if(cx.atrR>1.8){pts--;notes.push({ok:false,text:'Volatility spike (wider stops needed)'})}else if(cx.atrR<0.6)notes.push({ok:null,text:'Very quiet market'});
  const d=cx.deriv;if(d){const f=d.funding;notes.push({ok:null,text:`Funding ${(f*100).toFixed(3)}%${d.oiChg!=null?' · OI 24h '+(d.oiChg>=0?'+':'')+(d.oiChg*100).toFixed(1)+'%':''}`});
   if(dir>0&&f>0.0005||dir<0&&f<-0.0005){pts--;block.fund=true;notes.push({ok:false,text:dir>0?'Longs are crowded (high funding)':'Shorts are crowded (negative funding)'})}
   else if(dir>0&&f<-0.0003||dir<0&&f>0.0003){pts++;notes.push({ok:true,text:'Funding favours this side (contrarian)'})}}
  if(cx.near){block.news=true;const m=Math.round((cx.near.t-Date.now())/60000);notes.push({ok:false,text:`⚠ ${cx.near.title}: ${m>=0?'in '+m+' min':-m+' min ago'}`})}
  return{pts:Math.max(-3,Math.min(3,pts)),notes,block}}
 const regrade=(G,p)=>{if(!G)return null;const n=Math.max(0,Math.min(10,(G.pts+p)/G.max*10));return{g:n>=8?'A+':n>=6?'A':n>=4?'B':'C',pts:G.pts+p,max:G.max}};
 async function card(el,o){if(!el)return;const key=o.sym+o.tf;if(el.dataset.k!==key)el.innerHTML='<h3>Market context</h3><p class="msg">Loading...</p>';el.dataset.k=key;
  let cx;try{cx=await get(o.sym,o.c,o.tf)}catch(e){el.innerHTML='<h3>Market context</h3><p class="msg">Could not load context.</p>';return}
  const e=evalCtx(cx,o.dir,o.sym),G2=o.G?regrade(o.G,e.pts):null,GC={'A+':'#f0b429',A:'#2ecc9a',B:'#4ea1ff',C:'#8a9bb0'};
  el.innerHTML='<h3>Market context</h3>'+(G2?`<p>Grade <span class="grade" style="background:${GC[o.G.g]}">${o.G.g}</span> → with context <span class="grade" style="background:${GC[G2.g]}">${G2.g}</span> <span class="msg">(${e.pts>=0?'+':''}${e.pts})</span></p>`:'')+
   e.notes.map(n=>`<p>${n.ok===true?'<span class="up">✓</span>':n.ok===false?'<span class="down">✗</span>':'•'} ${n.text}</p>`).join('')+(cx.hasEv?'':'<p class="msg">News calendar not available.</p>')+(cx.deriv?'':'<p class="msg">Funding / OI data not available.</p>')}
 // trade journal
 const journal=()=>ls.get('journal',[]);
 function toast(m){let t=document.createElement('div');t.className='toast';t.textContent=m;t.onclick=()=>t.remove();document.body.appendChild(t);setTimeout(()=>t.remove(),4000)}
 function addTrade(t){const r=ls.get('smcRisk',{a:1000,r:1}),l=journal();l.unshift({...t,id:Date.now(),t:Math.floor(Date.now()/1000),risk:r.a*r.r/100});ls.set('journal',l.slice(0,200));toast('Added to Trade journal ✓')}
 function evalTrade(s,c,mg){const long=s.d===1,rr1=Math.abs(s.tps[0]-s.entry)/Math.abs(s.entry-s.sl),rr2=Math.abs(s.tps[1]-s.entry)/Math.abs(s.entry-s.sl);let st='pending',hit=0,stop=s.sl;
  for(const k of c){const lo=k.low,hi=k.high;
   if(st==='pending'){if(long?lo<=s.entry:hi>=s.entry){st='open';if(long?lo<=s.sl:hi>=s.sl){st='sl';break}continue}if(long?hi>=s.tps[0]:lo<=s.tps[0]){st='missed';break}continue}
   if(long?lo<=stop:hi>=stop){st=hit?(mg?'be':'tp'):'sl';break}
   s.tps.forEach((p,i)=>{if(long?hi>=p:lo<=p)hit=Math.max(hit,i+1)});if(mg&&hit>=1)stop=s.entry;
   if(mg?hit>=2:hit>=1){st='tp';break}}
  let R=null;if(st==='sl')R=-1;else if(st==='be')R=0.5*rr1;else if(st==='tp')R=mg?0.5*rr1+0.5*rr2:rr1;
  return{st,hit,R,part:st==='open'&&hit>=1&&mg?0.5*rr1:null}}
 async function top30(){return(await(await fetch('https://data-api.binance.vision/api/v3/ticker/24hr')).json()).filter(t=>t.symbol.endsWith('USDT')&&!/UP|DOWN|USDC|FDUSD|TUSD|USDP|BUSD|EUR|^USD/.test(t.symbol)).sort((a,b)=>b.quoteVolume-a.quoteVolume).slice(0,30).map(t=>t.symbol.replace('USDT',''))}
 // backtest card: this coin or top 30 coins, one or three time frames
 function mountBacktest(el,o){
  el.innerHTML='<h3>Backtest</h3><p class="msg">Runs this method on past candles (1000 per run). More coins and time frames = more reliable numbers.</p><div class="rin"><select id="btm"><option value="1">This coin</option><option value="30">Top 30 coins</option></select><select id="btt"><option value="1">This time frame</option><option value="3">15m + 1h + 4h</option></select></div><button id="btRun" class="moreBtn">Run backtest</button><div id="btout"></div>';
  const out=el.querySelector('#btout');
  el.querySelector('#btRun').onclick=async()=>{out.textContent='Starting...';
   try{const coins=el.querySelector('#btm').value==='30'?await top30():[o.sym()],tfs=el.querySelector('#btt').value==='3'?['15m','1h','4h']:[o.tf()],res=[];let k=0;
    for(const sym of coins)for(const tf of tfs){out.textContent=`Running ${++k}/${coins.length*tfs.length} (${sym} ${tf})...`;await sleep(20);try{res.push(SMC.backtest(await kl(sym,tf,1000),4,o.gen))}catch(e){}}
    const r=SMC.mergeStats(res),pc=(a,b)=>b?(a/b*100).toFixed(0)+'%':'-',sg=x=>(x>=0?'+':'')+x.toFixed(2)+'R';
    out.innerHTML=r.resolved?`<p>${coins.length} coin(s) × ${tfs.length} time frame(s): setups <b>${r.setups}</b>, finished trades <b>${r.resolved}</b></p><p class="up">TP1 hit: <b>${pc(r.wins,r.resolved)}</b> · TP2: ${pc(r.tp2,r.resolved)} · TP3: ${pc(r.tp3,r.resolved)}</p><p class="down">SL first: <b>${pc(r.losses,r.resolved)}</b></p><p>Expectancy per trade: <b>${sg(r.exp)}</b> exit all at TP1 · <b>${sg(r.expM)}</b> managed (50% at TP1, stop to breakeven, rest to TP2)</p><p>With SMC confluence: ${r.strongN?pc(r.strongWin,r.strongN)+' win ('+r.strongN+' trades)':'none'}</p><p class="msg">Past results do not guarantee future results. Fees and slippage are not included.</p>`:'<p class="msg">Not enough finished setups. Try more coins or time frames.</p>'}
   catch(e){out.textContent='Could not run the backtest right now.'}}}
 return{get,eval:evalCtx,regrade,card,addTrade,evalTrade,journal,kl,mountBacktest,toast,ls,pf};
})();
