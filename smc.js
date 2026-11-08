const $=id=>document.getElementById(id);
const cdn=s=>`https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/32/color/${s.toLowerCase()}.png`;
function fb(el,s){if(!el.dataset.f){el.dataset.f=1;el.src=cdn(s)}else el.outerHTML=`<i class="lg">${s[0]}</i>`}
const logo=(s,img)=>{s=String(s).replace(/[^A-Za-z0-9]/g,'');return `<img class="lgo" src="${img||cdn(s)}" alt="" onerror="fb(this,'${s}')">`};
const ls={get:(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const GC={'A+':'#f0b429',A:'#2ecc9a',B:'#4ea1ff',C:'#8a9bb0'};
const pf=p=>p>=100?p.toFixed(2):p>=1?p.toFixed(4):p.toPrecision(5);
const pp=(p,r)=>((p-r)/r*100).toFixed(2)+'%';
let S={sym:'BTC',tf:'1h',img:'',c:[],A:null,T:null,lines:[],L:{struct:1,ob:1,fvg:1,liq:1,idm:1},td:null,tdT:0,tdSym:''},sig='';
// clock + menu
setInterval(function t(){const d=new Date();$('time').textContent=d.toLocaleTimeString();$('date').textContent=d.toLocaleDateString('en',{weekday:'short',year:'numeric',month:'short',day:'numeric'});return t}(),1000);
const tg=o=>{$('drawer').classList.toggle('open',o);$('scrim').classList.toggle('show',o)};
$('menuBtn').onclick=()=>tg(1);$('scrim').onclick=()=>tg(0);
// chart view factory: main chart + one separate chart per method
const V=[],force=()=>V.forEach(v=>v.force());
function view(box,Lf){
 const chart=LightweightCharts.createChart(box.firstElementChild,{autoSize:true,layout:{background:{color:'#0e1621'},textColor:'#8a9bb0'},grid:{vertLines:{color:'#1a2636'},horzLines:{color:'#1a2636'}},rightPriceScale:{borderColor:'#243447'},timeScale:{borderColor:'#243447',timeVisible:true,rightOffset:8}});
 const series=chart.addCandlestickSeries({upColor:'#2ecc9a',downColor:'#ff5d6c',wickUpColor:'#2ecc9a',wickDownColor:'#ff5d6c',borderVisible:false});
 const made=[],none={autoscaleInfoProvider:()=>null,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false};
 // everything is drawn with native chart series (zones = filled baseline series, lines = line series)
 function render(){
  try{
   made.forEach(m=>chart.removeSeries(m));made.length=0;series.setMarkers([]);$('err').textContent='';
   const L=Lf(),A=S.A,c=S.c;if(!A||!c.length)return;const last=c.length-1,marks=[],T=i=>c[Math.max(0,Math.min(last,i))].time;
   const zone=(z,col,txt)=>{let e=z.mit?z.end:last;if(e<=z.i)e=Math.min(last,z.i+1);if(e<=z.i)return;
    const s=chart.addBaselineSeries({...none,baseValue:{type:'price',price:z.bot},topLineColor:col,topFillColor1:col+'66',topFillColor2:col+'66',bottomLineColor:'rgba(0,0,0,0)',bottomFillColor1:'rgba(0,0,0,0)',bottomFillColor2:'rgba(0,0,0,0)',lineWidth:1});
    s.setData([{time:T(z.i),value:z.top},{time:T(e),value:z.top}]);
    s.setMarkers([{time:T(z.i),position:'inBar',shape:'circle',size:0,color:col,text:txt}]);made.push(s)};
   const line=(i1,i2,p,col,w,st,txt)=>{if(i2<=i1)return;const m=Math.round((i1+i2)/2),idx=[...new Set([i1,m,i2])];
    const s=chart.addLineSeries({...none,color:col,lineWidth:w,lineStyle:st});
    s.setData(idx.map(i=>({time:T(i),value:p})));
    if(txt)s.setMarkers([{time:T(m),position:'aboveBar',shape:'circle',size:0,color:col,text:txt}]);made.push(s)};
   if(L.ob)for(const q of[1,-1])A.obs.filter(o=>!o.mit&&o.d===q).slice(-3).forEach(o=>zone(o,q>0?'#2ecc9a':'#ff5d6c',(q>0?'Bull':'Bear')+' OB'+(o.conf?'+FVG':'')));
   if(L.fvg)for(const q of[1,-1])A.fvg.filter(o=>!o.mit&&o.d===q).slice(-4).forEach(o=>zone(o,q>0?'#4ea1ff':'#f0b429','FVG'));
   A.ev.slice(-14).filter(e=>e.k==='CHoCH'?L.ch:L.bos).forEach(e=>line(e.from,e.to,e.p,e.k==='CHoCH'?'#f0b429':'#8ab4ff',e.k==='CHoCH'?2:1,e.k==='CHoCH'?2:0,e.k+(e.d>0?' ↑':' ↓')));
   if(L.htf)(S.htf||[]).forEach(z=>{const i=c.findIndex(x=>x.time>=z.t);if(i>=0)zone({...z,i,mit:0},z.f?(z.d>0?'#4ea1ff':'#f0b429'):(z.d>0?'#2ecc9a':'#ff5d6c'),z.tag)});
   if(L.idm)A.idm.forEach(m=>line(m.i,m.to,m.p,'#ff9f43',1,2,'IDM'));
   if(L.liq){A.liq.slice(-6).forEach(q=>line(q.from,q.st==='open'?last:q.at,q.p,'#b388ff',1,1,(q.t==='H'?'EQH':'EQL')+' $$$'));
    A.sweeps.forEach(s=>{line(s.i,s.at,s.p,'#b388ff',1,1,'');marks.push({time:T(s.at),position:s.t==='H'?'aboveBar':'belowBar',color:'#ff7ad9',shape:'circle',size:0,text:'X'})})}
   series.setMarkers(marks.sort((x,y)=>x.time-y.time));
  }catch(e){console.error(e);$('err').textContent='Draw error: '+e.message}
 }
 const v={chart,series,force:render};V.push(v);return v;
}
const main=view($('box'),()=>({bos:S.L.struct,ch:S.L.struct,ob:S.L.ob,fvg:S.L.fvg,liq:S.L.liq,idm:S.L.idm,htf:1}));
const chart=main.chart,series=main.series;
[['ob','Order Block (OB)'],['fvg','Fair Value Gap (FVG)'],['liq','Liquidity ($$$ and sweep)'],['ch','Change of Character (CHoCH)'],['bos','Break of Structure (BOS)']].forEach(([k,t])=>{
 const s=document.createElement('section');s.innerHTML=`<h2>${t} <small id="n_${k}" class="msg"></small></h2><div class="cbox"><div class="ch"></div></div>`;
 $('extra').appendChild(s);view(s.querySelector('.cbox'),()=>({[k]:1}))});
function counts(){const A=S.A,n=(k,v)=>$('n_'+k).textContent=v+' found';
 n('ob',A.obs.filter(o=>!o.mit).length);n('fvg',A.fvg.filter(o=>!o.mit).length);n('liq',A.liq.length+A.sweeps.length);
 n('ch',A.ev.filter(e=>e.k==='CHoCH').length);n('bos',A.ev.filter(e=>e.k==='BOS').length)}
// data
async function load(sym,first){
 try{const r=await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}USDT&interval=${S.tf}&limit=500`);if(!r.ok)throw 0;
  const k=await r.json();if(!k.length)throw 0;
  S.sym=sym;
  S.c=k.map(x=>({time:Math.floor(x[0]/1000),open:+x[1],high:+x[2],low:+x[3],close:+x[4]}));
  const lp=S.c[S.c.length-1].close,pr=lp>=100?2:lp>=1?4:lp>=.1?5:lp>=.01?6:8,n=S.c.length;
  S.A=SMC.analyze(S.c,/m$/.test(S.tf)?5:4);S.T=SMC.setup(S.c,S.A);
  for(const v of V){const r=v.chart.timeScale().getVisibleLogicalRange();
   v.series.applyOptions({priceFormat:{type:'price',precision:pr,minMove:Math.pow(10,-pr)}});v.series.setData(S.c);
   if(first||!r)v.chart.timeScale().setVisibleLogicalRange({from:n-110,to:n+8});else v.chart.timeScale().setVisibleLogicalRange(r)}
  S.lines.forEach(l=>series.removePriceLine(l));S.lines=[];const T=S.T;
  if(T&&!T.none){const pl=(p,t,col)=>S.lines.push(series.createPriceLine({price:p,color:col,lineWidth:1,lineStyle:2,axisLabelVisible:true,title:t}));
   pl(T.entry,'ENTRY','#f0b429');pl(T.sl,'SL','#ff5d6c');T.tps.forEach((t,i)=>pl(t.p,'TP'+(i+1),'#2ecc9a'))}
  S.lines.push(series.createPriceLine({price:S.A.range.eq,color:'#6b7c93',lineWidth:1,lineStyle:1,axisLabelVisible:true,title:'EQ 50%'}));
  badge(lp);renderB();renderD();renderR();counts();force();loadTD(first);if(first)loadHTF();if(first&&$('btout'))$('btout').textContent='';
 }catch(e){$('B').innerHTML=`<h3>Trade setup</h3><p class="msg">${sym} is not available on Binance (USDT). Try another coin.</p>`}
}
function badge(lp){$('badge').innerHTML=`${logo(S.sym,S.img)}<span>${S.sym}</span><small>${pf(lp)}</small>`}
function renderB(){const T=S.T;let h='<h3>Trade setup (auto)</h3>';
 if(!T)h+='<p class="msg">Market structure is not clear yet. Try another time frame.</p>';
 else if(T.none)h+=`<p><span class="tag ${T.d>0?'up':'down'}">${T.d>0?'BULLISH':'BEARISH'}</span></p><p class="msg">No clean OB / FVG zone to enter right now. Wait for price to leave a new zone.</p>`;
 else{const G=SMC.grade(T,S.td),gt=G?`<span class="grade" style="background:${GC[G.g]}">${G.g}</span> <span class="msg">${G.pts}/${G.max}${S.td&&S.td.dir&&S.td.dir!==T.d?' · against daily bias':''}</span>`:'';const row=(n,p,col,x)=>`<tr><td style="color:${col}">${n}</td><td>${pf(p)}</td><td>${x}</td></tr>`,ck=(ok,t)=>`<span class="${ok?'up':'down'}">${ok?'✓':'✗'}</span> ${t}`;
  h+=`<p><span class="tag ${T.d>0?'up':'down'}">${T.d>0?'LONG':'SHORT'}</span> <span class="msg">from ${T.d>0?'Bullish':'Bearish'} ${T.src}${T.conf?' + FVG (strong zone)':''} · ${S.tf}</span> ${gt}</p><table>`+
   row('Entry',T.entry,'#f0b429',T.inside?'price in zone':pp(T.last,T.entry)+' away')+row('SL',T.sl,'#ff5d6c',pp(T.sl,T.entry))+
   T.tps.map((t,i)=>row('TP'+(i+1),t.p,'#2ecc9a','RR '+t.rr.toFixed(1))).join('')+'</table>'+
   `<p class="chk">${ck(T.conf,'OB + FVG confluence')}<br>${ck(T.sweep,'Liquidity sweep before entry'+(T.sweep?` (${T.sweepAgo} bars ago)`:''))}<br>${ck(T.pd,T.d>0?'Discount zone (below 50%)':'Premium zone (above 50%)')}</p><button id="saveBtn" class="moreBtn">Save setup</button>`}
 $('B').innerHTML=h;
 if($('saveBtn'))$('saveBtn').onclick=()=>{const l=ls.get('smcSaved',[]);l.unshift({sym:S.sym,tf:S.tf,d:T.d,entry:T.entry,sl:T.sl,tps:T.tps.map(t=>t.p),t:Math.floor(Date.now()/1000)});ls.set('smcSaved',l.slice(0,20));renderSV()}}
function renderD(){const A=S.A,T=S.T,e=A.ev[A.ev.length-1],n=k=>A.ev.filter(x=>x.k===k).length;let h='<h3>විස්තරය</h3>';
 if(!e){$('D').innerHTML=h+'<p class="msg">Structure එකක් තවම හඳුනාගත්තේ නෑ.</p>';return}
 const up=A.trend>0;
 h+=`<p>${S.tf} structure එක <b class="${up?'up':'down'}">${up?'Bullish (ඉහළට)':'Bearish (පහළට)'}</b>. අන්තිමට ${pf(e.p)} level එක ${e.d>0?'ඉහළට':'පහළට'} බිඳුණේ <b>${e.k}</b> එකක් ලෙසින්. ${e.k==='CHoCH'?'(CHoCH = trend එක මාරු වීමේ ලකුණ)':'(BOS = දැන් තියෙන trend එක ඉදිරියට යනවා)'}</p>`;
 if(T&&!T.none)h+=`<p>Entry zone එක ${T.src} එකක්: ${pf(T.z.bot)} – ${pf(T.z.top)}. ${T.d>0?'මිල මේ zone එකට පහළට pullback වුණාම buy':'මිල මේ zone එකට ඉහළට pullback වුණාම sell'} සලකන්න. Entry = zone මැද, SL = zone එකට පිටින් (zone එක කැඩුණොත් setup එක අවලංගුයි).</p><p>TP වලින් ${T.tps.filter(t=>t.s==='liquidity').length} ක් ඉතුරු liquidity ($$$) levels; අනිත් ඒවා RR අනුව.</p>`;
 else h+='<p>දැනට මිල ආපහු එන්න පුළුවන් නිරෝධ zone එකක් නෑ. අලුත් OB/FVG එකක් හැදෙනකම් බලන්න.</p>';
 h+=`<p class="msg">Chart එකේ: BOS ${n('BOS')}, CHoCH ${n('CHoCH')}, OB ${A.obs.filter(o=>!o.mit).length}, FVG ${A.fvg.filter(o=>!o.mit).length}, Liquidity ${A.liq.length}, Sweep ${A.sweeps.length}. මේක auto analysis එකක් විතරයි, financial advice නෙවෙයි.</p>`;
 $('D').innerHTML=h}
// top-down checklist, risk calculator, saved setups, backtest
const KL='https://data-api.binance.vision/api/v3/klines';
async function kl(sym,tf,lim,start){const r=await fetch(`${KL}?symbol=${sym}USDT&interval=${tf}&limit=${lim}`+(start?`&startTime=${start}`:''));if(!r.ok)throw 0;
 return(await r.json()).map(x=>({time:Math.floor(x[0]/1000),open:+x[1],high:+x[2],low:+x[3],close:+x[4]}))}
async function loadTD(f){if(!f&&Date.now()-S.tdT<60000&&S.tdSym===S.sym)return;S.tdT=Date.now();S.tdSym=S.sym;
 try{const[d,h4,h1,m]=await Promise.all(['1d','4h','1h','15m'].map(t=>kl(S.sym,t,300)));S.td=SMC.topDown({'1d':d,'4h':h4,'1h':h1,'15m':m})}catch(e){S.td=null}renderTD();renderB()}
function renderTD(){const t=S.td;let h='<h3>Top-down checklist</h3>';
 if(!t)h+='<p class="msg">Loading...</p>';
 else h+=`<p><span class="tag ${t.dir>0?'up':t.dir<0?'down':'n'}">${t.dir>0?'BULLISH':t.dir<0?'BEARISH':'NO BIAS'}</span> <b>${t.score}/4</b></p>`+t.items.map(i=>`<p><span class="${i.ok?'up':'down'}">${i.ok?'✓':'✗'}</span> <b>${i.tf}</b> ${i.label}<br><span class="msg">${i.detail}</span></p>`).join('');
 $('TD').innerHTML=h}
function renderR(){const r=ls.get('smcRisk',{a:1000,r:1});
 if(!$('ra')){$('R').innerHTML=`<h3>Risk calculator</h3><div class="rin"><label>Account $<input id="ra" type="number" min="1" value="${r.a}"></label><label>Risk %<input id="rr" type="number" min="0.1" step="0.1" value="${r.r}"></label></div><div id="rout"></div>`;
  ['ra','rr'].forEach(i=>$(i).oninput=()=>{ls.set('smcRisk',{a:+$('ra').value,r:+$('rr').value});renderR()})}
 const a=+$('ra').value,p=+$('rr').value,T=S.T;let h='';
 if(!T||T.none||!(a>0)||!(p>0))h='<p class="msg">No setup to size right now.</p>';
 else{const risk=a*p/100,q=risk/Math.abs(T.entry-T.sl);
  h=`<p>Risk: <b>$${risk.toFixed(2)}</b></p><p>Position size: <b>${q>=1?q.toFixed(2):q.toPrecision(3)} ${S.sym}</b> (≈ $${(q*T.entry).toFixed(2)})</p>`+T.tps.map((t,i)=>`<p class="up">TP${i+1}: +$${(q*Math.abs(t.p-T.entry)).toFixed(2)}</p>`).join('')+`<p class="down">SL: -$${risk.toFixed(2)}</p>`}
 $('rout').innerHTML=h}
const lbl=e=>({pending:'⏳ waiting for entry',entered:'▶ entered',missed:'⚪ missed (no pullback)',sl:e.hit?`TP${e.hit} ✓ then SL`:'❌ SL hit'}[e.st]||`✅ TP${e.hit} hit`);
async function renderSV(){const list=ls.get('smcSaved',[]);
 const rows=await Promise.all(list.map(async s=>{let e={st:'pending',hit:0};try{e=SMC.evalSaved(s,await kl(s.sym,'5m',1000,s.t*1000))}catch(x){}return{s,e}}));
 $('SV').innerHTML='<h3>Saved setups</h3>'+(rows.length?'<table>'+rows.map(({s,e},i)=>`<tr><td>${logo(s.sym)} <b>${s.sym}</b> ${s.tf} <span class="${s.d>0?'up':'down'}">${s.d>0?'LONG':'SHORT'}</span><br><small class="msg">Entry ${pf(s.entry)} · SL ${pf(s.sl)}</small></td><td>${lbl(e)}</td><td><button class="x" data-i="${i}">✕</button></td></tr>`).join('')+'</table>':'<p class="msg">Nothing saved yet. Use "Save setup" on a trade setup.</p>');
 document.querySelectorAll('#SV .x').forEach(b=>b.onclick=()=>{const l=ls.get('smcSaved',[]);l.splice(+b.dataset.i,1);ls.set('smcSaved',l);renderSV()})}
$('BT').innerHTML='<h3>Backtest</h3><p class="msg">Runs this method on the selected coin and time frame (last 1000 candles).</p><button id="btRun" class="moreBtn">Run backtest</button><div id="btout"></div>';
$('btRun').onclick=async()=>{$('btout').textContent='Running...';
 try{const c=await kl(S.sym,S.tf,1000);await new Promise(r=>setTimeout(r,30));const r=SMC.backtest(c),pc=(a,b)=>b?(a/b*100).toFixed(0)+'%':'-';
  $('btout').innerHTML=r.resolved?`<p>${S.sym} · ${S.tf}: setups <b>${r.setups}</b>, entered <b>${r.filled}</b>, finished <b>${r.resolved}</b></p><p class="up">TP1 hit: <b>${pc(r.wins,r.resolved)}</b> · TP2: ${pc(r.tp2,r.resolved)} · TP3: ${pc(r.tp3,r.resolved)}</p><p class="down">SL first: <b>${pc(r.losses,r.resolved)}</b></p><p>Expectancy (exit at TP1): <b>${r.exp>=0?'+':''}${r.exp.toFixed(2)}R</b> per trade</p><p>Strong zones (OB+FVG): ${r.strongN?pc(r.strongWin,r.strongN)+' win ('+r.strongN+' trades)':'none'}</p><p class="msg">Past results do not guarantee future results.</p>`:'<p class="msg">Not enough finished setups on this data. Try another time frame.</p>'}
 catch(e){$('btout').textContent='Could not run the backtest for this coin.'}};
// higher-time-frame zones on the current chart
const TFS=['1m','5m','15m','1h','4h','1d','1w'];
async function loadHTF(){const h=$('htf').value;S.htf=[];
 if(h&&TFS.indexOf(h)>TFS.indexOf(S.tf)){try{const c=await kl(S.sym,h,300),A=SMC.analyze(c),tg=h.toUpperCase();
  for(const d of[1,-1]){A.obs.filter(o=>!o.mit&&o.d===d).slice(-2).forEach(o=>S.htf.push({...o,t:c[o.i].time,tag:tg+' '+(d>0?'Bull':'Bear')+' OB'}));
   A.fvg.filter(o=>!o.mit&&o.d===d).slice(-2).forEach(o=>S.htf.push({...o,t:c[o.i].time,tag:tg+' FVG',f:1}))}}catch(e){}}
 force()}
$('htf').onchange=loadHTF;
// coin scanner (top 30 coins by volume, 1h setup + top-down score)
$('SC').innerHTML='<h3>Coin scanner</h3><p class="msg">Scans the 30 most traded coins: top-down score and setup grade (1h setup).</p><button id="scRun" class="moreBtn">Scan top 30</button><div id="scOut"></div>';
$('scRun').onclick=async()=>{const out=$('scOut');out.textContent='Loading coins...';
 try{const all=(await(await fetch('https://data-api.binance.vision/api/v3/ticker/24hr')).json()).filter(t=>t.symbol.endsWith('USDT')&&!/UP|DOWN|USDC|FDUSD|TUSD|USDP|BUSD|EUR|^USD/.test(t.symbol)).sort((a,b)=>b.quoteVolume-a.quoteVolume).slice(0,30),rows=[];let k=0;
  for(let i=0;i<all.length;i+=5)await Promise.all(all.slice(i,i+5).map(async t=>{const sym=t.symbol.replace('USDT','');
   try{const[d,h4,h1,m]=await Promise.all(['1d','4h','1h','15m'].map(x=>kl(sym,x,300)));const td=SMC.topDown({'1d':d,'4h':h4,'1h':h1,'15m':m}),T=td.setup,g=SMC.grade(T,td);rows.push({sym,td,T,g,pts:g?g.pts:-1})}catch(e){}
   out.textContent=`Scanning ${++k}/${all.length}...`}));
  rows.sort((a,b)=>b.pts-a.pts);
  out.innerHTML='<table>'+rows.slice(0,15).map(r=>`<tr class="sc" data-s="${r.sym}"><td>${logo(r.sym)} <b>${r.sym}</b></td><td><span class="${r.td.dir>0?'up':r.td.dir<0?'down':''}">${r.td.dir>0?'Bull':r.td.dir<0?'Bear':'-'}</span> ${r.td.score}/4</td><td>${r.g?`<span class="grade" style="background:${GC[r.g.g]}">${r.g.g}</span>`:'<span class="msg">no zone</span>'}</td><td>${r.T&&!r.T.none?pp(r.T.last,r.T.entry)+' to entry':''}</td></tr>`).join('')+'</table><p class="msg">Tap a coin to open it.</p>';
  document.querySelectorAll('.sc').forEach(r=>r.onclick=()=>{$('q').value=r.dataset.s;S.img='';load(r.dataset.s,1);scrollTo({top:0,behavior:'smooth'})})
 }catch(e){out.textContent='Could not scan right now. Try again.'}};
// controls
document.querySelectorAll('#tfbar button').forEach(b=>b.onclick=()=>{S.tf=b.dataset.tf;document.querySelectorAll('#tfbar button').forEach(x=>x.classList.toggle('on',x===b));load(S.sym,1)});
document.querySelectorAll('#tools [data-l]').forEach(b=>b.onclick=()=>{S.L[b.dataset.l]^=1;b.classList.toggle('on');force()});
const zoom=f=>{const ts=chart.timeScale(),r=ts.getVisibleLogicalRange();if(r)ts.setVisibleLogicalRange({from:r.to-(r.to-r.from)*f,to:r.to})};
$('zin').onclick=()=>zoom(.6);$('zout').onclick=()=>zoom(1.6);
$('zfit').onclick=()=>{const n=S.c.length;chart.timeScale().setVisibleLogicalRange({from:n-110,to:n+8})};
$('zbig').onclick=()=>$('box').classList.toggle('big');
$('searchForm').onsubmit=e=>{e.preventDefault();const v=$('q').value.trim().toUpperCase().replace(/USDT$/,'').split(' ')[0];if(v){S.img='';load(v,1);$('q').blur();$('sug').innerHTML=''}};
let t;$('q').oninput=()=>{clearTimeout(t);const v=$('q').value.trim();if(v.length<2){$('sug').innerHTML='';return}
 t=setTimeout(async()=>{try{const r=await(await fetch('https://api.coingecko.com/api/v3/search?query='+encodeURIComponent(v))).json();
  $('sug').innerHTML=r.coins.slice(0,8).map(c=>`<li data-s="${c.symbol.toUpperCase()}" data-i="${c.thumb}">${logo(c.symbol.toUpperCase(),c.thumb)}<b>${c.name}</b><span>${c.symbol.toUpperCase()}</span></li>`).join('');
  document.querySelectorAll('#sug li').forEach(l=>l.onmousedown=l.ontouchstart=e=>{e.preventDefault();$('q').value=l.dataset.s;$('sug').innerHTML='';S.img=l.dataset.i;load(l.dataset.s,1)})}catch(e){}},350)};
$('q').onblur=()=>setTimeout(()=>$('sug').innerHTML='',150);
renderSV();setInterval(renderSV,60000);load('BTC',1);setInterval(()=>load(S.sym,0),20000);
