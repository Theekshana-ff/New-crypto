// Call this every minute (e.g. cron-job.org): /api/check?key=ALERT_KEY. Sends Telegram when price crosses an entry.
const L=require('./_lib');
module.exports=async(req,res)=>{
 if(!L.ok(req))return res.status(401).json({error:'bad key'});
 if(!L.ready())return res.status(501).json({error:'Upstash Redis is not configured'});
 const now=Date.now()/1000,a=(await L.load()).filter(x=>now-x.t<14*86400);if(!a.length)return res.json({checked:0});
 const syms=[...new Set(a.map(x=>x.sym+'USDT'))];let P={};
 try{const r=await(await fetch('https://data-api.binance.vision/api/v3/ticker/price?symbols='+encodeURIComponent(JSON.stringify(syms)))).json();P=Object.fromEntries(r.map(x=>[x.symbol,+x.price]))}catch(e){return res.status(502).json({error:'price feed unavailable'})}
 const keep=[];let sent=0;
 for(const x of a){const p=P[x.sym+'USDT'];if(!p){keep.push(x);continue}
  if(Math.sign(p-x.entry)!==x.from||p===x.entry){await L.tg({...x,p});sent++}else keep.push(x)}
 await L.save(keep);res.json({checked:a.length,sent})};
