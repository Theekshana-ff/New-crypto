// File: api/futures-agent.js
const crypto = require('crypto');

const signMexc = (apiKey, secret, ts, paramStr) =>
  crypto.createHmac('sha256', secret).update(apiKey + ts + paramStr).digest('hex');

async function mexcReq(method, path, payload = null) {
  const apiKey = (process.env.MEXC_API_KEY || '').trim();
  const secret = (process.env.MEXC_API_SECRET || '').trim();
  if (!apiKey || !secret) throw new Error('MEXC API Keys are missing in Vercel Environment Variables.');

  const ts = Date.now().toString();
  let url = `https://contract.mexc.com${path}`;
  let paramStr = '';
  let body = undefined;

  if (method === 'GET' && payload) {
    const keys = Object.keys(payload).sort();
    paramStr = keys.map(k => `${k}=${payload[k]}`).join('&');
    if (paramStr) url += '?' + paramStr;
  } else if (method === 'POST' && payload) {
    paramStr = JSON.stringify(payload);
    body = paramStr;
  }

  const sig = signMexc(apiKey, secret, ts, paramStr);
  const r = await fetch(url, {
    method,
    headers: {
      'ApiKey': apiKey,
      'Request-Time': ts,
      'Signature': sig,
      'Content-Type': 'application/json'
    },
    body
  });
  const data = await r.json();
  if (!data.success && data.code !== 0) {
    throw new Error(data.message || `MEXC Error ${data.code}`);
  }
  return data.data;
}

// Fetch Top 30 USDT Coins live metrics for AI analysis
async function getTop30MarketData() {
  const r = await fetch('https://data-api.binance.vision/api/v3/ticker/24hr');
  if (!r.ok) throw new Error('Market scanner feed unavailable.');
  const all = await r.json();
  return all
    .filter(t => t.symbol.endsWith('USDT') && !/UP|DOWN|USDC|FDUSD|TUSD|USDP|BUSD|EUR|^USD|PAXG/.test(t.symbol))
    .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
    .slice(0, 30)
    .map(t => ({
      coin: t.symbol.replace('USDT', ''),
      price: Number(t.lastPrice),
      change24h: Number(t.priceChangePercent).toFixed(2) + '%',
      high24h: Number(t.highPrice),
      low24h: Number(t.lowPrice),
      volumeUSDT: Math.round(Number(t.quoteVolume))
    }));
}

// Ask Gemini AI with model fallback & clean JSON extraction
async function pickBestCoinWithGemini(marketList, timeframe) {
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!geminiKey) throw new Error('GEMINI_API_KEY is missing in Vercel Environment Variables.');

  const prompt = `You are an elite institutional Crypto Futures AI Trading Agent.
Analyze these live Top 30 USDT coins (${timeframe} timeframe):
${JSON.stringify(marketList)}

Select the SINGLE BEST coin with the strongest momentum, liquidity, and cleanest Risk-to-Reward setup right now for a MEXC USDT-M Futures trade (LONG or SHORT).
Calculate exact Entry, Stop-Loss (SL), and Take-Profit (TP) prices with at least 1:2 Risk-to-Reward ratio.

Respond ONLY with a raw JSON object (no markdown formatting):
{
  "coin": "BTC",
  "direction": "LONG",
  "entry": 0.0,
  "sl": 0.0,
  "tp": 0.0,
  "confidence": 85,
  "reason": "Clear 2-sentence explanation in Sinhala & English of why this coin was chosen and its profit target."
}`;

  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  let lastErr = '';

  for (const model of models) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json'
            }
          })
        }
      );
      const j = await r.json();
      if (!r.ok || j.error) {
        lastErr = j.error?.message || `HTTP ${r.status} on ${model}`;
        continue;
      }
      const rawText = j.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleaned = rawText.replace(/```json|```/gi, '').trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) {
        lastErr = `Invalid JSON format from ${model}`;
        continue;
      }
      const parsed = JSON.parse(match[0]);
      if (!parsed.coin || !parsed.direction || !parsed.entry) {
        lastErr = `Incomplete trade parameters from ${model}`;
        continue;
      }
      return parsed;
    } catch (e) {
      lastErr = e.message;
    }
  }

  throw new Error(`Gemini API Error: ${lastErr || 'Unknown failure. Check GEMINI_API_KEY in Vercel.'}`);
}

// Get contract size & execute MEXC Futures Order
async function openFuturesPosition(pick, marginUsdt, leverage) {
  const symbol = `${pick.coin.toUpperCase().replace(/USDT$/, '')}_USDT`;
  const detail = await mexcReq('GET', '/api/v1/contract/detail', { symbol });
  const contractSize = Number(detail.contractSize || 1);
  const price = Number(pick.entry);

  const notional = marginUsdt * leverage;
  const vol = Math.max(1, Math.floor(notional / (price * contractSize)));
  const side = pick.direction.toUpperCase() === 'LONG' ? 1 : 3;

  const orderPayload = {
    symbol,
    price,
    vol,
    leverage,
    side,
    type: 5, // Market Order
    openType: 1, // Isolated margin
    stopLossPrice: Number(pick.sl),
    takeProfitPrice: Number(pick.tp)
  };

  const orderId = await mexcReq('POST', '/api/v1/private/order/submit', orderPayload);
  return { orderId, symbol, vol, contractSize, notional };
}

module.exports = async (req, res) => {
  try {
    const body = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) : req.query;
    const secret = (body.secret || req.headers['x-secret'] || '').trim();

    if (!process.env.AGENT_SECRET || secret !== process.env.AGENT_SECRET.trim()) {
      return res.status(401).json({ error: 'Invalid Agent Password (AGENT_SECRET).' });
    }

    const action = body.action || 'status';

    if (action === 'status') {
      const [positions, assets] = await Promise.all([
        mexcReq('GET', '/api/v1/private/position/open_positions').catch(() => []),
        mexcReq('GET', '/api/v1/private/account/assets').catch(() => [])
      ]);
      const usdtAsset = (assets || []).find(a => a.currency === 'USDT') || { availableBalance: 0, equity: 0 };

      const formatted = (positions || []).map(p => {
        const isLong = p.positionType === 1;
        const entry = Number(p.openAvgPrice);
        const holdVol = Number(p.holdVol);
        const im = Number(p.im || 1);
        const unrealizedPnl = Number(p.unrealisedPnl || 0);
        const roePct = im > 0 ? ((unrealizedPnl / im) * 100).toFixed(2) : '0.00';

        return {
          positionId: p.positionId,
          symbol: p.symbol,
          direction: isLong ? 'LONG' : 'SHORT',
          leverage: p.leverage,
          entryPrice: entry,
          holdVol,
          margin: im.toFixed(2),
          pnl: unrealizedPnl.toFixed(2),
          roe: roePct,
          openTime: p.createTime
        };
      });

      return res.status(200).json({
        ok: true,
        balance: Number(usdtAsset.availableBalance || 0).toFixed(2),
        equity: Number(usdtAsset.equity || 0).toFixed(2),
        positions: formatted
      });
    }

    if (action === 'scan_and_trade') {
      const marginUsdt = Math.max(2, Number(body.marginUsdt) || 10);
      const leverage = Math.min(50, Math.max(1, Number(body.leverage) || 10));
      const timeframe = body.timeframe || '15m';

      const top30 = await getTop30MarketData();
      const pick = await pickBestCoinWithGemini(top30, timeframe);
      const exec = await openFuturesPosition(pick, marginUsdt, leverage);

      return res.status(200).json({
        ok: true,
        pick,
        exec,
        timestamp: Date.now()
      });
    }

    if (action === 'close') {
      const { symbol, positionId, direction, vol } = body;
      const closeSide = direction === 'LONG' ? 4 : 2;
      const closeRes = await mexcReq('POST', '/api/v1/private/order/submit', {
        symbol,
        positionId,
        vol: Number(vol),
        side: closeSide,
        type: 5,
        openType: 1
      });
      return res.status(200).json({ ok: true, closeRes });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
