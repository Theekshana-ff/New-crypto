const API='https://data-api.binance.vision/api/v3/ticker/24hr';
const WATCH=['BTC','ETH','SOL','BNB','XRP','DOGE'];
const $=id=>document.getElementById(id);
const fmt=p=>p>=1?p.toLocaleString('en',{maximumFractionDigits:2}):p.toPrecision(3);
const pct=c=>`<span class="${c>=0?'up':'down'}">${c>=0?'+':''}${(+c).toFixed(2)}%</span>`;

// A: live date + time
function tick(){const d=new Date();$('time').textContent=d.toLocaleTimeString();
 $('date').textContent=d.toLocaleDateString('en',{weekday:'short',year:'numeric',month:'short',day:'numeric'});}
tick();setInterval(tick,1000);

// B: menu
const toggle=o=>{$('drawer').classList.toggle('open',o);$('scrim').classList.toggle('show',o)};
$('menuBtn').onclick=()=>toggle(true);$('scrim').onclick=()=>toggle(false);

// D: TradingView chart
function loadChart(sym){
 sym=sym.toUpperCase().replace(/USDT$/,'');
 $('chartTitle').textContent=sym+'/USDT live chart';
 $('chart').innerHTML='';
 new TradingView.widget({container_id:'chart',symbol:'BINANCE:'+sym+'USDT',interval:'60',theme:'dark',
  autosize:true,timezone:'Etc/UTC',style:'1',locale:'en',allow_symbol_change:true});
}
$('searchForm').onsubmit=e=>{e.preventDefault();const v=$('q').value.trim();if(v)loadChart(v)};

// A ticker + C top 4 + search suggestions
async function prices(){
 try{
  const all=(await (await fetch(API)).json()).filter(t=>t.symbol.endsWith('USDT'));
  const by=Object.fromEntries(all.map(t=>[t.symbol.replace('USDT',''),t]));
  $('ticker').innerHTML=WATCH.filter(s=>by[s]).map(s=>`<span><b>${s}</b>${fmt(+by[s].lastPrice)} ${pct(by[s].priceChangePercent)}</span>`).join('');
  const top=all.filter(t=>+t.quoteVolume>5e7&&!/UP|DOWN|USDC|FDUSD/.test(t.symbol))
   .sort((a,b)=>b.priceChangePercent-a.priceChangePercent).slice(0,4);
  $('top4').innerHTML=top.map(t=>{const s=t.symbol.replace('USDT','');
   return `<button class="coin" data-s="${s}"><div class="n">${s}</div><div class="p">${fmt(+t.lastPrice)}</div>${pct(t.priceChangePercent)}</button>`}).join('');
  document.querySelectorAll('.coin').forEach(b=>b.onclick=()=>loadChart(b.dataset.s));
  if(!$('coins').children.length)$('coins').innerHTML=Object.keys(by).filter(s=>+by[s].quoteVolume>1e6).sort().map(s=>`<option value="${s}">`).join('');
 }catch(e){$('top4').innerHTML='<div class="msg">Could not load prices. Retrying...</div>'}
}
prices();setInterval(prices,15000);

// E: news
async function news(){
 try{
  const r=await (await fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN')).json();
  $('news').innerHTML=r.Data.slice(0,12).map(n=>`<a href="${n.url}" target="_blank" rel="noopener"><div>${n.title}</div><small>${n.source_info?.name||''} · ${new Date(n.published_on*1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></a>`).join('');
 }catch(e){$('news').innerHTML='<div class="msg">Could not load news.</div>'}
}
news();setInterval(news,300000);
loadChart('BTC');
