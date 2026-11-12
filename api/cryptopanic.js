// Vercel serverless function. Set CRYPTOPANIC_KEY in Vercel > Settings > Environment Variables.
module.exports = async (req, res) => {
  if (!process.env.CRYPTOPANIC_KEY) {
    return res.status(200).json({ results: [] });
  }
  try {
    const r = await fetch(`https://cryptopanic.com/api/v1/posts/?auth_token=${encodeURIComponent(process.env.CRYPTOPANIC_KEY)}&public=true`);
    if (!r.ok) throw new Error(r.status);
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate');
    res.status(200).json(await r.json());
  } catch (e) {
    res.status(200).json({ results: [] });
  }
};
