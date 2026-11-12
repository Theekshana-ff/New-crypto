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

// Cache contract details so we know exact contractSize & maxLeverage
let contractCache = null, cacheTime = 0;
async function getContractMap() {
  if (contractCache && Date.now() - cacheTime < 300000) return contractCache;
  try {
    const r = await fetch('https://contract.mexc.com/api/v1/contract/detail');
    const j = await r.json();
    const map = {};
    (j.data || []).forEach(c => {
      map[c.symbol] = {
        contractSize: Number(c.contractSize || 1),
        maxLeverage: Number(c.maxLeverage || 50),
        minVol: Number(c.minVol || 1)
      };
    });
    contractCache = map;
    cacheTime = Date.now();
    return map;
  } catch (e) {
    return contractCache || {};
  }
}

async function getMexcTickerMap() {
  try {
    const r = await fetch('https://contract.mexc.com/api/v1/contract/ticker');
    const j = await r.json();
    const map = {};
    (j.data || []).forEach(t => {
      map[t.symbol] = {
        lastPrice: Number(t.lastPrice || t.fairPrice || 0),
        fairPrice: Number(t.fairPrice || t.lastPrice || 0)
      };
    });
    return map;
  } catch (e) {
    return {};
  }
}

// Fetch Top 30 USDT Coins live metrics + real candle trend
async function getTop30MarketData(maxContractUsdt) {
  const [r, cMap] = await Promise.all([
    fetch('https://data-api.binance.vision/api/v3/ticker/24hr'),
    getContractMap()
  ]);
  if (!r.ok) throw new Error('Market scanner feed unavailable.');
  const all = await r.json();

  return all
    .filter(t => t.symbol.endsWith('USDT') && !/UP|DOWN|USDC|FDUSD|TUSD|USDP|BUSD|EUR|^USD|PAXG|WBTC/.test(t.symbol))
    .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
    .slice(0, 35)
    .map(t => {
      const coin = t.symbol.replace('USDT', '');
      const sym = `${coin}_USDT`;
      const price = Number(t.lastPrice);
      const high = Number(t.highPrice);
      const low = Number(t.lowPrice);
      const chg = Number(t.priceChangePercent);
      const posInRange = high > low ? ((price - low) / (high - low)) : 0.5;
      const cInfo = cMap[sym] || { contractSize: 1, maxLeverage: 50 };
      const minNotional1Contract = price * cInfo.contractSize;

      return {
        coin,
        price,
        change24h: chg.toFixed(2) + '%',
        chgNum: chg,
        high24h: high,
        low24h: low,
        posInRange: +posInRange.toFixed(2),
        minContractUsdt: +minNotional1Contract.toFixed(2),
        maxLeverage: cInfo.maxLeverage,
        volumeUSDT: Math.round(Number(t.quoteVolume))
      };
    })
    .filter(c => c.minContractUsdt <= maxContractUsdt)
    .slice(0, 30);
}

// Compute Smart Auto-Leverage based on Margin USDT, Stop-Loss distance & Contract Min Notional
function calcAutoLeverage(marginUsdt, minContractUsdt, entry, sl, maxLev = 50) {
  // Minimum leverage required so that (marginUsdt * lev) >= minContractUsdt * 1.05
  const minLevForContract = Math.ceil((minContractUsdt * 1.08) / Math.max(0.5, marginUsdt));

  // Volatility-based safe leverage based on SL % distance (aiming ~20-30% margin risk at SL)
  const slPct = Math.abs(entry - sl) / (entry || 1);
  let targetLev = slPct > 0 ? Math.round(0.25 / slPct) : 15;

  // For small margin ($1 - $3), boost leverage slightly so position size is meaningful
  if (marginUsdt <= 1.5) targetLev = Math.max(targetLev, 15);
  else if (marginUsdt <= 3) targetLev = Math.max(targetLev, 12);

  const finalLev = Math.max(minLevForContract, Math.min(maxLev, Math.max(5, targetLev)));
  return Math.min(50, finalLev);
}

function algorithmicFallbackPick(marketList) {
  let best = marketList[0], bestScore = -1;
  for (const c of marketList) {
    const absChg = Math.abs(c.chgNum);
    const momScore = absChg >= 1.5 && absChg <= 14 ? absChg * 2 : absChg * 0.5;
    const dirBonus = (c.chgNum > 0 && c.posInRange > 0.62) || (c.chgNum < 0 && c.posInRange < 0.38) ? 12 : 0;
    const score = momScore + dirBonus;
    if (score > bestScore) { bestScore = score; best = c; }
  }

  const isLong = best.chgNum >= 0;
  const p = best.price;
  const riskPct = 0.015;
  const rewardPct = 0.035;
  const dec = p >= 100 ? 2 : p >= 1 ? 4 : 5;

  return {
    coin: best.coin,
    direction: isLong ? 'LONG' : 'SHORT',
    entry: +p.toFixed(dec),
    sl: +(isLong ? p * (1 - riskPct) : p * (1 + riskPct)).toFixed(dec),
    tp: +(isLong ? p * (1 + rewardPct) : p * (1 - rewardPct)).toFixed(dec),
    confidence: 85,
    reason: `Strong ${isLong ? 'bullish' : 'bearish'} trend (${best.change24h}) with high volume and 1:2.3 Risk-to-Reward target.`
  };
}

async function pickBestCoinWithGemini(marketList, timeframe) {
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!geminiKey || !marketList.length) return algorithmicFallbackPick(marketList);

  const prompt = `You are an elite Crypto Futures AI Trading Agent.
Analyze these live USDT coins (${timeframe} timeframe) that fit the user's margin size:
${JSON.stringify(marketList.map(({ chgNum, maxLeverage, ...rest }) => rest))}

Select the SINGLE BEST coin with the strongest trend momentum, liquidity, and cleanest Risk-to-Reward setup right now for a MEXC USDT-M Futures trade (LONG or SHORT).
Calculate exact Entry, Stop-Loss (SL ~1.4% to 2% away), and Take-Profit (TP ~3% to 4.5% away) prices.

Respond ONLY with a raw JSON object:
{
  "coin": "XRP",
  "direction": "LONG",
  "entry": 0.0,
  "sl": 0.0,
  "tp": 0.0,
  "confidence": 88,
  "reason": "Clear 2-sentence explanation of why this coin was chosen and its profit target."
}`;

  let models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-pro-latest'];
  try {
    const lr = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
    if (lr.ok) {
      const lj = await lr.json();
      const found = (lj.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini/i.test(m.name) && !/vision|embedding|imagen|aqa|tts|audio/i.test(m.name))
        .map(m => m.name.replace(/^models\//, ''));
      if (found.length) {
        found.sort((a, b) => (/flash/i.test(b) ? 1 : 0) - (/flash/i.test(a) ? 1 : 0));
        models = found.slice(0, 4);
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
      if (parsed.coin && parsed.direction && parsed.entry) return parsed;
    } catch (e) {}
  }

  return algorithmicFallbackPick(marketList);
}

async function openFuturesPosition(pick, marginUsdt, reqLeverage, autoLeverage) {
  const cleanCoin = pick.coin.toUpperCase().replace(/USDT$/, '').replace(/[^A-Z0-9]/g, '');
  const symbol = `${cleanCoin}_USDT`;
  const detail = await mexcReq('GET', '/api/v1/contract/detail', { symbol });
  const contractSize = Number(detail.contractSize || 1);
  const maxLev = Number(detail.maxLeverage || 50);
  const price = Number(pick.entry);
  const minContractUsdt = price * contractSize;

  const leverage = autoLeverage
    ? calcAutoLeverage(marginUsdt, minContractUsdt, price, Number(pick.sl), maxLev)
    : Math.min(maxLev, Math.max(1, reqLeverage));

  const notional = marginUsdt * leverage;
  const vol = Math.max(1, Math.floor(notional / minContractUsdt));
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
  return { orderId, symbol, vol, leverage, contractSize, notional: +(vol * minContractUsdt).toFixed(2) };
}

module.exports = async (req, res) => {
  try {
    const body = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) : req.query;
    const secret = (body.secret || req.headers['x-secret'] || '').trim();

    if (!process.env.AGENT_SECRET || secret !== process.env.AGENT_SECRET.trim()) {
      return res.status(401).json({ error: 'Invalid Agent Password (AGENT_SECRET).' });
    }

    const action = body.action || 'status';

    // 1. Live Status + Real-time Calculated Unrealized PnL ($ and %)
    if (action === 'status') {
      const [positions, assets, tickers, cMap] = await Promise.all([
        mexcReq('GET', '/api/v1/private/position/open_positions').catch(() => []),
        mexcReq('GET', '/api/v1/private/account/assets').catch(() => []),
        getMexcTickerMap(),
        getContractMap()
      ]);
      const usdtAsset = (assets || []).find(a => a.currency === 'USDT') || { availableBalance: 0, equity: 0 };

      let totalUnrealized = 0;
      const formatted = (positions || []).map(p => {
        const isLong = p.positionType === 1;
        const entry = Number(p.openAvgPrice || p.holdAvgPrice || 0);
        const holdVol = Number(p.holdVol || 0);
        const im = Number(p.im || p.oim || 1);
        const cSize = cMap[p.symbol]?.contractSize || 1;
        const liveMark = tickers[p.symbol]?.lastPrice || entry;

        // Calculate exact real-time PnL from live price if MEXC omits unrealisedPnl
        const rawPnl = p.unrealisedPnl != null
          ? Number(p.unrealisedPnl)
          : (isLong ? (liveMark - entry) : (entry - liveMark)) * holdVol * cSize;

        totalUnrealized += rawPnl;
        const roePct = im > 0 ? ((rawPnl / im) * 100).toFixed(2) : '0.00';

        return {
          positionId: p.positionId,
          symbol: p.symbol,
          coin: p.symbol.replace('_USDT', ''),
          direction: isLong ? 'LONG' : 'SHORT',
          leverage: p.leverage,
          entryPrice: entry,
          markPrice: liveMark,
          holdVol,
          margin: im.toFixed(2),
          pnl: rawPnl.toFixed(3),
          roe: roePct,
          liquidatePrice: p.liquidatePrice || 0,
          openTime: p.createTime
        };
      });

      const avail = Number(usdtAsset.availableBalance || 0);
      const eq = Number(usdtAsset.equity || avail) + totalUnrealized;

      return res.status(200).json({
        ok: true,
        balance: avail.toFixed(2),
        equity: eq.toFixed(2),
        totalPnl: totalUnrealized.toFixed(3),
        positions: formatted
      });
    }

    // 2. Scan Top 30 -> Auto-adjust Leverage for Margin ($0.50 / $1+) -> Execute Trade
    if (action === 'scan_and_trade') {
      const marginUsdt = Math.max(0.5, Number(body.marginUsdt) || 1);
      const reqLeverage = Math.min(50, Math.max(1, Number(body.leverage) || 10));
      const autoLeverage = body.autoLeverage !== false;
      const timeframe = body.timeframe || '15m';

      // Max 1-contract value allowed so even $1 margin can open at least 1 contract
      const maxLookupLev = autoLeverage ? 40 : reqLeverage;
      const maxContractUsdt = marginUsdt * maxLookupLev;

      const top30 = await getTop30MarketData(maxContractUsdt);
      if (!top30.length) {
        throw new Error(`Margin $${marginUsdt} is too small for current leverage. Enable Auto-Leverage or use at least $1 USDT.`);
      }

      const pick = await pickBestCoinWithGemini(top30, timeframe);
      const exec = await openFuturesPosition(pick, marginUsdt, reqLeverage, autoLeverage);

      return res.status(200).json({
        ok: true,
        pick,
        exec,
        timestamp: Date.now()
      });
    }

    // 3. Close Position
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
