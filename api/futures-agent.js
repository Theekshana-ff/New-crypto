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

// --- UPDATE #3: BTC MARKET REGIME FILTER ---
async function getBtcMarketRegime(tf = '15m') {
  try {
    const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=${tf}&limit=60`);
    if (!r.ok) return { regime: 'NEUTRAL', allowLong: true, allowShort: true, change1hPct: 0 };
    const raw = await r.json();
    const closes = raw.map(x => +x[4]);
    const ema20 = calcEMAVal(closes, 20);
    const ema50 = calcEMAVal(closes, 50);
    const last = closes[closes.length - 1];
    const prev4 = closes[closes.length - 5] || last;
    const suddenMovePct = ((last - prev4) / prev4) * 100;

    // Block Altcoin LONG if BTC is crashing (>1.3% sudden drop or bearish below both EMAs)
    const btcDumping = suddenMovePct <= -1.3 || (last < ema20 && ema20 < ema50 && suddenMovePct < -0.5);
    // Block Altcoin SHORT if BTC is squeezing upward (>1.3% sudden pump or bullish above both EMAs)
    const btcPumping = suddenMovePct >= 1.3 || (last > ema20 && ema20 > ema50 && suddenMovePct > 0.5);

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
  const bullBar = last > lastOpen && last >= prev;
  const bearBar = last < lastOpen && last <= prev;

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
  const nearEma20 = Math.abs(last - ema20) / ema20 <= 0.018;
  if (nearEma20 && bullBar && last >= ema50) addVote('LONG', 'P1_SMC_ICT', '1.SMC-OB');
  if (nearEma20 && bearBar && last <= ema50) addVote('SHORT', 'P1_SMC_ICT', '1.SMC-OB');

  const high10 = Math.max(...highs.slice(-12, -2));
  const low10 = Math.min(...lows.slice(-12, -2));
  if (last > opens[n - 3] && lows[n - 1] > Math.min(...lows.slice(-20, -10))) addVote('LONG', 'P1_SMC_ICT', '2.SMC-BOS');
  if (last < opens[n - 3] && highs[n - 1] < Math.max(...highs.slice(-20, -10))) addVote('SHORT', 'P1_SMC_ICT', '2.SMC-BOS');

  let bullFvg = false, bearFvg = false;
  for (let i = n - 7; i <= n - 2; i++) {
    if (lows[i] > highs[i - 2]) bullFvg = true;
    if (highs[i] < lows[i - 2]) bearFvg = true;
  }
  if (bullFvg && bullBar) addVote('LONG', 'P1_SMC_ICT', '3.ICT-FVG');
  if (bearFvg && bearBar) addVote('SHORT', 'P1_SMC_ICT', '3.ICT-FVG');

  if (fibFromHigh >= 0.50 && fibFromHigh <= 0.79 && bullBar) addVote('LONG', 'P1_SMC_ICT', '4.ICT-OTE');
  if (fibFromLow >= 0.50 && fibFromLow <= 0.79 && bearBar) addVote('SHORT', 'P1_SMC_ICT', '4.ICT-OTE');

  const lowerWick = Math.min(last, lastOpen) - lows[n - 1];
  const upperWick = highs[n - 1] - Math.max(last, lastOpen);
  const bodySize = Math.abs(last - lastOpen) || 0.0001;
  if ((lows[n - 2] <= low10 * 1.002 && last > low10) || lowerWick > bodySize * 0.8) addVote('LONG', 'P1_SMC_ICT', '5.Liq-Sweep');
  if ((highs[n - 2] >= high10 * 0.998 && last < high10) || upperWick > bodySize * 0.8) addVote('SHORT', 'P1_SMC_ICT', '5.Liq-Sweep');

  // Pillar 2: Trend & Structure (5)
  if (htfBull && ema20 > ema50) addVote('LONG', 'P2_TREND', '6.MTF-EMA');
  if (htfBear && ema20 < ema50) addVote('SHORT', 'P2_TREND', '6.MTF-EMA');

  const hl2 = (highs[n - 1] + lows[n - 1]) / 2;
  const stLower = hl2 - 2.2 * atr;
  const stUpper = hl2 + 2.2 * atr;
  if (last > stLower && last > ema20) addVote('LONG', 'P2_TREND', '7.SuperTrend');
  if (last < stUpper && last < ema20) addVote('SHORT', 'P2_TREND', '7.SuperTrend');

  const tenkan = (Math.max(...highs.slice(-9)) + Math.min(...lows.slice(-9))) / 2;
  const kijun = (Math.max(...highs.slice(-26)) + Math.min(...lows.slice(-26))) / 2;
  if (last > kijun && tenkan >= kijun) addVote('LONG', 'P2_TREND', '8.Ichimoku');
  if (last < kijun && tenkan <= kijun) addVote('SHORT', 'P2_TREND', '8.Ichimoku');

  let plusDM = 0, minusDM = 0;
  for (let i = n - 14; i < n; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    if (upMove > downMove && upMove > 0) plusDM += upMove;
    if (downMove > upMove && downMove > 0) minusDM += downMove;
  }
  if (plusDM > minusDM * 1.05) addVote('LONG', 'P2_TREND', '9.ADX-DI+');
  if (minusDM > plusDM * 1.05) addVote('SHORT', 'P2_TREND', '9.ADX-DI-');

  const psarBull = lows[n - 1] > Math.min(...lows.slice(-6, -1));
  const psarBear = highs[n - 1] < Math.max(...highs.slice(-6, -1));
  if (psarBull && last > ema50) addVote('LONG', 'P2_TREND', '10.PSAR');
  if (psarBear && last < ema50) addVote('SHORT', 'P2_TREND', '10.PSAR');

  // Pillar 3: Momentum & Oscillators (5)
  if (rsi >= 44 && rsi <= 65) addVote('LONG', 'P3_MOMENTUM', '11.RSI-Safe');
  if (rsi <= 56 && rsi >= 35) addVote('SHORT', 'P3_MOMENTUM', '11.RSI-Safe');

  const ema12Arr = calcEMAArray(closes, 12);
  const ema26Arr = calcEMAArray(closes, 26);
  const macdArr = ema12Arr.map((v, i) => v - ema26Arr[i]);
  const sigArr = calcEMAArray(macdArr, 9);
  const macdHist = macdArr[n - 1] - sigArr[n - 1];
  const prevHist = macdArr[n - 2] - sigArr[n - 2];
  if (macdHist > 0 || macdHist > prevHist) addVote('LONG', 'P3_MOMENTUM', '12.MACD');
  if (macdHist < 0 || macdHist < prevHist) addVote('SHORT', 'P3_MOMENTUM', '12.MACD');

  const h14 = Math.max(...highs.slice(-14));
  const l14 = Math.min(...lows.slice(-14));
  const stochK = h14 > l14 ? ((last - l14) / (h14 - l14)) * 100 : 50;
  if (stochK >= 30 && stochK <= 82 && bullBar) addVote('LONG', 'P3_MOMENTUM', '13.Stoch');
  if (stochK <= 70 && stochK >= 18 && bearBar) addVote('SHORT', 'P3_MOMENTUM', '13.Stoch');

  const tpArr = closes.slice(-20).map((c, i) => (highs[n - 20 + i] + lows[n - 20 + i] + c) / 3);
  const tpMean = tpArr.reduce((a, b) => a + b, 0) / 20;
  const meanDev = tpArr.reduce((a, b) => a + Math.abs(b - tpMean), 0) / 20 || 1;
  const cci = (tpArr[19] - tpMean) / (0.015 * meanDev);
  if (cci > -20 && cci < 160) addVote('LONG', 'P3_MOMENTUM', '14.CCI');
  if (cci < 20 && cci > -160) addVote('SHORT', 'P3_MOMENTUM', '14.CCI');

  const willR = h14 > l14 ? ((h14 - last) / (h14 - l14)) * -100 : -50;
  if (willR >= -75 && willR <= -18) addVote('LONG', 'P3_MOMENTUM', '15.Will%R');
  if (willR <= -25 && willR >= -82) addVote('SHORT', 'P3_MOMENTUM', '15.Will%R');

  // Pillar 4: Volume & Order Flow (5)
  let pvSum = 0, vSum = 0;
  for (let i = n - 24; i < n; i++) {
    const typ = (highs[i] + lows[i] + closes[i]) / 3;
    pvSum += typ * vols[i];
    vSum += vols[i];
  }
  const vwap = vSum > 0 ? pvSum / vSum : last;
  if (last >= vwap * 0.998) addVote('LONG', 'P4_VOLUME', '16.VWAP');
  if (last <= vwap * 1.002) addVote('SHORT', 'P4_VOLUME', '16.VWAP');

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
  if (cmf >= -0.02) addVote('LONG', 'P4_VOLUME', '18.CMF');
  if (cmf <= 0.02) addVote('SHORT', 'P4_VOLUME', '18.CMF');

  if (bullBar && (volRatio >= 0.9 || lowerWick > upperWick)) addVote('LONG', 'P4_VOLUME', '19.Wyckoff-VSA');
  if (bearBar && (volRatio >= 0.9 || upperWick > lowerWick)) addVote('SHORT', 'P4_VOLUME', '19.Wyckoff-VSA');

  let buyVol = 0, sellVol = 0;
  for (let i = n - 6; i < n; i++) {
    if (closes[i] >= opens[i]) buyVol += vols[i];
    else sellVol += vols[i];
  }
  if (buyVol >= sellVol) addVote('LONG', 'P4_VOLUME', '20.Vol-Delta');
  if (sellVol >= buyVol) addVote('SHORT', 'P4_VOLUME', '20.Vol-Delta');

  // Pillar 5: Geometry & Patterns (5)
  if (fibFromHigh >= 0.32 && fibFromHigh <= 0.68 && bullBar) addVote('LONG', 'P5_PATTERNS', '21.Fib-Golden');
  if (fibFromLow >= 0.32 && fibFromLow <= 0.68 && bearBar) addVote('SHORT', 'P5_PATTERNS', '21.Fib-Golden');

  const p0 = closes[n - 34], p1 = closes[n - 20], p2 = closes[n - 10];
  if (p1 > p0 && p2 > p0 && last >= p2) addVote('LONG', 'P5_PATTERNS', '22.Elliott-Wave');
  if (p1 < p0 && p2 < p0 && last <= p2) addVote('SHORT', 'P5_PATTERNS', '22.Elliott-Wave');

  const lowA = Math.min(...lows.slice(-28, -14));
  const lowB = Math.min(...lows.slice(-14, -1));
  const highA = Math.max(...highs.slice(-28, -14));
  const highB = Math.max(...highs.slice(-14, -1));
  if (lowB >= lowA * 0.992 && bullBar) addVote('LONG', 'P5_PATTERNS', '23.Pattern-W/Flag');
  if (highB <= highA * 1.008 && bearBar) addVote('SHORT', 'P5_PATTERNS', '23.Pattern-M/Flag');

  const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const std20 = Math.sqrt(closes.slice(-20).reduce((a, c) => a + Math.pow(c - sma20, 2), 0) / 20);
  const bbUpper = sma20 + 2 * std20;
  const bbLower = sma20 - 2 * std20;
  if (last >= sma20 && last < bbUpper * 0.998) addVote('LONG', 'P5_PATTERNS', '24.Bollinger');
  if (last <= sma20 && last > bbLower * 1.002) addVote('SHORT', 'P5_PATTERNS', '24.Bollinger');

  const kcUpper = ema20 + 1.8 * atr;
  const kcLower = ema20 - 1.8 * atr;
  if (last >= ema20 && last <= kcUpper) addVote('LONG', 'P5_PATTERNS', '25.Keltner-ATR');
  if (last <= ema20 && last >= kcLower) addVote('SHORT', 'P5_PATTERNS', '25.Keltner-ATR');

  return { votes, pillars, volRatio };
}

async function analyzeCoin25Methods(coin, tf, strategyMode = 'ALL25', btcRegime = { allowLong: true, allowShort: true, regime: 'BALANCED' }) {
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
    const htfBull = hEma20 > hEma50 && hLast >= hEma50 * 0.996;
    const htfBear = hEma20 < hEma50 && hLast <= hEma50 * 1.004;

    const ema20 = calcEMAVal(closes, 20);
    const ema50 = calcEMAVal(closes, 50);
    const rsi = calcRSIVal(closes, 14);
    const atr = calcATRVal(highs, lows, closes, 14);
    const last = closes[closes.length - 1];

    if (Math.abs(last - ema20) / ema20 > 0.026) return null;

    const { votes, pillars } = evaluate25Methods(
      closes, opens, highs, lows, vols, ema20, ema50, atr, rsi, htfBull, htfBear
    );

    let dir = null;
    if (htfBull && votes.LONG.length > votes.SHORT.length) dir = 'LONG';
    else if (htfBear && votes.SHORT.length > votes.LONG.length) dir = 'SHORT';
    if (!dir) return null;

    // Enforce BTC Market Regime Filter for Altcoins
    if (coin !== 'BTC') {
      if (dir === 'LONG' && !btcRegime.allowLong) return null;
      if (dir === 'SHORT' && !btcRegime.allowShort) return null;
    }

    if (dir === 'LONG' && (rsi < 40 || rsi > 66)) return null;
    if (dir === 'SHORT' && (rsi < 34 || rsi > 60)) return null;

    const matchedMethods = votes[dir];
    const methodCount = matchedMethods.length;
    const activePillars = Object.keys(pillars).filter(p => pillars[p][dir] >= 2).length;

    if (strategyMode !== 'ALL25' && strategyMode !== 'ALL') {
      if ((pillars[strategyMode]?.[dir] || 0) < 3) return null;
    } else {
      if (methodCount < 14 || activePillars < 4) return null;
    }

    const confidence = Math.min(98, Math.round(62 + methodCount * 1.45));
    const atrPct = atr / last;
    const slPct = Math.min(0.028, Math.max(0.014, atrPct * 1.8));
    const tpPct = slPct * 2.2;
    const dec = last >= 100 ? 2 : last >= 1 ? 4 : 5;

    const entry = +last.toFixed(dec);
    const sl = +(dir === 'LONG' ? last * (1 - slPct) : last * (1 + slPct)).toFixed(dec);
    const tp = +(dir === 'LONG' ? last * (1 + tpPct) : last * (1 - tpPct)).toFixed(dec);

    const pillarSummary = `P1:${pillars.P1_SMC_ICT[dir]}/5 | P2:${pillars.P2_TREND[dir]}/5 | P3:${pillars.P3_MOMENTUM[dir]}/5 | P4:${pillars.P4_VOLUME[dir]}/5 | P5:${pillars.P5_PATTERNS[dir]}/5`;

    return {
      coin,
      direction: dir,
      method: `25-Method Confluence (${methodCount}/25 · ${activePillars}/5 Pillars)`,
      matchedMethods,
      indicators: `${pillarSummary} | BTC:${btcRegime.regime} | RSI:${rsi}`,
      entry,
      sl,
      tp,
      rr: '1:2.2',
      confidence,
      reason: `Passed ${methodCount}/25 methods across ${activePillars}/5 Pillars with BTC Regime (${btcRegime.regime}) & ${htf}+${tf} alignment.`
    };
  } catch (e) {
    return null;
  }
}

async function scanHighProbabilitySetups(maxContractUsdt, excludeSymbols = [], timeframe = '15m', strategyMode = 'ALL25', useBtcFilter = true) {
  const [r, cMap, btcRegime] = await Promise.all([
    fetch('https://data-api.binance.vision/api/v3/ticker/24hr'),
    getContractMap(),
    useBtcFilter ? getBtcMarketRegime(timeframe) : Promise.resolve({ regime: 'FILTER_OFF', allowLong: true, allowShort: true })
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
    const res = await Promise.all(batch.map(c => analyzeCoin25Methods(c.coin, timeframe, strategyMode, btcRegime)));
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

function calcSafeAutoLeverage(marginUsdt, minContractUsdt, entry, sl, maxLev = 50) {
  const minLevForContract = Math.ceil((minContractUsdt * 1.08) / Math.max(0.5, marginUsdt));
  const slPct = Math.abs(entry - sl) / (entry || 1);
  const safeLev = slPct > 0 ? Math.round(0.16 / slPct) : 8;
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

  const prompt = `You are an elite institutional Crypto Futures AI Trading Agent using the 25-Method 5-Pillar Confluence Matrix. Timeframe: ${timeframe}.
These setups passed >=14/25 methods, >=4/5 pillars, and the BTC Market Regime Filter:
${JSON.stringify(verifiedSetups.slice(0, 4))}

Pick the SINGLE SAFEST setup. Respond ONLY with raw JSON:
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

async function notifyTelegram(pick, exec, marginUsdt, source = 'WEB') {
  const token = process.env.TG_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TG_CHAT || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  const text = `🤖🏆 25-METHOD AI TRADE (${source})\n` +
    `Coin: ${exec.symbol} (${pick.direction} ${exec.leverage}x)\n` +
    `Confluence: ${pick.method}\n` +
    `Pillars: ${pick.indicators}\n` +
    `Margin: $${marginUsdt} USDT (Size: $${exec.notional})\n` +
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

    // --- UPDATE #4: SERVER-SIDE 24/7 VERCEL CRON HANDLER ---
    if (action === 'cron_tick') {
      const cronAuth = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
      const cronSecret = (process.env.CRON_SECRET || process.env.AGENT_SECRET || '').trim();
      if (cronSecret && cronAuth && cronAuth !== cronSecret) {
        return res.status(401).json({ error: 'Unauthorized Cron Tick' });
      }
      const openPos = await mexcReq('GET', '/api/v1/private/position/open_positions').catch(() => []);
      if ((openPos || []).length >= 1) {
        return res.status(200).json({ ok: true, status: 'Active position already open, skipping cron entry.' });
      }
      const marginUsdt = Math.max(0.5, Number(process.env.CRON_MARGIN_USDT) || 1);
      const { setups, btcRegime } = await scanHighProbabilitySetups(marginUsdt * 15, [], '15m', 'ALL25', true);
      if (!setups.length || setups[0].confidence < 80) {
        return res.status(200).json({ ok: true, status: 'No 25-method setup passed filter right now.', btcRegime });
      }
      const pick = await confirmWithGemini(setups, '15m');
      const exec = await openFuturesPosition(pick, marginUsdt, 10, true);
      await notifyTelegram(pick, exec, marginUsdt, '24/7 SERVER CRON');
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
        btcRegime,
        positions: formatted
      });
    }

    if (action === 'scan_and_trade') {
      const marginUsdt = Math.max(0.5, Number(body.marginUsdt) || 1);
      const reqLeverage = Math.min(25, Math.max(1, Number(body.leverage) || 8));
      const autoLeverage = body.autoLeverage !== false;
      const timeframe = body.timeframe || '15m';
      const strategyMode = body.strategyMode || 'ALL25';
      const useBtcFilter = body.useBtcFilter !== false;
      const maxOpen = Math.max(1, Number(body.maxOpen) || 1);

      const openPos = await mexcReq('GET', '/api/v1/private/position/open_positions').catch(() => []);
      if ((openPos || []).length >= maxOpen) {
        return res.status(400).json({ error: `Max Open Positions limit (${maxOpen}) reached. Waiting for current trade to finish.` });
      }
      const excludeSymbols = (openPos || []).map(p => p.symbol);

      const maxLookupLev = autoLeverage ? 15 : reqLeverage;
      const maxContractUsdt = marginUsdt * maxLookupLev;

      const { setups, btcRegime } = await scanHighProbabilitySetups(
        maxContractUsdt, excludeSymbols, timeframe, strategyMode, useBtcFilter
      );

      if (!setups.length || setups[0].confidence < 80) {
        return res.status(400).json({
          error: `⏸️ 25-Method Shield (${btcRegime.regime}): No coin safely passes >=14/25 methods & 4/5 Pillars right now. Waiting for next cycle.`
        });
      }

      const pick = await confirmWithGemini(setups, timeframe);
      const exec = await openFuturesPosition(pick, marginUsdt, reqLeverage, autoLeverage);
      await notifyTelegram(pick, exec, marginUsdt, 'AUTO-AGENT');

      return res.status(200).json({
        ok: true,
        pick,
        exec,
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
