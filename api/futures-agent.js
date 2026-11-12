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

// Fetch Top 30 USDT Coins live metrics (prioritizing low min-notional coins for small balances)
async function getTop30MarketData() {
  const r = await fetch('https://data-api.binance.vision/api/v3/ticker/24hr');
  if (!r.ok) throw new Error('Market scanner feed unavailable.');
  const all = await r.json();
  return all
    .filter(t => t.symbol.endsWith('USDT') && !/UP|DOWN|USDC|FDUSD|TUSD|USDP|BUSD|EUR|^USD|PAXG|WBTC/.test(t.symbol))
    .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
    .slice(0, 30)
    .map(t => {
      const price = Number(t.lastPrice);
      const high = Number(t.highPrice);
      const low = Number(t.lowPrice);
      const chg = Number(t.priceChangePercent);
      const posInRange = high > low ? ((price - low) / (high - low)) : 0.5;
      return {
        coin: t.symbol.replace('USDT', ''),
        price,
        change24h: chg.toFixed(2) + '%',
        chgNum: chg,
        high24h: high,
        low24h: low,
        posInRange: +posInRange.toFixed(2),
        volumeUSDT: Math.round(Number(t.quoteVolume))
      };
    });
}

// Built-in Algorithmic AI Fallback if Gemini quota/model fails
function algorithmicFallbackPick(marketList) {
  // Filter out BTC/ETH if margin is small; pick strong momentum coin
  const tradable = marketList.filter(c => !['BTC', 'ETH'].includes(c.coin) && c.price < 500);
  const pool = tradable.length ? tradable : marketList;

  let best = pool[0], bestScore = -1;
  for (const c of pool) {
    const absChg = Math.abs(c.chgNum);
    // Favor healthy momentum (1.5% to 12% 24h move) with clear directional strength
    const momScore = absChg >= 1.5 && absChg <= 12 ? absChg * 2 : absChg * 0.5;
    const dirBonus = (c.chgNum > 0 && c.posInRange > 0.6) || (c.chgNum < 0 && c.posInRange < 0.4) ? 10 : 0;
    const score = momScore + dirBonus;
    if (score > bestScore) { bestScore = score; best = c; }
  }

  const isLong = best.chgNum >= 0;
  const p = best.price;
  const riskPct = 0.015; // 1.5% SL distance
  const rewardPct = 0.035; // 3.5% TP distance (1:2.33 RR)
  const dec = p >= 100 ? 2 : p >= 1 ? 4 : 5;

  return {
    coin: best.coin,
    direction: isLong ? 'LONG' : 'SHORT',
    entry: +p.toFixed(dec),
    sl: +(isLong ? p * (1 - riskPct) : p * (1 + riskPct)).toFixed(dec),
    tp: +(isLong ? p * (1 + rewardPct) : p * (1 - rewardPct)).toFixed(dec),
    confidence: 82,
    reason: `Strong ${isLong ? 'bullish' : 'bearish'} momentum (${best.change24h}) with high liquidity and 1:2.3 Risk-Reward target.`
  };
}

// Dynamically discover available Gemini models & ask Gemini AI
async function pickBestCoinWithGemini(marketList, timeframe, notionalUsdt) {
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!geminiKey) return algorithmicFallbackPick(marketList);

  // Filter coins whose single contract is affordable for small notional sizes (< $25)
  const candidates = notionalUsdt < 25
    ? marketList.filter(c => !['BTC', 'ETH'].includes(c.coin))
    : marketList;

  const prompt = `You are an elite Crypto Futures AI Trading Agent.
Analyze these live Top USDT coins (${timeframe} timeframe):
${JSON.stringify(candidates.map(({ chgNum, ...rest }) => rest))}

Select the SINGLE BEST coin with the strongest momentum, liquidity, and cleanest Risk-to-Reward setup right now for a MEXC USDT-M Futures trade (LONG or SHORT).
Calculate exact Entry, Stop-Loss (SL ~1.5% away), and Take-Profit (TP ~3.5% away) prices.

Respond ONLY with a raw JSON object:
{
  "coin": "SOL",
  "direction": "LONG",
  "entry": 0.0,
  "sl": 0.0,
  "tp": 0.0,
  "confidence": 85,
  "reason": "Clear 2-sentence explanation of why this coin was chosen and its profit target."
}`;

  // 1. Auto-detect supported generateContent models from Google API
  let models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-pro-latest'];
  try {
    const lr = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
    if (lr.ok) {
      const lj = await lr.json();
      const found = (lj.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini/i.test(m.name) && !/vision|embedding|imagen|aqa|tts|audio/i.test(m.name))
        .map(m => m.name.replace(/^models\//, ''));
      if (found.length) {
        // Prioritize flash models first
        found.sort((a, b) => (/flash/i.test(b) ? 1 : 0) - (/flash/i.test(a) ? 1 : 0));
        models = found.slice(0, 5);
      }
    }
  } catch (e) {}

  for (const model of models) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2 }
          })
        }
      );
      const j = await r.json();
      if (!r.ok || j.error) continue;

      const rawText = j.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleaned = rawText.replace(/```json|```/gi, '').trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) continue;

      const parsed = JSON.parse(match[0]);
      if (parsed.coin && parsed.direction && parsed.entry) {
        return parsed;
      }
    } catch (e) {}
  }

  // Fallback to built-in algorithmic AI if Gemini API key has model/quota restrictions
  return algorithmicFallbackPick(candidates);
}

// Get contract size & execute MEXC Futures Order
async function openFuturesPosition(pick, marginUsdt, leverage) {
  const cleanCoin = pick.coin.toUpperCase().replace(/USDT$/, '').replace(/[^A-Z0-9]/g, '');
  const symbol = `${cleanCoin}_USDT`;
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
      const marginUsdt = Math.max(1, Number(body.marginUsdt) || 1.5);
      const leverage = Math.min(50, Math.max(1, Number(body.leverage) || 10));
      const timeframe = body.timeframe || '15m';
      const notionalUsdt = marginUsdt * leverage;

      const top30 = await getTop30MarketData();
      const pick = await pickBestCoinWithGemini(top30, timeframe, notionalUsdt);
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
