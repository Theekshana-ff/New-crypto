const $=id=>document.getElementById(id),ls=Ctx.ls,pf=Ctx.pf;
setInterval(function t(){const d=new Date();$('time').textContent=d.toLocaleTimeString();$('date').textContent=d.toLocaleDateString('en',{weekday:'short',year:'numeric',month:'short',day:'numeric'});return t}(),1000);
const tg=o=>{$('drawer').classList.toggle('open',o);$('scrim').classList.toggle('show',o)};$('menuBtn').onclick=()=>tg(1);$('scrim').onclick=()=>tg(0);
$('jm').value=ls.get('jMode','1');$('jm').onchange=()=>{ls.set('jMode',$('jm').value);run()};
const LBL={pending:'⏳ waiting for entry',open:'▶ open',missed:'⚪ missed (no pullback)',sl:'❌ stopped out',be:'⚖ breakeven + TP1 half',tp:'✅ target hit'};
async function run(){const list=Ctx.journal(),mg=$('jm').value==='1',now=Date.now();
 const rows=await Promise.all(list.map(async s=>{let e={st:'pending',hit:0,R:null};try{const age=(now-s.t*1000)/864e5,tf=age<2.5?'5m':age<10?'15m':age<40?'1h':'4h';e=Ctx.evalTrade(s,await Ctx.kl(s.sym,tf,1000,s.t*1000),mg)}catch(x){}return{s,e}}));
 {const nf=ls.get('jNotified',null),A=ls.get('alCfg',{}),cl=rows.filter(r=>r.e.R!=null&&r.s.id);
  if(nf===null)ls.set('jNotified',cl.map(r=>r.s.id));
  else{let ch=0;for(const r of cl){if(nf.includes(r.s.id))continue;nf.push(r.s.id);ch=1;const m=`📒 ${r.s.sym} ${r.s.tf} ${r.s.d>0?'LONG':'SHORT'}: ${LBL[r.e.st]||'closed'} (${r.e.R>=0?'+':''}${r.e.R.toFixed(2)}R)`;Ctx.toast(m);
   if(A.token&&A.chat)fetch(`https://api.telegram.org/bot${encodeURIComponent(A.token)}/sendMessage?chat_id=${encodeURIComponent(A.chat)}&text=${encodeURIComponent(m)}`).catch(()=>{})}
   if(ch)ls.set('jNotified',nf.slice(-300))}}
 const done=rows.filter(r=>r.e.R!=null),w=done.filter(r=>r.e.R>0),tot=done.reduce((a,r)=>a+r.e.R,0),usd=done.reduce((a,r)=>a+r.e.R*(r.s.risk||0),0);
 const grp=k=>{const m={};done.forEach(r=>{const g=r.s[k];(m[g]=m[g]||{n:0,w:0,R:0});m[g].n++;m[g].R+=r.e.R;if(r.e.R>0)m[g].w++});return m};
 const gt=m=>'<table>'+Object.keys(m).map(g=>`<tr><td>${g}</td><td>${m[g].n} trades</td><td>${(m[g].w/m[g].n*100).toFixed(0)}% win</td><td class="${m[g].R>=0?'up':'down'}">${m[g].R>=0?'+':''}${m[g].R.toFixed(2)}R</td></tr>`).join('')+'</table>';
 $('SUM').innerHTML='<h3>Summary</h3>'+(done.length?`<p>Closed trades: <b>${done.length}</b> · Win rate: <b>${(w.length/done.length*100).toFixed(0)}%</b> · Average: <b>${(tot/done.length).toFixed(2)}R</b></p><p>Total: <b class="${tot>=0?'up':'down'}">${tot>=0?'+':''}${tot.toFixed(2)}R</b> ≈ <b class="${usd>=0?'up':'down'}">${usd>=0?'+':'-'}$${Math.abs(usd).toFixed(2)}</b></p><h3 style="margin-top:10px">By method</h3>${gt(grp('method'))}<h3 style="margin-top:10px">By coin</h3>${gt(grp('sym'))}`:'<p class="msg">No closed trades yet. Use "📒 Take trade" on the SMC, Fibonacci or Chart patterns pages. Results update automatically from real price data.</p>');
 $('TR').innerHTML='<h3>Trades</h3>'+(rows.length?'<table>'+rows.map(({s,e},i)=>`<tr><td><b>${s.sym}</b> ${s.tf} <span class="${s.d>0?'up':'down'}">${s.d>0?'LONG':'SHORT'}</span> <small class="msg">${s.method}</small><br><small class="msg">Entry ${pf(s.entry)} · SL ${pf(s.sl)} · ${new Date(s.t*1000).toLocaleDateString()}</small></td><td>${LBL[e.st]}${e.R!=null?`<br><b class="${e.R>=0?'up':'down'}">${e.R>=0?'+':''}${e.R.toFixed(2)}R</b>`:e.part?`<br><span class="up">+${e.part.toFixed(2)}R locked</span>`:''}</td><td><button class="x" data-i="${i}">✕</button></td></tr>`).join('')+'</table>':'<p class="msg">Journal is empty.</p>');
 document.querySelectorAll('#TR .x').forEach(b=>b.onclick=()=>{const l=Ctx.journal();l.splice(+b.dataset.i,1);ls.set('journal',l);run()})}
run();setInterval(run,60000);
