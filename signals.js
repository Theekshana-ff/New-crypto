// File: signals.js
const $=id=>document.getElementById(id);
const pf=p=>p>=100?p.toFixed(2):p>=1?p.toFixed(4):p.toPrecision(5);
const pp=(p,r)=>((Math.abs(p-r)/r)*100).toFixed(2)+'%';
const cdn=s=>`https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/32/color/${s.toLowerCase()}.png`;
function fb(el,s){if(!el.dataset.f){el.dataset.f=1;el.src=cdn(s)}else el.outerHTML=`<i class="lg">${s[0]}</i>`}
const logo=s=>{s=String(s).replace(/[^A-Za-z0-9]/g,'');return `<img class="lgo" src="${cdn(s)}" alt="" onerror="fb(this,'${s}')">`};
const GC={'A+':'#f0b429',A:'#2ecc9a',B:'#4ea1ff',C:'#8a9bb0'};
const MPAGE={SMC:'smc.html',FIB:'fibonacci.html',PAT:'patterns.html',STRAT:'smc.html'};

setInterval(function t(){
 const d=new Date();
 if($('time'))$('time').textContent=d.toLocaleTimeString();
 if($('date'))$('date').textContent=d.toLocaleDateString('en',{weekday:'short',year:'numeric',month:'short',day:'numeric'});
 return t;
}(),1000);

const tg=o=>{if($('drawer'))$('drawer').classList.toggle('open',o);if($('scrim'))$('scrim').classList.toggle('show',o)};
if($('menuBtn'))$('menuBtn').onclick=()=>tg(1);
if($('scrim'))$('scrim').onclick=()=>tg(0);

const KL='https://data-api.binance.vision/api/v3/klines';
async function kl(sym,tf,lim=350){
 const r=await fetch(`${KL}?symbol=${sym}USDT&interval=${tf}&limit=${lim}`);
 if(!r.ok)throw 0;
 const now=Date.now(),raw=await r.json();
 const closed=raw.filter(x=>x[6]<=now);
 const use=closed.length>=50?closed:raw.slice(0,-1);
 return use.map(x=>({time:Math.floor(x[0]/1000),open:+x[1],high:+x[2],low:+x[3],close:+x[4],vol:+x[5]}));
}

let ST={enabled:[]},ALL_SIGS=[],FILT_M='ALL';

(async()=>{
 try{const r=await fetch('/strategy.json');if(r.ok)ST=await r.json()}catch(e){}
 ST.enabled=ST.enabled||[];
 $('ST').innerHTML='<h3>✅ Active Signal Engines &amp; Validated Rules</h3>'+
  `<p class="msg" style="margin-bottom:8px">✅ <b>Multi-Engine Active:</b> Scanning Smart Money Concepts (OB, FVG, Liquidity/IDM Sweeps), Fibonacci Golden Zone (0.5–0.62 + Clusters), 70 Chart Patterns &amp; Validated Strategy Rules on CLOSED candles.</p>`+
  (ST.enabled.length?'<table>'+ST.enabled.map(e=>`<tr><td><b>${e.name}</b><br><small class="msg">${e.tf} · SL ${e.cfg.k}×ATR · TP ${e.cfg.m}R</small></td><td>${e.stats.trades} trades<br><small class="msg">${(e.stats.hitRate*100).toFixed(0)}% wins</small></td><td><small class="msg">expectancy</small><br>train ${e.stats.expTrain>=0?'+':''}${e.stats.expTrain}R<br>val ${e.stats.expValidation>=0?'+':''}${e.stats.expValidation}R<br>test ${e.stats.expTest>=0?'+':''}${e.stats.expTest}R</td></tr>`).join('')+'</table><p class="msg">Tested '+(ST.generated?new Date(ST.generated).toLocaleDateString():'')+' on '+(ST.coins||[]).length+' coins. Past results do not guarantee future profit.</p>':'<p class="msg">Strategy rules ready. Use the scanner above to scan SMC, Fibonacci &amp; Chart Patterns across the top 30 coins.</p>');
})();

function analyzeCoinTF(sym,tf,c,td){
 const found=[],last=c[c.length-1].close;
 const A=SMC.analyze(c,/m$/.test(tf)?5:4);

 // 1. SMC Check
 const T=SMC.setup(c,A);
 if(T&&!T.none){
  const dist=Math.abs(last-T.entry)/last;
  if(T.inside||dist<=0.025){
   const G=SMC.grade(T,td)||{g:'B',pts:5};
   found.push({
    sym,tf,method:'SMC',mLabel:'SMC ('+T.src+(T.conf?'+FVG':'')+')',
    d:T.d,entry:T.entry,sl:T.sl,tps:(T.tps||[]).map(x=>x.p),rr:(T.tps&&T.tps[0]?T.tps[0].rr:2),
    inZone:!!T.inside,dist,grade:G.g,pts:G.pts+(T.inside?3:0),
    status:T.inside?'🔥 In SMC Zone':pp(last,T.entry)+' to zone',
    why:`${T.d>0?'Bullish':'Bearish'} ${T.src}${T.conf?' + FVG confluence':''}${T.sweep?' + Liquidity/IDM swept':''}`
   });
  }
 }

 // 2. Fibonacci Check
 if(typeof FIB!=='undefined'){
  const F=FIB.fib(c,A,FIB.DEF);
  if(F&&!F.broken){
   const dist=F.state==='inside'?0:Math.abs(last-F.entry)/last;
   if(F.state==='inside'||dist<=0.025){
    const rx=FIB.reactions(c,A,F.d),G=FIB.grade(F,rx)||{g:'B',pts:5};
    found.push({
     sym,tf,method:'FIB',mLabel:`Fibonacci (${F.zr[0]}–${F.zr[1]})`,
     d:F.d,entry:F.entry,sl:F.sl,tps:(F.tps||[]).map(x=>x.p),rr:(F.tps&&F.tps[0]?F.tps[0].rr:2),
     inZone:F.state==='inside',dist,grade:G.g,pts:G.pts+(F.state==='inside'?3:0),
     status:F.state==='inside'?'🔥 In Fib Golden Zone':pp(last,F.entry)+' to Fib zone',
     why:`Fib ${F.zr[0]}–${F.zr[1]} retracement${F.conf.length?' + SMC '+F.conf.join('+'):''}${F.clusterInZone?' + Fib Cluster':''}`
    });
   }
  }
 }

 // 3. Chart Patterns Check
 if(typeof PAT!=='undefined'){
  const pats=PAT.detect(c,A).filter(p=>p.dir&&p.tps&&p.tps.length);
  for(const p of pats.slice(0,2)){
   const dist=Math.abs(last-p.entry)/last;
   const isBrk=/breakout|breakdown|at zone|at D|at point 5|at 3rd drive/.test(p.status);
   const near=dist<=0.02||(A.atr&&Math.abs(last-p.entry)<=A.atr*1.0);
   if(isBrk||near){
    const pts=(isBrk?7:5)+(p.dir===A.trend?2:0)+(dist<=0.008?2:0);
    const g=pts>=8?'A+':pts>=6?'A':'B';
    found.push({
     sym,tf,method:'PAT',mLabel:p.names[0],
     d:p.dir,entry:p.entry,sl:p.sl,tps:p.tps.map(x=>x.p),rr:p.tps[0]?p.tps[0].rr:2,
     inZone:isBrk||dist<=0.006,dist,grade:g,pts,
     status:isBrk?`🔥 ${p.status}`:pp(last,p.entry)+' to breakout/entry',
     why:`${p.names[0]} (${p.status}) · Target RR ${(p.tps[0]?.rr||1.5).toFixed(1)}`,
     brk:p.brk
    });
   }
  }
 }

 // 4. Validated Strategy Rules Check
 if(typeof STRAT!=='undefined'&&c.length>=210){
  const P=STRAT.prep(c),i=c.length-1;
  const rules=ST.enabled.filter(x=>x.tf===tf);
  for(const e of rules){
   const d=STRAT.signal(P,i,e.cfg);
   if(d){
    const pl=STRAT.plan(P,i,e.cfg,d,last);
    found.push({
     sym,tf,method:'STRAT',mLabel:e.name,
     d,entry:pl.entry,sl:pl.sl,tps:[pl.tp,pl.tp],rr:e.cfg.m||2,
     inZone:true,dist:0,grade:'A',pts:8,
     status:'🔥 Candle Closed Signal',
     why:`Validated Rule: ${e.name} (SL ${e.cfg.k}×ATR, TP ${e.cfg.m}R)`
    });
   }
  }
 }

 for(const s of found){
  const others=found.filter(o=>o!==s&&o.d===s.d&&o.method!==s.method);
  if(others.length){
   s.confluence=others.map(o=>o.method);
   s.pts+=others.length*2;
   if(s.pts>=9)s.grade='A+';
  }
 }
 return found;
}

function renderTrending(){
 const box=$('TR');if(!box)return;
 if(!ALL_SIGS.length){
  box.innerHTML='<h3>🔥 Trending Method &amp; Market Pulse</h3><p class="msg">No active setups found yet. Tap "Scan Top 30 Coins" below.</p>';
  return;
 }

 const stats={
  SMC:{name:'SMC (Smart Money Concepts)',inZone:0,highG:0,total:0,score:0,bull:0,bear:0,desc:'Order Blocks, FVG & Liquidity Sweeps මත පදනම් වූ institutional entries දැනට ඉතා හොඳින් ක්‍රියාත්මක වේ.'},
  FIB:{name:'Fibonacci Golden Zone (0.5–0.62)',inZone:0,highG:0,total:0,score:0,bull:0,bear:0,desc:'Market එකේ පැහැදිලි Impulse Swing Legs සහ 0.5–0.62 OTE Pullbacks බහුලව දක්නට ලැබේ.'},
  PAT:{name:'Chart Patterns (Breakouts & Harmonics)',inZone:0,highG:0,total:0,score:0,bull:0,bear:0,desc:'Classical Breakouts (Triangles, Flags, Double Top/Bottom) සහ Harmonic Reversals දැනට ප්‍රබලව පවතී.'}
 };

 let totalBull=0,totalBear=0;
 for(const s of ALL_SIGS){
  if(s.d>0)totalBull++;else if(s.d<0)totalBear++;
  const st=stats[s.method];if(!st)continue;
  st.total++;
  if(s.inZone)st.inZone++;
  if(s.grade==='A+'||s.grade==='A')st.highG++;
  if(s.d>0)st.bull++;else st.bear++;
  st.score+=(s.inZone?4:1)+(s.grade==='A+'?4:s.grade==='A'?2:1)+(s.confluence?2:0);
 }

 const ranked=Object.entries(stats).sort((a,b)=>b[1].score-a[1].score);
 const best=ranked[0][1];
 const totDir=Math.max(1,totalBull+totalBear),bullPct=Math.round((totalBull/totDir)*100),bearPct=100-bullPct;
 const mktBias=bullPct>=60?`<span class="tag up">BULLISH MARKET (${bullPct}% Longs)</span>`:bearPct>=60?`<span class="tag down">BEARISH MARKET (${bearPct}% Shorts)</span>`:`<span class="tag n">MIXED / RANGING (${bullPct}% Bull · ${bearPct}% Bear)</span>`;

 box.innerHTML=`<h3>🔥 Trending Method &amp; Market Pulse</h3>
  <p style="margin:6px 0"><b>🏆 මේ වෙලාවේ හොඳම (Trending) Method එක:</b> <span class="grade" style="background:#f0b429;color:#0e1621;font-size:0.95em;padding:3px 8px">${best.name}</span> &nbsp; ${mktBias}</p>
  <p class="msg" style="margin:4px 0 10px">${best.desc}</p>
  <table>
   <tr><th>Method</th><th>🔥 In Zone Now</th><th>A+ / A Setups</th><th>Total Signals</th><th>Bias (L/S)</th></tr>
   ${ranked.map(([k,v],idx)=>`<tr style="${idx===0?'background:rgba(240,180,41,0.1);font-weight:600':''}">
    <td>${idx===0?'👑 ':''}<b>${v.name}</b></td>
    <td><b class="up">${v.inZone}</b> in zone</td>
    <td>${v.highG} high-grade</td>
    <td>${v.total} setups</td>
    <td><span class="up">${v.bull}L</span> / <span class="down">${v.bear}S</span></td>
   </tr>`).join('')}
  </table>`;
}

function renderResults(){
 const out=$('out'),onlyZone=$('sstat').value==='zone';
 let list=ALL_SIGS.filter(s=>(FILT_M==='ALL'||s.method===FILT_M)&&(!onlyZone||s.inZone));
 list.sort((a,b)=>(b.inZone-a.inZone)||(b.pts-a.pts)||(a.dist-b.dist));

 if(!list.length){
  out.innerHTML='<p class="msg">No matching signals right now for this filter. Try switching to "All Methods" or "Show: In-Zone + Near Entry".</p>';
  return;
 }

 out.innerHTML=`<p class="msg" style="margin:8px 0">Found <b>${list.length}</b> actionable setups (${list.filter(x=>x.inZone).length} 🔥 right inside entry zone). Sorted by Entry Zone &amp; Grade.</p>
  <table>
   <tr><th>Coin &amp; TF</th><th>Method &amp; Confluence</th><th>Status</th><th>Entry / SL / TP</th><th>Action</th></tr>
   ${list.slice(0,45).map((s,idx)=>{
    const confTag=s.confluence?`<br><span class="tag up" style="font-size:0.75em">⚡ Confluence: ${s.method} + ${s.confluence.join(' + ')}</span>`:'';
    const tpStr=(s.tps||[]).slice(0,2).map((p,i)=>`TP${i+1}: ${pf(p)}`).join(' · ');
    const targetPage=MPAGE[s.method]||'smc.html';
    const chartLink=`${targetPage}?sym=${encodeURIComponent(s.sym)}&tf=${encodeURIComponent(s.tf)}`;

    return `<tr>
     <td>${logo(s.sym)} <b>${s.sym}</b> <small class="msg">${s.tf}</small><br><span class="tag ${s.d>0?'up':'down'}">${s.d>0?'LONG':'SHORT'}</span> <span class="grade" style="background:${GC[s.grade]||'#4ea1ff'}">${s.grade}</span></td>
     <td><b>${s.mLabel}</b>${confTag}<br><small class="msg">${s.why}</small></td>
     <td><b class="${s.inZone?'up':'msg'}">${s.status}</b></td>
     <td><b style="color:#f0b429">Entry: ${pf(s.entry)}</b><br><span class="down">SL: ${pf(s.sl)}</span><br><span class="up">${tpStr}</span></td>
     <td>
      <a class="moreBtn" style="display:inline-block;margin:2px 0;text-decoration:none" href="${chartLink}">📈 Chart</a>
      <button class="moreBtn takeBtn" data-i="${idx}" style="margin:2px 0">📒 Trade</button>
      <a class="moreBtn" style="display:inline-block;margin:2px 0;text-decoration:none" href="risk.html?e=${s.entry}&s=${s.sl}&t1=${s.tps[0]||''}">Risk</a>
     </td>
    </tr>`;
   }).join('')}
  </table>`;

 document.querySelectorAll('.takeBtn').forEach(b=>b.onclick=()=>{
  const s=list[+b.dataset.i];if(!s)return;
  if(typeof Ctx!=='undefined'&&Ctx.addTrade){
   Ctx.addTrade({method:s.method,sym:s.sym,tf:s.tf,d:s.d,entry:s.entry,sl:s.sl,tps:s.tps,brk:s.brk});
   b.textContent='✓ Added';
  }
 });
}

async function runScan(coinList){
 const out=$('out');
 const tfSel=$('stf').value;
 const tfs=tfSel==='all'?['15m','1h','4h']:[tfSel];
 ALL_SIGS=[];
 out.innerHTML=`<p class="msg">Scanning 0/${coinList.length} coins across ${tfs.join(', ')} (SMC + Fibonacci + Chart Patterns)...</p>`;

 let done=0;
 for(let i=0;i<coinList.length;i+=5){
  await Promise.all(coinList.slice(i,i+5).map(async sym=>{
   try{
    const tfData={};
    await Promise.all(tfs.map(async tf=>{tfData[tf]=await kl(sym,tf,320)}));
    for(const tf of tfs){
     const c=tfData[tf];
     if(c&&c.length>=60){
      const sigs=analyzeCoinTF(sym,tf,c,null);
      ALL_SIGS.push(...sigs);
     }
    }
   }catch(e){}
   done++;
   out.innerHTML=`<p class="msg">Scanning ${done}/${coinList.length} coins... (${ALL_SIGS.length} setups found so far)</p>`;
  }));
 }
 renderTrending();
 renderResults();
}

$('scan30').onclick=async()=>{
 const out=$('out');
 out.innerHTML='<p class="msg">Fetching Top 30 most traded USDT coins from Binance...</p>';
 try{
  const r=await fetch('https://data-api.binance.vision/api/v3/ticker/24hr');
  const all=(await r.json()).filter(t=>t.symbol.endsWith('USDT')&&!/UP|DOWN|USDC|FDUSD|TUSD|USDP|BUSD|EUR|^USD|PAXG/.test(t.symbol)).sort((a,b)=>b.quoteVolume-a.quoteVolume).slice(0,30);
  const top30=all.map(t=>t.symbol.replace('USDT',''));
  $('coins').value=top30.join(',');
  await runScan(top30);
 }catch(e){
  out.innerHTML='<p class="msg">Could not fetch top 30 list. Scanning default coins instead...</p>';
  const fallback=$('coins').value.split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
  await runScan(fallback);
 }
};

$('scanCustom').onclick=async()=>{
 const list=$('coins').value.split(',').map(x=>x.trim().toUpperCase().replace(/USDT$/,'')).filter(Boolean).slice(0,30);
 if(!list.length)return;
 await runScan(list);
};

document.querySelectorAll('.mflt').forEach(b=>b.onclick=()=>{
 FILT_M=b.dataset.m;
 document.querySelectorAll('.mflt').forEach(x=>x.classList.toggle('on',x===b));
 if(ALL_SIGS.length)renderResults();
});
$('sstat').onchange=()=>{if(ALL_SIGS.length)renderResults()};
