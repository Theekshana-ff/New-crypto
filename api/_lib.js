const U=process.env.UPSTASH_REDIS_REST_URL,K=process.env.UPSTASH_REDIS_REST_TOKEN;
async function cmd(a){const r=await fetch(U,{method:'POST',headers:{Authorization:'Bearer '+K},body:JSON.stringify(a)});return(await r.json()).result}
exports.load=async()=>{try{return JSON.parse(await cmd(['GET','alerts']))||[]}catch(e){return[]}};
exports.save=a=>cmd(['SET','alerts',JSON.stringify(a)]);
const f=p=>p>=100?p.toFixed(2):p>=1?p.toFixed(4):p.toPrecision(5);
exports.tg=async x=>{const t=process.env.TG_TOKEN,c=process.env.TG_CHAT;if(!t||!c)return;
 const txt=`🔔 ${x.sym} ${x.tf} ${x.d>0?'LONG':'SHORT'} — entry reached\nPrice: ${f(x.p)}\nEntry: ${f(x.entry)}\nSL: ${f(x.sl)}\n`+(x.tps||[]).map((v,i)=>`TP${i+1}: ${f(v)}`).join('\n')+`\nSource: ${x.src}`;
 await fetch(`https://api.telegram.org/bot${t}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:c,text:txt})})};
exports.ok=req=>!!process.env.ALERT_KEY&&(req.headers['x-key']===process.env.ALERT_KEY||(req.query&&req.query.key===process.env.ALERT_KEY));
exports.ready=()=>!!(U&&K);
