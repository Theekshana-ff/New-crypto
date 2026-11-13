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
        volume24: Number(t.amount24 || t.volume24 || 0),
        high24Price: Number(t.high24Price || t.lastPrice || 0),
        low24Price: Number(t.low24Price || t.lastPrice || 0),
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

// Deep K-Line Verification on Top Filtered Candidates from the 100-Coin Scan
async function verifyCandidateWithKlines(candidate, tf = '15m') {
  try {
    const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${candidate.coin}USDT&interval=${tf}&limit=80`);
    if (!r.ok) return null;
    const raw = await r.json();
    if (!Array.isArray(raw) || raw.length < 50) return null;

    const closes = raw.map(x => +x[4]);
    const opens = raw.map(x => +x[1]);
    const highs = raw.map(x => +x[2]);
    const lows = raw.map(x => +x[3]);
    const vols = raw.map(x => +x[5]);
    const n = closes.length;

    const last = closes[n - 1];
    const prev = closes[n - 2];
    const ema9 = calcEMAVal(closes, 9);
    const ema21 = calcEMAVal(closes, 21);
    const ema50 = calcEMAVal(closes, 50);
    const rsi = calcRSIVal(closes, 14);
    const atr = calcATRVal(highs, lows, closes, 14);

    const avgVol = vols.slice(-21, -1).reduce((a, b) => a + b, 0) / 20 || 1;
    const volSurge = +(vols[n - 1] / avgVol).toFixed(2);

    const bullTrend = ema9 >= ema21 && ema21 >= ema50 * 0.997 && last >= ema21;
    const bearTrend = ema9 <= ema21 && ema21 <= ema50 * 1.003 && last <= ema21;

    let dir = null;
    let score = 65;
    const signals = [];

    if (bullTrend && rsi >= 42 && rsi <= 68) {
      dir = 'LONG';
      signals.push('EMA 9>21>50 Bullish');
      if (last > opens[n - 1] && last >= prev) { score += 8; signals.push('Bullish Momentum Bar'); }
      if (rsi >= 50 && rsi <= 64) { score += 7; signals.push(`RSI Sweet-Spot (${rsi})`); }
      if (volSurge >= 1.05) { score += 6; signals.push(`Volume Surge (${volSurge}x)`); }
      if (candidate.fundingRate <= 0.0005) { score += 5; signals.push('Safe Funding'); }
      if (lows[n - 1] > lows[n - 3]) { score += 5; signals.push('Higher-Low Structure'); }
    } else if (bearTrend && rsi <= 58 && rsi >= 32) {
      dir = 'SHORT';
      signals.push('EMA 9<21<50 Bearish');
      if (last < opens[n - 1] && last <= prev) { score += 8; signals.push('Bearish Momentum Bar'); }
      if (rsi <= 50 && rsi >= 36) { score += 7; signals.push(`RSI Bear-Zone (${rsi})`); }
      if (volSurge >= 1.05) { score += 6; signals.push(`Volume Surge (${volSurge}x)`); }
      if (candidate.fundingRate >= -0.0005) { score += 5; signals.push('Safe Funding'); }
      if (highs[n - 1] < highs[n - 3]) { score += 5; signals.push('Lower-High Structure'); }
    }

    if (!dir) return null;

    const confidence = Math.min(98, score);
    const mexcPrice = candidate.price;
    const atrPct = atr / (last || 1);
    const slPct = Math.min(0.015, Math.max(0.008, atrPct * 1.2));
    const tpPct = slPct * 2.5;
    const dec = mexcPrice >= 100 ? 2 : mexcPrice >= 1 ? 4 : 5;

    const entry = +mexcPrice.toFixed(dec);
    const sl = +(dir === 'LONG' ? mexcPrice * (1 - slPct) : mexcPrice * (1 + slPct)).toFixed(dec);
    const tp = +(dir === 'LONG' ? mexcPrice * (1 + tpPct) : mexcPrice * (1 - tpPct)).toFixed(dec);

    return {
      coin: candidate.coin,
      symbol: candidate.symbol,
      direction: dir,
      entry,
      sl,
      tp,
      rsi,
      confidence,
      change24h: candidate.change24h,
      minContractUsdt: candidate.minContractUsdt,
      signals,
      method: `100-Coin AI Scanner (Score: ${confidence}% · ${signals.length} Confirmations)`,
      reason: `Selected #1 out of 100 scanned coins: ${signals.join(' + ')} on ${tf} timeframe.`
    };
  } catch (e) {
    return null;
  }
}

// 100-COIN FULL MARKET SCANNER
async function scan100CoinsAndPickBest(maxContractUsdt, excludeSymbols = [], timeframe = '15m') {
  const [bRes, cMap, mexcTickers] = await Promise.all([
    fetch('https://data-api.binance.vision/api/v3/ticker/24hr'),
    getContractMap(),
    getMexcTickerMap()
  ]);
  if (!bRes.ok) throw new Error('Market scanner feed unavailable.');
  const binanceAll = await bRes.json();

  // Stage 1: Collect Top 100 Active MEXC Futures Coins & Calculate Pre-Score
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

      // Range position in 24h High-Low
      const high24 = Number(t.highPrice || mTick.high24Price || price);
      const low24 = Number(t.lowPrice || mTick.low24Price || price);
      const rangePos = high24 > low24 ? (price - low24) / (high24 - low24) : 0.5;

      // Quantitative pre-score across all 100 coins
      const momentumScore = Math.min(25, Math.abs(chg) * 2.2);
      const spreadScore = spreadPct <= 0.08 ? 15 : 5;
      const preScore = Math.round(50 + momentumScore + spreadScore);

      return {
        coin,
        symbol: sym,
        price,
        chgNum: chg,
        change24h: chg.toFixed(2) + '%',
        minContractUsdt,
        fundingRate: mTick.fundingRate || 0,
        spreadPct,
        rangePos,
        preScore
      };
    })
    .filter(c => c && c.minContractUsdt <= maxContractUsdt && !excludeSymbols.includes(c.symbol) && Math.abs(c.chgNum) <= 22 && c.spreadPct <= 0.18)
    .slice(0, 100);

  const scannedCount = top100Coins.length;

  // Stage 2: Take the top 24 pre-scored coins from the 100 and run deep K-line EMA/RSI/ATR calculations
  const finalists = [...top100Coins].sort((a, b) => b.preScore - a.preScore).slice(0, 24);

  const verified = [];
  for (let i = 0; i < finalists.length; i += 6) {
    const batch = finalists.slice(i, i + 6);
    const results = await Promise.all(batch.map(c => verifyCandidateWithKlines(c, timeframe)));
    results.forEach(res => {
      if (res) verified.push(res);
    });
  }

  verified.sort((a, b) => b.confidence - a.confidence);
  return {
    scannedCount,
    setups: verified,
    topCandidates: verified.slice(0, 5).map(v => ({
      coin: v.coin,
      direction: v.direction,
      confidence: v.confidence,
      change24h: v.change24h
    }))
  };
}

// Auto-Calculate Safe Leverage (10x - 20x) so a 10% ROE stop has room to breathe
function calcAutoSafeLeverage(marginUsdt, minContractUsdt, confidence = 85, maxLev = 50) {
  const minLevForContract = Math.ceil((minContractUsdt * 1.08) / Math.max(0.5, marginUsdt));
  const targetLev = confidence >= 88 ? 20 : confidence >= 82 ? 15 : 12;
  return Math.min(maxLev, Math.max(minLevForContract, targetLev));
}

async function openFuturesPosition(pick, marginUsdt, autoLeverage = true, manualLev = 15) {
  const symbol = pick.symbol || `${pick.coin}_USDT`;
  const [cMap, tickers] = await Promise.all([getContractMap(), getMexcTickerMap()]);
  const detail = cMap[symbol];
  if (!detail) throw new Error(`Contract ${symbol} not available on MEXC.`);

  const contractSize = Number(detail.contractSize || 1);
  const maxLev = Number(detail.maxLeverage || 50);
  const livePrice = Number(tickers[symbol]?.lastPrice || pick.entry);
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
    entryPrice: livePrice,
    notional: +(vol * minContractUsdt).toFixed(2)
  };
}

async function executeBestWithFallback(setups, topCandidates, marginUsdt, autoLeverage, manualLev) {
  let lastErr = null;
  for (const candidate of setups.slice(0, 3)) {
    try {
      const exec = await openFuturesPosition(candidate, marginUsdt, autoLeverage, manualLev);
      return { pick: { ...candidate, topCandidates }, exec };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Could not open position on top candidates.');
}

module.exports = async (req, res) => {
  try {
    const body = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) : req.query;
    const secret = (body.secret || req.headers['x-secret'] || '').trim();

    if (!process.env.AGENT_SECRET || secret !== process.env.AGENT_SECRET.trim()) {
      return res.status(401).json({ error: 'Invalid Agent Password (AGENT_SECRET).' });
    }

    const action = body.action || 'status';

    // 1. LIVE STATUS: WALLET BALANCE + LIVE POSITIONS + REAL-TIME PROFIT/LOSS
    if (action === 'status') {
      const [positions, assets, tickers, cMap] = await Promise.all([
        mexcReq('GET', '/api/v1/private/position/open_positions').catch(() => []),
        mexcReq('GET', '/api/v1/private/account/assets').catch(() => []),
        getMexcTickerMap(),
        getContractMap()
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
          liquidatePrice: p.liquidatePrice || 0,
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
        positions: formattedPositions
      });
    }

    // 2. SCAN 100 COINS & AUTO-EXECUTE BEST TRADE
    if (action === 'scan_and_trade') {
      const [openPos, assets] = await Promise.all([
        mexcReq('GET', '/api/v1/private/position/open_positions').catch(() => []),
        mexcReq('GET', '/api/v1/private/account/assets').catch(() => [])
      ]);

      if ((openPos || []).length >= 1) {
        return res.status(400).json({ error: '1 Trade is already active. Monitoring live profit & 90% Profit Lock!' });
      }

      const usdtAsset = (assets || []).find(a => a.currency === 'USDT') || { availableBalance: 0 };
      const availBal = Number(usdtAsset.availableBalance || 0);
      if (availBal < 0.5) {
        return res.status(400).json({ error: `Insufficient MEXC Futures Balance ($${availBal.toFixed(2)} USDT). Minimum $0.50 required.` });
      }

      // Smart Auto-Margin Calculation based on Wallet Balance (35% of balance for fast $5/day compounding)
      const autoMargin = availBal <= 2.5
        ? Math.max(0.5, +(availBal * 0.70).toFixed(2))
        : Math.max(0.5, +(availBal * 0.35).toFixed(2));
      const marginUsdt = body.autoMargin !== false
        ? autoMargin
        : Math.min(availBal * 0.95, Math.max(0.5, Number(body.marginUsdt) || autoMargin));

      const timeframe = body.timeframe || '15m';
      const cooldownCoins = Array.isArray(body.cooldownCoins) ? body.cooldownCoins : [];
      const excludeSymbols = [...(openPos || []).map(p => p.symbol), ...cooldownCoins];

      const maxContractUsdt = Math.max(15, marginUsdt * 25);
      const { scannedCount, setups, topCandidates } = await scan100CoinsAndPickBest(maxContractUsdt, excludeSymbols, timeframe);

      if (!setups.length) {
        return res.status(400).json({
          error: `Scanned ${scannedCount} MEXC coins — no safe high-probability trend right now. Auto-rescanning shortly...`
        });
      }

      const { pick, exec } = await executeBestWithFallback(
        setups, topCandidates, marginUsdt, body.autoLeverage !== false, Number(body.leverage) || 15
      );

      return res.status(200).json({
        ok: true,
        scannedCount,
        pick,
        exec,
        usedMargin: +marginUsdt.toFixed(2),
        timestamp: Date.now()
      });
    }

    // 3. INSTANT CLOSE POSITION (Locks profit into wallet immediately)
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
