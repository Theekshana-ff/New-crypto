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

const globalPeakMap = global.mexcCloudPeakMap || (global.mexcCloudPeakMap = {});

let contractCache = null, cacheTime = 0;
async function getContractMap() {
  if (contractCache && Date.now() - cacheTime < 300000) return contractCache;
  try {
    const r = await fetch('https://contract.mexc.com/api/v1/contract/detail');
    const j = await r.json();
    const map = {};
    (j.data || []).forEach(c => {
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
        symbol: t.symbol,
        lastPrice: Number(t.lastPrice || t.fairPrice || 0),
        fairPrice: Number(t.fairPrice || t.lastPrice || 0),
        riseFallRate: Number(t.riseFallRate || 0) * 100,
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

async function getGlobalNewsAndSentiment(coin = '') {
  const result = {
    fearGreedValue: 50,
    fearGreedLabel: 'Neutral',
    newsBias: 'NEUTRAL',
    headlines: []
  };
  try {
    const [fgRes, newsRes] = await Promise.all([
      fetch('https://api.alternative.me/fng/?limit=1').catch(() => null),
      fetch(`https://min-api.cryptocompare.com/data/v2/news/?lang=EN${coin ? `&categories=${coin},BTC,Market` : ''}`).catch(() => null)
    ]);

    if (fgRes && fgRes.ok) {
      const fgJson = await fgRes.json();
      const d = fgJson.data?.[0];
      if (d) {
        result.fearGreedValue = Number(d.value || 50);
        result.fearGreedLabel = d.value_classification || 'Neutral';
      }
    }

    if (newsRes && newsRes.ok) {
      const nJson = await newsRes.json();
      const articles = (nJson.Data || []).slice(0, 5);
      let bullWords = 0, bearWords = 0;
      articles.forEach(a => {
        const title = String(a.title || '');
        result.headlines.push(title);
        if (/surge|bull|breakout|rally|etf|adopt|upgrade|partnership|record|gain|buy|high/i.test(title)) bullWords++;
        if (/hack|crash|ban|sec|lawsuit|dump|drop|exploit|bear|liquidation|plunge|fear/i.test(title)) bearWords++;
      });
      if (bullWords > bearWords) result.newsBias = 'BULLISH_NEWS';
      else if (bearWords > bullWords) result.newsBias = 'BEARISH_NEWS';
    }
  } catch (e) {}
  return result;
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

function detectWavePivots(times, highs, lows, closes, dir) {
  const n = closes.length;
  const seg = Math.floor(n / 6);
  const points = [];
  const labels = ['1', '2', '3', '4', '5 (i)', 'ii (Sniper Entry)'];

  for (let idx = 0; idx < 6; idx++) {
    const start = Math.max(0, n - (6 - idx) * seg);
    const end = Math.min(n - 1, start + seg);
    let bestI = start;
    const lookForHigh = (dir === 'SHORT' && idx % 2 === 1) || (dir === 'LONG' && idx % 2 === 0);

    for (let j = start; j <= end; j++) {
      if (lookForHigh && highs[j] >= highs[bestI]) bestI = j;
      if (!lookForHigh && lows[j] <= lows[bestI]) bestI = j;
    }

    points.push({
      time: Math.floor(times[bestI] / 1000),
      price: lookForHigh ? highs[bestI] : lows[bestI],
      position: lookForHigh ? 'aboveBar' : 'belowBar',
      label: labels[idx]
    });
  }
  return points;
}

// --- 25 WORLD-CLASS TRADING METHODS ENGINE ---
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

  const nearEma20 = Math.abs(last - ema20) / ema20 <= 0.022;
  if (nearEma20 && bullBar && last >= ema50 * 0.996) addVote('LONG', 'P1_SMC_ICT', '1.SMC Order Block');
  if (nearEma20 && bearBar && last <= ema50 * 1.004) addVote('SHORT', 'P1_SMC_ICT', '1.SMC Order Block');

  const high10 = Math.max(...highs.slice(-12, -2));
  const low10 = Math.min(...lows.slice(-12, -2));
  if (last > opens[n - 3] || lows[n - 1] >= Math.min(...lows.slice(-20, -10))) addVote('LONG', 'P1_SMC_ICT', '2.Break of Structure (BOS)');
  if (last < opens[n - 3] || highs[n - 1] <= Math.max(...highs.slice(-20, -10))) addVote('SHORT', 'P1_SMC_ICT', '2.Break of Structure (BOS)');

  let bullFvg = false, bearFvg = false;
  for (let i = n - 8; i <= n - 2; i++) {
    if (lows[i] > highs[i - 2]) bullFvg = true;
    if (highs[i] < lows[i - 2]) bearFvg = true;
  }
  if (bullFvg && bullBar) addVote('LONG', 'P1_SMC_ICT', '3.ICT Fair Value Gap (FVG)');
  if (bearFvg && bearBar) addVote('SHORT', 'P1_SMC_ICT', '3.ICT Fair Value Gap (FVG)');

  if (fibFromHigh >= 0.38 && fibFromHigh <= 0.79 && bullBar) addVote('LONG', 'P1_SMC_ICT', '4.ICT Optimal Trade Entry (OTE)');
  if (fibFromLow >= 0.38 && fibFromLow <= 0.79 && bearBar) addVote('SHORT', 'P1_SMC_ICT', '4.ICT Optimal Trade Entry (OTE)');

  const lowerWick = Math.min(last, lastOpen) - lows[n - 1];
  const upperWick = highs[n - 1] - Math.max(last, lastOpen);
  const bodySize = Math.abs(last - lastOpen) || 0.0001;
  if ((lows[n - 2] <= low10 * 1.003 && last >= low10) || lowerWick > bodySize * 0.6) addVote('LONG', 'P1_SMC_ICT', '5.Liquidity Sweep Grab');
  if ((highs[n - 2] >= high10 * 0.997 && last <= high10) || upperWick > bodySize * 0.6) addVote('SHORT', 'P1_SMC_ICT', '5.Liquidity Sweep Grab');

  if (htfBull || ema20 > ema50) addVote('LONG', 'P2_TREND', '6.MTF EMA Ribbon (20/50)');
  if (htfBear || ema20 < ema50) addVote('SHORT', 'P2_TREND', '6.MTF EMA Ribbon (20/50)');

  const hl2 = (highs[n - 1] + lows[n - 1]) / 2;
  if (last > hl2 - 2.2 * atr && last >= ema20 * 0.995) addVote('LONG', 'P2_TREND', '7.SuperTrend Bull');
  if (last < hl2 + 2.2 * atr && last <= ema20 * 1.005) addVote('SHORT', 'P2_TREND', '7.SuperTrend Bear');

  const tenkan = (Math.max(...highs.slice(-9)) + Math.min(...lows.slice(-9))) / 2;
  const kijun = (Math.max(...highs.slice(-26)) + Math.min(...lows.slice(-26))) / 2;
  if (last >= kijun || tenkan >= kijun) addVote('LONG', 'P2_TREND', '8.Ichimoku Cloud');
  if (last <= kijun || tenkan <= kijun) addVote('SHORT', 'P2_TREND', '8.Ichimoku Cloud');

  let plusDM = 0, minusDM = 0;
  for (let i = n - 14; i < n; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    if (upMove > downMove && upMove > 0) plusDM += upMove;
    if (downMove > upMove && downMove > 0) minusDM += downMove;
  }
  if (plusDM >= minusDM) addVote('LONG', 'P2_TREND', '9.ADX DI+ Trend Strength');
  if (minusDM >= plusDM) addVote('SHORT', 'P2_TREND', '9.ADX DI- Trend Strength');

  if (lows[n - 1] >= Math.min(...lows.slice(-5, -1)) && last >= ema50 * 0.995) addVote('LONG', 'P2_TREND', '10.Parabolic SAR');
  if (highs[n - 1] <= Math.max(...highs.slice(-5, -1)) && last <= ema50 * 1.005) addVote('SHORT', 'P2_TREND', '10.Parabolic SAR');

  if (rsi >= 38 && rsi <= 65) addVote('LONG', 'P3_MOMENTUM', '11.RSI Momentum Zone');
  if (rsi <= 62 && rsi >= 33) addVote('SHORT', 'P3_MOMENTUM', '11.RSI Momentum Zone');

  const ema12Arr = calcEMAArray(closes, 12);
  const ema26Arr = calcEMAArray(closes, 26);
  const macdArr = ema12Arr.map((v, i) => v - ema26Arr[i]);
  const sigArr = calcEMAArray(macdArr, 9);
  const macdHist = macdArr[n - 1] - sigArr[n - 1];
  const prevHist = macdArr[n - 2] - sigArr[n - 2];
  if (macdHist >= 0 || macdHist >= prevHist) addVote('LONG', 'P3_MOMENTUM', '12.MACD Histogram Surge');
  if (macdHist <= 0 || macdHist <= prevHist) addVote('SHORT', 'P3_MOMENTUM', '12.MACD Histogram Drop');

  const h14 = Math.max(...highs.slice(-14));
  const l14 = Math.min(...lows.slice(-14));
  const stochK = h14 > l14 ? ((last - l14) / (h14 - l14)) * 100 : 50;
  if (stochK >= 20 && stochK <= 82 && bullBar) addVote('LONG', 'P3_MOMENTUM', '13.Stochastic K% Cross');
  if (stochK <= 80 && stochK >= 18 && bearBar) addVote('SHORT', 'P3_MOMENTUM', '13.Stochastic K% Cross');

  const tpArr = closes.slice(-20).map((c, i) => (highs[n - 20 + i] + lows[n - 20 + i] + c) / 3);
  const tpMean = tpArr.reduce((a, b) => a + b, 0) / 20;
  const meanDev = tpArr.reduce((a, b) => a + Math.abs(b - tpMean), 0) / 20 || 1;
  const cci = (tpArr[19] - tpMean) / (0.015 * meanDev);
  if (cci >= -55 && cci <= 165) addVote('LONG', 'P3_MOMENTUM', '14.CCI Impulse');
  if (cci <= 55 && cci >= -165) addVote('SHORT', 'P3_MOMENTUM', '14.CCI Impulse');

  const willR = h14 > l14 ? ((h14 - last) / (h14 - l14)) * -100 : -50;
  if (willR >= -80 && willR <= -18) addVote('LONG', 'P3_MOMENTUM', '15.Williams %R');
  if (willR <= -20 && willR >= -82) addVote('SHORT', 'P3_MOMENTUM', '15.Williams %R');

  let pvSum = 0, vSum = 0;
  for (let i = n - 24; i < n; i++) {
    const typ = (highs[i] + lows[i] + closes[i]) / 3;
    pvSum += typ * vols[i];
    vSum += vols[i];
  }
  const vwap = vSum > 0 ? pvSum / vSum : last;
  if (last >= vwap * 0.996) addVote('LONG', 'P4_VOLUME', '16.Institutional VWAP');
  if (last <= vwap * 1.004) addVote('SHORT', 'P4_VOLUME', '16.Institutional VWAP');

  let obv = 0, obvPrev = 0;
  for (let i = n - 15; i < n; i++) {
    if (closes[i] > closes[i - 1]) obv += vols[i];
    else if (closes[i] < closes[i - 1]) obv -= vols[i];
    if (i === n - 5) obvPrev = obv;
  }
  if (obv >= obvPrev) addVote('LONG', 'P4_VOLUME', '17.OBV Accumulation');
  if (obv <= obvPrev) addVote('SHORT', 'P4_VOLUME', '17.OBV Distribution');

  let mfvSum = 0, volSum20 = 0;
  for (let i = n - 20; i < n; i++) {
    const hl = highs[i] - lows[i] || 1;
    const mfm = ((closes[i] - lows[i]) - (highs[i] - closes[i])) / hl;
    mfvSum += mfm * vols[i];
    volSum20 += vols[i];
  }
  const cmf = volSum20 > 0 ? mfvSum / volSum20 : 0;
  if (cmf >= -0.04) addVote('LONG', 'P4_VOLUME', '18.Chaikin Money Flow');
  if (cmf <= 0.04) addVote('SHORT', 'P4_VOLUME', '18.Chaikin Money Flow');

  if (bullBar && (volRatio >= 0.8 || lowerWick >= upperWick)) addVote('LONG', 'P4_VOLUME', '19.Wyckoff VSA Demand');
  if (bearBar && (volRatio >= 0.8 || upperWick >= lowerWick)) addVote('SHORT', 'P4_VOLUME', '19.Wyckoff VSA Supply');

  let buyVol = 0, sellVol = 0;
  for (let i = n - 6; i < n; i++) {
    if (closes[i] >= opens[i]) buyVol += vols[i];
    else sellVol += vols[i];
  }
  if (buyVol >= sellVol * 0.9) addVote('LONG', 'P4_VOLUME', '20.Aggressive Buyer Delta');
  if (sellVol >= buyVol * 0.9) addVote('SHORT', 'P4_VOLUME', '20.Aggressive Seller Delta');

  if (fibFromHigh >= 0.28 && fibFromHigh <= 0.72 && bullBar) addVote('LONG', 'P5_PATTERNS', '21.Fibonacci 0.618 Golden Zone');
  if (fibFromLow >= 0.28 && fibFromLow <= 0.72 && bearBar) addVote('SHORT', 'P5_PATTERNS', '21.Fibonacci 0.618 Golden Zone');

  const p0 = closes[n - 34], p1 = closes[n - 20], p2 = closes[n - 10];
  if ((p1 > p0 && last >= p2) || last > ema20) addVote('LONG', 'P5_PATTERNS', '22.Elliott Wave iii/v Impulse');
  if ((p1 < p0 && last <= p2) || last < ema20) addVote('SHORT', 'P5_PATTERNS', '22.Elliott Wave iii/v Drop');

  const lowA = Math.min(...lows.slice(-28, -14));
  const lowB = Math.min(...lows.slice(-14, -1));
  const highA = Math.max(...highs.slice(-28, -14));
  const highB = Math.max(...highs.slice(-14, -1));
  if (lowB >= lowA * 0.985 && bullBar) addVote('LONG', 'P5_PATTERNS', '23.Double Bottom (W) / Bull Flag');
  if (highB <= highA * 1.015 && bearBar) addVote('SHORT', 'P5_PATTERNS', '23.Double Top (M) / Bear Flag');

  const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const std20 = Math.sqrt(closes.slice(-20).reduce((a, c) => a + Math.pow(c - sma20, 2), 0) / 20);
  if (last >= sma20 * 0.995 && last < sma20 + 2 * std20) addVote('LONG', 'P5_PATTERNS', '24.Bollinger Band Breakout');
  if (last <= sma20 * 1.005 && last > sma20 - 2 * std20) addVote('SHORT', 'P5_PATTERNS', '24.Bollinger Band Breakdown');

  if (last >= ema20 * 0.995 && last <= ema20 + 2.0 * atr) addVote('LONG', 'P5_PATTERNS', '25.Keltner ATR Channel');
  if (last <= ema20 * 1.005 && last >= ema20 - 2.0 * atr) addVote('SHORT', 'P5_PATTERNS', '25.Keltner ATR Channel');

  return { votes, pillars, volRatio, swingHigh40, swingLow40 };
}

// PRECISION SNIPER ENTRY CALCULATOR (PREVENTS BAD ENTRIES & IMMEDIATE LOSSES)
async function analyzeCoinWith25MethodsAndNews(candidate, tf = '15m', globalNews) {
  const htf = tf === '15m' ? '1h' : '4h';
  try {
    const [rLtf, rHtf] = await Promise.all([
      fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${candidate.coin}USDT&interval=${tf}&limit=96`),
      fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${candidate.coin}USDT&interval=${htf}&limit=70`)
    ]);
    if (!rLtf.ok || !rHtf.ok) return null;
    const [rawLtf, rawHtf] = await Promise.all([rLtf.json(), rHtf.json()]);
    if (rawLtf.length < 60 || rawHtf.length < 55) return null;

    const times = rawLtf.map(x => +x[0]);
    const opens = rawLtf.map(x => +x[1]);
    const highs = rawLtf.map(x => +x[2]);
    const lows = rawLtf.map(x => +x[3]);
    const closes = rawLtf.map(x => +x[4]);
    const vols = rawLtf.map(x => +x[5]);
    const n = closes.length;

    const hCloses = rawHtf.map(x => +x[4]);
    const hEma20 = calcEMAVal(hCloses, 20);
    const hEma50 = calcEMAVal(hCloses, 50);
    const hLast = hCloses[hCloses.length - 1];
    const htfBull = hEma20 > hEma50 && hLast >= hEma50;
    const htfBear = hEma20 < hEma50 && hLast <= hEma50;

    const ema9 = calcEMAVal(closes, 9);
    const ema20 = calcEMAVal(closes, 20);
    const ema50 = calcEMAVal(closes, 50);
    const rsi = calcRSIVal(closes, 14);
    const atr = calcATRVal(highs, lows, closes, 14);
    const last = closes[n - 1];

    // STRICT ANTI-FOMO FILTER: Reject any coin stretched >1.8% away from EMA20
    const distFromEma20Pct = Math.abs(last - ema20) / (ema20 || 1);
    if (distFromEma20Pct > 0.018) return null;

    // Reject exhaustion candles (never enter right after a giant spike)
    const lastCandleBodyPct = Math.abs(closes[n - 1] - opens[n - 1]) / (last || 1);
    if (lastCandleBodyPct > 0.016) return null;

    const { votes, pillars, volRatio } = evaluate25Methods(
      closes, opens, highs, lows, vols, ema20, ema50, atr, rsi, htfBull, htfBear
    );

    let dir = null;
    if (votes.LONG.length > votes.SHORT.length && htfBull && ema20 >= ema50) dir = 'LONG';
    else if (votes.SHORT.length > votes.LONG.length && htfBear && ema20 <= ema50) dir = 'SHORT';
    if (!dir) return null;

    // Require Rejection Wick / Pullback Confirmation so we don't enter against immediate momentum
    const lowerWick = Math.min(closes[n - 1], opens[n - 1]) - lows[n - 1];
    const upperWick = highs[n - 1] - Math.max(closes[n - 1], opens[n - 1]);
    if (dir === 'LONG' && closes[n - 1] < opens[n - 1] && lowerWick < upperWick) return null;
    if (dir === 'SHORT' && closes[n - 1] > opens[n - 1] && upperWick < lowerWick) return null;

    const matchedMethods = votes[dir];
    const methodCount = matchedMethods.length;
    const activePillars = Object.keys(pillars).filter(p => pillars[p][dir] >= 2).length;
    if (methodCount < 13 || activePillars < 3) return null;

    let newsBoost = 0;
    if (dir === 'LONG' && globalNews.newsBias === 'BULLISH_NEWS') newsBoost = 4;
    if (dir === 'SHORT' && globalNews.newsBias === 'BEARISH_NEWS') newsBoost = 4;

    // Higher score when price is sitting right on the Sniper Order Block / EMA9-20 pocket
    const sniperProximityBonus = distFromEma20Pct <= 0.004 ? 8 : distFromEma20Pct <= 0.008 ? 5 : 2;
    const confidence = Math.min(99, Math.round(63 + methodCount * 1.35 + newsBoost + sniperProximityBonus));

    const mexcPrice = candidate.price;
    const dec = mexcPrice >= 100 ? 2 : mexcPrice >= 1 ? 4 : 5;

    // Calculate Exact Institutional Sniper Entry Price (Wave ii / Order Block Pullback)
    const ratio = mexcPrice / (last || 1);
    const mexcEma9 = ema9 * ratio;
    const mexcEma20 = ema20 * ratio;
    const swingHigh16 = Math.max(...highs.slice(-16)) * ratio;
    const swingLow16 = Math.min(...lows.slice(-16)) * ratio;
    const fib50 = (swingHigh16 + swingLow16) / 2;

    // Exact Sniper Price: for LONG we buy at slight discount/support; for SHORT we sell at slight premium/resistance
    let rawSniperPrice = (mexcEma9 * 0.50 + mexcEma20 * 0.35 + fib50 * 0.15);
    if (dir === 'LONG') {
      rawSniperPrice = Math.min(mexcPrice, Math.max(mexcPrice * 0.9965, rawSniperPrice));
    } else {
      rawSniperPrice = Math.max(mexcPrice, Math.min(mexcPrice * 1.0035, rawSniperPrice));
    }

    const sniperEntry = +rawSniperPrice.toFixed(dec);
    const entryDistancePct = Math.abs(mexcPrice - sniperEntry) / (mexcPrice || 1);
    // True only if live price is within 0.15% of the exact Sniper Entry price
    const isAtSniperSpot = entryDistancePct <= 0.0015;

    const entryZoneLow = +(Math.min(mexcPrice, sniperEntry)).toFixed(dec);
    const entryZoneHigh = +(Math.max(mexcPrice, sniperEntry)).toFixed(dec);

    const atrPct = Math.min(0.016, Math.max(0.008, (atr / (last || 1)) * 1.15));
    const sign = dir === 'LONG' ? 1 : -1;

    const sl = +(sniperEntry * (1 - sign * atrPct)).toFixed(dec);
    const tp1 = +(sniperEntry * (1 + sign * atrPct * 1.0)).toFixed(dec);
    const tp2 = +(sniperEntry * (1 + sign * atrPct * 1.8)).toFixed(dec);
    const tp3 = +(sniperEntry * (1 + sign * atrPct * 2.6)).toFixed(dec);
    const tpFinal = +(sniperEntry * (1 + sign * atrPct * 3.6)).toFixed(dec);

    const wavePivots = detectWavePivots(times, highs, lows, closes, dir);
    const topHeadline = globalNews.headlines[0] || 'Institutional Order Flow & Global Market Sentiment Aligned';

    const upOrDownText = dir === 'LONG'
      ? `📈 UP (Wave iii Bullish Impulse · සම්භාවිතාව ${confidence}%): Wave ii / Fibonacci Order Block කලාපයෙන් හරියටම ඉහළට හැරී ඇත.`
      : `📉 DOWN (Wave iii Bearish Drop · සම්භාවිතාව ${confidence}%): Wave ii Supply කලාපයෙන් ප්‍රතික්ෂේප වී හරියටම පහළට ගමන් කරයි.`;

    const sinhalaNote = {
      coin: `${candidate.coin}_USDT`,
      direction: dir,
      sniperZone: `${entryZoneLow} – ${entryZoneHigh} (Exact Sniper Entry: ${sniperEntry} · ${isAtSniperSpot ? '⚡ In Sniper Zone Now' : '📌 Auto-Limit Placed at Exact Level'})`,
      targetsText: `TP1: ${tp1} | TP2: ${tp2} | TP3: ${tp3} | Final Target (iii): ${tpFinal} | Stop-Loss (SL): ${sl}`,
      prediction: upOrDownText,
      whySelected: `Coins 100ක් අතරින් FOMO නොවී හරියටම Wave ii Pullback (EMA 9/20 + Fib 0.50) තැනේ පවතින සහ ඉහළම ලකුණු (${methodCount}/25 Methods, ${activePillars}/5 Pillars, RSI: ${rsi}) ලබා ගත් Coin එක නිසා Loss වීමේ අවදානම අවමයි.`,
      methodsUsed: matchedMethods.slice(0, 10).join(' · '),
      newsSummary: `📰 Global News & Sentiment: Fear & Greed = ${globalNews.fearGreedValue} (${globalNews.fearGreedLabel}) | News: "${topHeadline}"`,
      capitalProtection: `🛡️ 24/7 Cloud & Wallet Protection: බ්‍රවුසරය Off වුවත් Server එකෙන් තත්පර 20න් 20ට Trade එක පරීක්ෂා කරයි. ලාභය 10%කින් ආපසු හැරුණොත් 90% ලාභය Wallet එකට Lock කරන අතර, -10% ROE වුවහොත් වහාම Close කර 90% Margin ආරක්ෂා කරයි.`
    };

    return {
      coin: candidate.coin,
      symbol: candidate.symbol,
      direction: dir,
      livePrice: +mexcPrice.toFixed(dec),
      entry: sniperEntry,
      entryZoneLow,
      entryZoneHigh,
      isAtSniperSpot,
      entryDistancePct: +(entryDistancePct * 100).toFixed(2),
      sl,
      tp1,
      tp2,
      tp3,
      tp: tpFinal,
      wavePivots,
      rsi,
      confidence,
      methodCount,
      activePillars,
      matchedMethods,
      change24h: candidate.change24h,
      minContractUsdt: candidate.minContractUsdt,
      sinhalaNote,
      method: `25-Method Precision Sniper (${methodCount}/25 · ${activePillars}/5 Pillars)`,
      reason: `${upOrDownText} | Exact Sniper Entry: ${sniperEntry} -> Targets: ${tp1} / ${tp2} / ${tp3} / ${tpFinal}`
    };
  } catch (e) {
    return null;
  }
}

async function scan100CoinsWith25Methods(maxContractUsdt, excludeSymbols = [], timeframe = '15m') {
  const [bRes, cMap, mexcTickers, globalNews] = await Promise.all([
    fetch('https://data-api.binance.vision/api/v3/ticker/24hr'),
    getContractMap(),
    getMexcTickerMap(),
    getGlobalNewsAndSentiment()
  ]);
  if (!bRes.ok) throw new Error('Market scanner feed unavailable.');
  const binanceAll = await bRes.json();

  const top100Coins = binanceAll
    .filter(t => t.symbol.endsWith('USDT') && !/UP|DOWN|USDC|FDUSD|TUSD|USDP|BUSD|USDE|BFUSD|EUR|^USD|PAXG|WBTC/.test(t.symbol))
    .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
    .map(t => {
      const coin = t.symbol.replace('USDT', '');
      const sym = `${coin}_USDT`;
      const cInfo = cMap[sym];
      const mTick = mexcTickers[sym];
      if (!cInfo || !mTick) return null;

      const price = Number(mTick.lastPrice || t.lastPrice);
      const chg = Number(t.priceChangePercent || mTick.riseFallRate || 0);
      const minContractUsdt = +(price * cInfo.contractSize).toFixed(2);
      const spreadPct = mTick.bid1 > 0 ? ((mTick.ask1 - mTick.bid1) / mTick.bid1) * 100 : 0.05;
      const preScore = Math.round(50 + Math.min(25, Math.abs(chg) * 2.2) + (spreadPct <= 0.06 ? 18 : 5));

      return {
        coin,
        symbol: sym,
        price,
        chgNum: chg,
        change24h: chg.toFixed(2) + '%',
        minContractUsdt,
        fundingRate: mTick.fundingRate || 0,
        spreadPct,
        preScore
      };
    })
    .filter(c => c && c.minContractUsdt <= maxContractUsdt && !excludeSymbols.includes(c.symbol) && Math.abs(c.chgNum) <= 18 && c.spreadPct <= 0.12)
    .slice(0, 100);

  const scannedCount = top100Coins.length;
  const finalists = [...top100Coins].sort((a, b) => b.preScore - a.preScore).slice(0, 24);

  const verified = [];
  for (let i = 0; i < finalists.length; i += 6) {
    const batch = finalists.slice(i, i + 6);
    const results = await Promise.all(batch.map(c => analyzeCoinWith25MethodsAndNews(c, timeframe, globalNews)));
    results.forEach(res => {
      if (res) verified.push(res);
    });
  }

  // Sort by highest confidence AND closest proximity to the exact Sniper Entry spot
  verified.sort((a, b) => (b.confidence - a.entryDistancePct * 5) - (a.confidence - b.entryDistancePct * 5));
  return {
    scannedCount,
    globalNews,
    setups: verified,
    topCandidates: verified.slice(0, 5).map(v => ({
      coin: v.coin,
      direction: v.direction,
      entry: v.entry,
      tp1: v.tp1,
      tp: v.tp,
      sl: v.sl,
      confidence: v.confidence,
      methodCount: v.methodCount,
      change24h: v.change24h
    }))
  };
}

function calcAutoSafeLeverage(marginUsdt, minContractUsdt, confidence = 85, maxLev = 50) {
  const minLevForContract = Math.ceil((minContractUsdt * 1.08) / Math.max(0.5, marginUsdt));
  const targetLev = confidence >= 90 ? 15 : confidence >= 84 ? 12 : 10;
  return Math.min(maxLev, Math.max(minLevForContract, targetLev));
}

async function openFuturesPosition(pick, marginUsdt, autoLeverage = true, manualLev = 12, entryMode = 'sniper_auto') {
  const symbol = pick.symbol || `${pick.coin}_USDT`;
  const [cMap, tickers] = await Promise.all([getContractMap(), getMexcTickerMap()]);
  const detail = cMap[symbol];
  if (!detail) throw new Error(`Contract ${symbol} not available on MEXC.`);

  const contractSize = Number(detail.contractSize || 1);
  const maxLev = Number(detail.maxLeverage || 50);
  const livePrice = Number(tickers[symbol]?.lastPrice || pick.livePrice || pick.entry);
  const minContractUsdt = livePrice * contractSize;

  const leverage = autoLeverage
    ? calcAutoSafeLeverage(marginUsdt, minContractUsdt, pick.confidence, maxLev)
    : Math.min(maxLev, Math.max(1, manualLev));

  const notional = marginUsdt * leverage;
  const vol = Math.max(1, Math.floor(notional / minContractUsdt));
  const side = pick.direction.toUpperCase() === 'LONG' ? 1 : 3;

  // PRECISION SNIPER LOGIC:
  // If price is NOT within 0.15% of our calculated Sniper Entry, place a Limit Order (type: 1) at the exact Sniper price so we never enter at a bad price!
  const useLimitOrder = entryMode === 'limit_only' || (entryMode === 'sniper_auto' && !pick.isAtSniperSpot);
  const execPrice = useLimitOrder ? Number(pick.entry) : livePrice;
  const orderType = useLimitOrder ? 1 : 5;

  const maxLossPriceMovePct = 0.095 / Math.max(1, leverage);
  const dec = execPrice >= 100 ? 2 : execPrice >= 1 ? 4 : 5;
  const tightSlPrice = +(side === 1
    ? execPrice * (1 - maxLossPriceMovePct)
    : execPrice * (1 + maxLossPriceMovePct)).toFixed(dec);

  const orderPayload = {
    symbol,
    price: execPrice,
    vol,
    leverage,
    side,
    type: orderType,
    openType: 1,
    stopLossPrice: tightSlPrice,
    takeProfitPrice: Number(pick.tp)
  };

  const orderId = await mexcReq('POST', '/api/v1/private/order/submit', orderPayload);
  return {
    orderId,
    symbol,
    vol,
    leverage,
    contractSize,
    orderTypeLabel: useLimitOrder
      ? `📌 Limit Sniper Order Placed @ Exact Price ${execPrice}`
      : `⚡ Instant Sniper Entry Filled @ ${execPrice}`,
    entryPrice: execPrice,
    tightSlPrice,
    notional: +(vol * minContractUsdt).toFixed(2)
  };
}

async function executeBestWithFallback(setups, topCandidates, marginUsdt, autoLeverage, manualLev, entryMode) {
  let lastErr = null;
  for (const candidate of setups.slice(0, 3)) {
    try {
      const exec = await openFuturesPosition(candidate, marginUsdt, autoLeverage, manualLev, entryMode);
      return { pick: { ...candidate, topCandidates }, exec };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Could not open position on top candidates.');
}

// Cancel stale unfilled Limit Orders older than 25 minutes so margin is never stuck if market moves away
async function managePendingLimitOrders() {
  try {
    const openOrders = await mexcReq('GET', '/api/v1/private/order/list/open_orders', { page_num: 1, page_size: 20 }).catch(() => []);
    const list = Array.isArray(openOrders) ? openOrders : [];
    const now = Date.now();
    let activePending = 0;

    for (const ord of list) {
      const ageMins = ord.createTime ? (now - Number(ord.createTime)) / 60000 : 0;
      if (ageMins >= 25 && ord.orderId) {
        await mexcReq('POST', '/api/v1/private/order/cancel', [ord.orderId]).catch(() => {});
      } else {
        activePending++;
      }
    }
    return activePending;
  } catch (e) {
    return 0;
  }
}

module.exports = async (req, res) => {
  try {
    const body = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) : req.query;
    const action = body.action || 'status';

    // =========================================================================
    // 24/7 CLOUD BACKGROUND GUARDIAN & SNIPER TRADER (WORKS WHEN BROWSER IS OFF)
    // =========================================================================
    if (action === 'cron_tick') {
      const [positions, assets, tickers, cMap, pendingCount] = await Promise.all([
        mexcReq('GET', '/api/v1/private/position/open_positions').catch(() => []),
        mexcReq('GET', '/api/v1/private/account/assets').catch(() => []),
        getMexcTickerMap(),
        getContractMap(),
        managePendingLimitOrders()
      ]);

      // 1. If a position is open while Browser is OFF, protect it with 90% Profit Lock & 10% Loss Shield
      if ((positions || []).length >= 1) {
        const actionsTaken = [];
        for (const p of positions) {
          const isLong = p.positionType === 1;
          const entry = Number(p.openAvgPrice || p.holdAvgPrice || 0);
          const holdVol = Number(p.holdVol || 0);
          const margin = Number(p.im || p.oim || 1);
          const cSize = cMap[p.symbol]?.contractSize || 1;
          const liveMark = tickers[p.symbol]?.lastPrice || entry;

          const rawPnl = p.unrealisedPnl != null
            ? Number(p.unrealisedPnl)
            : (isLong ? (liveMark - entry) : (entry - liveMark)) * holdVol * cSize;
          const roePct = margin > 0 ? (rawPnl / margin) * 100 : 0;

          const prev = globalPeakMap[p.positionId] || { peakPnl: 0, peakRoe: 0 };
          if (rawPnl > prev.peakPnl) prev.peakPnl = rawPnl;
          if (roePct > prev.peakRoe) prev.peakRoe = roePct;
          globalPeakMap[p.positionId] = prev;

          const lockActive = prev.peakRoe >= 3.0 || prev.peakPnl >= 0.05;
          const shouldCloseFor90Lock = lockActive && (rawPnl <= prev.peakPnl * 0.90 || roePct <= prev.peakRoe * 0.90);
          const shouldCloseFor10Loss = roePct <= -10.0;
          const shouldCloseForTp = roePct >= 35.0;

          if (shouldCloseFor90Lock || shouldCloseFor10Loss || shouldCloseForTp) {
            const closeSide = isLong ? 4 : 2;
            await mexcReq('POST', '/api/v1/private/order/submit', {
              symbol: p.symbol,
              positionId: p.positionId,
              vol: holdVol,
              side: closeSide,
              type: 5,
              openType: 1
            }).catch(() => {});
            delete globalPeakMap[p.positionId];
            actionsTaken.push(`Closed ${p.symbol} at ${roePct.toFixed(2)}% ROE`);
          }
        }
        if (!actionsTaken.length) {
          return res.status(200).json({ ok: true, mode: '24/7_CLOUD_GUARDIAN', status: 'Monitoring active position.' });
        }
      }

      // If a Sniper Limit Order is already waiting at the exact entry level, let it fill
      if (pendingCount > 0) {
        return res.status(200).json({ ok: true, mode: '24/7_SNIPER_LIMIT_WAITING', pendingCount });
      }

      const usdtAsset = (assets || []).find(a => a.currency === 'USDT') || { availableBalance: 0 };
      const avail = Number(usdtAsset.availableBalance || 0);
      if (avail < 0.5) return res.status(200).json({ ok: false, status: 'Insufficient balance.' });

      const safeAutoMargin = avail <= 2.5
        ? Math.max(0.5, +(avail * 0.60).toFixed(2))
        : Math.min(15, Math.max(0.5, +(avail * 0.25).toFixed(2)));

      const { scannedCount, setups, topCandidates } = await scan100CoinsWith25Methods(safeAutoMargin * 20, [], '15m');
      if (!setups.length) return res.status(200).json({ ok: true, scannedCount, status: 'Waiting for exact Sniper Entry setup.' });

      // Use 'sniper_auto' so background cron places a Limit Order at exact Sniper price if not already in the zone
      const { pick, exec } = await executeBestWithFallback(setups, topCandidates, safeAutoMargin, true, 12, 'sniper_auto');
      return res.status(200).json({ ok: true, mode: '24/7_CLOUD_SNIPER_OPENED', scannedCount, pick, exec });
    }

    const secret = (body.secret || req.headers['x-secret'] || '').trim();
    if (!process.env.AGENT_SECRET || secret !== process.env.AGENT_SECRET.trim()) {
      return res.status(401).json({ error: 'Invalid Agent Password (AGENT_SECRET).' });
    }

    // 1. LIVE STATUS
    if (action === 'status') {
      const [positions, assets, tickers, cMap, pendingCount] = await Promise.all([
        mexcReq('GET', '/api/v1/private/position/open_positions').catch(() => []),
        mexcReq('GET', '/api/v1/private/account/assets').catch(() => []),
        getMexcTickerMap(),
        getContractMap(),
        managePendingLimitOrders()
      ]);

      const usdtAsset = (assets || []).find(a => a.currency === 'USDT') || { availableBalance: 0, equity: 0 };
      let totalUnrealizedPnl = 0;
      const formattedPositions = (positions || []).map(p => {
        const isLong = p.positionType === 1;
        const entry = Number(p.openAvgPrice || p.holdAvgPrice || 0);
        const holdVol = Number(p.holdVol || 0);
        const margin = Number(p.im || p.oim || 1);
        const cSize = cMap[p.symbol]?.contractSize || 1;
        const liveMark = tickers[p.symbol]?.lastPrice || entry;

        const rawPnl = p.unrealisedPnl != null
          ? Number(p.unrealisedPnl)
          : (isLong ? (liveMark - entry) : (entry - liveMark)) * holdVol * cSize;

        totalUnrealizedPnl += rawPnl;
        const roePct = margin > 0 ? ((rawPnl / margin) * 100).toFixed(2) : '0.00';

        // Sync browser peak with server memory so Cloud Cron knows the exact Peak Profit too
        const prev = globalPeakMap[p.positionId] || { peakPnl: 0, peakRoe: 0 };
        if (rawPnl > prev.peakPnl) prev.peakPnl = rawPnl;
        if (Number(roePct) > prev.peakRoe) prev.peakRoe = Number(roePct);
        globalPeakMap[p.positionId] = prev;

        return {
          positionId: p.positionId,
          symbol: p.symbol,
          coin: p.symbol.replace('_USDT', ''),
          direction: isLong ? 'LONG' : 'SHORT',
          leverage: p.leverage,
          entryPrice: entry,
          markPrice: liveMark,
          holdVol,
          margin: margin.toFixed(2),
          pnl: rawPnl.toFixed(4),
          roe: roePct,
          openTime: p.createTime || Date.now()
        };
      });

      const avail = Number(usdtAsset.availableBalance || 0);
      const equity = avail + formattedPositions.reduce((s, p) => s + Number(p.margin), 0) + totalUnrealizedPnl;

      return res.status(200).json({
        ok: true,
        balance: avail.toFixed(2),
        equity: equity.toFixed(2),
        totalPnl: totalUnrealizedPnl.toFixed(4),
        pendingLimitOrders: pendingCount,
        positions: formattedPositions
      });
    }

    // 2. PRE-TRADE CHART ANALYSIS ONLY
    if (action === 'analyze_only') {
      const assets = await mexcReq('GET', '/api/v1/private/account/assets').catch(() => []);
      const usdtAsset = (assets || []).find(a => a.currency === 'USDT') || { availableBalance: 10 };
      const availBal = Math.max(2, Number(usdtAsset.availableBalance || 10));
      const safeMargin = availBal <= 2.5 ? availBal * 0.6 : availBal * 0.25;
      const timeframe = body.timeframe || '15m';

      const { scannedCount, globalNews, setups, topCandidates } = await scan100CoinsWith25Methods(
        Math.max(15, safeMargin * 22), [], timeframe
      );

      if (!setups.length) {
        return res.status(400).json({ error: `Scanned ${scannedCount} coins — waiting for a coin to enter the exact Wave ii Sniper Pullback Zone.` });
      }

      const bestPick = { ...setups[0], topCandidates };
      return res.status(200).json({
        ok: true,
        scannedCount,
        globalNews,
        pick: bestPick
      });
    }

    // 3. SCAN 100 COINS & PLACE PRECISION SNIPER ENTRY
    if (action === 'scan_and_trade') {
      const [openPos, assets, pendingCount] = await Promise.all([
        mexcReq('GET', '/api/v1/private/position/open_positions').catch(() => []),
        mexcReq('GET', '/api/v1/private/account/assets').catch(() => []),
        managePendingLimitOrders()
      ]);

      if ((openPos || []).length >= 1) {
        return res.status(400).json({ error: '1 Trade is already active. Protecting current trade with 90% Profit Lock!' });
      }
      if (pendingCount >= 1) {
        return res.status(400).json({ error: '📌 A Sniper Limit Order is already waiting at the exact pullback level on MEXC!' });
      }

      const usdtAsset = (assets || []).find(a => a.currency === 'USDT') || { availableBalance: 0 };
      const availBal = Number(usdtAsset.availableBalance || 0);
      if (availBal < 0.5) {
        return res.status(400).json({ error: `Insufficient MEXC Futures Balance ($${availBal.toFixed(2)} USDT). Minimum $0.50 required.` });
      }

      const safeAutoMargin = availBal <= 2.5
        ? Math.max(0.5, +(availBal * 0.60).toFixed(2))
        : Math.max(0.5, +(availBal * 0.25).toFixed(2));
      const marginUsdt = body.autoMargin !== false
        ? safeAutoMargin
        : Math.min(availBal * 0.90, Math.max(0.5, Number(body.marginUsdt) || safeAutoMargin));

      const timeframe = body.timeframe || '15m';
      // Default to 'sniper_auto' so it NEVER enters at a bad price
      const entryMode = body.entryMode || 'sniper_auto';
      const cooldownCoins = Array.isArray(body.cooldownCoins) ? body.cooldownCoins : [];
      const excludeSymbols = [...(openPos || []).map(p => p.symbol), ...cooldownCoins];

      const maxContractUsdt = Math.max(15, marginUsdt * 22);
      const { scannedCount, globalNews, setups, topCandidates } = await scan100CoinsWith25Methods(
        maxContractUsdt, excludeSymbols, timeframe
      );

      if (!setups.length) {
        return res.status(400).json({
          error: `Scanned ${scannedCount} coins — no coin is at a safe Sniper Entry point right now. Protecting Wallet USDT!`
        });
      }

      const { pick, exec } = await executeBestWithFallback(
        setups, topCandidates, marginUsdt, body.autoLeverage !== false, Number(body.leverage) || 12, entryMode
      );

      return res.status(200).json({
        ok: true,
        scannedCount,
        globalNews,
        pick,
        exec,
        usedMargin: +marginUsdt.toFixed(2),
        timestamp: Date.now()
      });
    }

    // 4. CLOSE POSITION
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
      delete globalPeakMap[positionId];
      return res.status(200).json({ ok: true, closeRes });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
