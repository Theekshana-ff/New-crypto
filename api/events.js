// High-impact economic events (free public calendar feed), cached 30 min
module.exports=async(req,res)=>{
 try{const r=await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json',{headers:{'User-Agent':'Mozilla/5.0'}});if(!r.ok)throw new Error(r.status);
  const j=await r.json(),out=j.filter(e=>e.impact==='High'&&['USD','All'].includes(e.country)).map(e=>({t:Date.parse(e.date),title:e.title,country:e.country})).filter(e=>e.t);
  res.setHeader('Cache-Control','s-maxage=1800, stale-while-revalidate');res.status(200).json(out)}
 catch(e){res.status(502).json({error:'events unavailable'})}
};
