const API='https://data-api.binance.vision/api/v3/ticker/24hr';
const WATCH=['BTC','ETH','SOL','BNB','XRP','DOGE'];
const $=id=>document.getElementById(id);
const fmt=p=>p>=1?p.toLocaleString('en',{maximumFractionDigits:2}):p.toPrecision(3);
const pct=c=>`<span class="${c>=0?'up':'down'}">${c>=0?'+':''}${(+c).toFixed(2)}%</span>`;
const cdn=s=>`https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/32/color/${s.toLowerCase()}.png`;
function fb(el,s){if(!el.dataset.f){el.dataset.f=1;el.src=cdn(s)}else{el.outerHTML=`<i class="lg">${s[0]}</i>`}}
const logo=(s,img)=>{s=String(s).replace(/[^A-Za-z0-9]/g,'');return `<img class="lgo" src="${img||cdn(s)}" alt="" loading="lazy" onerror="fb(this,'${s}')">`};
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
$('searchForm').onsubmit=e=>{e.preventDefault();const v=$('q').value.trim();if(v){loadChart(v.split(' ')[0]);$('q').blur();$('sug').innerHTML=''}};

// Search any coin in the world (CoinGecko), suggestions fill the list
let t;$('q').oninput=()=>{clearTimeout(t);const v=$('q').value.trim();if(v.length<2){$('sug').innerHTML='';return}
 t=setTimeout(async()=>{try{
  const r=await (await fetch('https://api.coingecko.com/api/v3/search?query='+encodeURIComponent(v))).json();
  $('sug').innerHTML=r.coins.slice(0,8).map(c=>`<li data-s="${c.symbol.toUpperCase()}">${logo(c.symbol.toUpperCase(),c.thumb)}<b>${c.name}</b><span>${c.symbol.toUpperCase()}</span></li>`).join('');
  document.querySelectorAll('#sug li').forEach(l=>l.onmousedown=l.ontouchstart=e=>{e.preventDefault();$('q').value=l.dataset.s;$('sug').innerHTML='';loadChart(l.dataset.s)});
 }catch(e){}},350)};
$('q').onblur=()=>setTimeout(()=>$('sug').innerHTML='',150);

// Prices + top 4
async function prices(){
 try{
  const all=(await (await fetch(API)).json()).filter(t=>t.symbol.endsWith('USDT'));
  const by=Object.fromEntries(all.map(t=>[t.symbol.replace('USDT',''),t]));
  binance=new Set(Object.keys(by));
  $('ticker').innerHTML=WATCH.filter(s=>by[s]).map(s=>`<span>${logo(s)}<b>${s}</b>${fmt(+by[s].lastPrice)} ${pct(by[s].priceChangePercent)}</span>`).join('');
  }catch(e){void 0}
}

// E: news with pictures, filter by source
let items=[];
function renderNews(){
 const list=items.slice(0,15);
 $('news').innerHTML=list.map(n=>`<a href="${n.url}" target="_blank" rel="noopener">${n.image?`<img src="${n.image}" loading="lazy" alt="">`:'<div class="ph"></div>'}<div><div>${n.title}</div><small>${n.source} · ${n.time?new Date(n.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):''}</small></div></a>`).join('')||'<div class="msg">No news yet.</div>';
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

// Top 4 + all-coins table (logos) from CoinGecko, cached by /api/markets
const money=n=>n==null?'-':n>=1e12?'$'+(n/1e12).toFixed(2)+'T':n>=1e9?'$'+(n/1e9).toFixed(2)+'B':n>=1e6?'$'+(n/1e6).toFixed(2)+'M':'$'+Math.round(n).toLocaleString('en');
const price=p=>p==null?'-':'$'+(p>=1?p.toLocaleString('en',{maximumFractionDigits:2}):p.toPrecision(4));
const pc=c=>c==null?'-':`<span class="${c>=0?'up':'down'}">${c>=0?'▲':'▼'}${Math.abs(c).toFixed(2)}%</span>`;
let pages=1;
async function getPage(n){
 try{const r=await fetch('/api/markets?page='+n);if(!r.ok)throw 0;return await r.json()}
 catch(e){return await (await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=${n}&price_change_percentage=1h,24h,7d`)).json()}
}
async function markets(){
 try{
  let rows=[];for(let n=1;n<=pages;n++)rows=rows.concat(await getPage(n));
  const peg=c=>(c.current_price>0.97&&c.current_price<1.03&&Math.abs(c.price_change_percentage_24h||0)<1)||/usd|dai|gold|staked|wrapped|tether/i.test(c.name+c.symbol);
  const top=rows.slice(0,50).filter(c=>!peg(c)).sort((a,b)=>b.price_change_percentage_24h-a.price_change_percentage_24h).slice(0,4);
  $('top4').innerHTML=top.map(c=>`<button class="coin" data-s="${c.symbol.toUpperCase()}"><div class="n">${logo(c.symbol.toUpperCase(),c.image)}${c.symbol.toUpperCase()}</div><div class="p">${price(c.current_price)}</div>${pct(c.price_change_percentage_24h)}</button>`).join('');
  document.querySelectorAll('.coin').forEach(b=>b.onclick=()=>pick(b.dataset.s));
  document.querySelector('#mkt tbody').innerHTML=rows.map(c=>`<tr data-s="${c.symbol.toUpperCase()}"><td>${c.market_cap_rank??''}</td><td class="nm">${logo(c.symbol.toUpperCase(),c.image)}<b>${c.name}</b> <span>${c.symbol.toUpperCase()}</span></td><td>${price(c.current_price)}</td><td>${pc(c.price_change_percentage_1h_in_currency)}</td><td>${pc(c.price_change_percentage_24h_in_currency??c.price_change_percentage_24h)}</td><td>${pc(c.price_change_percentage_7d_in_currency)}</td><td>${money(c.market_cap)}</td><td>${money(c.total_volume)}</td></tr>`).join('');
  document.querySelectorAll('#mkt tbody tr').forEach(r=>r.onclick=()=>pick(r.dataset.s));
 }catch(e){if(!$('top4').querySelector('.coin'))$('top4').innerHTML='<div class="msg">Could not load coins. Retrying...</div>'}
}
function pick(s){loadChart(s);$('chartTitle').scrollIntoView({behavior:'smooth'})}
$('more').onclick=()=>{if(pages<5){pages++;markets()}if(pages>=5)$('more').style.display='none'};
markets();setInterval(markets,60000);
