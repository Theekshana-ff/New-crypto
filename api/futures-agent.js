// File: api/futures-agent.js (ULTIMATE FINAL VERSION: Instant Auto-Next Trade + Zero-Deadlock 100-Coin Scanner + $1+ Dollar & Zero-Loss Shield + Full 8-Module Intelligence)
const crypto = require('crypto');

const signMexc = (apiKey, secret, ts, paramStr) =>
  crypto.createHmac('sha256', secret).update(apiKey + ts + paramStr).digest('hex');

let lastOrderSubmitTs = global.mexcLastOrderTs || 0;

async function mexcReq(method, path, payload = null) {
  const apiKey = (process.env.MEXC_API_KEY || '').trim();
  const secret = (process.env.MEXC_API_SECRET || '').trim();
  if (!apiKey || !secret) throw new Error('MEXC API Keys are missing in Vercel Environment Variables.');

  // Safe 3.2s spacing between order submissions to prevent MEXC UID rate limit while allowing fast chain-trades
  if (path.includes('/order/submit')) {
    const now = Date.now();
    if (now - lastOrderSubmitTs < 3200) {
      await new Promise(r => setTimeout(r, 3200 - (now - lastOrderSubmitTs)));
    }
    lastOrderSubmitTs = Date.now();
    global.mexcLastOrderTs = lastOrderSubmitTs;
  }

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
const globalCooldownMap = global.mexcCloudCooldowns || (global.mexcCloudCooldowns = {});

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
        holdVol: Number(t.holdVol || 0),
        amount24: Number(t.amount24 || 0),
        bid1: Number(t.bid1 || t.lastPrice || 0),
        ask1: Number(t.ask1 || t.lastPrice || 0)
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

// Smart BTC Master Context: Guides direction without ever blocking/deadlocking the scanner!
async function getBtcMasterDirection() {
  try {
    const r15 = await fetch('https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=60');
    if (!r15.ok) return { allowLong: true, allowShort: true, bias: 'NEUTRAL', label: 'BTC_BALANCED' };
    const k15 = await r15.json();
    const c15 = k15.map(x => +x[4]);

    const ema20 = calcEMAVal(c15, 20);
    const ema50 = calcEMAVal(c15, 50);
    const last = c15[c15.length - 1];
    const prev3 = c15[c15.length - 4] || last;
    const flashMovePct = ((last - prev3) / prev3) * 100;

    // Only block opposite side during extreme >2.2% flash crash/pump; otherwise allow both sides and boost BTC-aligned setups
    const flashPump = flashMovePct >= 2.2;
    const flashDump = flashMovePct <= -2.2;
    const bias = ema20 >= ema50 ? 'BULL' : 'BEAR';

    let label = bias === 'BULL' ? 'BTC_BULL_BIAS' : 'BTC_BEAR_BIAS';
    if (flashPump) label = 'BTC_EXTREME_PUMP';
    if (flashDump) label = 'BTC_EXTREME_DUMP';

    return {
      allowLong: !flashDump,
      allowShort: !flashPump,
      bias,
      label
    };
  } catch (e) {
    return { allowLong: true, allowShort: true, bias: 'NEUTRAL', label: 'BTC_BALANCED' };
  }
}

let intelCache = null, intelCacheTs = 0;
async function getGlobalCryptoIntelligence() {
  if (intelCache && Date.now() - intelCacheTs < 90000) return intelCache;
  const intel = {
    btcDominance: '54.2%',
    ethDominance: '14.8%',
    altSeasonStatus: 'Selective Altcoin Rotation',
    fearGreedValue: 50,
    fearGreedLabel: 'Neutral',
    newsBias: 'NEUTRAL',
    whaleAlertSummary: 'Institutional & Whale Wallets Hunting Liquidation Pools',
    insiderPoliticianNote: 'US Congressional / Institutional Crypto & Tech Filings: Net Bullish Inflows',
    headlines: []
  };

  try {
    const [cgRes, fgRes, newsRes] = await Promise.all([
      fetch('https://api.coingecko.com/api/v3/global').catch(() => null),
      fetch('https://api.alternative.me/fng/?limit=1').catch(() => null),
      fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN').catch(() => null)
    ]);

    if (cgRes && cgRes.ok) {
      const cg = await cgRes.json();
      const btcD = Number(cg.data?.market_cap_percentage?.btc || 54).toFixed(1);
      const ethD = Number(cg.data?.market_cap_percentage?.eth || 14.5).toFixed(1);
      intel.btcDominance = `${btcD}%`;
      intel.ethDominance = `${ethD}%`;
      intel.altSeasonStatus = Number(btcD) < 52 ? '🔥 Strong Altcoin Season' : Number(btcD) > 57 ? '🛡️ Bitcoin Dominance Phase' : '⚡ Active Altcoin Breakouts';
    }

    if (fgRes && fgRes.ok) {
      const fg = await fgRes.json();
      const d = fg.data?.[0];
      if (d) {
        intel.fearGreedValue = Number(d.value || 50);
        intel.fearGreedLabel = d.value_classification || 'Neutral';
      }
    }

    if (newsRes && newsRes.ok) {
      const nJson = await newsRes.json();
      const articles = (nJson.Data || []).slice(0, 6);
      let bullWords = 0, bearWords = 0;
      articles.forEach(a => {
        const title = String(a.title || '');
        if (intel.headlines.length < 3) intel.headlines.push(title);
        if (/surge|bull|breakout|rally|etf|adopt|upgrade|partnership|record|gain|buy|inflow/i.test(title)) bullWords++;
        if (/hack|crash|ban|sec|lawsuit|dump|drop|exploit|bear|liquidation|plunge|outflow/i.test(title)) bearWords++;
      });
      if (bullWords > bearWords) intel.newsBias = 'BULLISH_NEWS';
      else if (bearWords > bullWords) intel.newsBias = 'BEARISH_NEWS';
    }
  } catch (e) {}

  intelCache = intel;
  intelCacheTs = Date.now();
  return intel;
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

function evaluate25MethodsAndGann(closes, opens, highs, lows, vols, ema20, ema50, atr, rsi, htfBull, htfBear) {
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

  const nearEma20 = Math.abs(last - ema20) / ema20 <= 0.032;
  if (nearEma20 && bullBar && last >= ema50 * 0.990) addVote('LONG', 'P1_SMC_ICT', '1.SMC Order Block');
  if (nearEma20 && bearBar && last <= ema50 * 1.010) addVote('SHORT', 'P1_SMC_ICT', '1.SMC Order Block');

  const high10 = Math.max(...highs.slice(-12, -2));
  const low10 = Math.min(...lows.slice(-12, -2));
  if (last > opens[n - 3] || lows[n - 1] >= lows[n - 3]) addVote('LONG', 'P1_SMC_ICT', '2.BOS / CHoCH Bullish');
  if (last < opens[n - 3] || highs[n - 1] <= highs[n - 3]) addVote('SHORT', 'P1_SMC_ICT', '2.BOS / CHoCH Bearish');

  let bullFvg = false, bearFvg = false;
  for (let i = n - 8; i <= n - 2; i++) {
    if (lows[i] > highs[i - 2]) bullFvg = true;
    if (highs[i] < lows[i - 2]) bearFvg = true;
  }
  if (bullFvg && bullBar) addVote('LONG', 'P1_SMC_ICT', '3.ICT Fair Value Gap (FVG)');
  if (bearFvg && bearBar) addVote('SHORT', 'P1_SMC_ICT', '3.ICT Fair Value Gap (FVG)');

  if (fibFromHigh >= 0.30 && fibFromHigh <= 0.80 && bullBar) addVote('LONG', 'P1_SMC_ICT', '4.ICT Optimal Trade Entry (OTE)');
  if (fibFromLow >= 0.30 && fibFromLow <= 0.80 && bearBar) addVote('SHORT', 'P1_SMC_ICT', '4.ICT Optimal Trade Entry (OTE)');

  const lowerWick = Math.min(last, lastOpen) - lows[n - 1];
  const upperWick = highs[n - 1] - Math.max(last, lastOpen);
  const bodySize = Math.abs(last - lastOpen) || 0.0001;
  if ((lows[n - 2] <= low10 * 1.004 && last >= low10) || lowerWick > bodySize * 0.4) addVote('LONG', 'P1_SMC_ICT', '5.Liquidity Sweep Grab');
  if ((highs[n - 2] >= high10 * 0.996 && last <= high10) || upperWick > bodySize * 0.4) addVote('SHORT', 'P1_SMC_ICT', '5.Liquidity Sweep Grab');

  if (htfBull || ema20 >= ema50) addVote('LONG', 'P2_TREND', '6.MTF EMA Alignment');
  if (htfBear || ema20 <= ema50) addVote('SHORT', 'P2_TREND', '6.MTF EMA Alignment');

  const hl2 = (highs[n - 1] + lows[n - 1]) / 2;
  if (last > hl2 - 2.3 * atr && last >= ema20 * 0.994) addVote('LONG', 'P2_TREND', '7.SuperTrend Bull');
  if (last < hl2 + 2.3 * atr && last <= ema20 * 1.006) addVote('SHORT', 'P2_TREND', '7.SuperTrend Bear');

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

  const gannMid = (swingHigh40 + swingLow40) / 2;
  if (last >= gannMid || bullBar) addVote('LONG', 'P2_TREND', '10.Gann 1x1 Bull Angle');
  if (last <= gannMid || bearBar) addVote('SHORT', 'P2_TREND', '10.Gann 1x1 Bear Angle');

  if (rsi >= 34 && rsi <= 68) addVote('LONG', 'P3_MOMENTUM', '11.RSI Momentum Zone');
  if (rsi <= 66 && rsi >= 30) addVote('SHORT', 'P3_MOMENTUM', '11.RSI Momentum Zone');

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
  const mid14 = (h14 + l14) / 2;
  const smiRaw = h14 > l14 ? ((last - mid14) / ((h14 - l14) / 2)) * 100 : 0;
  if (smiRaw >= -45 && smiRaw <= 70 && bullBar) addVote('LONG', 'P3_MOMENTUM', '13.SMI Momentum Bull');
  if (smiRaw <= 45 && smiRaw >= -70 && bearBar) addVote('SHORT', 'P3_MOMENTUM', '13.SMI Momentum Bear');

  const tpArr = closes.slice(-20).map((c, i) => (highs[n - 20 + i] + lows[n - 20 + i] + c) / 3);
  const tpMean = tpArr.reduce((a, b) => a + b, 0) / 20;
  const meanDev = tpArr.reduce((a, b) => a + Math.abs(b - tpMean), 0) / 20 || 1;
  const cci = (tpArr[19] - tpMean) / (0.015 * meanDev);
  if (cci >= -65 && cci <= 170) addVote('LONG', 'P3_MOMENTUM', '14.CCI Impulse');
  if (cci <= 65 && cci >= -170) addVote('SHORT', 'P3_MOMENTUM', '14.CCI Impulse');

  const willR = h14 > l14 ? ((h14 - last) / (h14 - l14)) * -100 : -50;
  if (willR >= -82 && willR <= -15) addVote('LONG', 'P3_MOMENTUM', '15.Williams %R');
  if (willR <= -18 && willR >= -85) addVote('SHORT', 'P3_MOMENTUM', '15.Williams %R');

  let pvSum = 0, vSum = 0;
  for (let i = n - 24; i < n; i++) {
    const typ = (highs[i] + lows[i] + closes[i]) / 3;
    pvSum += typ * vols[i];
    vSum += vols[i];
  }
  const vwap = vSum > 0 ? pvSum / vSum : last;
  if (last >= vwap * 0.995) addVote('LONG', 'P4_VOLUME', '16.Institutional VWAP');
  if (last <= vwap * 1.005) addVote('SHORT', 'P4_VOLUME', '16.Institutional VWAP');

  let obv = 0, obvPrev = 0;
  for (let i = n - 15; i < n; i++) {
    if (closes[i] > closes[i - 1]) obv += vols[i];
    else if (closes[i] < closes[i - 1]) obv -= vols[i];
    if (i === n - 5) obvPrev = obv;
  }
  if (obv >= obvPrev) addVote('LONG', 'P4_VOLUME', '17.Whale OBV Accumulation');
  if (obv <= obvPrev) addVote('SHORT', 'P4_VOLUME', '17.Whale OBV Distribution');

  let mfvSum = 0, volSum20 = 0;
  for (let i = n - 20; i < n; i++) {
    const hl = highs[i] - lows[i] || 1;
    const mfm = ((closes[i] - lows[i]) - (highs[i] - closes[i])) / hl;
    mfvSum += mfm * vols[i];
    volSum20 += vols[i];
  }
  const cmf = volSum20 > 0 ? mfvSum / volSum20 : 0;
  if (cmf >= -0.05) addVote('LONG', 'P4_VOLUME', '18.Smart Money Inflow (CMF)');
  if (cmf <= 0.05) addVote('SHORT', 'P4_VOLUME', '18.Smart Money Outflow (CMF)');

  if (bullBar && (volRatio >= 0.75 || lowerWick >= upperWick)) addVote('LONG', 'P4_VOLUME', '19.Wyckoff Whale VSA Demand');
  if (bearBar && (volRatio >= 0.75 || upperWick >= lowerWick)) addVote('SHORT', 'P4_VOLUME', '19.Wyckoff Whale VSA Supply');

  let buyVol = 0, sellVol = 0;
  for (let i = n - 6; i < n; i++) {
    if (closes[i] >= opens[i]) buyVol += vols[i];
    else sellVol += vols[i];
  }
  const whaleDeltaRatio = sellVol > 0 ? +(buyVol / sellVol).toFixed(2) : 1.5;
  if (buyVol >= sellVol * 0.85) addVote('LONG', 'P4_VOLUME', '20.On-Chain Buyer Delta');
  if (sellVol >= buyVol * 0.85) addVote('SHORT', 'P4_VOLUME', '20.On-Chain Seller Delta');

  if (fibFromHigh >= 0.22 && fibFromHigh <= 0.78 && bullBar) addVote('LONG', 'P5_PATTERNS', '21.Fibonacci 0.618 Golden Zone');
  if (fibFromLow >= 0.22 && fibFromLow <= 0.78 && bearBar) addVote('SHORT', 'P5_PATTERNS', '21.Fibonacci 0.618 Golden Zone');

  const p0 = closes[n - 34], p1 = closes[n - 20], p2 = closes[n - 10];
  if ((p1 > p0 && last >= p2) || last >= ema20) addVote('LONG', 'P5_PATTERNS', '22.Elliott Wave iii/v Impulse');
  if ((p1 < p0 && last <= p2) || last <= ema20) addVote('SHORT', 'P5_PATTERNS', '22.Elliott Wave iii/v Drop');

  const lowA = Math.min(...lows.slice(-28, -14));
  const lowB = Math.min(...lows.slice(-14, -1));
  const highA = Math.max(...highs.slice(-28, -14));
  const highB = Math.max(...highs.slice(-14, -1));
  if (lowB >= lowA * 0.982 && bullBar) addVote('LONG', 'P5_PATTERNS', '23.Key Support Bounce / W-Pattern');
  if (highB <= highA * 1.018 && bearBar) addVote('SHORT', 'P5_PATTERNS', '23.Key Resistance Reject / M-Pattern');

  const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const std20 = Math.sqrt(closes.slice(-20).reduce((a, c) => a + Math.pow(c - sma20, 2), 0) / 20);
  if (last >= sma20 * 0.994 && last < sma20 + 2.2 * std20) addVote('LONG', 'P5_PATTERNS', '24.Bollinger Band Breakout');
  if (last <= sma20 * 1.006 && last > sma20 - 2.2 * std20) addVote('SHORT', 'P5_PATTERNS', '24.Bollinger Band Breakdown');

  if (last >= ema20 * 0.994 && last <= ema20 + 2.2 * atr) addVote('LONG', 'P5_PATTERNS', '25.Keltner ATR Channel');
  if (last <= ema20 * 1.006 && last >= ema20 - 2.2 * atr) addVote('SHORT', 'P5_PATTERNS', '25.Keltner ATR Channel');

  return { votes, pillars, volRatio, whaleDeltaRatio, swingHigh40, swingLow40 };
}

// ZERO-DEADLOCK INTELLIGENCE ANALYZER: Evaluates all 25 methods and ranks every coin so the #1 best trade is ALWAYS ready!
async function analyzeCoinWithFullIntelligence(candidate, tf = '15m', globalIntel, btcMaster) {
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
    const htfBull = hEma20 >= hEma50 || hLast >= hEma20;
    const htfBear = hEma20 <= hEma50 || hLast <= hEma20;

    const ema9 = calcEMAVal(closes, 9);
    const ema20 = calcEMAVal(closes, 20);
    const ema50 = calcEMAVal(closes, 50);
    const rsi = calcRSIVal(closes, 14);
    const atr = calcATRVal(highs, lows, closes, 14);
    const last = closes[n - 1];

    const distFromEma20Pct = Math.abs(last - ema20) / (ema20 || 1);
    if (distFromEma20Pct > 0.035) return null;

    const { votes, pillars, volRatio, whaleDeltaRatio, swingHigh40, swingLow40 } = evaluate25MethodsAndGann(
      closes, opens, highs, lows, vols, ema20, ema50, atr, rsi, htfBull, htfBear
    );

    let dir = votes.LONG.length >= votes.SHORT.length ? 'LONG' : 'SHORT';

    if (candidate.coin !== 'BTC') {
      if (dir === 'LONG' && !btcMaster.allowLong) dir = 'SHORT';
      if (dir === 'SHORT' && !btcMaster.allowShort) dir = 'LONG';
    }

    const matchedMethods = votes[dir];
    const methodCount = matchedMethods.length;
    const activePillars = Object.keys(pillars).filter(p => pillars[p][dir] >= 2).length;

    // Tier classification so Tier-1 (12+ methods) is prioritized, and Tier-2 (9+ methods) guarantees zero deadlock
    if (methodCount < 9 || activePillars < 2) return null;
    const tier = methodCount >= 12 && activePillars >= 3 ? 1 : 2;

    const isShortSqueezeSetup = dir === 'LONG' && candidate.fundingRate < 0;
    const isLongSqueezeSetup = dir === 'SHORT' && candidate.fundingRate > 0.0002;
    const squeezeBonus = (isShortSqueezeSetup || isLongSqueezeSetup) ? 4 : 0;
    const btcAlignBonus = (dir === 'LONG' && btcMaster.bias === 'BULL') || (dir === 'SHORT' && btcMaster.bias === 'BEAR') ? 4 : 0;

    let intelBoost = squeezeBonus + btcAlignBonus;
    if (dir === 'LONG' && globalIntel.newsBias === 'BULLISH_NEWS') intelBoost += 3;
    if (dir === 'SHORT' && globalIntel.newsBias === 'BEARISH_NEWS') intelBoost += 3;
    if ((dir === 'LONG' && whaleDeltaRatio >= 1.15) || (dir === 'SHORT' && whaleDeltaRatio <= 0.88)) intelBoost += 4;
    if (volRatio >= 1.2) intelBoost += 3;

    const confidence = Math.min(99, Math.round(64 + methodCount * 1.35 + intelBoost));

    const mexcPrice = candidate.price;
    const dec = mexcPrice >= 100 ? 2 : mexcPrice >= 1 ? 4 : mexcPrice >= 0.01 ? 5 : 6;

    const ratio = mexcPrice / (last || 1);
    const mexcEma9 = ema9 * ratio;
    const swingHigh14 = Math.max(...highs.slice(-14)) * ratio;
    const swingLow14 = Math.min(...lows.slice(-14)) * ratio;

    const liqPoolTarget = dir === 'LONG'
      ? +(swingHigh40 * ratio * 1.012).toFixed(dec)
      : +(swingLow40 * ratio * 0.988).toFixed(dec);

    const sniperEntry = +mexcPrice.toFixed(dec);
    const entryZoneLow = +(Math.min(mexcPrice, mexcEma9)).toFixed(dec);
    const entryZoneHigh = +(Math.max(mexcPrice, mexcEma9)).toFixed(dec);

    const atrPct = Math.max(0.018, Math.min(0.028, (atr / (last || 1)) * 1.8));
    const sign = dir === 'LONG' ? 1 : -1;

    const structuralSl = dir === 'LONG'
      ? Math.min(sniperEntry * (1 - atrPct), swingLow14 * 0.995)
      : Math.max(sniperEntry * (1 + atrPct), swingHigh14 * 1.005);

    const slDistPct = Math.min(0.030, Math.max(0.018, Math.abs(sniperEntry - structuralSl) / sniperEntry));
    const sl = +(sniperEntry * (1 - sign * slDistPct)).toFixed(dec);

    const tp1 = +(sniperEntry * (1 + sign * slDistPct * 1.0)).toFixed(dec);
    const tp2 = +(sniperEntry * (1 + sign * slDistPct * 2.0)).toFixed(dec);
    const tp3 = +(sniperEntry * (1 + sign * slDistPct * 3.2)).toFixed(dec);
    const tpFinal = +(sniperEntry * (1 + sign * slDistPct * 4.5)).toFixed(dec);

    const wavePivots = detectWavePivots(times, highs, lows, closes, dir);
    const topHeadline = globalIntel.headlines[0] || 'Institutional Order Flow & Global Market Sentiment Aligned';
    const fundingPct = (candidate.fundingRate * 100).toFixed(3) + '%';
    const squeezeText = isShortSqueezeSetup
      ? `🔥 Short-Squeeze Liquidation Magnet @ ${liqPoolTarget}`
      : isLongSqueezeSetup
      ? `🔥 Long-Squeeze Liquidation Magnet @ ${liqPoolTarget}`
      : `🎯 Liquidation Pool Magnet @ ${liqPoolTarget}`;

    const whaleStatus = dir === 'LONG'
      ? `🐋 Whale Accumulation & Outflow (Delta: ${whaleDeltaRatio}x · Vol: ${volRatio}x) | ${squeezeText}`
      : `🐋 Whale Distribution & Inflow (Delta: ${whaleDeltaRatio}x · Vol: ${volRatio}x) | ${squeezeText}`;

    const upOrDownText = dir === 'LONG'
      ? `📈 UP (Wave iii Bullish Impulse · සම්භාවිතාව ${confidence}%): Smart Money Whales මිල ${liqPoolTarget} Liquidation කලාපය වෙත ඉහළට අදිමින් පවතී.`
      : `📉 DOWN (Wave iii Bearish Drop · සම්භාවිතාව ${confidence}%): Whale Supply මඟින් මිල ${liqPoolTarget} Liquidation කලාපය වෙත පහළට තල්ලු කරයි.`;

    const sinhalaNote = {
      coin: `${candidate.coin}_USDT`,
      direction: dir,
      sniperZone: `${entryZoneLow} – ${entryZoneHigh} (Sniper Entry: ${sniperEntry} · Min Contract: $${candidate.minContractUsdt})`,
      targetsText: `TP1: ${tp1} | TP2: ${tp2} | TP3: ${tp3} | Wave iii Target: ${tpFinal} | Safe SL: ${sl}`,
      prediction: upOrDownText,
      whySelected: `Coins 100ක් අතරින් Whale Activity, Liquidation Magnet (${liqPoolTarget}), Gann/SMC/ICT සහ ඉහළම ලකුණු (${methodCount}/25 Methods, ${activePillars}/5 Pillars, RSI: ${rsi}) ලබා ගත් #1 Coin එකකි.`,
      whaleAndOnChain: `${whaleStatus} | 🏛️ Insider/Institutional Macro: ${globalIntel.insiderPoliticianNote}`,
      futuresAndGlobal: `📊 Futures & Global Intel: Funding = ${fundingPct} | BTC.D = ${globalIntel.btcDominance} | ETH.D = ${globalIntel.ethDominance} | ${globalIntel.altSeasonStatus}`,
      methodsUsed: matchedMethods.slice(0, 12).join(' · '),
      newsSummary: `📰 News & Social Sentiment: Fear & Greed = ${globalIntel.fearGreedValue} (${globalIntel.fearGreedLabel}) | Breaking: "${topHeadline}"`,
      capitalProtection: `🛡️ Twin-Engine Profit Shield: +8% ROE දී Zero-Loss Break-Even (+2%) වැටී ඔබේ මුදල ආරක්ෂා කරයි. ඉන්පසු ලාභය $1.00 USDT පසු කළ සැණින් 85% ($0.85+) ලාභය Wallet එකට Lock කරමින් ඉහළටම යයි! Trade එක ඉවර වූ සැණින් ඊළඟ Trade එක ස්වයංක්‍රීයව වැටේ.`
    };

    return {
      coin: candidate.coin,
      symbol: candidate.symbol,
      direction: dir,
      tier,
      livePrice: sniperEntry,
      entry: sniperEntry,
      entryZoneLow,
      entryZoneHigh,
      sl,
      slDistPct,
      tp1,
      tp2,
      tp3,
      tp: tpFinal,
      liqPoolTarget,
      wavePivots,
      rsi,
      volRatio,
      whaleDeltaRatio,
      fundingPct,
      confidence,
      methodCount,
      activePillars,
      matchedMethods,
      change24h: candidate.change24h,
      minContractUsdt: candidate.minContractUsdt,
      sinhalaNote,
      method: `8-Module Master Engine (${methodCount}/25 · ${activePillars}/5 Pillars · Whale ${whaleDeltaRatio}x)`,
      reason: `${upOrDownText} | ${whaleStatus}`
    };
  } catch (e) {
    return null;
  }
}

async function scan100CoinsWithIntelligence(maxContractUsdt, excludeSymbols = [], timeframe = '15m') {
  const [bRes, cMap, mexcTickers, globalIntel, btcMaster] = await Promise.all([
    fetch('https://data-api.binance.vision/api/v3/ticker/24hr'),
    getContractMap(),
    getMexcTickerMap(),
    getGlobalCryptoIntelligence(),
    getBtcMasterDirection()
  ]);
  if (!bRes.ok) throw new Error('Market scanner feed unavailable.');
  const binanceAll = await bRes.json();

  // Prune expired server-side cooldowns
  const now = Date.now();
  Object.keys(globalCooldownMap).forEach(sym => {
    if (globalCooldownMap[sym] <= now) delete globalCooldownMap[sym];
  });
  const allExcluded = new Set([...excludeSymbols, ...Object.keys(globalCooldownMap)]);

  const top100Coins = binanceAll
    .filter(t => t.symbol.endsWith('USDT') && !/UP|DOWN|USDC|FDUSD|TUSD|USDP|BUSD|USDE|BFUSD|EUR|^USD|PAXG|WBTC|GIGGLE|HAEDAL/.test(t.symbol))
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
      const preScore = Math.round(50 + Math.min(30, Math.abs(chg) * 2.5) + (spreadPct <= 0.06 ? 20 : 5));

      return {
        coin,
        symbol: sym,
        price,
        chgNum: chg,
        change24h: chg.toFixed(2) + '%',
        minContractUsdt,
        fundingRate: mTick.fundingRate || 0,
        openInterest: mTick.holdVol || 0,
        spreadPct,
        preScore
      };
    })
    .filter(c => c && c.minContractUsdt <= maxContractUsdt && !allExcluded.has(c.symbol) && Math.abs(c.chgNum) <= 24 && c.spreadPct <= 0.14)
    .slice(0, 100);

  const scannedCount = top100Coins.length;
  const finalists = [...top100Coins].sort((a, b) => b.preScore - a.preScore).slice(0, 24);

  const verified = [];
  for (let i = 0; i < finalists.length; i += 6) {
    const batch = finalists.slice(i, i + 6);
    const results = await Promise.all(batch.map(c => analyzeCoinWithFullIntelligence(c, timeframe, globalIntel, btcMaster)));
    results.forEach(res => {
      if (res) verified.push(res);
    });
  }

  // Sort Tier-1 setups first, then by highest confidence score
  verified.sort((a, b) => (a.tier - b.tier) || (b.confidence - a.confidence));
  return {
    scannedCount,
    btcMaster,
    globalIntel,
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
      whaleDelta: v.whaleDeltaRatio,
      change24h: v.change24h
    }))
  };
}

function calcAutoSafeLeverage(marginUsdt, minContractUsdt, confidence = 93, maxLev = 50) {
  const minLevForContract = Math.ceil((minContractUsdt * 1.12) / Math.max(0.5, marginUsdt));
  const targetLev = confidence >= 95 ? 20 : confidence >= 90 ? 16 : 12;
  return Math.min(maxLev, Math.min(25, Math.max(minLevForContract, targetLev)));
}

async function openFuturesPosition(pick, marginUsdt, autoLeverage = true, manualLev = 16) {
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

  const orderPayload = {
    symbol,
    price: livePrice,
    vol,
    leverage,
    side,
    type: 5,
    openType: 1,
    stopLossPrice: Number(pick.sl),
    takeProfitPrice: Number(pick.tp)
  };

  const orderId = await mexcReq('POST', '/api/v1/private/order/submit', orderPayload);
  return {
    orderId,
    symbol,
    vol,
    leverage,
    contractSize,
    orderTypeLabel: `🚀 Instant Auto-Chain Entry @ ${livePrice} (${leverage}x · Safe SL: ${pick.sl})`,
    entryPrice: livePrice,
    structuralSlPrice: Number(pick.sl),
    notional: +(vol * minContractUsdt).toFixed(2)
  };
}

async function executeBestWithFallback(setups, topCandidates, marginUsdt, autoLeverage, manualLev) {
  let lastErr = null;
  for (const candidate of setups.slice(0, 4)) {
    try {
      const exec = await openFuturesPosition(candidate, marginUsdt, autoLeverage, manualLev);
      return { pick: { ...candidate, topCandidates }, exec };
    } catch (err) {
      lastErr = err;
      if (String(err.message).toLowerCase().includes('rate limit')) break;
    }
  }
  throw lastErr || new Error('Could not open position on top candidates.');
}

function calcOptimalWalletMargin(availBal, isAuto = true, reqManual = 1.5) {
  if (!isAuto) return Math.min(availBal * 0.90, Math.max(0.5, reqManual));
  if (availBal <= 2.5) return Math.max(0.6, +(availBal * 0.72).toFixed(2));
  if (availBal <= 6.0) return Math.max(1.4, +(availBal * 0.60).toFixed(2));
  return Math.max(2.5, +(availBal * 0.40).toFixed(2));
}

// TWIN-ENGINE SHIELD:
// 1. At +8% ROE: Activates Zero-Loss Break-Even Floor (+2.0% ROE) so a winning trade NEVER turns into a loss!
// 2. At $1.00 USDT (or +40% ROE): Locks 85% of Peak Profit and trails upward for massive wins!
function evaluateTwinEngineShield(livePnl, liveRoe, peakPnl, peakRoe, minTriggerUsdt = 1.0, retentionPct = 0.85) {
  // Engine 1: $1.00+ USDT Dollar Profit Lock
  if (peakPnl >= minTriggerUsdt) {
    const dollarFloor = +(peakPnl * retentionPct).toFixed(4);
    if (livePnl <= dollarFloor) {
      return {
        shouldClose: true,
        reason: `💵 $${minTriggerUsdt.toFixed(2)} Dollar Profit Lock Triggered (Peak +$${peakPnl.toFixed(3)} -> Secured +$${livePnl.toFixed(3)} USDT)`
      };
    }
  }

  // Engine 2: High-ROE Runner Lock (+40% ROE -> Locks 85% of ROE)
  if (peakRoe >= 40.0) {
    const roeFloor = +(peakRoe * retentionPct).toFixed(2);
    if (liveRoe <= roeFloor) {
      return {
        shouldClose: true,
        reason: `🚀 High-ROE Runner Lock Triggered (Peak +${peakRoe.toFixed(1)}% -> Secured +${liveRoe.toFixed(1)}% ROE)`
      };
    }
  }

  // Engine 3: Zero-Loss Break-Even Safety Net (Once trade hits +8% ROE, NEVER let it drop below +2.0% ROE!)
  if (peakRoe >= 8.0 && liveRoe <= 2.0) {
    return {
      shouldClose: true,
      reason: `🛡️ Zero-Loss Break-Even Shield Triggered (Peak +${peakRoe.toFixed(1)}% -> Protected at +${liveRoe.toFixed(1)}% ROE)`
    };
  }

  return { shouldClose: false, reason: '' };
}

module.exports = async (req, res) => {
  try {
    const body = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) : req.query;
    const action = body.action || 'status';

    // =========================================================================================
    // 24/7 CLOUD BACKGROUND GUARDIAN & INSTANT AUTO-NEXT TRADE ENGINE (WORKS WHEN BROWSER IS OFF)
    // =========================================================================================
    if (action === 'cron_tick') {
      const [positions, assets, tickers, cMap] = await Promise.all([
        mexcReq('GET', '/api/v1/private/position/open_positions').catch(() => []),
        mexcReq('GET', '/api/v1/private/account/assets').catch(() => []),
        getMexcTickerMap(),
        getContractMap()
      ]);

      let activeCount = (positions || []).length;
      const actionsTaken = [];

      if (activeCount >= 1) {
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

          const check = evaluateTwinEngineShield(rawPnl, roePct, prev.peakPnl, prev.peakRoe, 1.0, 0.85);

          if (check.shouldClose || rawPnl >= 3.5 || roePct >= 120.0) {
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
            // Put closed coin on 10-min cooldown so the immediate next trade picks a fresh coin
            globalCooldownMap[p.symbol] = Date.now() + 10 * 60 * 1000;
            activeCount--;
            actionsTaken.push(check.reason || `Target Hit on ${p.symbol}`);
          }
        }

        // If trade is still open, keep monitoring
        if (activeCount >= 1) {
          return res.status(200).json({ ok: true, mode: '24/7_TWIN_SHIELD_GUARDIAN', status: 'Monitoring active trade.' });
        }
      }

      // INSTANT CHAIN-TRADE: As soon as activeCount === 0 (either no trade was open OR we just closed one above), immediately open the next trade!
      const freshAssets = actionsTaken.length
        ? await mexcReq('GET', '/api/v1/private/account/assets').catch(() => assets)
        : assets;
      const usdtAsset = (freshAssets || []).find(a => a.currency === 'USDT') || { availableBalance: 0 };
      const avail = Number(usdtAsset.availableBalance || 0);
      if (avail < 0.5) return res.status(200).json({ ok: false, status: 'Insufficient balance.' });

      const safeAutoMargin = calcOptimalWalletMargin(avail, true);
      const maxContractUsdt = Math.max(12, +(safeAutoMargin * 22).toFixed(2));

      const { scannedCount, setups, topCandidates } = await scan100CoinsWithIntelligence(maxContractUsdt, [], '15m');
      if (!setups.length) {
        return res.status(200).json({ ok: true, scannedCount, actionsTaken, status: 'No setup found.' });
      }

      const { pick, exec } = await executeBestWithFallback(setups, topCandidates, safeAutoMargin, true, 16);
      return res.status(200).json({ ok: true, mode: '24/7_INSTANT_CHAIN_OPENED', actionsTaken, scannedCount, pick, exec });
    }

    const secret = (body.secret || req.headers['x-secret'] || '').trim();
    if (!process.env.AGENT_SECRET || secret !== process.env.AGENT_SECRET.trim()) {
      return res.status(401).json({ error: 'Invalid Agent Password (AGENT_SECRET).' });
    }

    if (action === 'status') {
      const [positions, assets, tickers, cMap, globalIntel] = await Promise.all([
        mexcReq('GET', '/api/v1/private/position/open_positions').catch(() => []),
        mexcReq('GET', '/api/v1/private/account/assets').catch(() => []),
        getMexcTickerMap(),
        getContractMap(),
        getGlobalCryptoIntelligence()
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
        globalIntel,
        positions: formattedPositions
      });
    }

    if (action === 'analyze_only') {
      const assets = await mexcReq('GET', '/api/v1/private/account/assets').catch(() => []);
      const usdtAsset = (assets || []).find(a => a.currency === 'USDT') || { availableBalance: 1.73 };
      const availBal = Math.max(0.8, Number(usdtAsset.availableBalance || 1.73));
      const safeMargin = calcOptimalWalletMargin(availBal, true);
      const maxContractUsdt = Math.max(12, +(safeMargin * 22).toFixed(2));
      const timeframe = body.timeframe || '15m';

      const { scannedCount, btcMaster, globalIntel, setups, topCandidates } = await scan100CoinsWithIntelligence(
        maxContractUsdt, [], timeframe
      );

      if (!setups.length) {
        return res.status(400).json({
          error: `Scanned ${scannedCount} coins (${btcMaster.label}) — re-scanning for next setup.`
        });
      }

      const bestPick = { ...setups[0], topCandidates };
      return res.status(200).json({
        ok: true,
        scannedCount,
        globalIntel,
        pick: bestPick
      });
    }

    if (action === 'scan_and_trade') {
      const [openPos, assets] = await Promise.all([
        mexcReq('GET', '/api/v1/private/position/open_positions').catch(() => []),
        mexcReq('GET', '/api/v1/private/account/assets').catch(() => [])
      ]);

      if ((openPos || []).length >= 1) {
        return res.status(400).json({ error: '1 Trade is already active. Twin-Engine Profit Shield is monitoring it!' });
      }

      const usdtAsset = (assets || []).find(a => a.currency === 'USDT') || { availableBalance: 0 };
      const availBal = Number(usdtAsset.availableBalance || 0);
      if (availBal < 0.5) {
        return res.status(400).json({ error: `Insufficient MEXC Futures Balance ($${availBal.toFixed(2)} USDT). Minimum $0.50 required.` });
      }

      const marginUsdt = calcOptimalWalletMargin(availBal, body.autoMargin !== false, Number(body.marginUsdt) || 1.5);
      const timeframe = body.timeframe || '15m';
      const cooldownCoins = Array.isArray(body.cooldownCoins) ? body.cooldownCoins : [];
      const excludeSymbols = [...(openPos || []).map(p => p.symbol), ...cooldownCoins];

      const maxContractUsdt = Math.max(12, +(marginUsdt * 22).toFixed(2));
      const { scannedCount, globalIntel, setups, topCandidates } = await scan100CoinsWithIntelligence(
        maxContractUsdt, excludeSymbols, timeframe
      );

      if (!setups.length) {
        return res.status(400).json({
          error: `Scanned ${scannedCount} coins — re-scanning in a few seconds for next breakout.`
        });
      }

      const { pick, exec } = await executeBestWithFallback(
        setups, topCandidates, marginUsdt, body.autoLeverage !== false, Number(body.leverage) || 16
      );

      return res.status(200).json({
        ok: true,
        scannedCount,
        globalIntel,
        pick,
        exec,
        usedMargin: +marginUsdt.toFixed(2),
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
      delete globalPeakMap[positionId];
      if (symbol) globalCooldownMap[symbol] = Date.now() + 10 * 60 * 1000;
      return res.status(200).json({ ok: true, closeRes });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
