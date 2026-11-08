// Vercel function: coin list with logos, prices, 1h/24h/7d %, market cap, volume (CoinGecko, cached 60s)
module.exports=async(req,res)=>{
  const page=Math.min(Math.max(+req.query.page||1,1),5);
  const u=`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=${page}&price_change_percentage=1h,24h,7d`;
  try{
    const r=await fetch(u,{headers:{accept:'application/json'}});
    if(!r.ok)throw new Error(r.status);
    res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate');
    res.status(200).json(await r.json());
  }catch(e){res.status(502).json({error:'markets unavailable'})}
};
