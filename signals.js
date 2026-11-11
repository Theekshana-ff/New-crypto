const $=id=>document.getElementById(id),pf=p=>p>=100?p.toFixed(2):p>=1?p.toFixed(4):p.toPrecision(5);
setInterval(function t(){const d=new Date();if($('time'))$('time').textContent=d.toLocaleTimeString();if($('date'))$('date').textContent=d.toLocaleDateString('en',{weekday:'short',year:'numeric',month:'short',day:'numeric'});return t}(),1000);
const tg=o=>{if($('drawer'))$('drawer').classList.toggle('open',o);if($('scrim'))$('scrim').classList.toggle('show',o)};
if($('menuBtn'))$('menuBtn').onclick=()=>tg(1);
if($('scrim'))$('scrim').onclick=()=>tg(0);

const TFMS={'15m':9e5,'1h':36e5,'4h':144e5,'1d':864e5};
let ST={enabled:[]};

async function fetchKlines(sym,tf,limit=500){
 try{
  const r=await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}USDT&interval=${tf}&limit=${limit}`);
  if(!r.ok)return null;
  return(await r.json()).filter(x=>x[6]<=Date.now()).map(x=>({time:Math.floor(x[0]/1000),open:+x[1],high:+x[2],low:+x[3],close:+x[4],vol:+x[5]}));
 }catch(e){return null}
}

(async()=>{
 try{const r=await fetch('/strategy.json');if(r.ok)ST=await r.json()}catch(e){}
 ST.enabled=ST.enabled||[];
 const smcActive=typeof window.SMC!=='undefined';
 $('ST').innerHTML='<h3>Active Signal Engines</h3>'+
  (smcActive?'<p><b>SMC Engine Active:</b> Scanning Order Blocks, Fair Value Gaps (FVG), Liquidity Sweeps, Inducement (IDM) & Multi-Timeframe Structure (1D / 4H / 1H / 15M).</p>':'<p class="msg">Warning: smc-core.js is not loaded on this page. Include &lt;script src="smc-core.js"&gt;&lt;/script&gt; in signals.html for SMC signals.</p>')+
  (ST.enabled.length?'<table>'+ST.enabled.map(e=>`<tr><td><b>${e.name}</b><br><small class="msg">${e.tf} · SL ${e.cfg.k}×ATR · TP ${e.cfg.m}R</small></td><td>${e.stats.trades} trades<br><small class="msg">${(e.stats.hitRate*100).toFixed(0)}% wins</small></td><td><small class="msg">per trade after fees</small><br>train ${e.stats.expTrain>=0?'+':''}${e.stats.expTrain}R<br>val ${e.stats.expValidation>=0?'+':''}${e.stats.expValidation}R<br>test ${e.stats.expTest>=0?'+':''}${e.stats.expTest}R</td></tr>`).join('')+'</table>':'');
})();

$('scan').onclick=async()=>{
 const out=$('out'),list=$('coins').value.split(',').map(x=>x.trim().toUpperCase()).filter(Boolean).slice(0,12),rows=[];
 let k=0;out.textContent='Scanning market structure & patterns...';
 const hasSMC=typeof window.SMC!=='undefined',hasSTRAT=typeof window.STRAT!=='undefined';
 const tfs=new Set(['15m','1h','4h',...(ST.enabled||[]).map(e=>e.tf)]);
 if(hasSMC)tfs.add('1d');

 for(const sym of list){
  out.textContent=`Scanning ${sym} (${++k}/${list.length})...`;
  const data={};
  for(const tf of tfs){
   const c=await fetchKlines(sym,tf,500);
   if(c&&c.length>=200)data[tf]=c;
  }

  // 1. Smart Money Concepts (SMC) Multi-Timeframe & Pattern Signals
  if(hasSMC&&data['1h']){
   let td=null;
   if(data['1d']&&data['4h']&&data['1h']&&data['15m']){
    try{td=SMC.topDown(data)}catch(e){}
   }
   for(const tf of ['15m','1h','4h']){
    const c=data[tf];if(!c)continue;
    const A=SMC.analyze(c),S=SMC.setup(c,A);
    if(S&&!S.none&&S.tps&&S.tps.length){
     const gr=SMC.grade(S,td)||{g:'B',pts:5},dist=Math.abs(S.last-S.entry)/A.atr;
     // Only show setups where price is inside or within 2.5 ATR of the entry zone and aligned with HTF
     if(dist<=2.5&&(!td||!td.dir||td.dir===S.d||gr.pts>=6)){
      const ms=TFMS[tf]||36e5,age=Math.max(0,Math.round((Date.now()-(c[c.length-1].time*1000+ms))/60000));
      const tags=[`SMC ${S.src}`,`Grade ${gr.g}`];
      if(S.conf)tags.push('FVG Confluence');
      if(S.sweep)tags.push('Liq Sweep/IDM');
      if(S.inside)tags.push('AT ZONE NOW');
      rows.push({
       sym,tf,d:S.d,age,score:gr.pts+(S.inside?3:0),
       name:tags.join(' · '),
       p:{entry:S.entry,sl:S.sl,tp:S.tps[0].p,tp2:S.tps[1]?S.tps[1].p:null}
      });
     }
    }
   }
  }

  // 2. STRAT Core Signals (Checks last 2 closed candles + HTF filter if SMC available)
  if(hasSTRAT&&ST.enabled.length){
   const htfBias=(hasSMC&&data['4h'])?SMC.analyze(data['4h']).trend:0;
   for(const e of ST.enabled){
    const c=data[e.tf];if(!c||c.length<250)continue;
    const P=STRAT.prep(c),ms=TFMS[e.tf]||36e5;
    for(let idx=c.length-1;idx>=c.length-2;idx--){
     const d=STRAT.signal(P,idx,e.cfg);
     if(d&&(!htfBias||htfBias===d)){
      const age=Math.max(0,Math.round((Date.now()-(c[idx].time*1000+ms))/60000));
      const pl=STRAT.plan(P,idx,e.cfg,d,c[idx].close);
      rows.push({sym,tf:e.tf,d,age,score:6,name:`${e.name} (Trend Aligned)`,p:{entry:pl.entry,sl:pl.sl,tp:pl.tp}});
      break;
     }
    }
   }
  }
 }

 // Sort signals so the highest quality & active zone signals appear at the top
 rows.sort((a,b)=>b.score-a.score||a.age-b.age);

 out.innerHTML=rows.length?'<table>'+rows.map(r=>`<tr><td><b>${r.sym}</b> ${r.tf} <span class="${r.d>0?'up':'down'}">${r.d>0?'LONG':'SHORT'}</span><br><small class="msg">${r.name} · ${r.age}m ago</small></td><td>Entry ≈ ${pf(r.p.entry)}<br>SL ${pf(r.p.sl)}<br>TP1 ${pf(r.p.tp)}${r.p.tp2?`<br>TP2 ${pf(r.p.tp2)}`:''}</td><td><a href="risk.html?e=${r.p.entry}&s=${r.p.sl}&t1=${r.p.tp}${r.p.tp2?`&t2=${r.p.tp2}`:''}">Risk calc</a></td></tr>`).join('')+'</table><p class="msg">Sorted by setup quality. Prioritize "AT ZONE NOW" and Grade A+/A setups.</p>':'<p class="msg">No high-probability setup right now. Wait for market structure alignment.</p>';
};
