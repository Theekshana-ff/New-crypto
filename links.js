// File: links.js
const $=id=>document.getElementById(id);
const cdn=s=>`https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/32/color/${s.toLowerCase()}.png`;
function fb(el,s){if(!el.dataset.f){el.dataset.f=1;el.src=cdn(s)}else el.outerHTML=`<i class="lg">${s[0]}</i>`}
const logo=s=>{s=String(s).replace(/[^A-Za-z0-9]/g,'');return `<img class="lgo" src="${cdn(s)}" alt="" onerror="fb(this,'${s}')">`};
const pf=p=>p>=100?p.toFixed(2):p>=1?p.toFixed(4):p.toPrecision(5);
const money=n=>n>=1e9?'$'+(n/1e9).toFixed(2)+'B':n>=1e6?'$'+(n/1e6).toFixed(2)+'M':n>=1e3?'$'+(n/1e3).toFixed(1)+'K':'$'+n.toFixed(0);
setInterval(function t(){const d=new Date();if($('time'))$('time').textContent=d.toLocaleTimeString();if($('date'))$('date').textContent=d.toLocaleDateString('en',{weekday:'short',year:'numeric',month:'short',day:'numeric'});return t}(),1000);
const tg=o=>{if($('drawer'))$('drawer').classList.toggle('open',o);if($('scrim'))$('scrim').classList.toggle('show',o)};
if($('menuBtn'))$('menuBtn').onclick=()=>tg(1);
if($('scrim'))$('scrim').onclick=()=>tg(0);

const API='https://data-api.binance.vision/api/v3';
async function kl(sym,tf,lim){
 const r=await fetch(`${API}/klines?symbol=${sym}USDT&interval=${tf}&limit=${lim}`);if(!r.ok)throw 0;
 const now=Date.now(),raw=await r.json();
 const closed=raw.filter(x=>x[6]<=now);
 const use=closed.length>=30?closed:raw.slice(0,-1);
 return use.map(x=>({time:Math.floor(x[0]/1000),open:+x[1],high:+x[2],low:+x[3],close:+x[4],vol:+x[5]}));
}

const TFS=[['1m','1m'],['5m','5m'],['15m','15m'],['30m','30m'],['60m','1h'],['4h','4h'],['8h','8h']],LC={'Strong Sell':'#ff4d63',Sell:'#ff9f43',Neutral:'#f0c814',Buy:'#8fd16a','Strong Buy':'#1aae6f'};
const MPAGE={SMC:'smc.html',FIB:'fibonacci.html',PAT:'patterns.html'};
let S={sym:'BTC',gtf:'15m',stf:'1h'};

// Fear & Greed
fetch('https://api.alternative.me/fng/?limit=7').then(r=>r.json()).then(j=>{const d=j.data,col=v=>v<25?'#ff5d6c':v<45?'#ff9f43':v<55?'#f0b429':v<75?'#8fd16a':'#2ecc9a',row=(l,x)=>x?`<td><div class="msg">${l}</div><b style="color:${col(+x.value)}">${x.value}</b> <small class="msg">${x.value_classification}</small></td>`:'';
 $('FG').hidden=false;$('FG').innerHTML=`<h3>Fear &amp; Greed Index</h3><p><b style="font-size:30px;color:${col(+d[0].value)}">${d[0].value}</b> <span class="msg">${d[0].value_classification}</span></p><div class="fgbar"><i style="left:${d[0].value}%"></i></div><table style="margin-top:8px"><tr>${row('Yesterday',d[1])}${row('Last week',d[6])}</tr></table>`}).catch(()=>{});

// technical rating gauge
function gauge(g){const col=LC[g.label],ang=g.score*90;
 return `<svg viewBox="0 0 360 220" class="gauge"><defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0" stop-color="#ff4d63"/><stop offset=".3" stop-color="#ff9f43"/><stop offset=".5" stop-color="#f0c814"/><stop offset=".7" stop-color="#8fd16a"/><stop offset="1" stop-color="#1aae6f"/></linearGradient></defs>
 <path d="M40 175 A140 140 0 0 1 320 175" fill="none" stroke="url(#gg)" stroke-width="14" stroke-linecap="round"/>
 <g transform="rotate(${ang} 180 175)"><polygon points="180,172 176,176 180,72 184,176" fill="${col}"/></g><circle cx="180" cy="175" r="8" fill="#0e1621" stroke="${col}" stroke-width="4"/>
 <g font-size="13" font-weight="600" text-anchor="middle"><text x="40" y="198" fill="${LC['Strong Sell']}">Strong Sell</text><text x="80" y="78" fill="${LC.Sell}">Sell</text><text x="180" y="22" fill="${LC.Neutral}">Neutral</text><text x="280" y="78" fill="${LC.Buy}">Buy</text><text x="320" y="198" fill="${LC['Strong Buy']}">Strong Buy</text></g>
 <text x="180" y="212" text-anchor="middle" fill="${col}" font-size="22" font-weight="700">${g.label}</text></svg>`}

async function loadGauge(){const el=$('GA');if(!el.dataset.b){el.dataset.b=1;el.innerHTML='<h3 id="gt"></h3><div class="tfbar inline" id="gtabs">'+TFS.map(([l,v])=>`<button data-v="${v}" class="${v===S.gtf?'on':''}">${l}</button>`).join('')+'</div><div id="gg2"></div>';
  el.querySelectorAll('#gtabs button').forEach(b=>b.onclick=()=>{S.gtf=b.dataset.v;el.querySelectorAll('#gtabs button').forEach(x=>x.classList.toggle('on',x===b));loadGauge()})}
 $('gt').innerHTML=`${logo(S.sym)} ${S.sym} · Technical rating`;
 try{const g=TA.rate(await kl(S.sym,S.gtf,300));$('gg2').innerHTML=gauge(g)+`<div class="cnt"><span class="down">Sell: ${g.sell}</span><span style="color:#f0c814">Neutral: ${g.neutral}</span><span class="up">Buy: ${g.buy}</span></div><p class="msg">${g.total} indicators (11 oscillators + 15 moving averages) · based on closed candles</p>`}
 catch(e){$('gg2').innerHTML='<p class="msg">This coin is not available on Binance (USDT).</p>'}}

// total current orders (order book)
async function loadOrders(){const el=$('OB');
 try{const d=await(await fetch(`${API}/depth?symbol=${S.sym}USDT&limit=1000`)).json(),sum=a=>a.reduce((s,x)=>s+x[0]*x[1],0),B=sum(d.bids),A=sum(d.asks),T=B+A,mx=Math.max(B,A),
  lo=+d.bids[d.bids.length-1][0],hi=+d.asks[d.asks.length-1][0],mid=(+d.bids[0][0]+ +d.asks[0][0])/2;
  el.innerHTML=`<h3>${logo(S.sym)} ${S.sym} · Total current orders</h3><div style="text-align:center"><div class="msg">Total current orders</div><b style="font-size:28px">${money(T)}</b></div>
  <div class="bars"><div><b class="up">${money(B)}</b><i style="height:${Math.max(6,B/mx*110)}px;background:#0fa968"></i><span class="msg">Total Buys</span></div><div><b class="down">${money(A)}</b><i style="height:${Math.max(6,A/mx*110)}px;background:#ff4560"></i><span class="msg">Total Sells</span></div></div>
  <p class="msg" style="text-align:center">Buys ${(B/T*100).toFixed(1)}% · Sells ${(A/T*100).toFixed(1)}% · order book within ${((mid-lo)/mid*100).toFixed(2)}% below / ${((hi-mid)/mid*100).toFixed(2)}% above price · live (${new Date().toLocaleTimeString()})</p>`}
 catch(e){el.innerHTML='<h3>Total current orders</h3><p class="msg">Order book not available for this coin.</p>'}}

// scan top 30 coins: what is trending now + setups at entry
$('SC').innerHTML='<h3>Trending now · top 30 coins</h3><div class="tfbar inline" id="stabs">'+['15m','1h','4h','1d'].map(t=>`<button data-v="${t}" class="${t===S.stf?'on':''}">${t}</button>`).join('')+'<button id="scRun">Scan now</button></div><div id="scOut" class="msg">Scanning...</div><p class="msg">Score = 24h move + volume surge + technical rating strength. Tap a method badge (SMC / FIB / PAT) to open its chart directly.</p>';
document.querySelectorAll('#stabs button[data-v]').forEach(b=>b.onclick=()=>{S.stf=b.dataset.v;document.querySelectorAll('#stabs button[data-v]').forEach(x=>x.classList.toggle('on',x===b));scan()});
$('scRun').onclick=()=>scan();
let scanning=false;
async function scan(){if(scanning)return;scanning=true;const out=$('scOut');out.textContent='Loading coins...';
 try{const all=(await(await fetch(API+'/ticker/24hr')).json()).filter(t=>t.symbol.endsWith('USDT')&&!/UP|DOWN|USDC|FDUSD|TUSD|USDP|BUSD|EUR|^USD/.test(t.symbol)).sort((a,b)=>b.quoteVolume-a.quoteVolume).slice(0,30),rows=[];let k=0;
  for(let i=0;i<all.length;i+=6)await Promise.all(all.slice(i,i+6).map(async t=>{const sym=t.symbol.replace('USDT','');
   try{const c=await kl(sym,S.stf,300),n=c.length-1,g=TA.rate(c),v3=(c[n].vol+c[n-1].vol+c[n-2].vol)/3,base=c.slice(n-26,n-2).reduce((s,x)=>s+x.vol,0)/24,surge=base?v3/base:1,chg=+t.priceChangePercent,last=c[n].close,m=[];
    const A4=SMC.analyze(c,/m$/.test(S.stf)?5:4),A6=SMC.analyze(c,6),T=SMC.setup(c,A4);if(T&&!T.none&&T.inside)m.push(['SMC',T.d]);
    const F=FIB.fib(c,A6,FIB.DEF);if(F&&!F.broken&&F.state==='inside')m.push(['FIB',F.d]);
    const p=PAT.detect(c,A6).find(x=>x.dir&&x.tps&&Math.abs(last-x.entry)<=A6.atr*0.8);if(p)m.push(['PAT',p.dir]);
    const score=40*Math.min(Math.abs(chg),15)/15+30*Math.min(Math.max(surge-1,0),2)/2+30*Math.abs(g.score);rows.push({sym,last,chg,surge,g,m,score})}catch(e){}
   out.textContent=`Scanning ${++k}/${all.length}...`}));
  rows.sort((a,b)=>b.score-a.score);
  out.className='';out.innerHTML='<table>'+rows.map((r,i)=>`<tr class="sc" data-s="${r.sym}"><td>${i+1}</td><td>${logo(r.sym)} <b>${r.sym}</b><br><small class="msg">${pf(r.last)}</small></td><td class="${r.chg>=0?'up':'down'}">${r.chg>=0?'▲':'▼'} ${Math.abs(r.chg).toFixed(2)}%<br><small class="msg">vol ×${r.surge.toFixed(1)}</small></td><td><b style="color:${LC[r.g.label]}">${r.g.label}</b><br><small class="msg">${r.g.buy}B · ${r.g.sell}S</small></td><td>${r.m.map(([n,d])=>`<a href="${MPAGE[n]}?sym=${r.sym}&tf=${S.stf}" onclick="event.stopPropagation()" class="grade" style="background:${d>0?'#2ecc9a':'#ff5d6c'};text-decoration:none;display:inline-block;margin:1px">${n}${d>0?'↑':'↓'}</a>`).join(' ')||'<span class="msg">–</span>'}</td><td><div class="sbar"><i style="width:${r.score}%"></i></div></td></tr>`).join('')+`</table><p class="msg">Updated ${new Date().toLocaleTimeString()} · time frame ${S.stf} · tap a coin to see its rating and orders above, or tap a badge to open its chart</p>`;
  document.querySelectorAll('#scOut .sc').forEach(r=>r.onclick=()=>{open(r.dataset.s);scrollTo({top:0,behavior:'smooth'})})}
 catch(e){out.textContent='Could not scan right now. Try again.'}scanning=false}

function open(sym){S.sym=sym.toUpperCase().replace(/USDT$/,'');loadGauge();loadOrders()}
$('sf').onsubmit=e=>{e.preventDefault();const v=$('q').value.trim().split(' ')[0];if(v){open(v);$('q').blur()}};
open('BTC');setInterval(loadOrders,8000);setInterval(loadGauge,30000);scan();setInterval(scan,300000);
