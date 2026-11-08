const API='https://data-api.binance.vision/api/v3/ticker/24hr';
const WATCH=['BTC','ETH','SOL','BNB','XRP','DOGE'];
const $=id=>document.getElementById(id);
const fmt=p=>p>=1?p.toLocaleString('en',{maximumFractionDigits:2}):p.toPrecision(3);
const pct=c=>`<span class="${c>=0?'up':'down'}">${c>=0?'+':''}${(+c).toFixed(2)}%</span>`;
let state={sym:'BTC',tf:'60'},binance=new Set();

function tick(){const d=new Date();$('time').textContent=d.toLocaleTimeString();
 $('date').textContent=d.toLocaleDateString('en',{weekday:'short',year:'numeric',month:'short',day:'numeric'});}
tick();setInterval(tick,1000);
const toggle=o=>{$('drawer').classList.toggle('open',o);$('scrim').classList.toggle('show',o)};
$('menuBtn').onclick=()=>toggle(true);$('scrim').onclick=()=>toggle(false);

// D: chart (symbol + timeframe)
function loadChart(sym,tf){
 if(sym)state.sym=sym.toUpperCase().replace(/(USDT|USD)$/,'');
 if(tf)state.tf=tf;
 const s=state.sym;
 // Binance pair if listed there, otherwise TradingView's all-exchange crypto index
 const tvSymbol=binance.has(s)?`BINANCE:${s}USDT`:`CRYPTO:${s}USD`;
 $('chartTitle').textContent=`${s} live chart`;
 document.querySelectorAll('#tfbar button').forEach(b=>b.classList.toggle('on',b.dataset.tf===state.tf));
 $('chart').innerHTML='';
 new TradingView.widget({container_id:'chart',symbol:tvSymbol,interval:state.tf,theme:'dark',autosize:true,
  timezone:'Etc/UTC',style:'1',locale:'en',allow_symbol_change:true});
}
document.querySelectorAll('#tfbar button').forEach(b=>b.onclick=()=>loadChart(null,b.dataset.tf));
$('searchForm').onsubmit=e=>{e.preventDefault();const v=$('q').value.trim();if(v){loadChart(v.split(' ')[0]);$('q').blur()}};

// Search any coin in the world (CoinGecko), suggestions fill the list
let t;$('q').oninput=()=>{clearTimeout(t);const v=$('q').value.trim();if(v.length<2)return;
 t=setTimeout(async()=>{try{
  const r=await (await fetch('https://api.coingecko.com/api/v3/search?query='+encodeURIComponent(v))).json();
  $('coins').innerHTML=r.coins.slice(0,12).map(c=>`<option value="${c.symbol.toUpperCase()}" label="${c.name}">`).join('');
 }catch(e){}},350)};

// Prices + top 4
async function prices(){
 try{
  const all=(await (await fetch(API)).json()).filter(t=>t.symbol.endsWith('USDT'));
  const by=Object.fromEntries(all.map(t=>[t.symbol.replace('USDT',''),t]));
  binance=new Set(Object.keys(by));
  $('ticker').innerHTML=WATCH.filter(s=>by[s]).map(s=>`<span><b>${s}</b>${fmt(+by[s].lastPrice)} ${pct(by[s].priceChangePercent)}</span>`).join('');
  const top=all.filter(t=>+t.quoteVolume>5e7&&!/UP|DOWN|USDC|FDUSD/.test(t.symbol)).sort((a,b)=>b.priceChangePercent-a.priceChangePercent).slice(0,4);
  $('top4').innerHTML=top.map(t=>{const s=t.symbol.replace('USDT','');
   return `<button class="coin" data-s="${s}"><div class="n">${s}</div><div class="p">${fmt(+t.lastPrice)}</div>${pct(t.priceChangePercent)}</button>`}).join('');
  document.querySelectorAll('.coin').forEach(b=>b.onclick=()=>loadChart(b.dataset.s));
 }catch(e){$('top4').innerHTML='<div class="msg">Could not load prices. Retrying...</div>'}
}

// E: news with pictures, filter by source
let items=[],src='All';
function renderNews(){
 const list=items.filter(n=>src==='All'||n.source===src).slice(0,15);
 $('news').innerHTML=list.map(n=>`<a href="${n.url}" target="_blank" rel="noopener">${n.image?`<img src="${n.image}" loading="lazy" alt="">`:'<div class="ph"></div>'}<div><div>${n.title}</div><small>${n.source} · ${n.time?new Date(n.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):''}</small></div></a>`).join('')||'<div class="msg">No news yet.</div>';
 const names=['All',...new Set(items.map(n=>n.source))];
 $('srcbar').innerHTML=names.map(n=>`<button class="${n===src?'on':''}">${n}</button>`).join('');
 document.querySelectorAll('#srcbar button').forEach(b=>b.onclick=()=>{src=b.textContent;renderNews()});
}
async function news(){
 try{items=await (await fetch('/api/news')).json();if(!items.length)throw 0}
 catch(e){try{ // fallback when /api isn't available (e.g. opening the file locally)
  const r=await (await fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN')).json();
  items=r.Data.map(n=>({source:n.source_info?.name||'News',title:n.title,url:n.url,time:n.published_on*1000,image:n.imageurl}));
 }catch(e2){$('news').innerHTML='<div class="msg">Could not load news.</div>';return}}
 renderNews();
}
prices().then(()=>loadChart('BTC'));setInterval(prices,15000);
news();setInterval(news,300000);
