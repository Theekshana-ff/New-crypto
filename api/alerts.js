// Stores entry alerts so the server can watch them 24/7 (needs Upstash Redis + ALERT_KEY env)
const L=require('./_lib');
module.exports=async(req,res)=>{
 if(!L.ok(req))return res.status(401).json({error:'bad key'});
 if(!L.ready())return res.status(501).json({error:'Upstash Redis is not configured'});
 let a=await L.load();
 if(req.method==='POST'){const b=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!b||!b.sym||!(b.entry>0))return res.status(400).json({error:'bad alert'});
  a=a.filter(x=>x.id!==b.id);a.push({id:b.id,sym:b.sym,tf:b.tf,d:b.d,entry:b.entry,sl:b.sl,tps:b.tps,src:b.src,from:b.from,t:b.t});await L.save(a.slice(-100));return res.json({ok:true})}
 if(req.method==='DELETE'){a=a.filter(x=>String(x.id)!==String(req.query.id));await L.save(a);return res.json({ok:true})}
 res.json(a)};
