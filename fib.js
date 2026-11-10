const $=id=>document.getElementById(id);
const ls={get:(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const clone=o=>JSON.parse(JSON.stringify(o));
const cdn=s=>`https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/32/color/${s.toLowerCase()}.png`;
function fb(el,s){if(!el.dataset.f){el.dataset.f=1;el.src=cdn(s)}else el.outerHTML=`<i class="lg">${s[0]}</i>`}
const logo=(s,img)=>{s=String(s).replace(/[^A-Za-z0-9]/g,'');return `<img class="lgo" src="${img||cdn(s)}" alt="" onerror="fb(this,'${s}')">`};
const pf=p=>p>=100?p.toFixed(2):p>=1?p.toFixed(4):p.toPrecision(5);
const pp=(p,r)=>((p-r)/r*100).toFixed(2)+'%';
const GC={'A+':'#f0b429',A:'#2ecc9a',B:'#4ea1ff',C:'#8a9bb0'},TFS=['1m','5m','15m','1h','4h','1d','1w'];
let S={sym:'BTC',tf:'1h',img:'',c:[],A:null,F:null,rx:null,lines:[],L:{ret:1,ote:1},man:null,pick:0,tap:null,hf:null};
let CFG=ls.get('fibCfg',null);if(!CFG||!CFG.levels||CFG.levels.length!==FIB.DEF.levels.length||!CFG.zone)CFG=clone(FIB.DEF);
setInterval(function t(){const d=new Date();$('time').textContent=d.toLocaleTimeString();$('date').textContent=d.toLocaleDateString('en',{weekday:'short',year:'numeric',month:'short',day:'numeric'});return t}(),1000);
const tg=o=>{$('drawer').classList.toggle('open',o);$('scrim').classList.toggle('show',o)};
$('menuBtn').onclick=()=>tg(1);$('scrim').onclick=()=>tg(0);
const KL='https://data-api.binance.vision/api/v3/klines';
async function kl(sym,tf,lim,start){const r=await fetch(`${KL}?symbol=${sym}USDT&interval=${tf}&limit=${lim}`+(start?`&startTime=${start}`:''));if(!r.ok)throw 0;
 return(await r.json()).map(x=>({time:Math.floor(x[0]/1000),open:+x[1],high:+x[2],low:+x[3],close:+x[4],vol:+x[5]}))}
const chart=LightweightCharts.createChart($('cht'),{autoSize:true,layout:{background:{color:'#0e1621'},textColor:'#8a9bb0'},grid:{vertLines:{color:'#1a2636'},horzLines:{color:'#1a2636'}},rightPriceScale:{borderColor:'#243447'},timeScale:{borderColor:'#243447',timeVisible:true,rightOffset:8}});
const series=chart.addCandlestickSeries({upColor:'#2ecc9a',downColor:'#ff5d6c',wickUpColor:'#2ecc9a',wickDownColor:'#ff5d6c',borderVisible:false});
const made=[],none={autoscaleInfoProvider:()=>null,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false};
// 1) manual leg: tap start candle, then end candle
function manLeg(){const m=S.man,c=S.c;if(!m)return null;const ia=c.findIndex(x=>x.time===m.ta),ib=c.findIndex(x=>x.time===m.tb);if(ia<0||ib<0)return null;
 return m.d>0?{d:1,a:{i:ia,p:c[ia].low},b:{i:ib,p:c[ib].high}}:{d:-1,a:{i:ia,p:c[ia].high},b:{i:ib,p:c[ib].low}}}
chart.subscribeClick(p=>{if(!S.pick||!p.time||!p.point)return;const i=S.c.findIndex(x=>x.time===p.time),pr=series.coordinateToPrice(p.point.y);if(i<0||pr==null)return;
 if(S.pick===1){S.tap={i,pr};S.pick=2;$('hint').textContent='Now tap the END of the leg (the swing high / low).';return}
 if(i===S.tap.i)return;let a=S.tap,b={i,pr};if(a.i>b.i)[a,b]=[b,a];
 S.man={d:b.pr>a.pr?1:-1,ta:S.c[a.i].time,tb:S.c[b.i].time};S.pick=0;$('hint').textContent='';$('fman').classList.remove('on');refit()});
$('fman').onclick=()=>{S.pick=S.pick?0:1;$('fman').classList.toggle('on',!!S.pick);$('hint').textContent=S.pick?'Tap the START of the leg (a swing low for up, swing high for down).':''};
$('fauto').onclick=()=>{S.man=null;S.pick=0;$('fman').classList.remove('on');$('hint').textContent='';refit()};
// drawing (native series)
function render(){
 try{made.forEach(m=>chart.removeSeries(m));made.length=0;$('err').textContent='';
  const F=S.F,c=S.c;if(!F||!c.length)return;const last=c.length-1,T=i=>c[Math.max(0,Math.min(last,i))].time;
  const ser=(pts,col,w,st,mk)=>{const m=new Map();pts.forEach(p=>m.set(Math.max(0,Math.min(last,p.i)),p.v));if(mk)m.set(mk.i,m.get(mk.i)??pts[pts.length-1].v);
   const idx=[...m.keys()].sort((a,b)=>a-b);if(idx.length<2)return;
   const s=chart.addLineSeries({...none,color:col,lineWidth:w,lineStyle:st});s.setData(idx.map(i=>({time:T(i),value:m.get(i)})));
   if(mk)s.setMarkers([{time:T(mk.i),position:'aboveBar',shape:'circle',size:0,color:col,text:mk.text}]);made.push(s)};
  const{a,b}=F.leg,lab=Math.max(b.i+1,last-8);
  ser([{i:a.i,v:a.p},{i:b.i,v:b.p}],'#e6edf3',1,2,null);
  if(S.L.ret){F.levels.forEach(l=>ser([{i:a.i,v:l.p},{i:last,v:l.p}],l.col,1,0,{i:Math.min(last,lab),text:`${l.r} (${pf(l.p)})`}));
   F.clusters.forEach(x=>ser([{i:a.i,v:x.p},{i:last,v:x.p}],'#b388ff',3,0,{i:Math.min(last,Math.max(a.i+1,last-16)),text:`Cluster ${x.r} + ${x.with}`}));
   if(S.hf){const i0=Math.max(0,c.findIndex(x=>x.time>=S.hf.ta));if(i0<last)S.hf.levels.forEach(l=>ser([{i:i0,v:l.p},{i:last,v:l.p}],l.col,1,2,{i:Math.min(last,Math.max(i0+1,last-24)),text:`${S.hf.name} ${l.r} (${pf(l.p)})`}))}}
  if(S.L.ote){const e=last,i=Math.min(b.i,last-1),col=F.d>0?'#2ecc9a':'#ff5d6c';if(e>i){const s=chart.addBaselineSeries({...none,baseValue:{type:'price',price:F.zone.lo},topLineColor:col,topFillColor1:col+'44',topFillColor2:col+'44',bottomLineColor:'rgba(0,0,0,0)',bottomFillColor1:'rgba(0,0,0,0)',bottomFillColor2:'rgba(0,0,0,0)',lineWidth:1});
   s.setData([{time:T(i),value:F.zone.hi},{time:T(e),value:F.zone.hi}]);s.setMarkers([{time:T(i),position:'inBar',shape:'circle',size:0,color:col,text:(F.d>0?'Buy':'Sell')+' zone '+F.zr[0]+'–'+F.zr[1]}]);made.push(s)}}
 }catch(e){console.error(e);$('err').textContent='Draw error: '+e.message}
}
function plines(){S.lines.forEach(l=>series.removePriceLine(l));S.lines=[];const F=S.F;
 if(F){const pl=(p,t,col)=>S.lines.push(series.createPriceLine({price:p,color:col,lineWidth:1,lineStyle:2,axisLabelVisible:true,title:t}));
  pl(F.entry,'ENTRY','#f0b429');pl(F.sl,'SL','#ff5d6c');F.tps.forEach((t,i)=>pl(t.p,'TP'+(i+1),'#2ecc9a'))}}
function refit(){const A=S.A;if(!A){S.F=null;S.rx=null}else{const ex=S.hf?[{name:S.hf.name+' HTF',levels:S.hf.cl}]:[];S.F=FIB.fib(S.c,A,CFG,manLeg(),ex);S.rx=S.F?FIB.reactions(S.c,A,S.F.d):null}
 plines();renderB();renderD();renderRX();renderR();render()}
async function loadHTF(){const h=$('htf').value;S.hf=null;
 if(h&&TFS.indexOf(h)>TFS.indexOf(S.tf)){try{const c=await kl(S.sym,h,300),A=SMC.analyze(c,+$('sw').value),F=FIB.fib(c,A,CFG);
  if(F)S.hf={name:h.toUpperCase(),levels:F.levels,cl:FIB.levelPrices(F.leg,FIB.CL),ta:c[F.leg.a.i].time}}catch(e){}}
 refit()}
async function load(sym,first){
 try{const k=await kl(sym,S.tf,500);if(!k.length)throw 0;const rg=chart.timeScale().getVisibleLogicalRange();
  if(first||sym!==S.sym)S.man=null;S.sym=sym;S.c=k;
  const lp=S.c[S.c.length-1].close,pr=lp>=100?2:lp>=1?4:lp>=.1?5:lp>=.01?6:8,n=S.c.length;
  series.applyOptions({priceFormat:{type:'price',precision:pr,minMove:Math.pow(10,-pr)}});series.setData(S.c);
  S.A=SMC.analyze(S.c,+$('sw').value);
  if(first||!rg)chart.timeScale().setVisibleLogicalRange({from:n-110,to:n+8});else chart.timeScale().setVisibleLogicalRange(rg);
  $('badge').innerHTML=`${logo(S.sym,S.img)}<span>${S.sym}</span><small>${pf(lp)}</small>`;
  if(first)loadHTF();else refit();if(first&&$('btout'))$('btout').textContent='';
 }catch(e){$('B').innerHTML=`<h3>Fibonacci setup</h3><p class="msg">${sym} is not available on Binance (USDT). Try another coin.</p>`}
}
// cards
function renderB(){const F=S.F;let h='<h3>Fibonacci setup (auto)</h3>';
 if(!F)h+='<p class="msg">No clear swing leg yet. Try another time frame or swing size.</p>';
 else{const G=FIB.grade(F,S.rx),gt=G?`<span class="grade" style="background:${GC[G.g]}">${G.g}</span> <span class="msg">${G.pts}/${G.max}</span>`:'';
  const row=(n,p,col,x)=>`<tr><td style="color:${col}">${n}</td><td>${pf(p)}</td><td>${x}</td></tr>`,ck=(ok,t)=>`<span class="${ok?'up':'down'}">${ok?'✓':'✗'}</span> ${t}`;
  h+=`<p><span class="tag ${F.d>0?'up':'down'}">${F.d>0?'LONG':'SHORT'}</span> <span class="msg">zone ${F.zr[0]}–${F.zr[1]} · ${S.tf}${S.man?' · manual leg':''}</span> ${gt}</p><table>`+
   row('Entry',F.entry,'#f0b429',F.state==='inside'?'price in zone':pp(F.last,F.entry)+' away')+row('SL',F.sl,'#ff5d6c',pp(F.sl,F.entry))+
   F.tps.map((t,i)=>row('TP'+(i+1),t.p,'#2ecc9a','RR '+t.rr.toFixed(1))).join('')+'</table>'+
   `<p class="chk">${ck(F.state==='inside',`Price inside ${F.zr[0]}–${F.zr[1]} zone`)}<br>${ck(F.conf.length>0,'SMC confluence in zone'+(F.conf.length?' ('+F.conf.join(' + ')+')':''))}<br>${ck(F.aligned,'Leg follows market structure')}<br>${ck(F.clusterInZone,'Fib cluster in zone'+(F.clusters.length?' ('+F.clusters.map(x=>x.with).join(', ')+')':''))}<br>${ck(!F.broken,'Leg still valid (origin not broken)')}<br>${ck(!F.small,'Leg size is meaningful')}</p><button id="saveBtn" class="moreBtn">Save setup</button> <button id="jBtn" class="moreBtn">📒 Take trade</button> <button class="moreBtn" data-alert>🔔 Alert at entry</button>`}
 $('B').innerHTML=h;
 if($('saveBtn'))$('saveBtn').onclick=()=>{const l=ls.get('fibSaved',[]);l.unshift({sym:S.sym,tf:S.tf,d:F.d,entry:F.entry,sl:F.sl,tps:F.tps.map(t=>t.p),t:Math.floor(Date.now()/1000)});ls.set('fibSaved',l.slice(0,20));renderSV()}}
function renderD(){const F=S.F;let h='<h3>විස්තරය</h3>';if(!F){$('D').innerHTML=h+'<p class="msg">Swing leg එකක් හඳුනාගත්තේ නෑ.</p>';return}
 const up=F.d>0,st={above:'මිල zone එකට '+(up?'ඉහළින්':'පහළින්')+'. pullback එකක් එනකම් බලන්න.',inside:'මිල දැන් zone එක ඇතුළේ. '+(up?'buy':'sell')+' සලකුණු බලන්න පුළුවන් තැන.',below:'මිල zone එක පහුවෙලා ගිහින්. setup එක දුර්වලයි.'}[F.state];
 h+=`<p>Leg එක: <b class="${up?'up':'down'}">${up?'Swing Low සිට Swing High දක්වා (ඉහළට)':'Swing High සිට Swing Low දක්වා (පහළට)'}</b> · ${pf(F.leg.a.p)} → ${pf(F.leg.b.p)}${S.man?' (ඔයා තෝරපු leg එක)':''}.</p><p>මිල ${up?'ආපහු පහළට':'ආපහු ඉහළට'} ${F.zr[0]}–${F.zr[1]} area එකට (${pf(F.zone.lo)} – ${pf(F.zone.hi)}) ආවම ${up?'buy':'sell'} බලන්න. Entry = zone මැද, SL = leg එකේ ආරම්භයට පිටින්, TP = 0 level එක සහ -0.28 / -0.62.</p><p>${st}${F.conf.length?' Zone එකේ SMC '+F.conf.join(' සහ ')+' එකක් තියෙනවා.':''}${F.clusters.length?' Fib cluster එකක් ('+F.clusters.map(x=>x.r+' + '+x.with).join(', ')+') නිසා ඒ level එක ශක්තිමත්.':''}${F.broken?' <b class="down">Leg එකේ ආරම්භය කැඩිලා, setup එක අවලංගුයි.</b>':''}</p>`+
  '<table>'+F.levels.map(l=>`<tr><td style="color:${l.col}">${l.r}</td><td>${pf(l.p)}</td></tr>`).join('')+'</table><p class="msg">Auto analysis එකක් විතරයි, financial advice නෙවෙයි.</p>';
 $('D').innerHTML=h}
function renderRX(){const F=S.F,rx=S.rx;let h='<h3>Level reactions (history)</h3>';
 if(!F||!rx)h+='<p class="msg">No data yet.</p>';
 else{const rs=[0.5,0.62,0.79];h+=`<p class="msg">${F.d>0?'Up':'Down'} legs on this coin and time frame: after price retraced at least to the level, how often it then made a new ${F.d>0?'high':'low'} before breaking the leg start.</p><table>`+
  rs.map(r=>{const x=rx[r];return `<tr><td>${r}</td><td>${x.n?(x.ok/x.n*100).toFixed(0)+'%':'-'}</td><td class="msg">${x.n} cases</td></tr>`}).join('')+'</table>'+(Math.max(...rs.map(r=>rx[r].n))<5?'<p class="msg">Few cases on this data, treat with care.</p>':'')}
 $('RX').innerHTML=h}
function renderR(){const r=ls.get('smcRisk',{a:1000,r:1});
 if(!$('ra')){$('R').innerHTML=`<h3>Risk calculator</h3><div class="rin"><label>Account $<input id="ra" type="number" min="1" value="${r.a}"></label><label>Risk %<input id="rr" type="number" min="0.1" step="0.1" value="${r.r}"></label></div><div id="rout"></div>`;
  ['ra','rr'].forEach(i=>$(i).oninput=()=>{ls.set('smcRisk',{a:+$('ra').value,r:+$('rr').value});renderR()})}
 const a=+$('ra').value,p=+$('rr').value,F=S.F;let h='';
 if(!F||!(a>0)||!(p>0))h='<p class="msg">No setup to size right now.</p>';
 else{const risk=a*p/100,q=risk/Math.abs(F.entry-F.sl);
  h=`<p>Risk: <b>$${risk.toFixed(2)}</b></p><p>Position size: <b>${q>=1?q.toFixed(2):q.toPrecision(3)} ${S.sym}</b> (≈ $${(q*F.entry).toFixed(2)})</p>`+F.tps.map((t,i)=>`<p class="up">TP${i+1}: +$${(q*Math.abs(t.p-F.entry)).toFixed(2)}</p>`).join('')+`<p class="down">SL: -$${risk.toFixed(2)}</p>`}
 $('rout').innerHTML=h}
// 8) saved setups
const lbl=e=>({pending:'⏳ waiting for entry',entered:'▶ entered',missed:'⚪ missed (no pullback)',sl:e.hit?`TP${e.hit} ✓ then SL`:'❌ SL hit'}[e.st]||`✅ TP${e.hit} hit`);
async function renderSV(){const list=ls.get('fibSaved',[]);
 const rows=await Promise.all(list.map(async s=>{let e={st:'pending',hit:0};try{e=SMC.evalSaved(s,await kl(s.sym,'5m',1000,s.t*1000))}catch(x){}return{s,e}}));
 $('SV').innerHTML='<h3>Saved setups</h3>'+(rows.length?'<table>'+rows.map(({s,e},i)=>`<tr><td>${logo(s.sym)} <b>${s.sym}</b> ${s.tf} <span class="${s.d>0?'up':'down'}">${s.d>0?'LONG':'SHORT'}</span><br><small class="msg">Entry ${pf(s.entry)} · SL ${pf(s.sl)}</small></td><td>${lbl(e)}</td><td><button class="x" data-i="${i}">✕</button></td></tr>`).join('')+'</table>':'<p class="msg">Nothing saved yet. Use "Save setup" on a trade setup.</p>');
 document.querySelectorAll('#SV .x').forEach(b=>b.onclick=()=>{const l=ls.get('fibSaved',[]);l.splice(+b.dataset.i,1);ls.set('fibSaved',l);renderSV()})}
Ctx.mountBacktest($('BT'),{sym:()=>S.sym,tf:()=>S.tf,gen:(sl,A)=>{const q=FIB.fib(sl,A,CFG);if(!q||q.broken)return null;return{...q,key:q.d+'_'+q.leg.a.i,conf:q.conf.length>0}}});
// 6) scanner
$('SC').innerHTML='<h3>Coin scanner</h3><p class="msg">Scans the 30 most traded coins on the selected time frame and lists those in or near their Buy/Sell zone.</p><button id="scRun" class="moreBtn">Scan top 30</button><div id="scOut"></div>';
$('scRun').onclick=async()=>{const out=$('scOut');out.textContent='Loading coins...';
 try{const all=(await(await fetch('https://data-api.binance.vision/api/v3/ticker/24hr')).json()).filter(t=>t.symbol.endsWith('USDT')&&!/UP|DOWN|USDC|FDUSD|TUSD|USDP|BUSD|EUR|^USD/.test(t.symbol)).sort((a,b)=>b.quoteVolume-a.quoteVolume).slice(0,30),rows=[];let k=0;
  for(let i=0;i<all.length;i+=6)await Promise.all(all.slice(i,i+6).map(async t=>{const sym=t.symbol.replace('USDT','');
   try{const c=await kl(sym,S.tf,300),A=SMC.analyze(c,+$('sw').value),F=FIB.fib(c,A,CFG);
    if(F&&!F.broken){const z=F.zone,d=F.last>z.hi?(F.last-z.hi)/F.last:F.last<z.lo?(z.lo-F.last)/F.last:0;if(d<0.015)rows.push({sym,F,d,g:FIB.grade(F,null)})}}catch(e){}
   out.textContent=`Scanning ${++k}/${all.length}...`}));
  rows.sort((a,b)=>b.g.pts-a.g.pts||a.d-b.d);
  out.innerHTML=rows.length?'<table>'+rows.slice(0,15).map(r=>`<tr class="sc" data-s="${r.sym}"><td>${logo(r.sym)} <b>${r.sym}</b></td><td><span class="${r.F.d>0?'up':'down'}">${r.F.d>0?'LONG':'SHORT'}</span></td><td><span class="grade" style="background:${GC[r.g.g]}">${r.g.g}</span></td><td>${r.d?(r.d*100).toFixed(2)+'% to zone':'in zone'}</td></tr>`).join('')+'</table><p class="msg">Tap a coin to open it.</p>':'<p class="msg">No coin is in or near its zone right now.</p>';
  document.querySelectorAll('.sc').forEach(r=>r.onclick=()=>{$('q').value=r.dataset.s;S.img='';load(r.dataset.s,1);scrollTo({top:0,behavior:'smooth'})})
 }catch(e){out.textContent='Could not scan right now. Try again.'}};
// settings panel + 9) presets
function buildCfg(){$('fgrid').innerHTML=CFG.levels.map((l,i)=>`<div class="frow"><input type="checkbox" data-i="${i}" ${l.on?'checked':''}><input type="number" step="any" data-i="${i}" value="${l.r}"><input type="color" data-i="${i}" value="${l.col}"></div>`).join('');$('z1').value=CFG.zone[0];$('z2').value=CFG.zone[1]}
const cfgChange=e=>{const t=e.target,i=t.dataset.i;if(i!=null){const l=CFG.levels[+i];if(t.type==='checkbox')l.on=t.checked;else if(t.type==='color')l.col=t.value;else if(isFinite(parseFloat(t.value)))l.r=parseFloat(t.value);else return}
 else if(t.id==='z1'||t.id==='z2'){const v=parseFloat(t.value);if(!isFinite(v))return;CFG.zone[t.id==='z1'?0:1]=v}else return;
 ls.set('fibCfg',CFG);loadHTF()};
$('fgrid').addEventListener('input',cfgChange);$('fgrid').addEventListener('change',cfgChange);$('z1').oninput=$('z2').oninput=cfgChange;
const applyCfg=c=>{CFG=clone(c);ls.set('fibCfg',CFG);buildCfg();loadHTF()};
$('freset').onclick=()=>{$('fpre').value='';applyCfg(FIB.DEF)};
const pres=()=>ls.get('fibPresets',{});
function buildPre(sel){$('fpre').innerHTML='<option value="">Template</option>'+Object.keys(pres()).map(n=>`<option value="${n.replace(/"/g,'&quot;')}">${n.replace(/</g,'&lt;')}</option>`).join('');$('fpre').value=sel||''}
$('fpre').onchange=()=>{const p=pres()[$('fpre').value];if(p)applyCfg(p)};
$('fsave').onclick=()=>{const n=(prompt('Template name?')||'').trim();if(!n)return;const p=pres();p[n]=clone(CFG);ls.set('fibPresets',p);buildPre(n)};
$('fdel').onclick=()=>{const n=$('fpre').value;if(!n)return;const p=pres();delete p[n];ls.set('fibPresets',p);buildPre('')};
$('fset').onclick=()=>$('fcfg').toggleAttribute('hidden');buildCfg();buildPre('');
// controls
document.querySelectorAll('#tfbar button').forEach(b=>b.onclick=()=>{S.tf=b.dataset.tf;document.querySelectorAll('#tfbar button').forEach(x=>x.classList.toggle('on',x===b));load(S.sym,1)});
document.querySelectorAll('#tools [data-l]').forEach(b=>b.onclick=()=>{S.L[b.dataset.l]^=1;b.classList.toggle('on');render()});
$('sw').onchange=()=>load(S.sym,1);$('htf').onchange=loadHTF;
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

window.getSetup=()=>{const F=S.F;return F?{sym:S.sym,tf:S.tf,d:F.d,entry:F.entry,sl:F.sl,tps:F.tps.map(t=>t.p),src:'Fibonacci',price:S.c[S.c.length-1].close}:null};

Alerts.mount($('ALP'),$('alBtn'));HTF.mount($('HB'),()=>S.sym,()=>S.F&&S.F.d);
Alerts.init('Fibonacci',()=>S.sym,()=>S.tf,async(sym,tf)=>{const c=(await kl(sym,tf,500)).slice(0,-1),A=SMC.analyze(c,+$('sw').value),F=FIB.fib(c,A,CFG);if(!F||F.broken||F.state!=='inside')return[];const G=FIB.grade(F,null);if(!G||G.g==='C')return[];
 return[{dir:F.d,trade:{method:'Fibonacci',sym,tf,d:F.d,entry:F.entry,sl:F.sl,tps:F.tps.map(t=>t.p)},key:`FIB|${sym}|${tf}|${F.d}|${pf(F.entry)}`,title:`Fibonacci · ${sym} ${tf}`,text:`${F.d>0?'LONG':'SHORT'}: price is inside the ${F.zr[0]}–${F.zr[1]} zone${G?' (grade '+G.g+')':''}\nEntry ${pf(F.entry)} | SL ${pf(F.sl)}\n${F.tps.map((t,i)=>'TP'+(i+1)+' '+pf(t.p)).join(' | ')}`}]});

function ctxCard(){const F=S.F;Ctx.card($('CX'),{sym:S.sym,tf:S.tf,c:S.c,dir:F?F.d:0,G:F?FIB.grade(F,S.rx):null})}
{const _rf=refit;refit=function(){_rf.apply(this,arguments);ctxCard()}}
document.addEventListener('click',e=>{if(e.target.id!=='jBtn'||!S.F)return;const F=S.F;Ctx.addTrade({method:'Fibonacci',sym:S.sym,tf:S.tf,d:F.d,entry:F.entry,sl:F.sl,tps:F.tps.map(t=>t.p)})});
