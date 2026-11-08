// Vercel serverless function: gathers live news from several sources (browsers can't read these RSS feeds directly)
const FEEDS=[['CoinDesk','https://www.coindesk.com/arc/outboundfeeds/rss/'],['Cointelegraph','https://cointelegraph.com/rss'],['Decrypt','https://decrypt.co/feed'],['The Block','https://www.theblock.co/rss.xml']];
const dec=s=>s.replace(/&amp;/g,'&').replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const tag=(s,t)=>{const m=s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`,'i'));return m?dec(m[1].replace(/<!\[CDATA\[|\]\]>/g,'').trim()):''};
const attr=(s,re)=>{const m=s.match(re);return m?dec(m[1]):''};
async function rss([source,url]){
  const x=await (await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'}})).text();
  return x.split(/<item[\s>]/i).slice(1,16).map(i=>({source,title:tag(i,'title'),url:tag(i,'link'),
    time:Date.parse(tag(i,'pubDate'))||0,
    image:attr(i,/<media:content[^>]*url="([^"]+)"/i)||attr(i,/<enclosure[^>]*url="([^"]+)"/i)||attr(i,/<img[^>]*src="([^"]+)"/i)}));
}
async function cryptocompare(){ // free, no key, has images
  const r=await (await fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN')).json();
  return (r.Data||[]).slice(0,15).map(n=>({source:n.source_info?.name||'CryptoCompare',title:n.title,url:n.url,time:n.published_on*1000,image:n.imageurl||''}));
}
async function coinmarketcap(){
  const k=process.env.CMC_API_KEY, out=[];
  if(k){ // paid CMC API plan (Standard or above) needed for the content endpoint
    const r=await (await fetch('https://pro-api.coinmarketcap.com/v1/content/latest?limit=15',{headers:{'X-CMC_PRO_API_KEY':k}})).json();
    for(const n of r.data||[]) out.push({source:'CoinMarketCap',title:n.title,url:n.source_url||n.url,
      time:Date.parse(n.released_at||n.created_at)||0,image:n.cover||''});
  }
  if(process.env.CMC_RSS_URL) out.push(...await rss(['CoinMarketCap',process.env.CMC_RSS_URL])); // e.g. CMC Academy RSS
  return out;
}
module.exports=async(req,res)=>{
  const out=await Promise.allSettled([...FEEDS.map(rss),cryptocompare(),coinmarketcap()]);
  const items=out.filter(o=>o.status==='fulfilled').flatMap(o=>o.value).filter(n=>n.title&&n.url).sort((a,b)=>b.time-a.time);
  res.setHeader('Cache-Control','s-maxage=120, stale-while-revalidate');
  res.status(200).json(items.slice(0,40));
};
