// Higher-timeframe bias (1D + 4H structure on CLOSED candles). Used by alerts and the Fibonacci page.
const HTF=(()=>{
 const memo={},T=t=>t>0?'Bullish':t<0?'Bearish':'Neutral';
 async function trend(sym,tf){const k=sym+tf,e=memo[k];if(e&&Date.now()-e.t<18e5)return e.v;
  const r=await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}USDT&interval=${tf}&limit=300`);if(!r.ok)throw 0;
  const c=(await r.json()).filter(x=>x[6]<=Date.now()).map(x=>({time:Math.floor(x[0]/1000),open:+x[1],high:+x[2],low:+x[3],close:+x[4],vol:+x[5]}));
  const v=SMC.analyze(c,6).trend;memo[k]={t:Date.now(),v};return v}
 const bias=async sym=>{const[d1,h4]=await Promise.all([trend(sym,'1d'),trend(sym,'4h')]);return{d1,h4}};
 // block a setup only when the daily bias is clearly against it
 const against=(b,dir)=>!!dir&&(b.d1===-dir||(b.d1===0&&b.h4===-dir));
 function mount(el,gs,gd){if(!el)return;let key='';
  const draw=async()=>{const s=gs(),d=gd(),k=s+'|'+d;if(!s||k===key)return;key=k;el.innerHTML='<h3>Higher time frame bias</h3><p class="msg">Loading...</p>';
   try{const b=await bias(s),col=t=>t>0?'up':t<0?'down':'msg',ok=!d?null:against(b,d)?false:(b.d1===d&&b.h4===d?true:null);
    el.innerHTML=`<h3>Higher time frame bias</h3><p>1D: <b class="${col(b.d1)}">${T(b.d1)}</b> · 4H: <b class="${col(b.h4)}">${T(b.h4)}</b></p>`+
     (d?`<p>${ok===true?'<span class="up">✓</span> Setup follows the higher time frames':ok===false?'<span class="down">✗</span> Setup is against the daily bias (weaker)':'• Mixed higher time frames'}</p>`:'')+'<p class="msg">Based on closed candles only.</p>'}
   catch(e){el.innerHTML='<h3>Higher time frame bias</h3><p class="msg">Could not load.</p>'}};
  draw();setInterval(draw,5000)}
 return{bias,trend,against,mount,T}})();
