// File: risk.js
const $=id=>document.getElementById(id),ls={get:(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const pf=p=>p>=100?p.toFixed(2):p>=1?p.toFixed(4):p.toPrecision(5),usd=x=>(x<0?'-':'')+'$'+Math.abs(x).toLocaleString('en',{maximumFractionDigits:2});
setInterval(function t(){const d=new Date();if($('time'))$('time').textContent=d.toLocaleTimeString();if($('date'))$('date').textContent=d.toLocaleDateString('en',{weekday:'short',year:'numeric',month:'short',day:'numeric'});return t}(),1000);
const tg=o=>{if($('drawer'))$('drawer').classList.toggle('open',o);if($('scrim'))$('scrim').classList.toggle('show',o)};
if($('menuBtn'))$('menuBtn').onclick=()=>tg(1);
if($('scrim'))$('scrim').onclick=()=>tg(0);

const old=ls.get('smcRisk',{a:1000,r:1}),S=Object.assign({a:old.a,r:old.r,e:'',s:'',t1:'',t2:'',t3:'',l:10,f:0.05},ls.get('riskCalc',{})),q=new URLSearchParams(location.search);
if(q.get('e')||q.get('s')){
 S.e=q.get('e')||'';
 S.s=q.get('s')||'';
 S.t1=q.get('t1')||'';
 S.t2=q.get('t2')||'';
 S.t3=q.get('t3')||'';
}
const IDS=['a','r','e','s','t1','t2','t3','l','f'];
IDS.forEach(i=>{$(i).value=S[i];$(i).oninput=()=>{S[i]=$(i).value;ls.set('riskCalc',S);if(i==='a'||i==='r')ls.set('smcRisk',{a:+S.a,r:+S.r});calc()}});

function calc(){
 const A=+S.a,R=+S.r,E=+S.e,SL=+S.s,L=+S.l||1,F=(+S.f||0)/100,o=$('out');
 if(!(A>0&&R>0&&E>0&&SL>0)||E===SL){o.innerHTML='<h3>Result</h3><p class="msg">Enter account size, risk %, entry and stop loss.</p>';return}
 const long=E>SL,dist=Math.abs(E-SL)/E,risk=A*R/100,notional=risk/(dist+2*F),qty=notional/E,margin=notional/L,liq=100/L;
 const warn=[];if(margin>A)warn.push('Margin needed is more than your account. Lower the risk % or raise the leverage.');
 if(dist*100>=liq*0.8)warn.push(`Stop is ${(dist*100).toFixed(2)}% away; at ${L}x you are liquidated near ${liq.toFixed(1)}% against you. Use lower leverage.`);
 if(R>2)warn.push('Risk above 2% per trade is aggressive.');
 const tps=['t1','t2','t3'].map((k,i)=>({i:i+1,p:+S[k]})).filter(x=>x.p>0).map(x=>{const ok=long?x.p>E:x.p<E,mv=Math.abs(x.p-E)/E,gain=notional*mv-notional*2*F;return{...x,ok,rr:gain/risk,gain}});
 o.innerHTML=`<h3>Result · <span class="${long?'up':'down'}">${long?'LONG':'SHORT'}</span></h3>
 <table><tr><td>Risk amount</td><td><b>${usd(risk)}</b></td></tr><tr><td>Stop distance</td><td>${(dist*100).toFixed(2)}%</td></tr>
 <tr><td>Position size</td><td><b>${usd(notional)}</b></td></tr><tr><td>Quantity</td><td>${qty>=1?qty.toFixed(3):qty.toPrecision(4)}</td></tr>
 <tr><td>Margin at ${L}x</td><td>${usd(margin)}</td></tr><tr><td>Liquidation (approx.)</td><td>${pf(long?E*(1-liq/100):E*(1+liq/100))}</td></tr></table>`+
 (tps.length?'<h3 style="margin-top:12px">Targets (after fees)</h3><table>'+tps.map(x=>`<tr><td>TP${x.i} ${pf(x.p)}</td><td>${x.ok?`<span class="up">${usd(x.gain)}</span>`:'<span class="down">wrong side of entry</span>'}</td><td>${x.ok?x.rr.toFixed(2)+'R':''}</td></tr>`).join('')+'</table>':'')+
 warn.map(w=>`<p class="down">⚠ ${w}</p>`).join('')+'<p class="msg">Estimate only. Exchanges differ in fees, funding and liquidation rules.</p>';
}
calc();
