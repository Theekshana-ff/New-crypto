// Shared alerts: in-page toast + sound/vibrate + browser notification + Telegram message
const Alerts=(()=>{
 const ls={get:(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
 let ST=null;const loadS=async()=>{if(ST)return ST;try{const r=await fetch('/strategy.json');ST=r.ok?await r.json():{enabled:[]}}catch(e){ST={enabled:[]}}ST.enabled=ST.enabled||[];return ST};
 const TFMS={'1m':6e4,'5m':3e5,'15m':9e5,'1h':36e5,'4h':144e5,'1d':864e5},fp=p=>p>=100?p.toFixed(2):p>=1?p.toFixed(4):p.toPrecision(5);
 async function stratCheck(sym){if(!window.STRAT)return[];const S=await loadS(),out=[];
  for(const tf of[...new Set(S.enabled.map(e=>e.tf))]){let c;try{const r=await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}USDT&interval=${tf}&limit=500`);if(!r.ok)continue;c=(await r.json()).filter(x=>x[6]<=Date.now()).map(x=>({time:Math.floor(x[0]/1000),open:+x[1],high:+x[2],low:+x[3],close:+x[4],vol:+x[5]}))}catch(e){continue}
   if(c.length<250)continue;const P=STRAT.prep(c),i=c.length-1,ms=TFMS[tf]||36e5;if(Date.now()-(c[i].time*1000+ms)>Math.max(ms*0.5,40*60e3))continue;
   for(const e of S.enabled.filter(x=>x.tf===tf)){const d=STRAT.signal(P,i,e.cfg);if(!d)continue;const p=STRAT.plan(P,i,e.cfg,d,c[i].close);
    out.push({m:'STRAT',sig:e.id,dir:d,key:`ST|${sym}|${tf}|${e.id}|${c[i].time}`,title:`Strategy · ${sym} ${tf}`,text:`${d>0?'LONG':'SHORT'}: ${e.name} (SL ${e.cfg.k}×ATR, TP ${e.cfg.m}R)\nEntry ≈ ${fp(p.entry)} | SL ${fp(p.sl)}\nTP ${fp(p.tp)}\nTested on real data: ${e.stats.trades} trades, test period ${e.stats.expTest>=0?'+':''}${e.stats.expTest}R per trade`,trade:{method:'Strategy',sym,tf,d,entry:p.entry,sl:p.sl,tps:[p.tp,p.tp]}})}}
  return out}
 let VAL=null;const loadV=async()=>{if(VAL)return VAL;try{const r=await fetch('/validated.json');VAL=r.ok?await r.json():{disabled:[]}}catch(e){VAL={disabled:[]}}VAL.disabled=VAL.disabled||[];return VAL};
 let cfg=Object.assign({on:false,notif:true,sound:true,token:'',chat:'',watch:'',fb:true,fr:true,fn:true,ff:true,fh:true,aj:true},ls.get('alCfg',{})),gs,gt,fn,busy=false,actx,panel;
 const save=()=>ls.set('alCfg',cfg),esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 function beep(){try{actx=actx||new(window.AudioContext||window.webkitAudioContext)();const o=actx.createOscillator(),g=actx.createGain();o.connect(g);g.connect(actx.destination);o.frequency.value=880;g.gain.value=0.15;o.start();setTimeout(()=>o.stop(),350)}catch(e){}}
 function toast(m){let t=document.getElementById('toast');if(!t){t=document.createElement('div');t.id='toast';t.className='toast';t.onclick=()=>t.remove();document.body.appendChild(t)}t.textContent=m;clearTimeout(t._t);t._t=setTimeout(()=>t.remove(),20000)}
 async function tg(text){if(!cfg.token||!cfg.chat)return false;const u=`https://api.telegram.org/bot${encodeURIComponent(cfg.token)}/sendMessage?chat_id=${encodeURIComponent(cfg.chat)}&text=${encodeURIComponent(text)}`;
  try{const r=await fetch(u);return r.ok}catch(e){try{await fetch(u,{mode:'no-cors'});return 'unknown'}catch(e2){return false}}}
 async function notif(title,body){if(!cfg.notif||!('Notification' in window)||Notification.permission!=='granted')return;
  try{const reg=navigator.serviceWorker&&await navigator.serviceWorker.getRegistration();if(reg)reg.showNotification(title,{body,vibrate:[200,100,200]});else new Notification(title,{body})}catch(e){}}
 async function fire(a){toast(a.title+'\n'+a.text);if(cfg.sound){beep();try{navigator.vibrate&&navigator.vibrate([200,100,200])}catch(e){}}notif(a.title,a.text);
  await tg(`🔔 ${a.title}\n${a.text}\n\n(Auto analysis, not financial advice)`);
  const l=ls.get('alLog',[]);l.unshift({t:Date.now(),s:a.title+' – '+a.text.split('\n')[0]});ls.set('alLog',l.slice(0,8));log()}
 async function run(){if(!cfg.on||busy||!fn)return;busy=true;
  try{const coins=[...new Set([gs(),...cfg.watch.split(',').map(x=>x.trim().toUpperCase()).filter(Boolean)])].slice(0,11),sent=ls.get('alSent',{}),now=Date.now();
   for(const sym of coins){let res=[];try{res=await fn(sym,gt())}catch(e){}try{res=res.concat(await stratCheck(sym))}catch(e){}
    for(const a of res){if(sent[a.key]&&now-sent[a.key]<6*3600e3)continue;
     {const V=await loadV();if(a.m&&a.m!=='STRAT'&&(V.disabled.includes('Method: '+a.m)||V.disabled.includes('Signal: '+a.sig)||V.disabled.includes('Time frame: '+gt())))continue}
     if(window.Ctx&&a.dir){try{const cx=await Ctx.get(sym,null,gt()),e=Ctx.eval(cx,a.dir,sym);
      if((cfg.fn&&e.block.news)||(a.m!=='STRAT'&&((cfg.fb&&e.block.btc)||(cfg.fr&&e.block.range)||(cfg.ff&&e.block.fund))))continue;
      a.text+='\nContext: '+e.notes.map(n=>(n.ok===true?'✓ ':n.ok===false?'✗ ':'• ')+n.text).join('; ')}catch(x){}}
     if(cfg.fh&&a.m!=='STRAT'&&window.HTF&&a.dir){try{const b=await HTF.bias(sym);if(HTF.against(b,a.dir))continue;a.text+='\nHTF: 1D '+HTF.T(b.d1)+' · 4H '+HTF.T(b.h4)}catch(x){}}
     sent[a.key]=now;ls.set('alSent',sent);await fire(a);
     if(cfg.aj&&a.trade&&window.Ctx){const J=ls.get('alJ',[]);if(!J.includes(a.key)){J.push(a.key);ls.set('alJ',J.slice(-200));Ctx.addTrade(a.trade)}}}}
   for(const k in sent)if(now-sent[k]>24*3600e3)delete sent[k];ls.set('alSent',sent)}finally{busy=false}}
 function log(){if(!panel)return;const l=ls.get('alLog',[]);panel.querySelector('#al_log').innerHTML=l.length?l.map(x=>`<div class="msg">${new Date(x.t).toLocaleTimeString()} · ${esc(x.s)}</div>`).join(''):'<div class="msg">No alerts yet.</div>'}
 function mount(el,btn){panel=el;
  el.innerHTML=`<h3>🔔 Alerts</h3><label class="alr"><input type="checkbox" id="al_on"> Alerts ON (checked every minute while this page stays open)</label>
  <label class="alr"><input type="checkbox" id="al_s"> Sound + vibrate</label>
  <label class="alr"><input type="checkbox" id="al_n"> Browser notification</label> <button id="al_p" class="moreBtn" style="margin:4px 0">Allow notifications</button>
  <h3 style="margin-top:12px">Telegram</h3>
  <div class="rin"><label>Bot token<input id="al_t" type="password" autocomplete="off" placeholder="123456:ABC..."></label><label>Chat ID<input id="al_c" placeholder="123456789"></label></div>
  <button id="al_test" class="moreBtn" style="margin:4px 0">Save + send test</button> <span id="al_m" class="msg"></span>
  <p class="msg">1) Telegram එකේ @BotFather → /newbot → token එක copy කරන්න. 2) ඔයාගේ bot එකට /start යවන්න. 3) Chat ID එක @userinfobot එකෙන් ගන්න. Token එක save වෙන්නේ මේ phone එකේ browser එකේ විතරයි, කාටවත් බෙදන්න එපා.</p>
  <h3 style="margin-top:12px">Filters (skip alerts when…)</h3>
  <label class="alr"><input type="checkbox" id="al_fn"> high-impact US news is within ±30–60 min</label>
  <label class="alr"><input type="checkbox" id="al_fb"> setup is against the BTC trend</label>
  <label class="alr"><input type="checkbox" id="al_fh"> setup is against the daily (1D) trend of the coin</label>
  <label class="alr"><input type="checkbox" id="al_aj"> Auto-add fired alerts to the Trade journal</label>
  <label class="alr"><input type="checkbox" id="al_fr"> BTC is ranging</label>
  <label class="alr"><input type="checkbox" id="al_ff"> funding shows crowded positioning</label>
  <label class="alr">Watch more coins (comma separated)<input id="al_w" placeholder="ETH,SOL,LINK"></label>
  <h3 style="margin-top:12px">Recent alerts</h3><div id="al_log"></div>
  <p class="msg">Alerts වැඩ කරන්නේ මේ page එක (tab එක) open වෙලා තියෙනකම් විතරයි. Phone එකේ screen එක off වුණොත් browser එක ඒක නවත්තන්න පුළුවන්.</p>`;
  const q=id=>el.querySelector('#'+id);q('al_on').checked=cfg.on;q('al_s').checked=cfg.sound;q('al_n').checked=cfg.notif;q('al_t').value=cfg.token;q('al_c').value=cfg.chat;q('al_w').value=cfg.watch;
  q('al_on').onchange=e=>{cfg.on=e.target.checked;save();if(cfg.on){beep();run()}};q('al_s').onchange=e=>{cfg.sound=e.target.checked;save()};q('al_n').onchange=e=>{cfg.notif=e.target.checked;save()};
  ['fn','fb','fr','ff','fh','aj'].forEach(k=>{q('al_'+k).checked=cfg[k];q('al_'+k).onchange=e=>{cfg[k]=e.target.checked;save()}});q('al_w').onchange=e=>{cfg.watch=e.target.value;save()};
  q('al_p').onclick=async()=>{try{const p=await Notification.requestPermission();q('al_m').textContent='Notifications: '+p}catch(e){q('al_m').textContent='Not supported here'}};
  q('al_test').onclick=async()=>{cfg.token=q('al_t').value.trim();cfg.chat=q('al_c').value.trim();save();q('al_m').textContent='Sending...';
   const r=await tg('✅ Test message from your crypto site');q('al_m').textContent=r===true?'Sent ✓':r==='unknown'?'Sent (check Telegram)':'Failed. Check token / chat id.'};
  btn.onclick=()=>el.toggleAttribute('hidden');log()}
 function init(p,getSym,getTf,check){gs=getSym;gt=getTf;fn=check;try{navigator.serviceWorker&&navigator.serviceWorker.register('/sw.js')}catch(e){}setInterval(run,60000);setTimeout(run,8000)}
 return{mount,init,run};
})();
