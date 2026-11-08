const $=id=>document.getElementById(id);
const cdn=s=>`https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/32/color/${s.toLowerCase()}.png`;
function fb(el,s){if(!el.dataset.f){el.dataset.f=1;el.src=cdn(s)}else el.outerHTML=`<i class="lg">${s[0]}</i>`}
const logo=(s,img)=>{s=String(s).replace(/[^A-Za-z0-9]/g,'');return `<img class="lgo" src="${img||cdn(s)}" alt="" onerror="fb(this,'${s}')">`};
const pf=p=>p>=100?p.toFixed(2):p>=1?p.toFixed(4):p.toPrecision(5);
const pp=(p,r)=>((p-r)/r*100).toFixed(2)+'%';
let S={sym:'BTC',tf:'1h',img:'',c:[],A:null,T:null,lines:[],L:{struct:1,ob:1,fvg:1,liq:1}},sig='';
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
   if(L.ob)for(const q of[1,-1])A.obs.filter(o=>!o.mit&&o.d===q).slice(-3).forEach(o=>zone(o,q>0?'#2ecc9a':'#ff5d6c',(q>0?'Bull':'Bear')+' OB'));
   if(L.fvg)for(const q of[1,-1])A.fvg.filter(o=>!o.mit&&o.d===q).slice(-4).forEach(o=>zone(o,q>0?'#4ea1ff':'#f0b429','FVG'));
   A.ev.slice(-14).filter(e=>e.k==='CHoCH'?L.ch:L.bos).forEach(e=>line(e.from,e.to,e.p,e.k==='CHoCH'?'#f0b429':'#8ab4ff',e.k==='CHoCH'?2:1,e.k==='CHoCH'?2:0,e.k+(e.d>0?' ↑':' ↓')));
   if(L.liq){A.liq.slice(-6).forEach(q=>line(q.from,q.st==='open'?last:q.at,q.p,'#b388ff',1,1,(q.t==='H'?'EQH':'EQL')+' $$$'));
    A.sweeps.forEach(s=>{line(s.i,s.at,s.p,'#b388ff',1,1,'');marks.push({time:T(s.at),position:s.t==='H'?'aboveBar':'belowBar',color:'#ff7ad9',shape:'circle',size:0,text:'X'})})}
   series.setMarkers(marks.sort((x,y)=>x.time-y.time));
  }catch(e){console.error(e);$('err').textContent='Draw error: '+e.message}
 }
 const v={chart,series,force:render};V.push(v);return v;
}
const main=view($('box'),()=>({bos:S.L.struct,ch:S.L.struct,ob:S.L.ob,fvg:S.L.fvg,liq:S.L.liq}));
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
  badge(lp);renderB();renderD();counts();force();
 }catch(e){$('B').innerHTML=`<h3>Trade setup</h3><p class="msg">${sym} is not available on Binance (USDT). Try another coin.</p>`}
}
function badge(lp){$('badge').innerHTML=`${logo(S.sym,S.img)}<span>${S.sym}</span><small>${pf(lp)}</small>`}
function renderB(){const T=S.T;let h='<h3>Trade setup (auto)</h3>';
 if(!T)h+='<p class="msg">Market structure is not clear yet. Try another time frame.</p>';
 else if(T.none)h+=`<p><span class="tag ${T.d>0?'up':'down'}">${T.d>0?'BULLISH':'BEARISH'}</span></p><p class="msg">No clean OB / FVG zone to enter right now. Wait for price to leave a new zone.</p>`;
 else{const row=(n,p,col,x)=>`<tr><td style="color:${col}">${n}</td><td>${pf(p)}</td><td>${x}</td></tr>`;
  h+=`<p><span class="tag ${T.d>0?'up':'down'}">${T.d>0?'LONG':'SHORT'}</span> <span class="msg">from ${T.d>0?'Bullish':'Bearish'} ${T.src} · ${S.tf}</span></p><table>`+
   row('Entry',T.entry,'#f0b429',T.inside?'price in zone':pp(T.last,T.entry)+' away')+row('SL',T.sl,'#ff5d6c',pp(T.sl,T.entry))+
   T.tps.map((t,i)=>row('TP'+(i+1),t.p,'#2ecc9a','RR '+t.rr.toFixed(1))).join('')+'</table>'}
 $('B').innerHTML=h}
function renderD(){const A=S.A,T=S.T,e=A.ev[A.ev.length-1],n=k=>A.ev.filter(x=>x.k===k).length;let h='<h3>විස්තරය</h3>';
 if(!e){$('D').innerHTML=h+'<p class="msg">Structure එකක් තවම හඳුනාගත්තේ නෑ.</p>';return}
 const up=A.trend>0;
 h+=`<p>${S.tf} structure එක <b class="${up?'up':'down'}">${up?'Bullish (ඉහළට)':'Bearish (පහළට)'}</b>. අන්තිමට ${pf(e.p)} level එක ${e.d>0?'ඉහළට':'පහළට'} බිඳුණේ <b>${e.k}</b> එකක් ලෙසින්. ${e.k==='CHoCH'?'(CHoCH = trend එක මාරු වීමේ ලකුණ)':'(BOS = දැන් තියෙන trend එක ඉදිරියට යනවා)'}</p>`;
 if(T&&!T.none)h+=`<p>Entry zone එක ${T.src} එකක්: ${pf(T.z.bot)} – ${pf(T.z.top)}. ${T.d>0?'මිල මේ zone එකට පහළට pullback වුණාම buy':'මිල මේ zone එකට ඉහළට pullback වුණාම sell'} සලකන්න. Entry = zone මැද, SL = zone එකට පිටින් (zone එක කැඩුණොත් setup එක අවලංගුයි).</p><p>TP වලින් ${T.tps.filter(t=>t.s==='liquidity').length} ක් ඉතුරු liquidity ($$$) levels; අනිත් ඒවා RR අනුව.</p>`;
 else h+='<p>දැනට මිල ආපහු එන්න පුළුවන් නිරෝධ zone එකක් නෑ. අලුත් OB/FVG එකක් හැදෙනකම් බලන්න.</p>';
 h+=`<p class="msg">Chart එකේ: BOS ${n('BOS')}, CHoCH ${n('CHoCH')}, OB ${A.obs.filter(o=>!o.mit).length}, FVG ${A.fvg.filter(o=>!o.mit).length}, Liquidity ${A.liq.length}, Sweep ${A.sweeps.length}. මේක auto analysis එකක් විතරයි, financial advice නෙවෙයි.</p>`;
 $('D').innerHTML=h}
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
load('BTC',1);setInterval(()=>load(S.sym,0),20000);
