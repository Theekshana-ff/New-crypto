const $=id=>document.getElementById(id);
const ls={get:(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const cdn=s=>`https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/32/color/${s.toLowerCase()}.png`;
function fb(el,s){if(!el.dataset.f){el.dataset.f=1;el.src=cdn(s)}else el.outerHTML=`<i class="lg">${s[0]}</i>`}
const logo=(s,img)=>{s=String(s).replace(/[^A-Za-z0-9]/g,'');return `<img class="lgo" src="${img||cdn(s)}" alt="" onerror="fb(this,'${s}')">`};
const pf=p=>p>=100?p.toFixed(2):p>=1?p.toFixed(4):p.toPrecision(5);
const pp=(p,r)=>((p-r)/r*100).toFixed(2)+'%';
let S={sym:'BTC',tf:'1h',img:'',c:[],A:null,F:null,lines:[],L:{ret:1,ote:1}};
setInterval(function t(){const d=new Date();$('time').textContent=d.toLocaleTimeString();$('date').textContent=d.toLocaleDateString('en',{weekday:'short',year:'numeric',month:'short',day:'numeric'});return t}(),1000);
const tg=o=>{$('drawer').classList.toggle('open',o);$('scrim').classList.toggle('show',o)};
$('menuBtn').onclick=()=>tg(1);$('scrim').onclick=()=>tg(0);
const chart=LightweightCharts.createChart($('cht'),{autoSize:true,layout:{background:{color:'#0e1621'},textColor:'#8a9bb0'},grid:{vertLines:{color:'#1a2636'},horzLines:{color:'#1a2636'}},rightPriceScale:{borderColor:'#243447'},timeScale:{borderColor:'#243447',timeVisible:true,rightOffset:8}});
const series=chart.addCandlestickSeries({upColor:'#2ecc9a',downColor:'#ff5d6c',wickUpColor:'#2ecc9a',wickDownColor:'#ff5d6c',borderVisible:false});
const made=[],none={autoscaleInfoProvider:()=>null,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false};
let CFG=ls.get('fibCfg',null);if(!CFG||!CFG.levels||CFG.levels.length!==FIB.DEF.levels.length||!CFG.zone)CFG=JSON.parse(JSON.stringify(FIB.DEF));
function render(){
 try{made.forEach(m=>chart.removeSeries(m));made.length=0;$('err').textContent='';
  const F=S.F,c=S.c;if(!F||!c.length)return;const last=c.length-1,T=i=>c[Math.max(0,Math.min(last,i))].time;
  const ser=(pts,col,w,st,mk)=>{const m=new Map();pts.forEach(p=>m.set(Math.max(0,Math.min(last,p.i)),p.v));if(mk)m.set(mk.i,m.get(mk.i)??pts[pts.length-1].v);
   const idx=[...m.keys()].sort((a,b)=>a-b);if(idx.length<2)return;
   const s=chart.addLineSeries({...none,color:col,lineWidth:w,lineStyle:st});s.setData(idx.map(i=>({time:T(i),value:m.get(i)})));
   if(mk)s.setMarkers([{time:T(mk.i),position:'aboveBar',shape:'circle',size:0,color:col,text:mk.text}]);made.push(s)};
  const{a,b}=F.leg,lab=Math.max(b.i+1,last-8);
  ser([{i:a.i,v:a.p},{i:b.i,v:b.p}],'#e6edf3',1,2,null);
  if(S.L.ret)F.levels.forEach(l=>ser([{i:a.i,v:l.p},{i:last,v:l.p}],l.col,1,0,{i:Math.min(last,lab),text:`${l.r} (${pf(l.p)})`}));
  if(S.L.ote){const e=last,i=Math.min(b.i,last-1),col=F.d>0?'#2ecc9a':'#ff5d6c';if(e>i){const s=chart.addBaselineSeries({...none,baseValue:{type:'price',price:F.zone.lo},topLineColor:col,topFillColor1:col+'44',topFillColor2:col+'44',bottomLineColor:'rgba(0,0,0,0)',bottomFillColor1:'rgba(0,0,0,0)',bottomFillColor2:'rgba(0,0,0,0)',lineWidth:1});
   s.setData([{time:T(i),value:F.zone.hi},{time:T(e),value:F.zone.hi}]);s.setMarkers([{time:T(i),position:'inBar',shape:'circle',size:0,color:col,text:(F.d>0?'Buy':'Sell')+' zone '+F.zr[0]+'–'+F.zr[1]}]);made.push(s)}}
 }catch(e){console.error(e);$('err').textContent='Draw error: '+e.message}
}
function plines(){S.lines.forEach(l=>series.removePriceLine(l));S.lines=[];const F=S.F;
 if(F){const pl=(p,t,col)=>S.lines.push(series.createPriceLine({price:p,color:col,lineWidth:1,lineStyle:2,axisLabelVisible:true,title:t}));
  pl(F.entry,'ENTRY','#f0b429');pl(F.sl,'SL','#ff5d6c');F.tps.forEach((t,i)=>pl(t.p,'TP'+(i+1),'#2ecc9a'))}}
function refit(){S.F=S.A?FIB.fib(S.c,S.A,CFG):null;plines();renderB();renderD();renderR();render()}
async function load(sym,first){
 try{const r=await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}USDT&interval=${S.tf}&limit=500`);if(!r.ok)throw 0;const k=await r.json();if(!k.length)throw 0;
  const rg=chart.timeScale().getVisibleLogicalRange();S.sym=sym;
  S.c=k.map(x=>({time:Math.floor(x[0]/1000),open:+x[1],high:+x[2],low:+x[3],close:+x[4]}));
  const lp=S.c[S.c.length-1].close,pr=lp>=100?2:lp>=1?4:lp>=.1?5:lp>=.01?6:8,n=S.c.length;
  series.applyOptions({priceFormat:{type:'price',precision:pr,minMove:Math.pow(10,-pr)}});series.setData(S.c);
  S.A=SMC.analyze(S.c,+$('sw').value);S.F=FIB.fib(S.c,S.A,CFG);
  if(first||!rg)chart.timeScale().setVisibleLogicalRange({from:n-110,to:n+8});else chart.timeScale().setVisibleLogicalRange(rg);
  plines();
  $('badge').innerHTML=`${logo(S.sym,S.img)}<span>${S.sym}</span><small>${pf(lp)}</small>`;
  renderB();renderD();renderR();render();
 }catch(e){$('B').innerHTML=`<h3>Fibonacci setup</h3><p class="msg">${sym} is not available on Binance (USDT). Try another coin.</p>`}
}
function renderB(){const F=S.F;let h='<h3>Fibonacci setup (auto)</h3>';
 if(!F)h+='<p class="msg">No clear swing leg yet. Try another time frame or swing size.</p>';
 else{const row=(n,p,col,x)=>`<tr><td style="color:${col}">${n}</td><td>${pf(p)}</td><td>${x}</td></tr>`,ck=(ok,t)=>`<span class="${ok?'up':'down'}">${ok?'✓':'✗'}</span> ${t}`;
  h+=`<p><span class="tag ${F.d>0?'up':'down'}">${F.d>0?'LONG':'SHORT'}</span> <span class="msg">zone ${F.zr[0]}–${F.zr[1]} · ${S.tf}</span></p><table>`+
   row('Entry',F.entry,'#f0b429',F.state==='inside'?'price in zone':pp(F.last,F.entry)+' away')+row('SL',F.sl,'#ff5d6c',pp(F.sl,F.entry))+
   F.tps.map((t,i)=>row('TP'+(i+1),t.p,'#2ecc9a','RR '+t.rr.toFixed(1))).join('')+'</table>'+
   `<p class="chk">${ck(F.state==='inside',`Price inside ${F.zr[0]}–${F.zr[1]} zone`)}<br>${ck(F.conf.length>0,'SMC confluence in zone'+(F.conf.length?' ('+F.conf.join(' + ')+')':''))}<br>${ck(!F.broken,'Leg still valid (origin not broken)')}<br>${ck(!F.small,'Leg size is meaningful')}</p>`}
 $('B').innerHTML=h}
function renderD(){const F=S.F;let h='<h3>විස්තරය</h3>';if(!F){$('D').innerHTML=h+'<p class="msg">Swing leg එකක් හඳුනාගත්තේ නෑ.</p>';return}
 const up=F.d>0,st={above:'මිල zone එකට '+(up?'ඉහළින්':'පහළින්')+'. pullback එකක් එනකම් බලන්න.',inside:'මිල දැන් zone එක ඇතුළේ. '+(up?'buy':'sell')+' සලකුණු බලන්න පුළුවන් තැන.',below:'මිල zone එක පහුවෙලා ගිහින්. setup එක දුර්වලයි.'}[F.state];
 h+=`<p>Trend එක අනුව leg එක: <b class="${up?'up':'down'}">${up?'Swing Low සිට Swing High දක්වා (ඉහළට)':'Swing High සිට Swing Low දක්වා (පහළට)'}</b> · ${pf(F.leg.a.p)} → ${pf(F.leg.b.p)}.</p><p>මිල ${up?'ආපහු පහළට':'ආපහු ඉහළට'} ${F.zr[0]}–${F.zr[1]} area එකට (${pf(F.zone.lo)} – ${pf(F.zone.hi)}) ආවම ${up?'buy':'sell'} බලන්න. Entry = zone මැද, SL = leg එකේ ආරම්භයට පිටින්, TP = 0 level එක සහ -0.28 / -0.62 extensions.</p><p>${st}${F.conf.length?' Zone එකේ SMC '+F.conf.join(' සහ ')+' එකක් තියෙන නිසා ශක්තිමත්.':''}${F.broken?' <b class="down">Leg එකේ ආරම්භය කැඩිලා, setup එක අවලංගුයි.</b>':''}</p>`+
  '<table>'+F.levels.map(l=>`<tr><td style="color:${l.col}">${l.r}</td><td>${pf(l.p)}</td></tr>`).join('')+'</table><p class="msg">Levels තෝරන්න ⚙ Settings එක පාවිච්චි කරන්න. Auto analysis එකක් විතරයි, financial advice නෙවෙයි.</p>';
 $('D').innerHTML=h}
function renderR(){const r=ls.get('smcRisk',{a:1000,r:1});
 if(!$('ra')){$('R').innerHTML=`<h3>Risk calculator</h3><div class="rin"><label>Account $<input id="ra" type="number" min="1" value="${r.a}"></label><label>Risk %<input id="rr" type="number" min="0.1" step="0.1" value="${r.r}"></label></div><div id="rout"></div>`;
  ['ra','rr'].forEach(i=>$(i).oninput=()=>{ls.set('smcRisk',{a:+$('ra').value,r:+$('rr').value});renderR()})}
 const a=+$('ra').value,p=+$('rr').value,F=S.F;let h='';
 if(!F||!(a>0)||!(p>0))h='<p class="msg">No setup to size right now.</p>';
 else{const risk=a*p/100,q=risk/Math.abs(F.entry-F.sl);
  h=`<p>Risk: <b>$${risk.toFixed(2)}</b></p><p>Position size: <b>${q>=1?q.toFixed(2):q.toPrecision(3)} ${S.sym}</b> (≈ $${(q*F.entry).toFixed(2)})</p>`+F.tps.map((t,i)=>`<p class="up">TP${i+1}: +$${(q*Math.abs(t.p-F.entry)).toFixed(2)}</p>`).join('')+`<p class="down">SL: -$${risk.toFixed(2)}</p>`}
 $('rout').innerHTML=h}
function buildCfg(){$('fgrid').innerHTML=CFG.levels.map((l,i)=>`<div class="frow"><input type="checkbox" data-i="${i}" ${l.on?'checked':''}><input type="number" step="any" data-i="${i}" value="${l.r}"><input type="color" data-i="${i}" value="${l.col}"></div>`).join('');$('z1').value=CFG.zone[0];$('z2').value=CFG.zone[1]}
const cfgChange=e=>{const t=e.target,i=t.dataset.i;if(i!=null){const l=CFG.levels[+i];if(t.type==='checkbox')l.on=t.checked;else if(t.type==='color')l.col=t.value;else if(isFinite(parseFloat(t.value)))l.r=parseFloat(t.value);else return}
 else if(t.id==='z1'||t.id==='z2'){const v=parseFloat(t.value);if(!isFinite(v))return;CFG.zone[t.id==='z1'?0:1]=v}else return;
 ls.set('fibCfg',CFG);refit()};
$('fgrid').addEventListener('input',cfgChange);$('fgrid').addEventListener('change',cfgChange);$('z1').oninput=$('z2').oninput=cfgChange;
$('freset').onclick=()=>{CFG=JSON.parse(JSON.stringify(FIB.DEF));ls.set('fibCfg',CFG);buildCfg();refit()};
$('fset').onclick=()=>$('fcfg').toggleAttribute('hidden');buildCfg();
document.querySelectorAll('#tfbar button').forEach(b=>b.onclick=()=>{S.tf=b.dataset.tf;document.querySelectorAll('#tfbar button').forEach(x=>x.classList.toggle('on',x===b));load(S.sym,1)});
document.querySelectorAll('#tools [data-l]').forEach(b=>b.onclick=()=>{S.L[b.dataset.l]^=1;b.classList.toggle('on');render()});
$('sw').onchange=()=>load(S.sym,0);
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
load('BTC',1);setInterval(()=>load(S.sym,0),20000);
