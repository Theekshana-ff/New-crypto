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
setInterval(function t(){const d=new Date();if($('time'))$('time').textContent=d.toLocaleTimeString();if($('date'))$('date').textContent=d.toLocaleDateString('en',{weekday:'short',year:'numeric',month:'short',day:'numeric'});return t}(),1000);
const tg=o=>{if($('drawer'))$('drawer').classList.toggle('open',o);if($('scrim'))$('scrim').classList.toggle('show',o)};
if($('menuBtn'))$('menuBtn').onclick=()=>tg(1);
if($('scrim'))$('scrim').onclick=()=>tg(0);

// chart view factory: main chart + one separate chart per method
const V=[],force=()=>V.forEach(v=>v.force());
function view(box,Lf){
 const chart=LightweightCharts.createChart(box.firstElementChild,{autoSize:true,layout:{background:{color:'#0e1621'},textColor:'#8a9bb0'},grid:{vertLines:{color:'#1a2636'},horzLines:{color:'#1a2636'}},rightPriceScale:{borderColor:'#243447'},timeScale:{borderColor:'#243447',timeVisible:true,rightOffset:8}});
 const series=chart.addCandlestickSeries({upColor:'#2ecc9a',downColor:'#ff5d6c',wickUpColor:'#2ecc9a',wickDownColor:'#ff5d6c',borderVisible:false});
 const made=[],none={autoscaleInfoProvider:()=>null,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false};

 function render(){
  try{
   made.forEach(m=>{try{chart.removeSeries(m)}catch(e){}});made.length=0;series.setMarkers([]);if($('err'))$('err').textContent='';
   const L=Lf(),A=S.A,c=S.c;if(!A||!c.length)return;
   const last=c.length-1,marks=[],T=i=>c[Math.max(0,Math.min(last,i))].time;

   const zone=(z,col,txt)=>{
    let e=z.mit&&z.end?z.end:last;
    if(e<=z.i)e=Math.min(last,z.i+1);
    if(e<=z.i||T(e)<=T(z.i))return;
    const s=chart.addBaselineSeries({...none,baseValue:{type:'price',price:z.bot},topLineColor:col,topFillColor1:col+'66',topFillColor2:col+'66',bottomLineColor:'rgba(0,0,0,0)',bottomFillColor1:'rgba(0,0,0,0)',bottomFillColor2:'rgba(0,0,0,0)',lineWidth:1});
    s.setData([{time:T(z.i),value:z.top},{time:T(e),value:z.top}]);
    s.setMarkers([{time:T(z.i),position:'inBar',shape:'circle',size:0,color:col,text:txt}]);
    made.push(s);
   };

   const line=(i1,i2,p,col,w,st,txt)=>{
    if(i2<=i1||T(i2)<=T(i1))return;
    const m=Math.round((i1+i2)/2),pts=[],seenT=new Set();
    [i1,m,i2].forEach(idx=>{const tm=T(idx);if(!seenT.has(tm)){seenT.add(tm);pts.push({time:tm,value:p})}});
    if(pts.length<2)return;
    const s=chart.addLineSeries({...none,color:col,lineWidth:w,lineStyle:st});
    s.setData(pts);
    if(txt)s.setMarkers([{time:pts[Math.floor(pts.length/2)].time,position:'aboveBar',shape:'circle',size:0,color:col,text:txt}]);
    made.push(s);
   };

   if(L.ob)for(const q of[1,-1])(A.obs||[]).filter(o=>!o.mit&&o.d===q).slice(-3).forEach(o=>zone(o,q>0?'#2ecc9a':'#ff5d6c',(q>0?'Bull':'Bear')+' OB'+(o.conf?'+FVG':'')+(o.taps?` (${o.taps}x)`:'')));
   if(L.fvg)for(const q of[1,-1])(A.fvg||[]).filter(o=>!o.mit&&o.d===q).slice(-4).forEach(o=>zone(o,q>0?'#4ea1ff':'#f0b429','FVG'));
   (A.ev||[]).slice(-14).filter(e=>e.k==='CHoCH'?L.ch:L.bos).forEach(e=>line(e.from,e.to,e.p,e.k==='CHoCH'?'#f0b429':'#8ab4ff',e.k==='CHoCH'?2:1,e.k==='CHoCH'?2:0,e.k+(e.d>0?' ↑':' ↓')));
   if(L.htf)(S.htf||[]).forEach(z=>{const i=c.findIndex(x=>x.time>=z.t);if(i>=0)zone({...z,i,mit:0},z.f?(z.d>0?'#4ea1ff':'#f0b429'):(z.d>0?'#2ecc9a':'#ff5d6c'),z.tag)});
   if(L.idm)(A.idm||[]).forEach(m=>line(m.i,m.to,m.p,m.swept?'#ff9f43':'#ffd166',1,2,m.swept?'IDM ✓':'IDM'));
   if(L.liq){
    (A.liq||[]).slice(-6).forEach(q=>line(q.from,q.st==='open'?last:q.at,q.p,'#b388ff',1,1,(q.t==='H'?'EQH':'EQL')+' $$$'));
    (A.sweeps||[]).forEach(s=>{
     line(s.i,s.at,s.p,'#b388ff',1,1,'');
     marks.push({time:T(s.at),position:s.t==='H'?'aboveBar':'belowBar',color:'#ff7ad9',shape:'circle',size:0,text:'SWEEP'});
    });
   }
   // Deduplicate markers on same timestamp so chart never crashes
   const uniqMarks=[],mMap=new Map();
   marks.sort((x,y)=>x.time-y.time).forEach(m=>mMap.set(m.time+'_'+m.position,m));
   mMap.forEach(v=>uniqMarks.push(v));
   series.setMarkers(uniqMarks.sort((x,y)=>x.time-y.time));
  }catch(e){console.error(e);if($('err'))$('err').textContent='Draw error: '+e.message}
 }
 const v={chart,series,force:render};V.push(v);return v;
}

const main=view($('box'),()=>({bos:S.L.struct,ch:S.L.struct,ob:S.L.ob,fvg:S.L.fvg,liq:S.L.liq,idm:S.L.idm,htf:1}));
const chart=main.chart,series=main.series;

[['ob','Order Block (OB)'],['fvg','Fair Value Gap (FVG)'],['liq','Liquidity ($$$ and sweep)'],['ch','Change of Character (CHoCH)'],['bos','Break of Structure (BOS)']].forEach(([k,t])=>{
 const s=document.createElement('section');s.innerHTML=`<h2>${t} <small id="n_${k}" class="msg"></small></h2><div class="cbox"><div class="ch"></div></div>`;
 $('extra').appendChild(s);view(s.querySelector('.cbox'),()=>({[k]:1}));
});

function counts(){
 const A=S.A;if(!A)return;
 const n=(k,v)=>{if($('n_'+k))$('n_'+k).textContent=v+' found'};
 n('ob',(A.obs||[]).filter(o=>!o.mit).length);
 n('fvg',(A.fvg||[]).filter(o=>!o.mit).length);
 n('liq',(A.liq||[]).length+(A.sweeps||[]).length);
 n('ch',(A.ev||[]).filter(e=>e.k==='CHoCH').length);
 n('bos',(A.ev||[]).filter(e=>e.k==='BOS').length);
}

// Data fetch separated from UI rendering
async function load(sym,first){
 let k;
 try{
  const r=await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}USDT&interval=${S.tf}&limit=500`);
  if(!r.ok)throw 0;
  k=await r.json();
  if(!k||!k.length)throw 0;
 }catch(e){
  $('B').innerHTML=`<h3>Trade setup</h3><p class="msg">${sym} is not available on Binance (USDT). Try another coin.</p>`;
  return;
 }

 try{
  S.sym=sym;
  S.c=k.map(x=>({time:Math.floor(x[0]/1000),open:+x[1],high:+x[2],low:+x[3],close:+x[4],vol:+x[5]}));
  const lp=S.c[S.c.length-1].close,pr=lp>=100?2:lp>=1?4:lp>=.1?5:lp>=.01?6:8,n=S.c.length;
  S.A=SMC.analyze(S.c,/m$/.test(S.tf)?5:4);
  S.A.liq=S.A.liq||[];S.A.sweeps=S.A.sweeps||[];S.A.idm=S.A.idm||[];S.A.obs=S.A.obs||[];S.A.fvg=S.A.fvg||[];S.A.ev=S.A.ev||[];
  S.T=SMC.setup(S.c,S.A);

  for(const v of V){
   const r=v.chart.timeScale().getVisibleLogicalRange();
   v.series.applyOptions({priceFormat:{type:'price',precision:pr,minMove:Math.pow(10,-pr)}});
   v.series.setData(S.c);
   if(first||!r)v.chart.timeScale().setVisibleLogicalRange({from:n-110,to:n+8});
   else v.chart.timeScale().setVisibleLogicalRange(r);
  }
  S.lines.forEach(l=>{try{series.removePriceLine(l)}catch(e){}});S.lines=[];
  const T=S.T;
  if(T&&!T.none){
   const pl=(p,t,col)=>S.lines.push(series.createPriceLine({price:p,color:col,lineWidth:1,lineStyle:2,axisLabelVisible:true,title:t}));
   pl(T.entry,'ENTRY','#f0b429');pl(T.sl,'SL','#ff5d6c');
   (T.tps||[]).forEach((t,i)=>pl(t.p,'TP'+(i+1),'#2ecc9a'));
  }
  if(S.A.range&&S.A.range.eq){
   S.lines.push(series.createPriceLine({price:S.A.range.eq,color:'#6b7c93',lineWidth:1,lineStyle:1,axisLabelVisible:true,title:'EQ 50%'}));
  }
  badge(lp);
  renderB();
  renderD();
  renderR();
  counts();
  force();
  loadTD(first);
  if(first)loadHTF();
  if(first&&$('btout'))$('btout').textContent='';
 }catch(err){
  console.error(err);
 }
}

function badge(lp){if($('badge'))$('badge').innerHTML=`${logo(S.sym,S.img)}<span>${S.sym}</span><small>${pf(lp)}</small>`}

function renderB(){
 const T=S.T,A=S.A;let h='<h3>Trade setup (auto)</h3>';
 if(!T)h+='<p class="msg">Market structure is not clear yet. Try another time frame.</p>';
 else if(T.none){
  const hasZones=A&&((A.obs||[]).some(o=>!o.mit&&o.d===T.d)||(A.fvg||[]).some(f=>!f.mit&&f.d===T.d));
  h+=`<p><span class="tag ${T.d>0?'up':'down'}">${T.d>0?'BULLISH':'BEARISH'}</span></p><p class="msg">${T.far?'Active zone is too far from current price (> 8 ATR).':hasZones?'Zones found on chart, waiting for Liquidity Sweep / IDM or Candle Rejection confirmation.':'No clean OB / FVG zone to enter right now. Wait for price to leave a new zone.'}</p>`;
 }else{
  const G=SMC.grade(T,S.td),gt=G?`<span class="grade" style="background:${GC[G.g]}">${G.g}</span> <span class="msg">${G.pts}/${G.max}${S.td&&S.td.dir&&S.td.dir!==T.d?' · against daily bias':''}</span>`:'';
  const row=(n,p,col,x)=>`<tr><td style="color:${col}">${n}</td><td>${pf(p)}</td><td>${x}</td></tr>`,ck=(ok,t)=>`<span class="${ok?'up':'down'}">${ok?'✓':'✗'}</span> ${t}`;
  const idmSwept=A&&(A.idm||[]).some(id=>id.d===T.d&&id.swept&&id.i>=T.z.i);
  const hasSweep=!!(T.sweep||idmSwept);
  h+=`<p><span class="tag ${T.d>0?'up':'down'}">${T.d>0?'LONG':'SHORT'}</span> <span class="msg">from ${T.d>0?'Bullish':'Bearish'} ${T.src}${T.conf?' + FVG (strong zone)':''} · ${S.tf}</span> ${gt}</p><table>`+
   row('Entry',T.entry,'#f0b429',T.inside?'🔥 price in zone':pp(T.last,T.entry)+' away')+
   row('SL',T.sl,'#ff5d6c',pp(T.sl,T.entry))+
   (T.tps||[]).map((t,i)=>row('TP'+(i+1),t.p,'#2ecc9a','RR '+(t.rr||0).toFixed(1)+' ('+(t.s||'RR')+')')).join('')+'</table>'+
   `<p class="chk">${ck(T.conf,'OB + FVG confluence')}<br>${ck(hasSweep,'Liquidity / IDM swept'+(idmSwept?' (IDM ✓)':T.sweepAgo?` (${T.sweepAgo} bars ago)`:''))}<br>${ck(T.pd,T.d>0?'Discount zone (below 50% EQ)':'Premium zone (above 50% EQ)')}</p><button id="saveBtn" class="moreBtn">Save setup</button> <button id="jBtn" class="moreBtn">📒 Take trade</button> <button class="moreBtn" data-alert>🔔 Alert at entry</button>`;
 }
 $('B').innerHTML=h;
 if($('saveBtn'))$('saveBtn').onclick=()=>{
  const l=ls.get('smcSaved',[]);
  l.unshift({sym:S.sym,tf:S.tf,d:T.d,entry:T.entry,sl:T.sl,tps:(T.tps||[]).map(t=>t.p),t:Math.floor(Date.now()/1000)});
  ls.set('smcSaved',l.slice(0,20));renderSV();
 };
}

function renderD(){
 const box=$('D');if(!box)return;
 const A=S.A,T=S.T;
 let h='<h3>විස්තරය සහ හේතු (Reasons)</h3>';
 if(!A||!(A.ev||[]).length){
  box.innerHTML=h+'<p class="msg">Structure එකක් තවම හඳුනාගත්තේ නෑ.</p>';
  return;
 }
 const ev=A.ev||[],e=ev[ev.length-1],n=k=>ev.filter(x=>x.k===k).length;
 const up=A.trend>0;
 const sweptIdmCount=(A.idm||[]).filter(x=>x.swept).length;
 const reasons=[];

 reasons.push(`<li><b>Market Structure (${e.k}):</b> ${S.tf} චාට් එකේ අන්තිමට ${pf(e.p)} level එක ${e.d>0?'ඉහළට (Bullish)':'පහළට (Bearish)'} බිඳුණේ <b>${e.k}</b> එකක් ලෙසින්. ${e.k==='CHoCH'?'(CHoCH = trend එක මාරු වීමේ ලකුණකි)':'(BOS = දැන් තියෙන trend එක ඉදිරියට යන බව තහවුරු කරයි)'}</li>`);

 if(T&&!T.none&&T.z){
  const idmSwept=(A.idm||[]).some(id=>id.d===T.d&&id.swept&&id.i>=T.z.i);
  reasons.push(`<li><b>${T.src} කලාපය:</b> ${pf(T.z.bot)} – ${pf(T.z.top)} අතර Smart Money Orders සහිත නැවුම් කලාපයක් පවතී.${T.conf?' ඊට සමගාමීව <b>FVG Confluence</b> එකක්ද පිහිටා ඇති නිසා මෙම කලාපය ඉතා ප්‍රබල වේ.':''}</li>`);
  if(T.sweep||idmSwept){
   reasons.push(`<li><b>Liquidity / IDM Sweep (✓):</b> මිල මෙම කලාපයට පැමිණීමට පෙර Inducement / Liquidity sweep කර අවසන්ය.</li>`);
  }else{
   reasons.push(`<li><b>Liquidity තත්ත්වය:</b> තවමත් Liquidity Sweep එකක් සිදුවී නැති නිසා කලාපය තුළදී Candle Rejection එකක් බලා එන්ටර් වන්න.</li>`);
  }
  if(T.pd){
   reasons.push(`<li><b>${T.d>0?'Discount (ලාභදායී)':'Premium (ඉහළ)'} කලාපය (✓):</b> කලාපය 50% Equilibrium (${pf(A.range.eq)}) මට්ටමට ${T.d>0?'පහළින් (Buy කිරීමට සුදුසු Discount කලාපයේ)':'ඉහළින් (Sell කිරීමට සුදුසු Premium කලාපයේ)'} පිහිටා ඇත.</li>`);
  }else{
   reasons.push(`<li><b>Equilibrium (50%) මට්ටම:</b> කලාපය 50% මට්ටමට ${T.d>0?'ඉහළින්':'පහළින්'} පිහිටා ඇත.</li>`);
  }
  if(S.td&&S.td.dir){
   reasons.push(`<li><b>Top-Down Bias (${S.td.score}/4):</b> Daily (1D) ට්‍රෙන්ඩ් එක ${S.td.dir===T.d?'මෙම ට්‍රේඩ් එකේ දිශාවටම (Aligned) පවතී.':'මෙම ට්‍රේඩ් එකට විරුද්ධ දිශාවට පවතී.'}</li>`);
  }

  h+=`<p><b class="${T.d>0?'up':'down'}">${T.d>0?'🔼 මිල ඉහළ යාමට (LONG / UP) බලපාන හේතු:':'🔽 මිල පහළ යාමට (SHORT / DOWN) බලපාන හේතු:'}</b></p>`;
  h+=`<ul style="margin:6px 0 10px 18px;padding:0;line-height:1.5">${reasons.join('')}</ul>`;
  h+=`<p><b>සැලැස්ම:</b> Entry = ${pf(T.entry)} (zone මැද), SL = ${pf(T.sl)} (zone එකට පිටින්). TP වලින් ${(T.tps||[]).filter(t=>t.s==='liquidity').length} ක් ඉතුරු liquidity ($$$) levels; අනිත් ඒවා RR අනුව.</p>`;
 }else{
  h+=`<p><b class="${up?'up':'down'}">දැනට චාට් එක ${up?'Bullish (ඉහළ යන)':'Bearish (පහළ යන)'} ව්‍යුහයක පවතී:</b></p>`;
  h+=`<ul style="margin:6px 0 10px 18px;padding:0;line-height:1.5">${reasons.join('')}<li><b>Entry එකක් නොමැති වීමට හේතුව:</b> දැනට සියලුම SMC කොන්දේසි (Fresh OB/FVG + IDM/Liquidity Sweep + Candle Confirmation) සම්පූර්ණ වී නැත. මිල නියමිත කලාපයකට පැමිණ තහවුරු වන තෙක් රැඳී සිටින්න.</li></ul>`;
 }

 h+=`<p class="msg">Chart එකේ: BOS ${n('BOS')}, CHoCH ${n('CHoCH')}, OB ${(A.obs||[]).filter(o=>!o.mit).length}, FVG ${(A.fvg||[]).filter(o=>!o.mit).length}, IDM Swept ${sweptIdmCount}/${(A.idm||[]).length}, Sweep ${(A.sweeps||[]).length}. මේක auto analysis එකක් විතරයි, financial advice නෙවෙයි.</p>`;
 box.innerHTML=h;
 try{ctxCard()}catch(err){console.error(err)}
}

// top-down checklist, risk calculator, saved setups, backtest
const KL='https://data-api.binance.vision/api/v3/klines';
async function kl(sym,tf,lim,start){
 const r=await fetch(`${KL}?symbol=${sym}USDT&interval=${tf}&limit=${lim}`+(start?`&startTime=${start}`:''));if(!r.ok)throw 0;
 return(await r.json()).map(x=>({time:Math.floor(x[0]/1000),open:+x[1],high:+x[2],low:+x[3],close:+x[4],vol:+x[5]}));
}

async function loadTD(f){
 if(!f&&Date.now()-S.tdT<60000&&S.tdSym===S.sym)return;
 S.tdT=Date.now();S.tdSym=S.sym;
 try{const[d,h4,h1,m]=await Promise.all(['1d','4h','1h','15m'].map(t=>kl(S.sym,t,300)));S.td=SMC.topDown({'1d':d,'4h':h4,'1h':h1,'15m':m})}catch(e){S.td=null}
 renderTD();renderB();renderD();
}

function renderTD(){
 const t=S.td;let h='<h3>Top-down checklist</h3>';
 if(!t)h+='<p class="msg">Loading...</p>';
 else h+=`<p><span class="tag ${t.dir>0?'up':t.dir<0?'down':'n'}">${t.dir>0?'BULLISH':t.dir<0?'BEARISH':'NO BIAS'}</span> <b>${t.score}/4</b></p>`+t.items.map(i=>`<p><span class="${i.ok?'up':'down'}">${i.ok?'✓':'✗'}</span> <b>${i.tf}</b> ${i.label}<br><span class="msg">${i.detail}</span></p>`).join('');
 $('TD').innerHTML=h;
}

function renderR(){
 const r=ls.get('smcRisk',{a:1000,r:1});
 if(!$('ra')){
  $('R').innerHTML=`<h3>Risk calculator</h3><div class="rin"><label>Account $<input id="ra" type="number" min="1" value="${r.a}"></label><label>Risk %<input id="rr" type="number" min="0.1" step="0.1" value="${r.r}"></label></div><div id="rout"></div>`;
  ['ra','rr'].forEach(i=>$(i).oninput=()=>{ls.set('smcRisk',{a:+$('ra').value,r:+$('rr').value});renderR()});
 }
 const a=+$('ra').value,p=+$('rr').value,T=S.T;let h='';
 if(!T||T.none||!(a>0)||!(p>0))h='<p class="msg">No setup to size right now.</p>';
 else{
  const risk=a*p/100,q=risk/Math.abs(T.entry-T.sl);
  h=`<p>Risk: <b>$${risk.toFixed(2)}</b></p><p>Position size: <b>${q>=1?q.toFixed(2):q.toPrecision(3)} ${S.sym}</b> (≈ $${(q*T.entry).toFixed(2)})</p>`+(T.tps||[]).map((t,i)=>`<p class="up">TP${i+1}: +$${(q*Math.abs(t.p-T.entry)).toFixed(2)}</p>`).join('')+`<p class="down">SL: -$${risk.toFixed(2)}</p>`;
 }
 $('rout').innerHTML=h;
}

const lbl=e=>({pending:'⏳ waiting for entry',entered:'▶ entered',missed:'⚪ missed (no pullback)',sl:e.hit?`TP${e.hit} ✓ then SL`:'❌ SL hit'}[e.st]||`✅ TP${e.hit} hit`);
async function renderSV(){
 const list=ls.get('smcSaved',[]);
 const rows=await Promise.all(list.map(async s=>{
  let e={st:'pending',hit:0};
  try{
   const ageHrs=(Date.now()-s.t*1000)/36e5;
   const evalTf=ageHrs>80?'1h':ageHrs>20?'15m':'5m';
   const normS={...s,tps:(s.tps||[]).map(x=>typeof x==='object'?x.p:x)};
   e=SMC.evalSaved(normS,await kl(s.sym,evalTf,1000,s.t*1000));
  }catch(x){}
  return{s,e};
 }));
 $('SV').innerHTML='<h3>Saved setups</h3>'+(rows.length?'<table>'+rows.map(({s,e},i)=>`<tr><td>${logo(s.sym)} <b>${s.sym}</b> ${s.tf} <span class="${s.d>0?'up':'down'}">${s.d>0?'LONG':'SHORT'}</span><br><small class="msg">Entry ${pf(s.entry)} · SL ${pf(s.sl)}</small></td><td>${lbl(e)}</td><td><button class="x" data-i="${i}">✕</button></td></tr>`).join('')+'</table>':'<p class="msg">Nothing saved yet. Use "Save setup" on a trade setup.</p>');
 document.querySelectorAll('#SV .x').forEach(b=>b.onclick=()=>{const l=ls.get('smcSaved',[]);l.splice(+b.dataset.i,1);ls.set('smcSaved',l);renderSV()});
}

if(typeof Ctx!=='undefined'&&Ctx.mountBacktest)Ctx.mountBacktest($('BT'),{sym:()=>S.sym,tf:()=>S.tf,gen:null});

// higher-time-frame zones on the current chart
const TFS=['1m','5m','15m','1h','4h','1d','1w'];
async function loadHTF(){
 const h=$('htf').value;S.htf=[];
 if(h&&TFS.indexOf(h)>TFS.indexOf(S.tf)){
  try{
   const c=await kl(S.sym,h,300),A=SMC.analyze(c),tg=h.toUpperCase();
   for(const d of[1,-1]){
    (A.obs||[]).filter(o=>!o.mit&&o.d===d).slice(-2).forEach(o=>S.htf.push({...o,t:c[o.i].time,tag:tg+' '+(d>0?'Bull':'Bear')+' OB'}));
    (A.fvg||[]).filter(o=>!o.mit&&o.d===d).slice(-2).forEach(o=>S.htf.push({...o,t:c[o.i].time,tag:tg+' FVG',f:1}));
   }
  }catch(e){}
 }
 force();
}
$('htf').onchange=loadHTF;

// coin scanner (top 30 coins by volume, scans 15m, 1h & 4h)
$('SC').innerHTML='<h3>Coin scanner</h3><p class="msg">Scans the 30 most traded coins across 15m, 1h & 4h: top-down score and best setup grade.</p><button id="scRun" class="moreBtn">Scan top 30</button><div id="scOut"></div>';
$('scRun').onclick=async()=>{
 const out=$('scOut');out.textContent='Loading coins...';
 try{
  const all=(await(await fetch('https://data-api.binance.vision/api/v3/ticker/24hr')).json()).filter(t=>t.symbol.endsWith('USDT')&&!/UP|DOWN|USDC|FDUSD|TUSD|USDP|BUSD|EUR|^USD/.test(t.symbol)).sort((a,b)=>b.quoteVolume-a.quoteVolume).slice(0,30),rows=[];
  let k=0;
  for(let i=0;i<all.length;i+=5)await Promise.all(all.slice(i,i+5).map(async t=>{
   const sym=t.symbol.replace('USDT','');
   try{
    const[d,h4,h1,m]=await Promise.all(['1d','4h','1h','15m'].map(x=>kl(sym,x,300)));
    const td=SMC.topDown({'1d':d,'4h':h4,'1h':h1,'15m':m});
    let bestT=td.setup,bestG=SMC.grade(bestT,td),bestTf='1h';
    for(const [tfName,cData] of [['15m',m],['4h',h4]]){
     const A=SMC.analyze(cData,tfName==='15m'?5:4),T=SMC.setup(cData,A),G=SMC.grade(T,td);
     if(G&&(!bestG||G.pts>bestG.pts||(G.pts===bestG.pts&&T.inside))){bestT=T;bestG=G;bestTf=tfName}
    }
    rows.push({sym,td,T:bestT,g:bestG,tf:bestTf,pts:bestG?bestG.pts+(bestT&&bestT.inside?2:0):-1});
   }catch(e){}
   out.textContent=`Scanning ${++k}/${all.length}...`;
  }));
  rows.sort((a,b)=>b.pts-a.pts);
  out.innerHTML='<table>'+rows.slice(0,15).map(r=>`<tr class="sc" data-s="${r.sym}" data-tf="${r.tf}"><td>${logo(r.sym)} <b>${r.sym}</b> <small class="msg">${r.tf}</small></td><td><span class="${r.td.dir>0?'up':r.td.dir<0?'down':''}">${r.td.dir>0?'Bull':r.td.dir<0?'Bear':'-'}</span> ${r.td.score}/4</td><td>${r.g?`<span class="grade" style="background:${GC[r.g.g]}">${r.g.g}</span>`:'<span class="msg">no zone</span>'}</td><td>${r.T&&!r.T.none?(r.T.inside?'🔥 in zone':pp(r.T.last,r.T.entry)+' to entry'):''}</td></tr>`).join('')+'</table><p class="msg">Tap a coin to open it.</p>';
  document.querySelectorAll('.sc').forEach(r=>r.onclick=()=>{
   $('q').value=r.dataset.s;S.img='';
   if(r.dataset.tf){S.tf=r.dataset.tf;document.querySelectorAll('#tfbar button').forEach(x=>x.classList.toggle('on',x.dataset.tf===S.tf))}
   load(r.dataset.s,1);scrollTo({top:0,behavior:'smooth'});
  });
 }catch(e){out.textContent='Could not scan right now. Try again.'}
};

// controls
document.querySelectorAll('#tfbar button').forEach(b=>b.onclick=()=>{S.tf=b.dataset.tf;document.querySelectorAll('#tfbar button').forEach(x=>x.classList.toggle('on',x===b));load(S.sym,1)});
document.querySelectorAll('#tools [data-l]').forEach(b=>b.onclick=()=>{S.L[b.dataset.l]^=1;b.classList.toggle('on');force()});
const zoom=f=>{const ts=chart.timeScale(),r=ts.getVisibleLogicalRange();if(r)ts.setVisibleLogicalRange({from:r.to-(r.to-r.from)*f,to:r.to})};
$('zin').onclick=()=>zoom(.6);$('zout').onclick=()=>zoom(1.6);
$('zfit').onclick=()=>{const n=S.c.length;chart.timeScale().setVisibleLogicalRange({from:n-110,to:n+8})};
$('zbig').onclick=()=>$('box').classList.toggle('big');
$('searchForm').onsubmit=e=>{e.preventDefault();const v=$('q').value.trim().toUpperCase().replace(/USDT$/,'').split(' ')[0];if(v){S.img='';load(v,1);$('q').blur();$('sug').innerHTML=''}};
let t;$('q').oninput=()=>{
 clearTimeout(t);const v=$('q').value.trim();if(v.length<2){$('sug').innerHTML='';return}
 t=setTimeout(async()=>{
  try{
   const r=await(await fetch('https://api.coingecko.com/api/v3/search?query='+encodeURIComponent(v))).json();
   $('sug').innerHTML=r.coins.slice(0,8).map(c=>`<li data-s="${c.symbol.toUpperCase()}" data-i="${c.thumb}">${logo(c.symbol.toUpperCase(),c.thumb)}<b>${c.name}</b><span>${c.symbol.toUpperCase()}</span></li>`).join('');
   document.querySelectorAll('#sug li').forEach(l=>l.onmousedown=l.ontouchstart=e=>{e.preventDefault();$('q').value=l.dataset.s;$('sug').innerHTML='';S.img=l.dataset.i;load(l.dataset.s,1)});
  }catch(e){}
 },350);
};
$('q').onblur=()=>setTimeout(()=>$('sug').innerHTML='',150);

window.getSetup=()=>{const T=S.T;return T&&!T.none?{sym:S.sym,tf:S.tf,d:T.d,entry:T.entry,sl:T.sl,tps:(T.tps||[]).map(t=>t.p),src:'SMC '+T.src,price:S.c[S.c.length-1].close}:null};

if(typeof Alerts!=='undefined'){
 Alerts.mount($('ALP'),$('alBtn'));
 Alerts.init('SMC',()=>S.sym,()=>S.tf,async(sym,tf)=>{
  const c=await kl(sym,tf,500),A=SMC.analyze(c,/m$/.test(tf)?5:4),T=SMC.setup(c,A);
  if(!T||T.none||!T.inside)return[];
  const G=SMC.grade(T,null);if(!G||G.pts<4)return[];
  return[{m:'SMC',sig:'SMC '+T.src,dir:T.d,trade:{method:'SMC',sym,tf,d:T.d,entry:T.entry,sl:T.sl,tps:(T.tps||[]).map(t=>t.p)},key:`SMC|${sym}|${tf}|${T.d}|${pf(T.entry)}`,title:`SMC · ${sym} ${tf}`,text:`${T.d>0?'LONG':'SHORT'}: price is inside the ${T.src} entry zone${T.conf?' (OB+FVG)':''}\nEntry ${pf(T.entry)} | SL ${pf(T.sl)}\n${(T.tps||[]).map((t,i)=>'TP'+(i+1)+' '+pf(t.p)).join(' | ')}`}];
 });
}

function ctxCard(){
 if(typeof Ctx==='undefined')return;
 const T=S.T,ok=T&&!T.none;
 try{if(Ctx.card)Ctx.card($('CX'),{sym:S.sym,tf:S.tf,c:S.c,dir:ok?T.d:(S.A?S.A.trend:0),G:ok?SMC.grade(T,S.td):null})}catch(e){}
 try{if(Ctx.evidence)Ctx.evidence($('EV'),{sym:S.sym,tf:S.tf,method:'SMC',gen:null,setup:ok?{d:T.d,entry:T.entry,sl:T.sl,tps:T.tps}:null})}catch(e){}
}

document.addEventListener('click',e=>{if(e.target.id!=='jBtn'||!S.T||S.T.none||typeof Ctx==='undefined')return;const T=S.T;Ctx.addTrade({method:'SMC',sym:S.sym,tf:S.tf,d:T.d,entry:T.entry,sl:T.sl,tps:(T.tps||[]).map(t=>t.p)})});

renderSV();setInterval(renderSV,60000);load('BTC',1);setInterval(()=>load(S.sym,0),20000);
