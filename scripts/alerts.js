// File: scripts/alerts.js
// 24/7 alerts for GitHub Actions: checks the coins in watch.json with the same SMC / Fibonacci / Chart-pattern logic as the site and sends Telegram messages.
const fs=require('fs'),path=require('path'),root=path.join(__dirname,'..');
const SMC=require(path.join(root,'smc-core.js')),FIB=require(path.join(root,'fib-core.js')),PAT=require(path.join(root,'pat-core.js')),STRAT=require(path.join(root,'strat-core.js'));
let ST={enabled:[]};try{ST=JSON.parse(fs.readFileSync(path.join(root,'strategy.json'),'utf8'))}catch(e){}
const LOOK=+process.env.LOOKBACK_MIN||45;
const cfg=Object.assign({coins:['BTC','ETH','SOL'],timeframes:['15m','1h'],methods:['smc','fib','patterns'],filters:{news:true,btc:false,range:false,funding:false},cooldownHours:6},JSON.parse(fs.readFileSync(path.join(root,'watch.json'),'utf8')));
const methods=(cfg.methods||[]).map(m=>String(m).toLowerCase());
const hasM=(...keys)=>keys.some(k=>methods.includes(k));
const TOKEN=process.env.TELEGRAM_BOT_TOKEN,CHAT=process.env.TELEGRAM_CHAT_ID,TEST=process.env.TEST==='1',DRY=process.env.DRY_RUN==='1';
const HOSTS=['https://data-api.binance.vision','https://api.binance.us','https://api.binance.com'];
let V={disabled:[],signals:{}};try{V=Object.assign(V,JSON.parse(fs.readFileSync(path.join(root,'validated.json'),'utf8')))}catch(e){}
const bt=sig=>{const s=V.signals['Signal: '+sig];return s?`Backtest ${s.n} trades: TP1 ${(s.tp1*100).toFixed(0)}%, exp ${s.expU>=0?'+':''}${s.expU}R`:null};
const pf=p=>p>=100?p.toFixed(2):p>=1?p.toFixed(4):p.toPrecision(5),tpl=a=>a.map((p,i)=>'TP'+(i+1)+' '+pf(p)).join(' | ');

async function kl(sym,tf,lim=500){
 for(const h of HOSTS){
  try{
   const r=await fetch(`${h}/api/v3/klines?symbol=${sym}USDT&interval=${tf}&limit=${lim}`);if(!r.ok)continue;
   const k=await r.json();
   if(Array.isArray(k)&&k.length){
    const closed=k.filter(x=>x[6]<=Date.now());
    const use=closed.length>=30?closed:k.slice(0,-1);
    return use.map(x=>({time:Math.floor(x[0]/1000),open:+x[1],high:+x[2],low:+x[3],close:+x[4],vol:+x[5]}));
   }
  }catch(e){}
 }
 throw new Error(`no candles for ${sym} ${tf}`);
}

async function send(text){
 if(DRY||!TOKEN||!CHAT){console.log('[not sent]',text.replace(/\n/g,' | '));return}
 const r=await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:CHAT,text})});
 if(!r.ok)console.error('Telegram error',r.status,(await r.text()).slice(0,200));
}

const sfile=path.join(root,'.state','sent.json'),readState=()=>{try{return JSON.parse(fs.readFileSync(sfile,'utf8'))}catch(e){return{}}};
const writeState=s=>{fs.mkdirSync(path.dirname(sfile),{recursive:true});fs.writeFileSync(sfile,JSON.stringify(s))};

async function context(){
 const o={};
 try{const[h4,d1]=await Promise.all([kl('BTC','4h',300),kl('BTC','1d',200)]),w=h4.slice(-50),er=Math.abs(w[w.length-1].close-w[0].close)/(w.slice(1).reduce((s,x,i)=>s+Math.abs(x.close-w[i].close),0)||1);
  o.btc={t4:SMC.analyze(h4,6).trend,t1:SMC.analyze(d1,6).trend,range:er<0.2}}catch(e){}
 try{const r=await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json',{headers:{'User-Agent':'Mozilla/5.0'}});if(r.ok)o.ev=(await r.json()).filter(e=>e.impact==='High'&&['USD','All'].includes(e.country)).map(e=>({t:Date.parse(e.date),title:e.title}))}catch(e){}
 return o;
}

const fcache={};
async function funding(sym){if(sym in fcache)return fcache[sym];let v=null;try{const r=await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${sym}USDT`);if(r.ok)v=+(await r.json()).lastFundingRate}catch(e){}return fcache[sym]=v}
const T3=t=>t>0?'Bullish':t<0?'Bearish':'Neutral';
const hc={};
async function bias(sym){if(hc[sym])return hc[sym];let v={d1:0,h4:0};try{const[a,b]=await Promise.all([kl(sym,'1d',300),kl(sym,'4h',300)]);v={d1:SMC.analyze(a,6).trend,h4:SMC.analyze(b,6).trend}}catch(e){v=null}return hc[sym]=v}

function evalCtx(cx,fund,rv,dir,sym){
 const notes=[],block={},b=cx.btc;if(!b)notes.push('⚠ BTC context unavailable');if(!cx.ev)notes.push('⚠ news calendar unavailable');
 if(b){notes.push(`BTC 4h ${T3(b.t4)} · 1d ${T3(b.t1)} · ${b.range?'ranging':'trending'}`);
  if(dir&&sym!=='BTC'){const al=(b.t4===dir)+(b.t1===dir),op=(b.t4===-dir)+(b.t1===-dir);if(al===2)notes.push('✓ follows BTC trend');else if(op>=1){block.btc=1;notes.push('✗ against BTC trend')}}if(b.range)block.range=1}
 if(rv!=null)notes.push(`Volume ${rv.toFixed(1)}× avg`);
 if(fund!=null){notes.push(`Funding ${(fund*100).toFixed(3)}%`);if(dir>0&&fund>0.0005||dir<0&&fund<-0.0005){block.fund=1;notes.push('✗ crowded')}}
 const now=Date.now(),n=(cx.ev||[]).find(e=>e.t-now<=3600e3&&now-e.t<=1800e3);if(n){block.news=1;notes.push(`⚠ ${n.title} (${Math.round((n.t-now)/60000)} min)`)}
 return{notes,block};
}

(async()=>{
 if(TEST){await send('✅ 24/7 alerts connected (GitHub Actions)');return}
 const state=readState(),now=Date.now(),cd=cfg.cooldownHours*3600e3,cx=await context(),F=cfg.filters||{};let sentN=0;
 for(const sym of cfg.coins)for(const tf of cfg.timeframes){
  let c;try{c=await kl(sym,tf)}catch(e){console.error(e.message);continue}
  const n=c.length-1,last=c[n].close,A4=SMC.analyze(c,/m$/.test(tf)?5:4),A6=SMC.analyze(c,6),found=[],avg=c.slice(n-20,n).reduce((s,x)=>s+x.vol,0)/20,rv=avg?c[n-1].vol/avg:null;
  if(hasM('smc')){const T=SMC.setup(c,A4);const gS=T&&!T.none?SMC.grade(T,null):null;if(T&&!T.none&&T.inside&&gS&&gS.pts>=4)found.push({m:'SMC',sig:'SMC '+T.src,key:`SMC|${sym}|${tf}|${T.d}|${pf(T.entry)}`,dir:T.d,title:`SMC · ${sym} ${tf}`,text:`${T.d>0?'LONG':'SHORT'}: price is inside the ${T.src} entry zone${T.conf?' (OB+FVG)':''}\nEntry ${pf(T.entry)} | SL ${pf(T.sl)}\n${tpl(T.tps.map(t=>t.p))}`})}
  if(hasM('fib','fibonacci')){const f=FIB.fib(c,A6,FIB.DEF);if(f&&!f.broken&&f.state==='inside'){const g=FIB.grade(f,null);if(g&&g.g!=='C')found.push({m:'FIB',sig:'Fibonacci',key:`FIB|${sym}|${tf}|${f.d}|${pf(f.entry)}`,dir:f.d,title:`Fibonacci · ${sym} ${tf}`,text:`${f.d>0?'LONG':'SHORT'}: price is inside the ${f.zr[0]}–${f.zr[1]} zone${g?' (grade '+g.g+')':''}\nEntry ${pf(f.entry)} | SL ${pf(f.sl)}\n${tpl(f.tps.map(t=>t.p))}`})}}
  if(hasM('patterns','pat'))PAT.detect(c,A6).filter(p=>p.dir&&p.tps&&!(cfg.skipPatterns||[]).includes(p.names[0])&&Math.abs(last-p.entry)<=A6.atr*0.8).slice(0,3).forEach(p=>found.push({m:'PAT',sig:p.names[0],key:`PAT|${sym}|${tf}|${p.id}`,dir:p.dir,title:`Pattern · ${sym} ${tf}`,text:`${p.names[0]} (${p.status})\n${p.dir>0?'LONG':'SHORT'} entry ${pf(p.entry)} | SL ${pf(p.sl)}\n${tpl(p.tps.map(t=>t.p))}`}));
  if(hasM('strategy','strat')){const tfms=({'15m':9e5,'1h':36e5,'4h':144e5})[tf]||36e5,rules=(ST.enabled||[]).filter(e=>e.tf===tf);
   if(rules.length&&c.length>=250){const P=STRAT.prep(c);for(let i=n;i>=Math.max(210,n-3);i--){if(now-(c[i].time*1000+tfms)>LOOK*60000)break;
    for(const e of rules){const d=STRAT.signal(P,i,e.cfg);if(!d)continue;const pl=STRAT.plan(P,i,e.cfg,d,c[i].close),q=e.stats||{};
     found.push({m:'STRAT',sig:'Strategy '+e.name,key:`STRAT|${sym}|${tf}|${e.id||e.name}|${c[i].time}`,dir:d,title:`Strategy · ${sym} ${tf}`,text:`${d>0?'LONG':'SHORT'} — ${e.name}\nSignal on a CLOSED candle. Enter at the next candle open (about ${pf(pl.entry)})\nSL ${pf(pl.sl)} (${e.cfg.k}×ATR) | TP ${pf(pl.tp)} (${e.cfg.m}R)\nReal-data test (fees included): ${q.trades||'?'} trades, expectancy train ${q.expTrain}R / val ${q.expValidation}R / test ${q.expTest}R`})}}}}
  for(const a of found){
   if(state[a.key]&&now-state[a.key]<cd)continue;
   if(V.disabled.includes('Method: '+a.m)||V.disabled.includes('Signal: '+a.sig)||V.disabled.includes('Time frame: '+tf)){console.log('skipped (failed real-data validation):',a.key);continue}
   const e=evalCtx(cx,F.funding?await funding(sym):null,rv,a.dir,sym);
   if(F.htf!==false){const b=await bias(sym);if(b){if(a.dir&&(b.d1===-a.dir||(b.d1===0&&b.h4===-a.dir))){console.log('skipped by HTF bias:',a.key);continue}e.notes.push(`HTF 1D ${T3(b.d1)} · 4H ${T3(b.h4)}`)}}
   if((F.news&&e.block.news)||(F.btc&&e.block.btc)||(F.range&&e.block.range)||(F.funding&&e.block.fund)){console.log('skipped by filter:',a.key);continue}
   const b=bt(a.sig);if(b)e.notes.push(b);
   state[a.key]=now;sentN++;await send(`🔔 ${a.title}\n${a.text}\nContext: ${e.notes.join('; ')}\n\n(Auto analysis, not financial advice)`);
  }
 }
 for(const k in state)if(now-state[k]>864e5)delete state[k];writeState(state);
 console.log(`done: ${cfg.coins.length} coins × ${cfg.timeframes.length} time frames, ${sentN} alert(s)`);
})().catch(e=>{console.error(e);process.exit(1)});
