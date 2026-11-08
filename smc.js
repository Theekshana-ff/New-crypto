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
// chart
const chart=LightweightCharts.createChart($('cht'),{autoSize:true,layout:{background:{color:'#0e1621'},textColor:'#8a9bb0'},grid:{vertLines:{color:'#1a2636'},horzLines:{color:'#1a2636'}},rightPriceScale:{borderColor:'#243447'},timeScale:{borderColor:'#243447',timeVisible:true,rightOffset:8}});
const series=chart.addCandlestickSeries({upColor:'#2ecc9a',downColor:'#ff5d6c',wickUpColor:'#2ecc9a',wickDownColor:'#ff5d6c',borderVisible:false});
const cv=$('ov'),ctx=cv.getContext('2d');
new ResizeObserver(()=>{const r=$('box').getBoundingClientRect(),d=devicePixelRatio||1;cv.width=r.width*d;cv.height=r.height*d;sig=''}).observe($('box'));
function draw(){
 const d=devicePixelRatio||1;ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,cv.width,cv.height);
 const A=S.A,c=S.c;if(!A)return;const ts=chart.timeScale(),W=ts.width(),X=i=>ts.logicalToCoordinate(i),Y=p=>series.priceToCoordinate(p);
 ctx.font='11px sans-serif';
 const line=(x1,x2,y,col,w,dash,txt)=>{if(x1==null||x2==null||y==null)return;ctx.strokeStyle=col;ctx.lineWidth=w;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(x1,y);ctx.lineTo(x2,y);ctx.stroke();ctx.setLineDash([]);if(txt){ctx.fillStyle=col;ctx.textAlign='center';ctx.fillText(txt,(x1+x2)/2,y-4)}};
 const zone=(z,col,txt)=>{const x1=X(z.i),x2=Math.min(z.mit?X(z.end):W,W),y1=Y(z.top),y2=Y(z.bot);if(x1==null||x2==null||y1==null||y2==null||x2<0)return;
  ctx.fillStyle=col+'33';ctx.strokeStyle=col;ctx.lineWidth=1;ctx.fillRect(x1,y1,x2-x1,y2-y1);ctx.strokeRect(x1,y1,x2-x1,y2-y1);ctx.fillStyle=col;ctx.textAlign='left';ctx.fillText(txt,Math.max(x1,0)+4,y1+11)};
 if(S.L.ob)for(const d of[1,-1])A.obs.filter(o=>!o.mit&&o.d===d).slice(-3).forEach(o=>zone(o,d>0?'#2ecc9a':'#ff5d6c',(d>0?'Bull':'Bear')+' OB'));
 if(S.L.fvg)for(const d of[1,-1])A.fvg.filter(o=>!o.mit&&o.d===d).slice(-4).forEach(o=>zone(o,d>0?'#4ea1ff':'#f0b429','FVG'));
 if(S.L.struct)A.ev.slice(-14).forEach(e=>line(X(e.from),X(e.to),Y(e.p),e.k==='CHoCH'?'#f0b429':'#8ab4ff',e.k==='CHoCH'?1.6:1,e.k==='CHoCH'?[5,3]:[],e.k+(e.d>0?' ↑':' ↓')));
 if(S.L.liq){A.liq.slice(-6).forEach(q=>line(X(q.from),q.st==='open'?W:X(q.at),Y(q.p),'#b388ff',1,[2,3],(q.t==='H'?'EQH':'EQL')+' $$$'));
  A.sweeps.forEach(s=>{const x=X(s.at),y=Y(s.t==='H'?c[s.at].high:c[s.at].low);if(x==null||y==null)return;line(X(s.i),x,Y(s.p),'#b388ff',1,[2,3]);ctx.fillStyle='#ff7ad9';ctx.font='bold 14px sans-serif';ctx.textAlign='center';ctx.fillText('X',x,s.t==='H'?y-4:y+14);ctx.font='11px sans-serif'})}
}
(function loop(){const r=chart.timeScale().getVisibleLogicalRange(),c=S.c[S.c.length-1];
 const s=r?[r.from,r.to,c&&series.priceToCoordinate(c.high),c&&series.priceToCoordinate(c.low),cv.width].join():'';if(s!==sig){sig=s;draw()}requestAnimationFrame(loop)})();
// data
async function load(sym,first){
 try{const r=await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}USDT&interval=${S.tf}&limit=500`);if(!r.ok)throw 0;
  const k=await r.json();if(!k.length)throw 0;
  const rg=chart.timeScale().getVisibleLogicalRange();S.sym=sym;
  S.c=k.map(x=>({time:Math.floor(x[0]/1000),open:+x[1],high:+x[2],low:+x[3],close:+x[4]}));
  const lp=S.c[S.c.length-1].close;series.applyOptions({priceFormat:{type:'price',precision:lp>=100?2:lp>=1?4:lp>=.1?5:lp>=.01?6:8,minMove:Math.pow(10,-(lp>=100?2:lp>=1?4:lp>=.1?5:lp>=.01?6:8))}});
  series.setData(S.c);S.A=SMC.analyze(S.c,/m$/.test(S.tf)?5:4);S.T=SMC.setup(S.c,S.A);
  if(first||!rg){const n=S.c.length;chart.timeScale().setVisibleLogicalRange({from:n-110,to:n+8})}else chart.timeScale().setVisibleLogicalRange(rg);
  S.lines.forEach(l=>series.removePriceLine(l));S.lines=[];const T=S.T;
  if(T&&!T.none){const pl=(p,t,col)=>S.lines.push(series.createPriceLine({price:p,color:col,lineWidth:1,lineStyle:2,axisLabelVisible:true,title:t}));
   pl(T.entry,'ENTRY','#f0b429');pl(T.sl,'SL','#ff5d6c');T.tps.forEach((t,i)=>pl(t.p,'TP'+(i+1),'#2ecc9a'))}
  badge(lp);renderB();renderD();sig='';
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
document.querySelectorAll('#tools [data-l]').forEach(b=>b.onclick=()=>{S.L[b.dataset.l]^=1;b.classList.toggle('on');sig=''});
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
