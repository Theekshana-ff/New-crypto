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
      // Only include active USDT perpetual contracts (state === 0)
      if (c.symbol && c.symbol.endsWith('_USDT') && (c.state === 0 || c.state == null)) {
        map[c.symbol] = {
          symbol: c.symbol,
          contractSize: Number(c.contractSize || 1),
          maxLeverage: Number(c.maxLeverage || 50),
          minVol: Number(c.minVol || 1)
        };
      }
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
        fairPrice: Number(t.fairPrice || t.lastPrice || 0),
        fundingRate: Number(t.fundingRate || 0),
        bid1: Number(t.bid1 || t.lastPrice || 0),
        ask1: Number(t.ask1 || t.lastPrice || 0)
      };
    });
    return map;
  } catch (e) {
    return {};
  }
}

async function checkOrderBookAndSpread(coin, dir) {
  try {
    const r = await fetch(`https://data-api.binance.vision/api/v3/depth?symbol=${coin}USDT&limit=20`);
    if (!r.ok) return { ok: true, obRatio: 1, spreadPct: 0.02 };
    const d = await r.json();
    const bids = (d.bids || []).map(x => [+x[0], +x[1]]);
    const asks = (d.asks || []).map(x => [+x[0], +x[1]]);
    if (!bids.length || !asks.length) return { ok: true, obRatio: 1, spreadPct: 0.02 };

    const bestBid = bids[0][0];
    const bestAsk = asks[0][0];
    const spreadPct = ((bestAsk - bestBid) / bestBid) * 100;

    if (spreadPct > 0.15) return { ok: false, reason: 'Spread too wide' };

    const bidVol = bids.reduce((s, b) => s + b[0] * b[1], 0);
    const askVol = asks.reduce((s, a) => s + a[0] * a[1], 0) || 1;
    const obRatio = +(bidVol / askVol).toFixed(2);

    if (dir === 'LONG' && obRatio < 0.55) return { ok: false, reason: 'Heavy Sell Wall Ahead' };
    if (dir === 'SHORT' && obRatio > 1.85) return { ok: false, reason: 'Heavy Buy Wall Below' };

    return { ok: true, obRatio, spreadPct: +spreadPct.toFixed(3) };
  } catch (e) {
    return { ok: true, obRatio: 1, spreadPct: 0.02 };
  }
}

function calcEMAVal(arr, period) {
  const k = 2 / (period + 1);
  let e = arr[0];
  for (let i = 1; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
  return e;
}

function calcEMAArray(arr, period) {
  const k = 2 / (period + 1);
  let e = arr[0];
  return arr.map(v => (e = v * k + e * (1 - k)));
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

async function getBtcMarketRegime(tf = '15m') {
  try {
    const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=${tf}&limit=60`);
    if (!r.ok) return { regime: 'NEUTRAL', allowLong: true, allowShort: true, suddenMovePct: 0 };
    const raw = await r.json();
    const closes = raw.map(x => +x[4]);
    const ema20 = calcEMAVal(closes, 20);
    const ema50 = calcEMAVal(closes, 50);
    const last = closes[closes.length - 1];
    const prev4 = closes[closes.length - 5] || last;
    const suddenMovePct = ((last - prev4) / prev4) * 100;

    const btcDumping = suddenMovePct <= -1.6;
    const btcPumping = suddenMovePct >= 1.6;

    let regime = 'BALANCED';
    if (btcDumping) regime = 'BTC_DUMPING (Alt LONG Blocked)';
    else if (btcPumping) regime = 'BTC_PUMPING (Alt SHORT Blocked)';
    else if (ema20 > ema50) regime = 'BTC_BULLISH';
    else regime = 'BTC_BEARISH';

    return {
      regime,
      allowLong: !btcDumping,
      allowShort: !btcPumping,
      suddenMovePct: +suddenMovePct.toFixed(2)
    };
  } catch (e) {
    return { regime: 'NEUTRAL', allowLong: true, allowShort: true, suddenMovePct: 0 };
  }
}

// --- 25 INSTITUTIONAL METHODS (5 PILLARS) ---
function evaluate25Methods(closes, opens, highs, lows, vols, ema20, ema50, atr, rsi, htfBull, htfBear) {
  const n = closes.length;
  const last = closes[n - 1];
  const prev = closes[n - 2];
  const lastOpen = opens[n - 1];
  const bullBar = last >= lastOpen || last >= prev;
  const bearBar = last <= lastOpen || last <= prev;

  const swingHigh40 = Math.max(...highs.slice(-40));
  const swingLow40 = Math.min(...lows.slice(-40));
  const range40 = swingHigh40 - swingLow40 || 1;
  const fibFromHigh = (swingHigh40 - last) / range40;
  const fibFromLow = (last - swingLow40) / range40;

  const avgVol = vols.slice(-21, -1).reduce((a, b) => a + b, 0) / 20 || 1;
  const volRatio = +(vols[n - 1] / avgVol).toFixed(2);

  const votes = { LONG: [], SHORT: [] };
  const pillars = {
    P1_SMC_ICT: { LONG: 0, SHORT: 0 },
    P2_TREND: { LONG: 0, SHORT: 0 },
    P3_MOMENTUM: { LONG: 0, SHORT: 0 },
    P4_VOLUME: { LONG: 0, SHORT: 0 },
    P5_PATTERNS: { LONG: 0, SHORT: 0 }
  };

  const addVote = (dir, pillar, name) => {
    votes[dir].push(name);
    pillars[pillar][dir]++;
  };

  // Pillar 1: SMC & ICT (5)
  const nearEma20 = Math.abs(last - ema20) / ema20 <= 0.025;
  if (nearEma20 && bullBar && last >= ema50 * 0.995) addVote('LONG', 'P1_SMC_ICT', '1.SMC-OB');
  if (nearEma20 && bearBar && last <= ema50 * 1.005) addVote('SHORT', 'P1_SMC_ICT', '1.SMC-OB');

  const high10 = Math.max(...highs.slice(-12, -2));
  const low10 = Math.min(...lows.slice(-12, -2));
  if (last > opens[n - 3] || lows[n - 1] >= Math.min(...lows.slice(-20, -10))) addVote('LONG', 'P1_SMC_ICT', '2.SMC-BOS');
  if (last < opens[n - 3] || highs[n - 1] <= Math.max(...highs.slice(-20, -10))) addVote('SHORT', 'P1_SMC_ICT', '2.SMC-BOS');

  let bullFvg = false, bearFvg = false;
  for (let i = n - 8; i <= n - 2; i++) {
    if (lows[i] > highs[i - 2]) bullFvg = true;
    if (highs[i] < lows[i - 2]) bearFvg = true;
  }
  if (bullFvg && bullBar) addVote('LONG', 'P1_SMC_ICT', '3.ICT-FVG');
  if (bearFvg && bearBar) addVote('SHORT', 'P1_SMC_ICT', '3.ICT-FVG');

  if (fibFromHigh >= 0.38 && fibFromHigh <= 0.82 && bullBar) addVote('LONG', 'P1_SMC_ICT', '4.ICT-OTE');
  if (fibFromLow >= 0.38 && fibFromLow <= 0.82 && bearBar) addVote('SHORT', 'P1_SMC_ICT', '4.ICT-OTE');

  const lowerWick = Math.min(last, lastOpen) - lows[n - 1];
  const upperWick = highs[n - 1] - Math.max(last, lastOpen);
  const bodySize = Math.abs(last - lastOpen) || 0.0001;
  if ((lows[n - 2] <= low10 * 1.003 && last >= low10) || lowerWick > bodySize * 0.6) addVote('LONG', 'P1_SMC_ICT', '5.Liq-Sweep');
  if ((highs[n - 2] >= high10 * 0.997 && last <= high10) || upperWick > bodySize * 0.6) addVote('SHORT', 'P1_SMC_ICT', '5.Liq-Sweep');

  // Pillar 2: Trend & Structure (5)
  if (htfBull || ema20 > ema50) addVote('LONG', 'P2_TREND', '6.MTF-EMA');
  if (htfBear || ema20 < ema50) addVote('SHORT', 'P2_TREND', '6.MTF-EMA');

  const hl2 = (highs[n - 1] + lows[n - 1]) / 2;
  const stLower = hl2 - 2.2 * atr;
  const stUpper = hl2 + 2.2 * atr;
  if (last > stLower && last >= ema20 * 0.995) addVote('LONG', 'P2_TREND', '7.SuperTrend');
  if (last < stUpper && last <= ema20 * 1.005) addVote('SHORT', 'P2_TREND', '7.SuperTrend');

  const tenkan = (Math.max(...highs.slice(-9)) + Math.min(...lows.slice(-9))) / 2;
  const kijun = (Math.max(...highs.slice(-26)) + Math.min(...lows.slice(-26))) / 2;
  if (last >= kijun || tenkan >= kijun) addVote('LONG', 'P2_TREND', '8.Ichimoku');
  if (last <= kijun || tenkan <= kijun) addVote('SHORT', 'P2_TREND', '8.Ichimoku');

  let plusDM = 0, minusDM = 0;
  for (let i = n - 14; i < n; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    if (upMove > downMove && upMove > 0) plusDM += upMove;
    if (downMove > upMove && downMove > 0) minusDM += downMove;
  }
  if (plusDM >= minusDM) addVote('LONG', 'P2_TREND', '9.ADX-DI+');
  if (minusDM >= plusDM) addVote('SHORT', 'P2_TREND', '9.ADX-DI-');

  const psarBull = lows[n - 1] >= Math.min(...lows.slice(-5, -1));
  const psarBear = highs[n - 1] <= Math.max(...highs.slice(-5, -1));
  if (psarBull && last >= ema50 * 0.995) addVote('LONG', 'P2_TREND', '10.PSAR');
  if (psarBear && last <= ema50 * 1.005) addVote('SHORT', 'P2_TREND', '10.PSAR');

  // Pillar 3: Momentum & Oscillators (5)
  if (rsi >= 36 && rsi <= 68) addVote('LONG', 'P3_MOMENTUM', '11.RSI-Safe');
  if (rsi <= 64 && rsi >= 28) addVote('SHORT', 'P3_MOMENTUM', '11.RSI-Safe');

  const ema12Arr = calcEMAArray(closes, 12);
  const ema26Arr = calcEMAArray(closes, 26);
  const macdArr = ema12Arr.map((v, i) => v - ema26Arr[i]);
  const sigArr = calcEMAArray(macdArr, 9);
  const macdHist = macdArr[n - 1] - sigArr[n - 1];
  const prevHist = macdArr[n - 2] - sigArr[n - 2];
  if (macdHist >= 0 || macdHist >= prevHist) addVote('LONG', 'P3_MOMENTUM', '12.MACD');
  if (macdHist <= 0 || macdHist <= prevHist) addVote('SHORT', 'P3_MOMENTUM', '12.MACD');

  const h14 = Math.max(...highs.slice(-14));
  const l14 = Math.min(...lows.slice(-14));
  const stochK = h14 > l14 ? ((last - l14) / (h14 - l14)) * 100 : 50;
  if (stochK >= 20 && stochK <= 86 && bullBar) addVote('LONG', 'P3_MOMENTUM', '13.Stoch');
  if (stochK <= 80 && stochK >= 14 && bearBar) addVote('SHORT', 'P3_MOMENTUM', '13.Stoch');

  const tpArr = closes.slice(-20).map((c, i) => (highs[n - 20 + i] + lows[n - 20 + i] + c) / 3);
  const tpMean = tpArr.reduce((a, b) => a + b, 0) / 20;
  const meanDev = tpArr.reduce((a, b) => a + Math.abs(b - tpMean), 0) / 20 || 1;
  const cci = (tpArr[19] - tpMean) / (0.015 * meanDev);
  if (cci >= -60 && cci <= 180) addVote('LONG', 'P3_MOMENTUM', '14.CCI');
  if (cci <= 60 && cci >= -180) addVote('SHORT', 'P3_MOMENTUM', '14.CCI');

  const willR = h14 > l14 ? ((h14 - last) / (h14 - l14)) * -100 : -50;
  if (willR >= -82 && willR <= -14) addVote('LONG', 'P3_MOMENTUM', '15.Will%R');
  if (willR <= -18 && willR >= -88) addVote('SHORT', 'P3_MOMENTUM', '15.Will%R');

  // Pillar 4: Volume & Order Flow (5)
  let pvSum = 0, vSum = 0;
  for (let i = n - 24; i < n; i++) {
    const typ = (highs[i] + lows[i] + closes[i]) / 3;
    pvSum += typ * vols[i];
    vSum += vols[i];
  }
  const vwap = vSum > 0 ? pvSum / vSum : last;
  if (last >= vwap * 0.995) addVote('LONG', 'P4_VOLUME', '16.VWAP');
  if (last <= vwap * 1.005) addVote('SHORT', 'P4_VOLUME', '16.VWAP');

  let obv = 0, obvPrev = 0;
  for (let i = n - 15; i < n; i++) {
    if (closes[i] > closes[i - 1]) obv += vols[i];
    else if (closes[i] < closes[i - 1]) obv -= vols[i];
    if (i === n - 5) obvPrev = obv;
  }
  if (obv >= obvPrev) addVote('LONG', 'P4_VOLUME', '17.OBV');
  if (obv <= obvPrev) addVote('SHORT', 'P4_VOLUME', '17.OBV');

  let mfvSum = 0, volSum20 = 0;
  for (let i = n - 20; i < n; i++) {
    const hl = highs[i] - lows[i] || 1;
    const mfm = ((closes[i] - lows[i]) - (highs[i] - closes[i])) / hl;
    mfvSum += mfm * vols[i];
    volSum20 += vols[i];
  }
  const cmf = volSum20 > 0 ? mfvSum / volSum20 : 0;
  if (cmf >= -0.05) addVote('LONG', 'P4_VOLUME', '18.CMF');
  if (cmf <= 0.05) addVote('SHORT', 'P4_VOLUME', '18.CMF');

  if (bullBar && (volRatio >= 0.75 || lowerWick >= upperWick)) addVote('LONG', 'P4_VOLUME', '19.Wyckoff-VSA');
  if (bearBar && (volRatio >= 0.75 || upperWick >= lowerWick)) addVote('SHORT', 'P4_VOLUME', '19.Wyckoff-VSA');

  let buyVol = 0, sellVol = 0;
  for (let i = n - 6; i < n; i++) {
    if (closes[i] >= opens[i]) buyVol += vols[i];
    else sellVol += vols[i];
  }
  if (buyVol >= sellVol * 0.9) addVote('LONG', 'P4_VOLUME', '20.Vol-Delta');
  if (sellVol >= buyVol * 0.9) addVote('SHORT', 'P4_VOLUME', '20.Vol-Delta');

  // Pillar 5: Geometry & Patterns (5)
  if (fibFromHigh >= 0.25 && fibFromHigh <= 0.75 && bullBar) addVote('LONG', 'P5_PATTERNS', '21.Fib-Golden');
  if (fibFromLow >= 0.25 && fibFromLow <= 0.75 && bearBar) addVote('SHORT', 'P5_PATTERNS', '21.Fib-Golden');

  const p0 = closes[n - 34], p1 = closes[n - 20], p2 = closes[n - 10];
  if ((p1 > p0 && last >= p2) || last > ema20) addVote('LONG', 'P5_PATTERNS', '22.Elliott-Wave');
  if ((p1 < p0 && last <= p2) || last < ema20) addVote('SHORT', 'P5_PATTERNS', '22.Elliott-Wave');

  const lowA = Math.min(...lows.slice(-28, -14));
  const lowB = Math.min(...lows.slice(-14, -1));
  const highA = Math.max(...highs.slice(-28, -14));
  const highB = Math.max(...highs.slice(-14, -1));
  if (lowB >= lowA * 0.985 && bullBar) addVote('LONG', 'P5_PATTERNS', '23.Pattern-W/Flag');
  if (highB <= highA * 1.015 && bearBar) addVote('SHORT', 'P5_PATTERNS', '23.Pattern-M/Flag');

  const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const std20 = Math.sqrt(closes.slice(-20).reduce((a, c) => a + Math.pow(c - sma20, 2), 0) / 20);
  const bbUpper = sma20 + 2 * std20;
  const bbLower = sma20 - 2 * std20;
  if (last >= sma20 * 0.995 && last < bbUpper) addVote('LONG', 'P5_PATTERNS', '24.Bollinger');
  if (last <= sma20 * 1.005 && last > bbLower) addVote('SHORT', 'P5_PATTERNS', '24.Bollinger');

  const kcUpper = ema20 + 2.0 * atr;
  const kcLower = ema20 - 2.0 * atr;
  if (last >= ema20 * 0.995 && last <= kcUpper) addVote('LONG', 'P5_PATTERNS', '25.Keltner-ATR');
  if (last <= ema20 * 1.005 && last >= kcLower) addVote('SHORT', 'P5_PATTERNS', '25.Keltner-ATR');

  return { votes, pillars, volRatio };
}

async function analyzeCoin25Methods(coin, tf, strategyMode = 'ALL25', btcRegime = {}, fundingRate = 0, sniperRecovery = false) {
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
    const n = closes.length;

    const hCloses = rawHtf.map(x => +x[4]);
    const hEma20 = calcEMAVal(hCloses, 20);
    const hEma50 = calcEMAVal(hCloses, 50);
    const hLast = hCloses[hCloses.length - 1];
    const htfBull = hEma20 > hEma50 || hLast >= hEma20;
    const htfBear = hEma20 < hEma50 || hLast <= hEma20;

    const ema20 = calcEMAVal(closes, 20);
    const ema50 = calcEMAVal(closes, 50);
    const rsi = calcRSIVal(closes, 14);
    const atr = calcATRVal(highs, lows, closes, 14);
    const last = closes[n - 1];

    const lastBarRangePct = ((highs[n - 1] - lows[n - 1]) / last) * 100;
    if (lastBarRangePct > 4.2) return null;

    if (Math.abs(last - ema20) / ema20 > 0.038) return null;

    const { votes, pillars } = evaluate25Methods(
      closes, opens, highs, lows, vols, ema20, ema50, atr, rsi, htfBull, htfBear
    );

    let dir = null;
    if (votes.LONG.length > votes.SHORT.length && (htfBull || ema20 >= ema50)) dir = 'LONG';
    else if (votes.SHORT.length > votes.LONG.length && (htfBear || ema20 <= ema50)) dir = 'SHORT';
    if (!dir) return null;

    if (dir === 'LONG' && fundingRate > 0.0008) return null;
    if (dir === 'SHORT' && fundingRate < -0.0008) return null;

    if (coin !== 'BTC') {
      if (dir === 'LONG' && !btcRegime.allowLong) return null;
      if (dir === 'SHORT' && !btcRegime.allowShort) return null;
    }

    if (dir === 'LONG' && (rsi < 35 || rsi > 70)) return null;
    if (dir === 'SHORT' && (rsi < 27 || rsi > 65)) return null;

    const matchedMethods = votes[dir];
    const methodCount = matchedMethods.length;
    const activePillars = Object.keys(pillars).filter(p => pillars[p][dir] >= 2).length;

    const reqMethods = sniperRecovery ? 14 : 12;
    const reqPillars = sniperRecovery ? 4 : 3;

    if (strategyMode !== 'ALL25' && strategyMode !== 'ALL') {
      if ((pillars[strategyMode]?.[dir] || 0) < 3) return null;
    } else {
      if (methodCount < reqMethods || activePillars < reqPillars) return null;
    }

    const obCheck = await checkOrderBookAndSpread(coin, dir);
    if (!obCheck.ok) return null;

    const confidence = Math.min(98, Math.round(64 + methodCount * 1.45));
    const atrPct = atr / last;
    const slPct = Math.min(0.025, Math.max(0.012, atrPct * 1.6));
    const tpPct = slPct * 2.2;
    const dec = last >= 100 ? 2 : last >= 1 ? 4 : 5;

    const entry = +last.toFixed(dec);
    const sl = +(dir === 'LONG' ? last * (1 - slPct) : last * (1 + slPct)).toFixed(dec);
    const tp = +(dir === 'LONG' ? last * (1 + tpPct) : last * (1 - tpPct)).toFixed(dec);

    const fundPct = (fundingRate * 100).toFixed(3) + '%';
    const pillarSummary = `P1:${pillars.P1_SMC_ICT[dir]}/5 | P2:${pillars.P2_TREND[dir]}/5 | P3:${pillars.P3_MOMENTUM[dir]}/5 | P4:${pillars.P4_VOLUME[dir]}/5 | P5:${pillars.P5_PATTERNS[dir]}/5`;

    return {
      coin,
      direction: dir,
      method: `25-Method Confluence (${methodCount}/25 · ${activePillars}/5 Pillars${sniperRecovery ? ' · 🎯SNIPER' : ''})`,
      matchedMethods,
      indicators: `${pillarSummary} | OB:${obCheck.obRatio}x | Fund:${fundPct} | RSI:${rsi}`,
      entry,
      sl,
      tp,
      rr: '1:2.2',
      confidence,
      reason: `Passed ${methodCount}/25 methods, OrderBook (${obCheck.obRatio}x), Funding (${fundPct}), Spread (${obCheck.spreadPct}%) & BTC (${btcRegime.regime}).`
    };
  } catch (e) {
    return null;
  }
}

async function scanHighProbabilitySetups(maxContractUsdt, excludeSymbols = [], timeframe = '15m', strategyMode = 'ALL25', useBtcFilter = true, sniperRecovery = false) {
  const [r, cMap, mexcTickers, btcRegime] = await Promise.all([
    fetch('https://data-api.binance.vision/api/v3/ticker/24hr'),
    getContractMap(),
    getMexcTickerMap(),
    useBtcFilter ? getBtcMarketRegime(timeframe) : Promise.resolve({ regime: 'FILTER_OFF', allowLong: true, allowShort: true })
  ]);
  if (!r.ok) throw new Error('Market scanner feed unavailable.');
  const all = await r.json();

  // STRICT FILTER: Only scan coins that ACTUALLY exist in MEXC Futures (cMap[sym] && mexcTickers[sym])
  const candidates = all
    .filter(t => t.symbol.endsWith('USDT') && !/UP|DOWN|USDC|FDUSD|TUSD|USDP|BUSD|USDE|BFUSD|EUR|^USD|PAXG|WBTC/.test(t.symbol))
    .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
    .map(t => {
      const coin = t.symbol.replace('USDT', '');
      const sym = `${coin}_USDT`;
      if (!cMap[sym] || !mexcTickers[sym]) return null;
      const price = Number(mexcTickers[sym].lastPrice || t.lastPrice);
      const chg = Number(t.priceChangePercent);
      const cInfo = cMap[sym];
      const minContractUsdt = +(price * cInfo.contractSize).toFixed(2);
      const fundingRate = mexcTickers[sym]?.fundingRate || 0;
      return { coin, symbol: sym, price, chgNum: chg, change24h: chg.toFixed(2) + '%', minContractUsdt, fundingRate };
    })
    .filter(c => c && c.minContractUsdt <= maxContractUsdt && !excludeSymbols.includes(c.symbol) && Math.abs(c.chgNum) <= 20)
    .slice(0, 30);

  const verified = [];
  for (let i = 0; i < candidates.length; i += 6) {
    const batch = candidates.slice(i, i + 6);
    const res = await Promise.all(
      batch.map(c => analyzeCoin25Methods(c.coin, timeframe, strategyMode, btcRegime, c.fundingRate, sniperRecovery))
    );
    res.forEach((setup, idx) => {
      if (setup) {
        setup.change24h = batch[idx].change24h;
        setup.minContractUsdt = batch[idx].minContractUsdt;
        verified.push(setup);
      }
    });
  }

  return { setups: verified.sort((a, b) => b.confidence - a.confidence), btcRegime };
}

function calcSmartTargetLeverage(marginUsdt, minContractUsdt, entry, sl, confidence = 85, maxLev = 50) {
  const minLevForContract = Math.ceil((minContractUsdt * 1.08) / Math.max(0.5, marginUsdt));
  const slPct = Math.abs(entry - sl) / (entry || 1);
  const idealLev = slPct > 0 ? Math.round(0.28 / slPct) : 18;
  const maxSafeCap = confidence >= 86 ? 20 : 15;
  const bounded = Math.min(maxSafeCap, Math.max(12, idealLev));
  return Math.min(maxLev, Math.max(minLevForContract, bounded));
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

  const prompt = `You are an elite institutional Crypto Futures AI Trading Agent using the 25-Method 5-Pillar Confluence Matrix + 10 Institutional Pro Filters. Timeframe: ${timeframe}.
These setups passed all filters:
${JSON.stringify(verifiedSetups.slice(0, 4))}

Pick the SINGLE SAFEST setup from the list above (use the exact "coin" name from the list). Respond ONLY with raw JSON:
{
  "coin": "COIN",
  "direction": "LONG",
  "method": "Exact method string",
  "indicators": "Exact indicators string",
  "entry": 0.0,
  "sl": 0.0,
  "tp": 0.0,
  "confidence": 92,
  "reason": "2-sentence explanation."
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
      const cleanParsedCoin = String(parsed.coin || '').toUpperCase().replace(/_?USDT$/, '');
      const matchedOrig = verifiedSetups.find(v => v.coin === cleanParsedCoin);
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
  const cleanCoin = pick.coin.toUpperCase().replace(/_?USDT$/, '').replace(/[^A-Z0-9]/g, '');
  const symbol = `${cleanCoin}_USDT`;
  const [cMap, tickers] = await Promise.all([getContractMap(), getMexcTickerMap()]);
  const detail = cMap[symbol];
  if (!detail) {
    throw new Error(`Contract ${symbol} not available on MEXC Futures.`);
  }

  const contractSize = Number(detail.contractSize || 1);
  const maxLev = Number(detail.maxLeverage || 50);
  // Use live MEXC price so entry/SL/TP match MEXC's exact mark price
  const liveMexcPrice = Number(tickers[symbol]?.lastPrice || pick.entry);
  const minContractUsdt = liveMexcPrice * contractSize;

  const leverage = autoLeverage
    ? calcSmartTargetLeverage(marginUsdt, minContractUsdt, liveMexcPrice, Number(pick.sl), pick.confidence, maxLev)
    : Math.min(maxLev, Math.max(1, reqLeverage));

  const notional = marginUsdt * leverage;
  const vol = Math.max(1, Math.floor(notional / minContractUsdt));
  const side = pick.direction.toUpperCase() === 'LONG' ? 1 : 3;

  const orderPayload = {
    symbol,
    price: liveMexcPrice,
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

// Auto-Fallback: If #1 coin fails order submission on MEXC, automatically try #2 or #3
async function executeWithFallback(verifiedSetups, primaryPick, marginUsdt, reqLeverage, autoLeverage) {
  const queue = [primaryPick, ...verifiedSetups.filter(s => s.coin !== primaryPick.coin)].slice(0, 3);
  let lastErr = null;
  for (const candidate of queue) {
    try {
      const exec = await openFuturesPosition(candidate, marginUsdt, reqLeverage, autoLeverage);
      return { pick: { ...candidate, topCandidates: primaryPick.topCandidates }, exec };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Order execution failed across top candidates.');
}

async function notifyTelegram(pick, exec, marginUsdt, source = 'WEB') {
  const token = process.env.TG_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TG_CHAT || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  const text = `🤖🏆 25-METHOD + 10 PRO FILTERS (${source})\n` +
    `Coin: ${exec.symbol} (${pick.direction} ${exec.leverage}x)\n` +
    `Confluence: ${pick.method}\n` +
    `Margin: $${marginUsdt.toFixed(2)} USDT (Size: $${exec.notional})\n` +
    `Entry: ${pick.entry} | SL: ${pick.sl} | TP: ${pick.tp}\n` +
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
    const action = body.action || 'status';

    if (action === 'cron_tick') {
      const [openPos, assets] = await Promise.all([
        mexcReq('GET', '/api/v1/private/position/open_positions').catch(() => []),
        mexcReq('GET', '/api/v1/private/account/assets').catch(() => [])
      ]);
      if ((openPos || []).length >= 1) {
        return res.status(200).json({ ok: true, status: 'Active position already open.' });
      }
      const usdtAsset = (assets || []).find(a => a.currency === 'USDT') || { availableBalance: 10 };
      const avail = Number(usdtAsset.availableBalance || 10);
      const autoMargin = avail <= 3
        ? Math.max(0.5, +(avail * 0.70).toFixed(2))
        : Math.min(25, Math.max(0.5, +(avail * 0.35).toFixed(2)));

      const { setups, btcRegime } = await scanHighProbabilitySetups(autoMargin * 25, [], '15m', 'ALL25', true, false);
      if (!setups.length || setups[0].confidence < 78) {
        return res.status(200).json({ ok: true, status: 'No setup passed filter right now.', btcRegime });
      }
      const primaryPick = await confirmWithGemini(setups, '15m');
      const { pick, exec } = await executeWithFallback(setups, primaryPick, autoMargin, 18, true);
      await notifyTelegram(pick, exec, autoMargin, '24/7 AUTO-WALLET CRON');
      return res.status(200).json({ ok: true, executed: exec, pick });
    }

    const secret = (body.secret || req.headers['x-secret'] || '').trim();
    if (!process.env.AGENT_SECRET || secret !== process.env.AGENT_SECRET.trim()) {
      return res.status(401).json({ error: 'Invalid Agent Password (AGENT_SECRET).' });
    }

    if (action === 'status') {
      const [positions, assets, tickers, cMap, btcRegime] = await Promise.all([
        mexcReq('GET', '/api/v1/private/position/open_positions').catch(() => []),
        mexcReq('GET', '/api/v1/private/account/assets').catch(() => []),
        getMexcTickerMap(),
        getContractMap(),
        getBtcMarketRegime('15m')
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
          openTime: p.createTime || Date.now()
        };
      });

      const avail = Number(usdtAsset.availableBalance || 0);
      const eq = Number(usdtAsset.equity || avail) + totalUnrealized;

      return res.status(200).json({
        ok: true,
        balance: avail.toFixed(2),
        equity: eq.toFixed(2),
        totalPnl: totalUnrealized.toFixed(3),
        btcRegime,
        positions: formatted
      });
    }

    if (action === 'scan_and_trade') {
      const [openPos, assets] = await Promise.all([
        mexcReq('GET', '/api/v1/private/position/open_positions').catch(() => []),
        mexcReq('GET', '/api/v1/private/account/assets').catch(() => [])
      ]);

      const maxOpen = Math.max(1, Number(body.maxOpen) || 1);
      if ((openPos || []).length >= maxOpen) {
        return res.status(400).json({ error: `Max Open Positions limit (${maxOpen}) reached. Waiting for current trade to finish.` });
      }

      const usdtAsset = (assets || []).find(a => a.currency === 'USDT') || { availableBalance: 0 };
      const availBal = Number(usdtAsset.availableBalance || 0);

      if (availBal < 0.5) {
        return res.status(400).json({ error: `Insufficient MEXC Futures USDT balance ($${availBal.toFixed(2)}). Minimum $0.50 required.` });
      }

      let marginUsdt = Math.max(0.5, Number(body.marginUsdt) || 3.5);
      marginUsdt = Math.min(availBal * 0.95, marginUsdt);

      const reqLeverage = Math.min(30, Math.max(1, Number(body.leverage) || 20));
      const autoLeverage = body.autoLeverage !== false;
      const timeframe = body.timeframe || '15m';
      const strategyMode = body.strategyMode || 'ALL25';
      const useBtcFilter = body.useBtcFilter !== false;
      const sniperRecovery = Boolean(body.sniperRecovery);
      const cooldownCoins = Array.isArray(body.cooldownCoins) ? body.cooldownCoins : [];
      const excludeSymbols = [...(openPos || []).map(p => p.symbol), ...cooldownCoins];

      const maxLookupLev = autoLeverage ? 25 : reqLeverage;
      const maxContractUsdt = Math.max(15, marginUsdt * maxLookupLev);

      const { setups, btcRegime } = await scanHighProbabilitySetups(
        maxContractUsdt, excludeSymbols, timeframe, strategyMode, useBtcFilter, sniperRecovery
      );

      if (!setups.length || setups[0].confidence < 78) {
        return res.status(400).json({
          error: `⏸️ 25-Method + 10 Pro Filters (${btcRegime.regime}): No coin safely passes right now. Waiting for next cycle.`
        });
      }

      const primaryPick = await confirmWithGemini(setups, timeframe);
      const { pick, exec } = await executeWithFallback(setups, primaryPick, marginUsdt, reqLeverage, autoLeverage);
      await notifyTelegram(pick, exec, marginUsdt, '10-UPGRADE PRO AGENT');

      return res.status(200).json({
        ok: true,
        pick,
        exec,
        usedMargin: +marginUsdt.toFixed(2),
        btcRegime,
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
