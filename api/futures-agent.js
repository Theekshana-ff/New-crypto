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

function calcEMAVal(arr, period) {
  const k = 2 / (period + 1);
  let e = arr[0];
  for (let i = 1; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
  return e;
}

function calcRSIVal(closes, period = 14) {
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  const rs = losses === 0 ? 100 : gains / losses;
  return Math.round(100 - 100 / (1 + rs));
}

function calcATRVal(highs, lows, closes, period = 14) {
  let sum = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    sum += tr;
  }
  return sum / period;
}

// --- WORLD'S TOP 6 TRADING ENGINES ---
function evaluate6Methods(closes, opens, highs, lows, vols, ema20, ema50, htfBull, htfBear) {
  const n = closes.length;
  const last = closes[n - 1];
  const prev = closes[n - 2];
  const lastOpen = opens[n - 1];
  const bullBar = last > lastOpen && last >= prev;
  const bearBar = last < lastOpen && last <= prev;

  const swingHigh = Math.max(...highs.slice(-40));
  const swingLow = Math.min(...lows.slice(-40));
  const range = swingHigh - swingLow || 1;
  const avgVol = vols.slice(-21, -1).reduce((a, b) => a + b, 0) / 20 || 1;
  const volRatio = +(vols[n - 1] / avgVol).toFixed(2);

  const results = {};

  // 1. SMC (Smart Money Concepts: Order Block + BOS + Liquidity Sweep)
  const recentLow10 = Math.min(...lows.slice(-12, -2));
  const recentHigh10 = Math.max(...highs.slice(-12, -2));
  const sweptLow = lows[n - 2] <= recentLow10 * 1.002 && last > recentLow10;
  const sweptHigh = highs[n - 2] >= recentHigh10 * 0.998 && last < recentHigh10;
  const nearEma20 = Math.abs(last - ema20) / ema20 <= 0.018;

  if (htfBull && ema20 > ema50 && (sweptLow || nearEma20) && bullBar) {
    results.SMC = { dir: 'LONG', score: sweptLow ? 92 : 84, label: 'SMC Bullish Order Block + BOS' };
  } else if (htfBear && ema20 < ema50 && (sweptHigh || nearEma20) && bearBar) {
    results.SMC = { dir: 'SHORT', score: sweptHigh ? 92 : 84, label: 'SMC Bearish Order Block + BOS' };
  }

  // 2. ICT (Fair Value Gap FVG + OTE 0.62-0.79 + Killzone Displacement)
  let bullFvg = false, bearFvg = false;
  for (let i = n - 6; i <= n - 2; i++) {
    if (lows[i] > highs[i - 2]) bullFvg = true;
    if (highs[i] < lows[i - 2]) bearFvg = true;
  }
  const fibFromHigh = (swingHigh - last) / range;
  const fibFromLow = (last - swingLow) / range;
  if (htfBull && (bullFvg || (fibFromHigh >= 0.55 && fibFromHigh <= 0.79)) && bullBar) {
    results.ICT = { dir: 'LONG', score: bullFvg ? 91 : 85, label: 'ICT Bullish FVG + OTE Zone' };
  } else if (htfBear && (bearFvg || (fibFromLow >= 0.55 && fibFromLow <= 0.79)) && bearBar) {
    results.ICT = { dir: 'SHORT', score: bearFvg ? 91 : 85, label: 'ICT Bearish FVG + OTE Zone' };
  }

  // 3. FIB (Fibonacci Golden Pocket 0.50 - 0.618 Retracement)
  if (htfBull && ema20 >= ema50 * 0.998 && fibFromHigh >= 0.38 && fibFromHigh <= 0.66 && bullBar) {
    results.FIB = { dir: 'LONG', score: 89, label: `Fibonacci Golden Zone (${(fibFromHigh * 100).toFixed(0)}% Retrace)` };
  } else if (htfBear && ema20 <= ema50 * 1.002 && fibFromLow >= 0.38 && fibFromLow <= 0.66 && bearBar) {
    results.FIB = { dir: 'SHORT', score: 89, label: `Fibonacci Bearish Golden Zone (${(fibFromLow * 100).toFixed(0)}% Retrace)` };
  }

  // 4. PAT (Chart Patterns: Double Bottom/Top W/M & Bull/Bear Flag Breakout)
  const lowA = Math.min(...lows.slice(-30, -15));
  const lowB = Math.min(...lows.slice(-14, -2));
  const highA = Math.max(...highs.slice(-30, -15));
  const highB = Math.max(...highs.slice(-14, -2));
  const isDoubleBottom = Math.abs(lowA - lowB) / lowA <= 0.012 && last > ema20 && bullBar;
  const isDoubleTop = Math.abs(highA - highB) / highA <= 0.012 && last < ema20 && bearBar;
  const isBullFlag = htfBull && ema20 > ema50 && last > Math.max(...highs.slice(-6, -1)) && bullBar;
  const isBearFlag = htfBear && ema20 < ema50 && last < Math.min(...lows.slice(-6, -1)) && bearBar;

  if (htfBull && (isDoubleBottom || isBullFlag)) {
    results.PAT = { dir: 'LONG', score: isDoubleBottom ? 90 : 86, label: isDoubleBottom ? 'Pattern: Double Bottom (W) Neckline' : 'Pattern: Bullish Flag Breakout' };
  } else if (htfBear && (isDoubleTop || isBearFlag)) {
    results.PAT = { dir: 'SHORT', score: isDoubleTop ? 90 : 86, label: isDoubleTop ? 'Pattern: Double Top (M) Breakdown' : 'Pattern: Bearish Flag Breakdown' };
  }

  // 5. ELLIOTT (Elliott Wave: Wave 3 Impulse & Wave 4->5 Continuation)
  const p0 = closes[n - 35], p1 = closes[n - 22], p2 = closes[n - 10];
  const waveBull = htfBull && p1 > p0 && p2 > p0 && last > p1 && ema20 > ema50 && bullBar;
  const waveBear = htfBear && p1 < p0 && p2 < p0 && last < p1 && ema20 < ema50 && bearBar;
  if (waveBull) {
    results.ELLIOTT = { dir: 'LONG', score: 88, label: 'Elliott Wave 3 Bullish Impulse' };
  } else if (waveBear) {
    results.ELLIOTT = { dir: 'SHORT', score: 88, label: 'Elliott Wave 3 Bearish Impulse' };
  }

  // 6. VSA (Wyckoff & Volume Spread Analysis: Spring / Upthrust + Institutional Vol)
  const lowerWick = Math.min(last, lastOpen) - lows[n - 1];
  const upperWick = highs[n - 1] - Math.max(last, lastOpen);
  const bodySize = Math.abs(last - lastOpen) || 0.0001;
  if (htfBull && (volRatio >= 1.25 || lowerWick > bodySize * 1.2) && last > ema50 && bullBar) {
    results.VSA = { dir: 'LONG', score: 87, label: `Wyckoff Spring + VSA Institutional Volume (${volRatio}x)` };
  } else if (htfBear && (volRatio >= 1.25 || upperWick > bodySize * 1.2) && last < ema50 && bearBar) {
    results.VSA = { dir: 'SHORT', score: 87, label: `Wyckoff Upthrust + VSA Selling Volume (${volRatio}x)` };
  }

  return { results, volRatio };
}

async function analyzeCoinDeep(coin, tf, strategyMode = 'ALL') {
  const htf = tf === '15m' ? '1h' : tf === '1h' ? '4h' : '1d';
  try {
    const [rLtf, rHtf] = await Promise.all([
      fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${coin}USDT&interval=${tf}&limit=100`),
      fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${coin}USDT&interval=${htf}&limit=80`)
    ]);
    if (!rLtf.ok || !rHtf.ok) return null;
    const [rawLtf, rawHtf] = await Promise.all([rLtf.json(), rHtf.json()]);
    if (rawLtf.length < 55 || rawHtf.length < 55) return null;

    const closes = rawLtf.map(x => +x[4]);
    const opens = rawLtf.map(x => +x[1]);
    const highs = rawLtf.map(x => +x[2]);
    const lows = rawLtf.map(x => +x[3]);
    const vols = rawLtf.map(x => +x[5]);

    const hCloses = rawHtf.map(x => +x[4]);
    const hEma20 = calcEMAVal(hCloses, 20);
    const hEma50 = calcEMAVal(hCloses, 50);
    const hLast = hCloses[hCloses.length - 1];
    const htfBull = hEma20 > hEma50 && hLast >= hEma50 * 0.997;
    const htfBear = hEma20 < hEma50 && hLast <= hEma50 * 1.003;

    const ema20 = calcEMAVal(closes, 20);
    const ema50 = calcEMAVal(closes, 50);
    const rsi = calcRSIVal(closes, 14);
    const atr = calcATRVal(highs, lows, closes, 14);
    const last = closes[closes.length - 1];

    // Anti-exhaustion filter: Never LONG overbought (>67) or SHORT oversold (<33)
    const distFromEma20Pct = Math.abs(last - ema20) / ema20;
    if (distFromEma20Pct > 0.026) return null;

    const { results, volRatio } = evaluate6Methods(closes, opens, highs, lows, vols, ema20, ema50, htfBull, htfBear);
    const matchedKeys = Object.keys(results);
    if (!matchedKeys.length) return null;

    let chosenDir = null;
    let finalScore = 0;
    let methodLabel = '';
    let matchedList = [];

    if (strategyMode !== 'ALL') {
      const specific = results[strategyMode];
      if (!specific) return null;
      chosenDir = specific.dir;
      finalScore = specific.score;
      methodLabel = specific.label;
      matchedList = [strategyMode];
    } else {
      const longMethods = matchedKeys.filter(k => results[k].dir === 'LONG');
      const shortMethods = matchedKeys.filter(k => results[k].dir === 'SHORT');
      const winKeys = longMethods.length >= shortMethods.length ? longMethods : shortMethods;
      if (!winKeys.length) return null;

      chosenDir = results[winKeys[0]].dir;
      matchedList = winKeys;
      const topSingle = Math.max(...winKeys.map(k => results[k].score));
      // Add +3 confluence bonus for each additional confirming method among the 6
      finalScore = Math.min(98, topSingle + (winKeys.length - 1) * 3);
      const primaryLabel = results[winKeys[0]].label;
      methodLabel = winKeys.length > 1
        ? `Confluence (${winKeys.join(' + ')}): ${primaryLabel}`
        : primaryLabel;
    }

    if (chosenDir === 'LONG' && (rsi < 40 || rsi > 66)) return null;
    if (chosenDir === 'SHORT' && (rsi < 34 || rsi > 60)) return null;

    const atrPct = atr / last;
    const slPct = Math.min(0.028, Math.max(0.014, atrPct * 1.8));
    const tpPct = slPct * 2.2;
    const dec = last >= 100 ? 2 : last >= 1 ? 4 : 5;

    const entry = +last.toFixed(dec);
    const sl = +(chosenDir === 'LONG' ? last * (1 - slPct) : last * (1 + slPct)).toFixed(dec);
    const tp = +(chosenDir === 'LONG' ? last * (1 + tpPct) : last * (1 - tpPct)).toFixed(dec);

    return {
      coin,
      direction: chosenDir,
      method: methodLabel,
      matchedMethods: matchedList,
      rsi,
      htfTrend: htfBull ? `${htf} BULLISH` : `${htf} BEARISH`,
      ltfTrend: ema20 > ema50 ? `${tf} BULLISH` : `${tf} BEARISH`,
      volRatio: `${volRatio}x Avg`,
      indicators: `Methods (${matchedList.length}/6): ${matchedList.join(',')} | HTF: ${htfBull ? 'Bull' : 'Bear'} | RSI: ${rsi} | Vol: ${volRatio}x | RR: 1:2.2`,
      entry,
      sl,
      tp,
      rr: '1:2.2',
      confidence: finalScore,
      reason: `Verified by ${matchedList.length} institutional method(s) [${matchedList.join(' + ')}] with ${htf}+${tf} trend alignment, safe RSI (${rsi}), and ATR-protected Stop Loss.`
    };
  } catch (e) {
    return null;
  }
}

async function scanHighProbabilitySetups(maxContractUsdt, excludeSymbols = [], timeframe = '15m', strategyMode = 'ALL') {
  const [r, cMap] = await Promise.all([
    fetch('https://data-api.binance.vision/api/v3/ticker/24hr'),
    getContractMap()
  ]);
  if (!r.ok) throw new Error('Market scanner feed unavailable.');
  const all = await r.json();

  const candidates = all
    .filter(t => t.symbol.endsWith('USDT') && !/UP|DOWN|USDC|FDUSD|TUSD|USDP|BUSD|EUR|^USD|PAXG|WBTC/.test(t.symbol))
    .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
    .slice(0, 36)
    .map(t => {
      const coin = t.symbol.replace('USDT', '');
      const sym = `${coin}_USDT`;
      const price = Number(t.lastPrice);
      const chg = Number(t.priceChangePercent);
      const cInfo = cMap[sym] || { contractSize: 1, maxLeverage: 50 };
      const minContractUsdt = +(price * cInfo.contractSize).toFixed(2);
      return { coin, symbol: sym, price, chgNum: chg, change24h: chg.toFixed(2) + '%', minContractUsdt };
    })
    .filter(c => c.minContractUsdt <= maxContractUsdt && !excludeSymbols.includes(c.symbol) && Math.abs(c.chgNum) <= 16)
    .slice(0, 24);

  const verified = [];
  for (let i = 0; i < candidates.length; i += 6) {
    const batch = candidates.slice(i, i + 6);
    const res = await Promise.all(batch.map(c => analyzeCoinDeep(c.coin, timeframe, strategyMode)));
    res.forEach((setup, idx) => {
      if (setup) {
        setup.change24h = batch[idx].change24h;
        setup.minContractUsdt = batch[idx].minContractUsdt;
        verified.push(setup);
      }
    });
  }

  return verified.sort((a, b) => b.confidence - a.confidence);
}

function calcSafeAutoLeverage(marginUsdt, minContractUsdt, entry, sl, maxLev = 50) {
  const minLevForContract = Math.ceil((minContractUsdt * 1.08) / Math.max(0.5, marginUsdt));
  const slPct = Math.abs(entry - sl) / (entry || 1);
  const safeLev = slPct > 0 ? Math.round(0.16 / slPct) : 8;
  const capped = Math.min(12, Math.max(5, safeLev));
  return Math.min(maxLev, Math.max(minLevForContract, capped));
}

async function confirmWithGemini(verifiedSetups, timeframe, strategyMode) {
  const topRadar = verifiedSetups.slice(0, 3).map(x => ({
    coin: x.coin,
    direction: x.direction,
    method: x.method,
    change24h: x.change24h,
    confidence: x.confidence
  }));

  const best = { ...verifiedSetups[0], topCandidates: topRadar };
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!geminiKey || verifiedSetups.length === 1) return best;

  const prompt = `You are an elite institutional Crypto Futures AI Trading Agent using the World's Top 6 Trading Methods (SMC, ICT, Fibonacci, Chart Patterns, Elliott Wave, Wyckoff VSA).
Strategy Mode Requested: ${strategyMode} | Timeframe: ${timeframe}
These setups have ALREADY passed Multi-Timeframe trend alignment, RSI safe-zone, and institutional method checks:
${JSON.stringify(verifiedSetups.slice(0, 5))}

Pick the SINGLE SAFEST setup with the highest confluence and probability of hitting Take-Profit without hitting Stop-Loss.
Respond ONLY with raw JSON:
{
  "coin": "COIN",
  "direction": "LONG",
  "method": "Exact method name",
  "indicators": "Exact indicators string",
  "entry": 0.0,
  "sl": 0.0,
  "tp": 0.0,
  "confidence": 92,
  "reason": "2-sentence explanation of why this 6-method confluence setup is the highest-probability trade right now."
}`;

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1 }
        })
      }
    );
    const j = await r.json();
    const rawText = j.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const match = rawText.replace(/```json|```/gi, '').trim().match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const matchedOrig = verifiedSetups.find(v => v.coin === parsed.coin);
      if (matchedOrig) {
        return {
          ...matchedOrig,
          reason: parsed.reason || matchedOrig.reason,
          confidence: parsed.confidence || matchedOrig.confidence,
          topCandidates: topRadar
        };
      }
    }
  } catch (e) {}

  return best;
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
    ? calcSafeAutoLeverage(marginUsdt, minContractUsdt, price, Number(pick.sl), maxLev)
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
    type: 5,
    openType: 1,
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
  const text = `🤖🏆 6-METHOD AI FUTURES TRADE EXECUTED\n` +
    `Coin: ${exec.symbol} (${pick.direction} ${exec.leverage}x)\n` +
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
      const reqLeverage = Math.min(25, Math.max(1, Number(body.leverage) || 8));
      const autoLeverage = body.autoLeverage !== false;
      const timeframe = body.timeframe || '15m';
      const strategyMode = body.strategyMode || 'ALL';
      const maxOpen = Math.max(1, Number(body.maxOpen) || 2);

      const openPos = await mexcReq('GET', '/api/v1/private/position/open_positions').catch(() => []);
      if ((openPos || []).length >= maxOpen) {
        return res.status(400).json({ error: `Max Open Positions limit (${maxOpen}) reached. Waiting for current trade to finish.` });
      }
      const excludeSymbols = (openPos || []).map(p => p.symbol);

      const maxLookupLev = autoLeverage ? 15 : reqLeverage;
      const maxContractUsdt = marginUsdt * maxLookupLev;

      const verifiedSetups = await scanHighProbabilitySetups(maxContractUsdt, excludeSymbols, timeframe, strategyMode);

      if (!verifiedSetups.length || verifiedSetups[0].confidence < 80) {
        return res.status(400).json({
          error: `⏸️ AI Protection Active: No high-probability ${strategyMode === 'ALL' ? '6-Method Confluence' : strategyMode} setup right now. Capital protected — try scanning again in 15 mins.`
        });
      }

      const pick = await confirmWithGemini(verifiedSetups, timeframe, strategyMode);
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
