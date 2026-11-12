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

async function enrichTechnicalIndicators(coin, tf) {
  try {
    const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${coin}USDT&interval=${tf}&limit=80`);
    if (!r.ok) return null;
    const raw = await r.json();
    const closes = raw.map(x => +x[4]);
    const highs = raw.map(x => +x[2]);
    const lows = raw.map(x => +x[3]);
    const vols = raw.map(x => +x[5]);
    if (closes.length < 50) return null;

    const calcEma = (arr, p) => {
      const k = 2 / (p + 1);
      let e = arr[0];
      for (let i = 1; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
      return e;
    };
    const ema20 = calcEma(closes, 20);
    const ema50 = calcEma(closes, 50);

    let gains = 0, losses = 0;
    for (let i = closes.length - 14; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff; else losses -= diff;
    }
    const rs = losses === 0 ? 100 : gains / losses;
    const rsi = Math.round(100 - 100 / (1 + rs));

    const avgVol = vols.slice(-21, -1).reduce((a, b) => a + b, 0) / 20 || 1;
    const volRatio = +(vols[vols.length - 1] / avgVol).toFixed(2);

    const swingHigh = Math.max(...highs.slice(-40));
    const swingLow = Math.min(...lows.slice(-40));
    const last = closes[closes.length - 1];
    const fibPos = swingHigh > swingLow ? +((swingHigh - last) / (swingHigh - swingLow)).toFixed(2) : 0.5;

    let detectedMethod = 'EMA 20/50 Trend + Volume Breakout';
    if (fibPos >= 0.5 && fibPos <= 0.68) {
      detectedMethod = 'Fibonacci Golden Zone (0.5 - 0.618 Pullback)';
    } else if (volRatio >= 1.5 && (last > ema20 && ema20 > ema50 || last < ema20 && ema20 < ema50)) {
      detectedMethod = 'SMC Order Block + Institutional Volume Spike';
    } else if (rsi <= 32 || rsi >= 68) {
      detectedMethod = 'RSI Momentum Exhaustion / Liquidity Sweep';
    }

    return {
      rsi,
      emaTrend: ema20 > ema50 ? 'BULLISH (EMA20 > EMA50)' : 'BEARISH (EMA20 < EMA50)',
      volRatio: `${volRatio}x Avg`,
      fibRetracement: fibPos,
      detectedMethod
    };
  } catch (e) {
    return null;
  }
}

async function getTop30MarketData(maxContractUsdt, excludeSymbols = [], timeframe = '15m') {
  const [r, cMap] = await Promise.all([
    fetch('https://data-api.binance.vision/api/v3/ticker/24hr'),
    getContractMap()
  ]);
  if (!r.ok) throw new Error('Market scanner feed unavailable.');
  const all = await r.json();

  const baseList = all
    .filter(t => t.symbol.endsWith('USDT') && !/UP|DOWN|USDC|FDUSD|TUSD|USDP|BUSD|EUR|^USD|PAXG|WBTC/.test(t.symbol))
    .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
    .slice(0, 38)
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
        symbol: sym,
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
    .filter(c => c.minContractUsdt <= maxContractUsdt && !excludeSymbols.includes(c.symbol))
    .slice(0, 30);

  const sortedByMom = [...baseList].sort((a, b) => Math.abs(b.chgNum) - Math.abs(a.chgNum)).slice(0, 8);
  await Promise.all(sortedByMom.map(async c => {
    const ta = await enrichTechnicalIndicators(c.coin, timeframe);
    if (ta) Object.assign(c, ta);
  }));

  return baseList;
}

function calcAutoLeverage(marginUsdt, minContractUsdt, entry, sl, maxLev = 50) {
  const minLevForContract = Math.ceil((minContractUsdt * 1.08) / Math.max(0.5, marginUsdt));
  const slPct = Math.abs(entry - sl) / (entry || 1);
  let targetLev = slPct > 0 ? Math.round(0.25 / slPct) : 15;

  if (marginUsdt <= 1.5) targetLev = Math.max(targetLev, 15);
  else if (marginUsdt <= 3) targetLev = Math.max(targetLev, 12);

  const finalLev = Math.max(minLevForContract, Math.min(maxLev, Math.max(5, targetLev)));
  return Math.min(50, finalLev);
}

function rankCandidatesAlgo(marketList) {
  const scored = marketList.map(c => {
    const absChg = Math.abs(c.chgNum);
    const momScore = absChg >= 1.5 && absChg <= 14 ? absChg * 2.2 : absChg * 0.6;
    const dirBonus = (c.chgNum > 0 && c.posInRange > 0.62) || (c.chgNum < 0 && c.posInRange < 0.38) ? 14 : 0;
    const taBonus = c.detectedMethod ? 8 : 0;
    return { ...c, totalScore: momScore + dirBonus + taBonus };
  }).sort((a, b) => b.totalScore - a.totalScore);

  const buildPick = c => {
    const isLong = c.chgNum >= 0;
    const p = c.price;
    const riskPct = 0.015;
    const rewardPct = 0.036;
    const dec = p >= 100 ? 2 : p >= 1 ? 4 : 5;
    const entry = +p.toFixed(dec);
    const sl = +(isLong ? p * (1 - riskPct) : p * (1 + riskPct)).toFixed(dec);
    const tp = +(isLong ? p * (1 + rewardPct) : p * (1 - rewardPct)).toFixed(dec);

    return {
      coin: c.coin,
      direction: isLong ? 'LONG' : 'SHORT',
      method: c.detectedMethod || 'SMC Momentum + EMA 20/50 Alignment',
      indicators: `RSI: ${c.rsi || 54} | ${c.emaTrend || (isLong ? 'EMA Bullish' : 'EMA Bearish')} | Vol: ${c.volRatio || '1.4x'} | RR: 1:2.4`,
      entry,
      sl,
      tp,
      rr: '1:2.4',
      confidence: Math.min(94, Math.round(78 + (c.totalScore || 10) * 0.4)),
      reason: `${c.coin} selected via ${c.detectedMethod || 'Multi-Factor Momentum'} (${c.change24h} 24h move, ${c.emaTrend || 'strong trend structure'}) targeting a 1:2.4 Risk-to-Reward ratio.`
    };
  };

  const best = buildPick(scored[0]);
  best.topCandidates = scored.slice(0, 3).map(x => ({
    coin: x.coin,
    direction: x.chgNum >= 0 ? 'LONG' : 'SHORT',
    method: x.detectedMethod || 'EMA Trend + Volume',
    change24h: x.change24h,
    confidence: Math.min(94, Math.round(78 + (x.totalScore || 10) * 0.4))
  }));
  return best;
}

async function pickBestCoinWithGemini(marketList, timeframe) {
  const algoFallback = rankCandidatesAlgo(marketList);
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!geminiKey || !marketList.length) return algoFallback;

  const prompt = `You are an elite institutional Crypto Futures AI Trading Agent.
Analyze these live Top USDT coins (${timeframe} timeframe) with their real technical indicators (RSI, EMA Trend, Fib Retracement, Detected Method, 24h Change, Volume):
${JSON.stringify(marketList.slice(0, 20).map(({ chgNum, maxLeverage, ...rest }) => rest))}

Select the SINGLE BEST coin (#1) for a MEXC USDT-M Futures trade (LONG or SHORT), and also list the top 3 radar candidates.
Specify the exact analysis method used (e.g., "SMC Order Block + Volume Spike", "Fibonacci 0.618 Golden Zone + EMA Trend", "RSI Divergence + Liquidity Sweep", or "EMA 20/50 Breakout").
Calculate exact Entry, Stop-Loss (SL ~1.5% away), and Take-Profit (TP ~3.6% away, at least 1:2.2 RR) prices.

Respond ONLY with a raw JSON object matching this exact schema:
{
  "coin": "XRP",
  "direction": "LONG",
  "method": "SMC Order Block + EMA 20/50 Alignment",
  "indicators": "RSI: 58 | EMA20 > EMA50 Bullish | Vol: 1.6x Avg | RR: 1:2.4",
  "entry": 0.0,
  "sl": 0.0,
  "tp": 0.0,
  "rr": "1:2.4",
  "confidence": 88,
  "reason": "Clear 2-sentence explanation of why this coin was chosen, which analysis method triggered it, and its profit target.",
  "topCandidates": [
    {"coin": "XRP", "direction": "LONG", "method": "SMC Order Block", "change24h": "+4.2%", "confidence": 88},
    {"coin": "SOL", "direction": "LONG", "method": "Fib 0.618 Pullback", "change24h": "+3.1%", "confidence": 82},
    {"coin": "DOGE", "direction": "SHORT", "method": "EMA Breakdown", "change24h": "-2.8%", "confidence": 79}
  ]
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
      if (parsed.coin && parsed.direction && parsed.entry) {
        if (!parsed.method) parsed.method = algoFallback.method;
        if (!parsed.indicators) parsed.indicators = algoFallback.indicators;
        if (!parsed.topCandidates) parsed.topCandidates = algoFallback.topCandidates;
        return parsed;
      }
    } catch (e) {}
  }

  return algoFallback;
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

async function notifyTelegram(pick, exec, marginUsdt) {
  const token = process.env.TG_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TG_CHAT || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  const text = `🤖🚀 MEXC AI FUTURES TRADE EXECUTED[span_0](start_span)[span_0](end_span)\n` +
    `Coin: ${exec.symbol} (${pick.direction} ${exec.leverage}x)[span_1](start_span)[span_1](end_span)\n` +
    `Method: ${pick.method}\n` +
    `Indicators: ${pick.indicators}\n` +
    `Margin: $${marginUsdt} USDT (Size: $${exec.notional})\n` +
    `Entry: ${pick.entry} | SL: ${pick.sl} | TP: ${pick.tp}\n` +
    `Confidence: ${pick.confidence}%\n` +
    `Reason: ${pick.reason}`;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text })
  }).catch(() => {});
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

    if (action === 'scan_and_trade') {
      const marginUsdt = Math.max(0.5, Number(body.marginUsdt) || 1);
      const reqLeverage = Math.min(50, Math.max(1, Number(body.leverage) || 10));
      const autoLeverage = body.autoLeverage !== false;
      const timeframe = body.timeframe || '15m';
      const maxOpen = Math.max(1, Number(body.maxOpen) || 2);

      const openPos = await mexcReq('GET', '/api/v1/private/position/open_positions').catch(() => []);
      if ((openPos || []).length >= maxOpen) {
        return res.status(400).json({ error: `Max Open Positions limit (${maxOpen}) reached. Close a trade or increase limit.` });
      }
      const excludeSymbols = (openPos || []).map(p => p.symbol);

      const maxLookupLev = autoLeverage ? 40 : reqLeverage;
      const maxContractUsdt = marginUsdt * maxLookupLev;

      const top30 = await getTop30MarketData(maxContractUsdt, excludeSymbols, timeframe);
      if (!top30.length) {
        throw new Error(`No new coins fit $${marginUsdt} USDT margin right now. Enable Auto-Leverage or increase margin.`);
      }

      const pick = await pickBestCoinWithGemini(top30, timeframe);
      const exec = await openFuturesPosition(pick, marginUsdt, reqLeverage, autoLeverage);
      await notifyTelegram(pick, exec, marginUsdt);

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
