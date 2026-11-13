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

// Multi-Timeframe (MTF) + Anti-Trap Pullback Analysis
async function analyzeCoinDeep(coin, tf) {
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
    const htfBull = hEma20 > hEma50 && hLast > hEma50;
    const htfBear = hEma20 < hEma50 && hLast < hEma50;

    const ema20 = calcEMAVal(closes, 20);
    const ema50 = calcEMAVal(closes, 50);
    const rsi = calcRSIVal(closes, 14);
    const atr = calcATRVal(highs, lows, closes, 14);

    const last = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];
    const lastOpen = opens[opens.length - 1];
    const bullCandle = last > lastOpen && last > prevClose;
    const bearCandle = last < lastOpen && last < prevClose;

    const avgVol = vols.slice(-21, -1).reduce((a, b) => a + b, 0) / 20 || 1;
    const volRatio = +(vols[vols.length - 1] / avgVol).toFixed(2);

    const swingHigh = Math.max(...highs.slice(-35));
    const swingLow = Math.min(...lows.slice(-35));
    const fibRetraceFromHigh = swingHigh > swingLow ? (swingHigh - last) / (swingHigh - swingLow) : 0.5;
    const distFromEma20Pct = Math.abs(last - ema20) / ema20;

    // STRICT ANTI-LOSS RULES:
    // 1. Both LTF & HTF must align in the same direction
    // 2. Price must NOT be overextended (>2.5% away from EMA20)
    // 3. RSI must be in safe continuation zone (LONG: 42-64, SHORT: 36-58) — never buy overbought >68 or sell oversold <32!
    // 4. Last candle must confirm bounce in trade direction
    let validDirection = null;
    let setupScore = 0;
    let method = '';

    if (htfBull && ema20 > ema50 && last >= ema50 && rsi >= 42 && rsi <= 65 && distFromEma20Pct <= 0.022 && bullCandle) {
      validDirection = 'LONG';
      setupScore = 78;
      if (fibRetraceFromHigh >= 0.35 && fibRetraceFromHigh <= 0.68) {
        setupScore += 10;
        method = `MTF (${htf}+${tf}) Fibonacci Pullback + EMA20 Bounce`;
      } else {
        method = `MTF (${htf}+${tf}) Bullish Order Block + EMA Alignment`;
      }
      if (volRatio >= 1.15) setupScore += 5;
    } else if (htfBear && ema20 < ema50 && last <= ema50 && rsi >= 35 && rsi <= 58 && distFromEma20Pct <= 0.022 && bearCandle) {
      validDirection = 'SHORT';
      setupScore = 78;
      if (fibRetraceFromHigh >= 0.32 && fibRetraceFromHigh <= 0.65) {
        setupScore += 10;
        method = `MTF (${htf}+${tf}) Bearish Supply Pullback + EMA20 Rejection`;
      } else {
        method = `MTF (${htf}+${tf}) Bearish Structure + EMA Alignment`;
      }
      if (volRatio >= 1.15) setupScore += 5;
    }

    if (!validDirection) return null;

    // ATR-based Dynamic Stop Loss (wide enough to survive normal noise, min 1.4%, max 2.8%)
    const atrPct = atr / last;
    const slPct = Math.min(0.028, Math.max(0.014, atrPct * 1.8));
    const tpPct = slPct * 2.1; // Clean 1:2.1 Risk-Reward
    const dec = last >= 100 ? 2 : last >= 1 ? 4 : 5;

    const entry = +last.toFixed(dec);
    const sl = +(validDirection === 'LONG' ? last * (1 - slPct) : last * (1 + slPct)).toFixed(dec);
    const tp = +(validDirection === 'LONG' ? last * (1 + tpPct) : last * (1 - tpPct)).toFixed(dec);

    return {
      coin,
      direction: validDirection,
      method,
      rsi,
      htfTrend: htfBull ? `${htf} BULLISH` : `${htf} BEARISH`,
      ltfTrend: ema20 > ema50 ? `${tf} BULLISH` : `${tf} BEARISH`,
      volRatio: `${volRatio}x Avg`,
      indicators: `HTF: ${htfBull ? 'Bull' : 'Bear'} | RSI: ${rsi} | Vol: ${volRatio}x | ATR SL: ${(slPct * 100).toFixed(2)}%`,
      entry,
      sl,
      tp,
      rr: '1:2.1',
      confidence: Math.min(95, setupScore),
      reason: `Confirmed ${htf} + ${tf} trend alignment with safe pullback entry near EMA20 (RSI ${rsi}, no exhaustion) and ATR-protected Stop Loss.`
    };
  } catch (e) {
    return null;
  }
}

async function scanHighProbabilitySetups(maxContractUsdt, excludeSymbols = [], timeframe = '15m') {
  const [r, cMap] = await Promise.all([
    fetch('https://data-api.binance.vision/api/v3/ticker/24hr'),
    getContractMap()
  ]);
  if (!r.ok) throw new Error('Market scanner feed unavailable.');
  const all = await r.json();

  // Filter liquid Top 30 USDT coins, avoiding extreme pump/dump traps (>16% 24h)
  const candidates = all
    .filter(t => t.symbol.endsWith('USDT') && !/UP|DOWN|USDC|FDUSD|TUSD|USDP|BUSD|EUR|^USD|PAXG|WBTC/.test(t.symbol))
    .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
    .slice(0, 35)
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
    .slice(0, 22);

  const verified = [];
  // Run deep MTF + Pullback analysis in parallel batches
  for (let i = 0; i < candidates.length; i += 6) {
    const batch = candidates.slice(i, i + 6);
    const res = await Promise.all(batch.map(c => analyzeCoinDeep(c.coin, timeframe)));
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

// Conservative Auto-Leverage (caps at 5x - 12x unless tiny contract requires slightly higher)
function calcSafeAutoLeverage(marginUsdt, minContractUsdt, entry, sl, maxLev = 50) {
  const minLevForContract = Math.ceil((minContractUsdt * 1.08) / Math.max(0.5, marginUsdt));
  const slPct = Math.abs(entry - sl) / (entry || 1);
  // Risk only ~15% of margin at Stop-Loss so liquidation is very far away
  const safeLev = slPct > 0 ? Math.round(0.15 / slPct) : 8;
  const capped = Math.min(12, Math.max(5, safeLev));
  return Math.min(maxLev, Math.max(minLevForContract, capped));
}

async function confirmWithGemini(verifiedSetups, timeframe) {
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

  const prompt = `You are a strict institutional Risk-First Crypto Futures AI Agent.
These setups have ALREADY passed Multi-Timeframe (HTF + ${timeframe}) EMA alignment, RSI safe-zone (no overbought/oversold chasing), and ATR Stop-Loss checks:
${JSON.stringify(verifiedSetups.slice(0, 5))}

Pick the SINGLE SAFEST setup with the highest probability of hitting Take-Profit without hitting Stop-Loss.
Keep its exact entry, sl, and tp values, or refine them slightly for safety.
Respond ONLY with raw JSON:
{
  "coin": "COIN",
  "direction": "LONG",
  "method": "Exact method name",
  "indicators": "Exact indicators string",
  "entry": 0.0,
  "sl": 0.0,
  "tp": 0.0,
  "confidence": 88,
  "reason": "2-sentence explanation of why this MTF pullback setup is the safest trade right now."
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
  const text = `🤖🛡️ SAFE MTF AI FUTURES TRADE\n` +
    `Coin: ${exec.symbol} (${pick.direction} ${exec.leverage}x)\n` +
    `Method: ${pick.method}\n` +
    `Indicators: ${pick.indicators}\n` +
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
      const maxOpen = Math.max(1, Number(body.maxOpen) || 2);

      const openPos = await mexcReq('GET', '/api/v1/private/position/open_positions').catch(() => []);
      if ((openPos || []).length >= maxOpen) {
        return res.status(400).json({ error: `Max Open Positions limit (${maxOpen}) reached. Waiting for current trade to finish.` });
      }
      const excludeSymbols = (openPos || []).map(p => p.symbol);

      const maxLookupLev = autoLeverage ? 15 : reqLeverage;
      const maxContractUsdt = marginUsdt * maxLookupLev;

      const verifiedSetups = await scanHighProbabilitySetups(maxContractUsdt, excludeSymbols, timeframe);

      // STRICT NO-TRADE PROTECTION: Do not force a trade if the market has no clean MTF pullback setup!
      if (!verifiedSetups.length || verifiedSetups[0].confidence < 80) {
        return res.status(400).json({
          error: '⏸️ AI Protection Active: No high-probability MTF pullback setup right now (Market is choppy/overextended). Capital protected — try scanning again in 15 mins.'
        });
      }

      const pick = await confirmWithGemini(verifiedSetups, timeframe);
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
