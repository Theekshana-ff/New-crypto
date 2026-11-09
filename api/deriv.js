// Funding rate + open interest (Binance futures, Bybit as fallback). Cached 60s.
const get=async u=>{const r=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0'}});if(!r.ok)throw new Error(r.status);return r.json()};
module.exports=async(req,res)=>{
 const s=String(req.query.symbol||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,14);if(!s)return res.status(400).json({error:'symbol'});
 let out=null;
 try{const[p,o,h]=await Promise.all([get(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${s}`),get(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${s}`),get(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${s}&period=1h&limit=25`)]);
  const a=+h[0].sumOpenInterestValue,b=+h[h.length-1].sumOpenInterestValue;out={src:'binance',funding:+p.lastFundingRate,oi:+o.openInterest*+p.markPrice,oiChg:a?(b-a)/a:null}}catch(e){}
 if(!out)try{const t=(await get(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${s}`)).result.list[0],h=(await get(`https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${s}&intervalTime=1h&limit=25`)).result.list;
  const b=+h[0].openInterest,a=+h[h.length-1].openInterest;out={src:'bybit',funding:+t.fundingRate,oi:+t.openInterestValue,oiChg:a?(b-a)/a:null}}catch(e){}
 if(!out)return res.status(502).json({error:'derivatives unavailable'});
 res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate');res.status(200).json(out);
};
