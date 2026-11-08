// Vercel serverless function. Set CRYPTOPANIC_KEY in Vercel > Settings > Environment Variables.
export default async function handler(req, res) {
  try {
    const r = await fetch(`https://cryptopanic.com/api/v1/posts/?auth_token=${process.env.CRYPTOPANIC_KEY}&public=true`);
    res.setHeader('Cache-Control', 's-maxage=120');
    res.status(200).json(await r.json());
  } catch (e) { res.status(200).json({ results: [] }); }
}
