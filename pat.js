// File: pat.js
const $=id=>document.getElementById(id);
const ls={get:(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const cdn=s=>`https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/32/color/${s.toLowerCase()}.png`;
function fb(el,s){if(!el.dataset.f){el.dataset.f=1;el.src=cdn(s)}else el.outerHTML=`<i class="lg">${s[0]}</i>`}
const logo=(s,img)=>{s=String(s).replace(/[^A-Za-z0-9]/g,'');return `<img class="lgo" src="${img||cdn(s)}" alt="" onerror="fb(this,'${s}')">`};
const pf=p=>p>=100?p.toFixed(2):p>=1?p.toFixed(4):p.toPrecision(5);
const pp=(p,r)=>((p-r)/r*100).toFixed(2)+'%';
const TFS=['1m','5m','15m','1h','4h','1d','1w'];

const KL='https://data-api.binance.vision/api/v3/klines';
async function kl(sym,tf,lim,start){
 const r=await fetch(`${KL}?symbol=${sym}USDT&interval=${tf}&limit=${lim}`+(start?`&startTime=${start}`:''));if(!r.ok)throw 0;
 const now=Date.now(),raw=await r.json();
 const closed=raw.filter(x=>x[6]<=now);
 const use=closed.length>=30?closed:raw.slice(0,-1);
 return use.map(x=>({time:Math.floor(x[0]/1000),open:+x[1],high:+x[2],low:+x[3],close:+x[4],vol:+x[5]}));
}

let S={sym:'BTC',tf:'1h',img:'',c:[],A:null,P:[],sel:null,all:false,lines:[],F:{dbl:1,hs:1,tri:1,wdg:1,chn:1,flg:1,adv:1}},reqId=0;
setInterval(function t(){const d=new Date();if($('time'))$('time').textContent=d.toLocaleTimeString();if($('date'))$('date').textContent=d.toLocaleDateString('en',{weekday:'short',year:'numeric',month:'short',day:'numeric'});return t}(),1000);
const tg=o=>{if($('drawer'))$('drawer').classList.toggle('open',o);if($('scrim'))$('scrim').classList.toggle('show',o)};
if($('menuBtn'))$('menuBtn').onclick=()=>tg(1);
if($('scrim'))$('scrim').onclick=()=>tg(0);

const chart=LightweightCharts.createChart($('cht'),{autoSize:true,layout:{background:{color:'#0e1621'},textColor:'#8a9bb0'},grid:{vertLines:{color:'#1a2636'},horzLines:{color:'#1a2636'}},rightPriceScale:{borderColor:'#243447'},timeScale:{borderColor:'#243447',timeVisible:true,rightOffset:8}});
const series=chart.addCandlestickSeries({upColor:'#2ecc9a',downColor:'#ff5d6c',wickUpColor:'#2ecc9a',wickDownColor:'#ff5d6c',borderVisible:false});
const made=[],none={autoscaleInfoProvider:()=>null,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false};
const list=()=>S.P.filter(p=>S.F[p.fam]??1),cur=()=>list().find(p=>p.id===S.sel)||list()[0]||null;

function render(){
 try{
  made.forEach(m=>{try{chart.removeSeries(m)}catch(e){}});made.length=0;if($('err'))$('err').textContent='';
  const c=S.c;if(!c.length)return;const last=c.length-1,T=i=>c[Math.max(0,Math.min(last,i))].time,sel=cur();
  const draw=(p,w)=>p.lines.forEach((ln,k)=>{const pts=ln.pts.map(q=>({i:Math.max(0,Math.min(last,q.i)),p:q.p}));if(pts.length<2)return;
   const col=ln.role==='neck'?'#f0b429':ln.role==='aux'?'#e6edf3':p.col,m=new Map(pts.map(q=>[q.i,q.p]));
   let mk=null;if(k===0&&p.mid){const i=Math.max(pts[0].i,Math.min(pts[pts.length-1].i,p.mid.i));let v=pts[pts.length-1].p;
    for(let j=0;j+1<pts.length;j++)if(i>=pts[j].i&&i<=pts[j+1].i){const a=pts[j],b=pts[j+1];v=b.i===a.i?a.p:a.p+(b.p-a.p)*(i-a.i)/(b.i-a.i);break}
    if(!m.has(i))m.set(i,v);mk={i,text:p.mid.text}}
   const idx=[...m.keys()].sort((a,b)=>a-b);if(idx.length<2)return;
   const s=chart.addLineSeries({...none,color:col,lineWidth:w,lineStyle:ln.role==='aux'?2:0});s.setData(idx.map(i=>({time:T(i),value:m.get(i)})));
   if(mk)s.setMarkers([{time:T(mk.i),position:'aboveBar',shape:'circle',size:0,color:col,text:mk.text}]);made.push(s)});
  if(S.all)list().forEach(p=>draw(p,p===sel?2:1));else if(sel)draw(sel,2);
 }catch(e){console.error(e);if($('err'))$('err').textContent='Draw error: '+e.message}
}

function plines(){
 S.lines.forEach(l=>{try{series.removePriceLine(l)}catch(e){}});S.lines=[];const p=cur();
 if(p&&p.dir){
  const pl=(v,t,col)=>S.lines.push(series.createPriceLine({price:v,color:col,lineWidth:1,lineStyle:2,axisLabelVisible:true,title:t}));
  pl(p.entry,'ENTRY','#f0b429');pl(p.sl,'SL','#ff5d6c');(p.tps||[]).forEach((t,i)=>pl(t.p,'TP'+(i+1),'#2ecc9a'));
 }
}

function refit(){
 S.P=S.A?PAT.detect(S.c,S.A):[];
 if(!list().some(p=>p.id===S.sel))S.sel=list()[0]?list()[0].id:null;
 plines();renderB();renderD();renderR();render();renderCOV();
}

async function load(sym,first){
 const myId=++reqId;
 let k;
 try{
  k=await kl(sym,S.tf,500);
  if(!k||!k.length)throw 0;
 }catch(e){
  if(myId===reqId)$('B').innerHTML=`<h3>Detected patterns</h3><p class="msg">${sym} is not available on Binance (USDT). Try another coin.</p>`;
  return;
 }
 if(myId!==reqId)return;

 try{
  const rg=chart.timeScale().getVisibleLogicalRange();S.sym=sym;S.c=k;
  const lp=k[k.length-1].close,pr=lp>=100?2:lp>=1?4:lp>=.1?5:lp>=.01?6:8,n=k.length;
  series.applyOptions({priceFormat:{type:'price',precision:pr,minMove:Math.pow(10,-pr)}});series.setData(k);
  S.A=SMC.analyze(k,+$('sw').value);
  if(first||!rg)chart.timeScale().setVisibleLogicalRange({from:n-130,to:n+8});else chart.timeScale().setVisibleLogicalRange(rg);
  $('badge').innerHTML=`${logo(S.sym,S.img)}<span>${S.sym}</span><small>${pf(lp)}</small>`;refit();
 }catch(e){console.error(e)}
}

const DESC={'Double Top':'මිල එකම උසට දෙපාරක් ගිහින් ආපහු හැරෙනවා (M හැඩය). Neckline (මැද පහළ) කැඩුණාම පහළට යන බවට සංඥාවක්. Target = ඉහළ සිට neckline දක්වා උස, neckline එකෙන් පහළට.',
'Double Bottom':'මිල එකම පහළට දෙපාරක් ගිහින් ආපහු ඉහළ යනවා (W හැඩය). Neckline (මැද ඉහළ) කැඩුණාම ඉහළට යන බවට සංඥාවක්. Target = උස neckline එකෙන් ඉහළට.',
'Triple Top':'එකම උසට තුන්පාරක් ගිහින් හැරෙන ශක්තිමත් reversal එකක්. Neckline කැඩුණාම පහළට.','Triple Bottom':'එකම පහළට තුන්පාරක් ගිහින් හැරෙන ශක්තිමත් reversal එකක්. Neckline කැඩුණාම ඉහළට.',
'Ascending Triangle':'ඉහළ line එක සමතලා (resistance), පහළ line එක ඉහළට. බොහෝවිට ඉහළට (bullish) කැඩෙනවා. Target = triangle එකේ පළල breakout එකෙන් ඉහළට.',
'Descending Triangle':'පහළ line එක සමතලා (support), ඉහළ line එක පහළට. බොහෝවිට පහළට (bearish) කැඩෙනවා.',
'Symmetrical Triangle':'දෙපැත්තෙන්ම හැකිළෙන triangle එකක්. ඉහළට හෝ පහළට කැඩෙන්න පුළුවන්, trend එක දිගටම යන්න වැඩි ඉඩක්. කැඩෙන පැත්ත බලන්න.',
'Rising Wedge':'ඉහළට යන, හැකිළෙන wedge එකක්. සාමාන්‍යයෙන් පහළට කැඩෙනවා (bearish).','Falling Wedge':'පහළට යන, හැකිළෙන wedge එකක්. සාමාන්‍යයෙන් ඉහළට කැඩෙනවා (bullish).',
'Ascending Channel':'සමාන්තර ඉහළ යන channel එකක්. පහළ line එකෙන් buy, ඉහළ line එකෙන් profit බලනවා. පහළට කැඩුණොත් trend එක දුර්වල වෙනවා.','Descending Channel':'සමාන්තර පහළ යන channel එකක්. ඉහළ line එකෙන් sell බලනවා. ඉහළට කැඩුණොත් trend එක මාරු වෙන්න පුළුවන්.',
'Rectangle Pattern':'support සහ resistance අතර සමතලා range එකක්. කැඩෙන පැත්තට trend එකක් පටන් ගන්න පුළුවන්. කැඩෙනකම් range එකේම trade කරන්න බලන්න.',
'Head and Shoulders':'උරහිස් දෙකක් අතරේ ඉහළම හිසක් (ඉහළ reversal). Neckline කැඩුණාම පහළට. Target = හිසේ සිට neckline දක්වා උස.','Inverse Head and Shoulders':'පහළම හිසක් සහිත උරහිස් දෙකක් (පහළ reversal). Neckline කැඩුණාම ඉහළට.',
'Bull Pennant':'තදින් ඉහළ ගිය පස්සේ කුඩා triangle (pennant) consolidation එකක්. ඉහළට කැඩුණාම දිගටම.','Bear Pennant':'තදින් පහළ ගිය පස්සේ කුඩා pennant එකක්. පහළට කැඩුණාම දිගටම.',
'Bull Flag':'තදින් ඉහළ ගිය (pole) පස්සේ පොඩි පහළ ඇදෙන consolidation එකක්. ඉහළට කැඩුණාම trend එක දිගටම. Target = pole එකේ දිග.','Bear Flag':'තදින් පහළ ගිය (pole) පස්සේ පොඩි ඉහළ ඇදෙන consolidation එකක්. පහළට කැඩුණාම trend එක දිගටම.',
'Cup and Handle':'U හැඩ cup එකක් සහ පොඩි handle pullback එකක්. Rim එක කැඩුණාම ඉහළට (bullish continuation).','Inverted Cup and Handle':'යටිකුරු cup එකක් සහ පොඩි handle එකක්. Rim එක කැඩුණාම පහළට.',
'Rounding Bottom':'සෙමින් පහළ ගිහින් සෙමින් ඉහළ එන U හැඩය. දිගුකාලීන bullish reversal.','Rounding Top':'සෙමින් ඉහළ ගිහින් සෙමින් පහළ එන ∩ හැඩය. bearish reversal.',
'Diamond Top':'මැද පළල් වෙලා ආපහු හැකිළෙන දියමන්ති හැඩය, ඉහළ trend එකකින් පස්සේ. පහළට කැඩෙන්න ඉඩ.','Diamond Bottom':'දියමන්ති හැඩය පහළ trend එකකින් පස්සේ. ඉහළට කැඩෙන්න ඉඩ.',
'Broadening Formation':'ඉහළ high සහ පහළ low දෙකම පළල් වෙන (volatility වැඩි වෙන) megaphone හැඩය. කැඩෙන පැත්ත බලන්න.','Megaphone Pattern':'ඉහළ line ඉහළට, පහළ line පහළට විහිදෙන megaphone හැඩයක්. Volatility වැඩි වෙනවා.',
'Quasimodo Pattern':'HH පස්සේ LL එකක් හැදුණාම (over-and-under), මිල left shoulder level එකට ආපහු ආවම reversal entry එකක්.','1-2-3 Reversal Pattern':'පහළ, ඉහළ, ඉහළ තියෙන පහළ (higher low) සහ 2 වෙනි point එක කැඩුණාම reversal එක තහවුරු.',
'ABCD Pattern':'AB සහ CD කකුල් සමාන, BC retracement 0.382–0.886. D point එකේ reversal බලන්න.','Harmonic AB=CD':'AB = CD, BC = 0.618 හෝ 0.786. D point එක reversal zone එක.',
'Gartley Pattern':'XABCD harmonic: B = 0.618 XA, D = 0.786 XA.','Bat Pattern':'B = 0.382–0.5 XA, D = 0.886 XA.','Butterfly Pattern':'B = 0.786 XA, D = 1.27–1.618 XA (X ඉක්මවා).','Crab Pattern':'B = 0.382–0.618 XA, D = 1.618 XA.','Deep Crab Pattern':'B = 0.886 XA, D = 1.618 XA.',
'Shark Pattern':'C එක A ඉක්මවා යනවා, D = XC හි 0.886–1.13.','Cypher Pattern':'C = 1.272–1.414 XA, D = XC හි 0.786 retracement.','Bullish 5-0 Pattern':'B = 1.13–1.618 XA, BC = 1.618–2.24 AB, D = BC හි 0.5.','Bearish 5-0 Pattern':'B = 1.13–1.618 XA, BC = 1.618–2.24 AB, D = BC හි 0.5.',
'Three Drives Pattern':'එකම දිශාවට drives තුනක්, ඒවා අතර 0.618–0.786 retracement. තුන්වෙනි drive එකේ reversal.','Wolfe Wave':'ලක්ෂ්‍ය 5ක wave එකක්. 1-3 line එකට 5 touch වෙනකොට entry, target = 1-4 line එක.',
'Elliott Wave Pattern':'තල්ලු wave 5ක් (1-2-3-4-5) දැක්කා. 5 පස්සේ correction එකක් අපේක්ෂා කරනවා.','Three Peaks Pattern':'එකම උසට ශිඛර තුනක්. Neckline කැඩුණාම පහළට.','Three Valleys Pattern':'එකම පහළට ගැඹුරු තුනක්. Neckline කැඩුණාම ඉහළට.',
'Island Reversal':'Gap දෙකකින් (ඉහළ gap + පහළ gap) වෙන් වුණු කුඩා දූපත් පෙදෙසක්. (Crypto 24/7 නිසා FVG gaps වලින් ආසන්න කරලා.)','Pipe Top':'ශිඛරයේ ඉහළ-පහළ උස candles දෙකක් (පයිප්ප). bearish reversal.','Pipe Bottom':'පහළ දෙකක් ගැඹුරු candles. bullish reversal.',
'V-Shaped Reversal':'ඉක්මනින් පහළ ගිහින් ඒ ප්‍රමාණයටම ඉහළ ආපහු එන V හැඩය.','Inverted V-Shaped Reversal':'ඉක්මනින් ඉහළ ගිහින් ඒ ප්‍රමාණයටම ආපහු පහළට එන Λ හැඩය.','Bump and Run Reversal':'Lead-in trendline එකට වඩා තදින් ඉහළ ගිය bump එකක් සහ trendline එක කැඩීම (run).','Dead Cat Bounce':'තදින් පහළ ගිහින් දුර්වල bounce එකක් (≤50%). එය අවසන් වෙලා නැවත පහළට.'};
const descOf=p=>{for(const n of p.names){const k=[n,n.replace(/^(Bullish|Bearish) /,''),n.replace(/^(Bullish|Bearish) /,'')+' Pattern'].find(x=>DESC[x]);if(k)return DESC[k]}return ''};

function renderCOV(){
 const have=new Set(S.P.flatMap(p=>p.names)),cnt=PAT.NAMES.filter(n=>have.has(n)).length;
 $('COV').innerHTML=`<h3>All ${PAT.NAMES.length} patterns <small class="msg">${cnt} detected now</small></h3><div class="cov">`+PAT.NAMES.map((n,i)=>`<span class="cv ${have.has(n)?'on':''}" data-n="${n.replace(/"/g,'&quot;')}">${i+1}. ${n}</span>`).join('')+'</div><p class="msg">Highlighted = detected on this chart right now. Tap to show it.</p>';
 document.querySelectorAll('#COV .cv.on').forEach(e=>e.onclick=()=>{const p=S.P.find(x=>x.names.includes(e.dataset.n));if(p){S.F[p.fam]=1;document.querySelectorAll('#tools [data-f]').forEach(b=>b.classList.toggle('on',!!S.F[b.dataset.f]));S.sel=p.id;plines();renderB();renderD();renderR();render();scrollTo({top:0,behavior:'smooth'})}});
}

function renderB(){
 const L=list();let h='<h3>Detected patterns</h3>';
 if(!L.length)h+='<p class="msg">No clear pattern right now. Try another time frame or swing size.</p>';
 else h+='<table>'+L.map(p=>`<tr class="pr" data-id="${p.id}" style="${p.id===(cur()||{}).id?'background:var(--bg)':''}"><td><b>${p.names[0]}</b>${p.names.length>1?'<br><small class="msg">'+p.names.slice(1).join(' · ')+'</small>':''}<br><small class="msg">${S.c.length-1-p.start} bars</small></td><td><span class="tag ${p.bias==='bull'?'up':p.bias==='bear'?'down':'n'}">${p.bias==='bull'?'BULL':p.bias==='bear'?'BEAR':'NEUTRAL'}</span></td><td>${p.status}</td></tr>`).join('')+'</table><p class="msg">Tap a pattern to show it on the chart.</p>';
 $('B').innerHTML=h;document.querySelectorAll('.pr').forEach(r=>r.onclick=()=>{S.sel=r.dataset.id;plines();renderB();renderD();renderR();render()});
}

function renderD(){
 const p=cur();let h='<h3>විස්තරය</h3>';if(!p){$('D').innerHTML=h+'<p class="msg">Pattern එකක් තෝරන්න.</p>';return}
 h+=`<p><b>${p.names.join(' / ')}</b> · <span class="${p.bias==='bull'?'up':p.bias==='bear'?'down':''}">${p.status}</span></p><p>${descOf(p)}</p>`;
 if(p.dir){const last=S.c[S.c.length-1].close,row=(n,v,col,x)=>`<tr><td style="color:${col}">${n}</td><td>${pf(v)}</td><td>${x}</td></tr>`;
  h+=`<p><span class="tag ${p.dir>0?'up':'down'}">${p.dir>0?'LONG':'SHORT'}</span> <span class="msg">${p.brk?'breakout entry':'reversal zone entry'}</span></p><table>`+row('Entry',p.entry,'#f0b429',pp(last,p.entry)+' away')+row('SL',p.sl,'#ff5d6c',pp(p.sl,p.entry))+p.tps.map((t,i)=>row('TP'+(i+1),t.p,'#2ecc9a','RR '+t.rr.toFixed(1))).join('')+`</table><p class="msg">TP = pattern උසේ ${(p.ks||[0.5,1,1.618]).join(' / ')} ගුණය. ${/breakout|breakdown/.test(p.status)?'Breakout එක දැනටමත් වෙලා, retest එකක් එනකම් බලන්න.':p.brk?'Breakout එක තහවුරු වෙනකම් (candle close) ඉන්න.':'Reversal zone එකේදී candle rejection එකක් බලා enter වන්න.'}</p><button id="saveBtn" class="moreBtn">Save setup</button> <button id="jBtn" class="moreBtn">📒 Take trade</button> <button class="moreBtn" data-alert>🔔 Alert at entry</button>`}
 else h+='<p class="msg">මේ pattern එකට breakout setup එකක් නෑ. කැඩෙන පැත්ත බලලා ඊට පස්සේ trade කරන්න.</p>';
 h+='<p class="msg">Auto analysis එකක් විතරයි, financial advice නෙවෙයි. Pattern හඳුනාගැනීම සමහර වෙලාවට වැරදෙන්න පුළුවන්.</p>';
 $('D').innerHTML=h;
 if($('saveBtn'))$('saveBtn').onclick=()=>{const l=ls.get('patSaved',[]);l.unshift({sym:S.sym,tf:S.tf,d:p.dir,entry:p.entry,sl:p.sl,tps:p.tps.map(t=>t.p),t:Math.floor(Date.now()/1000),name:p.names[0],brk:p.brk});ls.set('patSaved',l.slice(0,20));renderSV()};
}

function renderR(){
 const r=ls.get('smcRisk',{a:1000,r:1});
 if(!$('ra')){$('R').innerHTML=`<h3>Risk calculator</h3><div class="rin"><label>Account $<input id="ra" type="number" min="1" value="${r.a}"></label><label>Risk %<input id="rr" type="number" min="0.1" step="0.1" value="${r.r}"></label></div><div id="rout"></div>`;
  ['ra','rr'].forEach(i=>$(i).oninput=()=>{ls.set('smcRisk',{a:+$('ra').value,r:+$('rr').value});renderR()})}
 const a=+$('ra').value,pc=+$('rr').value,p=cur();let h='';
 if(!p||!p.dir||!(a>0)||!(pc>0))h='<p class="msg">No setup to size right now.</p>';
 else{const risk=a*pc/100,q=risk/Math.abs(p.entry-p.sl);
  h=`<p>Risk: <b>$${risk.toFixed(2)}</b></p><p>Position size: <b>${q>=1?q.toFixed(2):q.toPrecision(3)} ${S.sym}</b> (≈ $${(q*p.entry).toFixed(2)})</p>`+p.tps.map((t,i)=>`<p class="up">TP${i+1}: +$${(q*Math.abs(t.p-p.entry)).toFixed(2)}</p>`).join('')+`<p class="down">SL: -$${risk.toFixed(2)}</p>`}
 $('rout').innerHTML=h;
}

const lbl=e=>({pending:'⏳ waiting for entry',entered:'▶ entered',missed:'⚪ missed',sl:e.hit?`TP${e.hit} ✓ then SL`:'❌ SL hit'}[e.st]||`✅ TP${e.hit} hit`);
async function renderSV(){
 const l0=ls.get('patSaved',[]);
 const rows=await Promise.all(l0.map(async s=>{
  let e={st:'pending',hit:0};
  try{
   const ageHrs=(Date.now()-s.t*1000)/36e5;
   const evalTf=ageHrs>80?'1h':ageHrs>20?'15m':'5m';
   const normS={...s,tps:(s.tps||[]).map(x=>typeof x==='object'?x.p:x)};
   e=SMC.evalSaved(normS,await kl(s.sym,evalTf,1000,s.t*1000));
  }catch(x){}
  return{s,e};
 }));
 $('SV').innerHTML='<h3>Saved setups</h3>'+(rows.length?'<table>'+rows.map(({s,e},i)=>`<tr><td>${logo(s.sym)} <b>${s.sym}</b> ${s.tf} <span class="${s.d>0?'up':'down'}">${s.d>0?'LONG':'SHORT'}</span><br><small class="msg">${s.name||''} · Entry ${pf(s.entry)}</small></td><td>${lbl(e)}</td><td><button class="x" data-i="${i}">✕</button></td></tr>`).join('')+'</table>':'<p class="msg">Nothing saved yet.</p>');
 document.querySelectorAll('#SV .x').forEach(b=>b.onclick=()=>{const l=ls.get('patSaved',[]);l.splice(+b.dataset.i,1);ls.set('patSaved',l);renderSV()});
}

document.querySelectorAll('#tfbar button').forEach(b=>b.onclick=()=>{S.tf=b.dataset.tf;document.querySelectorAll('#tfbar button').forEach(x=>x.classList.toggle('on',x===b));load(S.sym,1)});
document.querySelectorAll('#tools [data-f]').forEach(b=>b.onclick=()=>{S.F[b.dataset.f]^=1;b.classList.toggle('on');refit()});
$('pall').onclick=()=>{S.all=!S.all;$('pall').classList.toggle('on',S.all);render()};
$('sw').onchange=()=>load(S.sym,1);
const zoom=f=>{const ts=chart.timeScale(),r=ts.getVisibleLogicalRange();if(r)ts.setVisibleLogicalRange({from:r.to-(r.to-r.from)*f,to:r.to})};
$('zin').onclick=()=>zoom(.6);$('zout').onclick=()=>zoom(1.6);
$('zfit').onclick=()=>{const n=S.c.length;chart.timeScale().setVisibleLogicalRange({from:n-130,to:n+8})};
$('zbig').onclick=()=>$('box').classList.toggle('big');
$('searchForm').onsubmit=e=>{e.preventDefault();const v=$('q').value.trim().toUpperCase().replace(/USDT$/,'').split(' ')[0];if(v){S.img='';load(v,1);$('q').blur();$('sug').innerHTML=''}};
let t;$('q').oninput=()=>{clearTimeout(t);const v=$('q').value.trim();if(v.length<2){$('sug').innerHTML='';return}
 t=setTimeout(async()=>{try{const r=await(await fetch('https://api.coingecko.com/api/v3/search?query='+encodeURIComponent(v))).json();
  $('sug').innerHTML=r.coins.slice(0,8).map(c=>`<li data-s="${c.symbol.toUpperCase()}" data-i="${c.thumb}">${logo(c.symbol.toUpperCase(),c.thumb)}<b>${c.name}</b><span>${c.symbol.toUpperCase()}</span></li>`).join('');
  document.querySelectorAll('#sug li').forEach(l=>l.onmousedown=l.ontouchstart=e=>{e.preventDefault();$('q').value=l.dataset.s;$('sug').innerHTML='';S.img=l.dataset.i;load(l.dataset.s,1)})}catch(e){}},350)};
$('q').onblur=()=>setTimeout(()=>$('sug').innerHTML='',150);

window.getSetup=()=>{const p=cur();return p&&p.dir?{sym:S.sym,tf:S.tf,d:p.dir,entry:p.entry,sl:p.sl,tps:p.tps.map(t=>t.p),src:p.names[0],price:S.c[S.c.length-1].close}:null};

if(typeof Alerts!=='undefined'){
 Alerts.mount($('ALP'),$('alBtn'));
 Alerts.init('Patterns',()=>S.sym,()=>S.tf,async(sym,tf)=>{
  const c=await kl(sym,tf,500),A=SMC.analyze(c,+$('sw').value),last=c[c.length-1].close;
  return PAT.detect(c,A).filter(p=>p.dir&&p.tps&&!['1-2-3 Reversal Pattern','Three Drives Pattern'].includes(p.names[0])&&Math.abs(last-p.entry)<=A.atr*0.8).slice(0,3).map(p=>({m:'PAT',sig:p.names[0],dir:p.dir,trade:{method:'Patterns',sym,tf,d:p.dir,entry:p.entry,sl:p.sl,tps:p.tps.map(t=>t.p)},key:`PAT|${sym}|${tf}|${p.id}`,title:`Pattern · ${sym} ${tf}`,
   text:`${p.names[0]} (${p.status})\n${p.dir>0?'LONG':'SHORT'} entry ${pf(p.entry)} | SL ${pf(p.sl)}\n${p.tps.map((t,i)=>'TP'+(i+1)+' '+pf(t.p)).join(' | ')}`}))
 });
}

if(typeof Ctx!=='undefined'&&Ctx.mountBacktest){
 Ctx.mountBacktest($('BT'),{sym:()=>S.sym,tf:()=>S.tf,gen:(sl,A)=>{const p=PAT.detect(sl,A).find(x=>x.dir&&x.tps&&!/breakout|breakdown/.test(x.status));return p?{d:p.dir,entry:p.entry,sl:p.sl,tps:p.tps,key:p.id,conf:false,brk:p.brk}:null}});
}

function ctxCard(){
 if(typeof Ctx==='undefined')return;
 const p=cur();
 try{if(Ctx.card)Ctx.card($('CX'),{sym:S.sym,tf:S.tf,c:S.c,dir:p?p.dir:0,G:null})}catch(e){}
 try{if(Ctx.evidence)Ctx.evidence($('EV'),{sym:S.sym,tf:S.tf,method:'PAT'+(p?p.names[0]:''),gen:(sl,A)=>{const q=PAT.detect(sl,A).find(x=>x.dir&&x.tps&&!/breakout|breakdown/.test(x.status));return q?{d:q.dir,entry:q.entry,sl:q.sl,tps:q.tps,key:q.id,conf:false,brk:q.brk}:null},setup:p&&p.dir?{d:p.dir,entry:p.entry,sl:p.sl,tps:p.tps}:null})}catch(e){}
}
{const _rd=renderD;renderD=function(){_rd.apply(this,arguments);ctxCard()}}
document.addEventListener('click',e=>{if(e.target.id!=='jBtn'||typeof Ctx==='undefined')return;const p=cur();if(!p||!p.dir)return;Ctx.addTrade({method:'Patterns',sym:S.sym,tf:S.tf,d:p.dir,entry:p.entry,sl:p.sl,tps:p.tps.map(t=>t.p),brk:p.brk})});

renderSV();
setInterval(renderSV,60000);

const urlParams=new URLSearchParams(window.location.search);
const initSym=urlParams.get('sym')?urlParams.get('sym').toUpperCase().replace(/USDT$/,''):'BTC';
const initTf=urlParams.get('tf');
if(initTf&&TFS.includes(initTf)){
 S.tf=initTf;
 document.querySelectorAll('#tfbar button').forEach(x=>x.classList.toggle('on',x.dataset.tf===S.tf));
}
if($('q')&&initSym!=='BTC')$('q').value=initSym;
load(initSym,1);
setInterval(()=>load(S.sym,0),20000);
