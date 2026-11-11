// File: strat-core.js
import { getClosedCandles, calculateRSI, calculateATR } from './ta-core.js';
import { getHTFBias } from './htf.js';
import { detectSMC } from './smc-core.js';

/**
 * Master Strategy Evaluation (HTF + SMC + RSI Confluence)
 * @param {Array} ltfRawCandles - Lower Timeframe candles (උදා: 15m හෝ 5m)
 * @param {Array} htfRawCandles - Higher Timeframe candles (උදා: 4h හෝ 1h)
 */
export function evaluateStrategy(ltfRawCandles, htfRawCandles = null) {
  const ltfCandles = getClosedCandles(ltfRawCandles);
  if (ltfCandles.length < 60) {
    return { signal: 'WAIT', reason: 'Insufficient closed candles' };
  }

  // HTF candles දී නැතිනම් LTF එකේම දිගු පරාසය භාවිතා කරයි
  const htfInfo = getHTFBias(htfRawCandles && htfRawCandles.length >= 55 ? htfRawCandles : ltfRawCandles);
  const htfBias = htfInfo.bias;

  const smc = detectSMC(ltfRawCandles);
  const rsi = calculateRSI(ltfRawCandles, 14);
  const atr = calculateATR(ltfRawCandles, 14) || smc.lastClose * 0.005;
  const currentPrice = smc.lastClose;

  // 1. Price එක Active (කැඩී නැති) Bullish හෝ Bearish SMC Zone එකක ඇත්දැයි පරීක්ෂාව
  const inBullishZone =
    smc.activeOBs.some(ob => ob.type === 'BULLISH' && currentPrice >= ob.bottom && currentPrice <= ob.top * 1.003) ||
    smc.activeFVGs.some(fvg => fvg.type === 'BULLISH' && currentPrice >= fvg.bottom && currentPrice <= fvg.top * 1.002);

  const inBearishZone =
    smc.activeOBs.some(ob => ob.type === 'BEARISH' && currentPrice <= ob.top && currentPrice >= ob.bottom * 0.997) ||
    smc.activeFVGs.some(fvg => fvg.type === 'BEARISH' && currentPrice <= fvg.top && currentPrice >= fvg.bottom * 0.998);

  // 2. LONG (BUY) Setup පරීක්ෂාව
  if (
    htfBias === 'BULLISH' &&
    (inBullishZone || smc.mss?.type === 'BULLISH_MSS') &&
    smc.structure !== 'BEARISH' &&
    rsi >= 30 && rsi <= 62
  ) {
    const validBullOB = smc.activeOBs.filter(o => o.type === 'BULLISH').pop();
    const stopLoss = validBullOB ? Math.min(validBullOB.bottom, currentPrice - atr * 1.5) : currentPrice - atr * 2;
    const risk = Math.max(currentPrice - stopLoss, atr * 0.5);

    return {
      signal: 'LONG',
      entry: Number(currentPrice.toFixed(4)),
      stopLoss: Number(stopLoss.toFixed(4)),
      takeProfit: Number((currentPrice + risk * 2.5).toFixed(4)),
      rr: 2.5,
      confidence: inBullishZone && smc.mss?.type === 'BULLISH_MSS' ? 'HIGH' : 'MEDIUM',
      htfBias,
      ltfStructure: smc.structure,
      rsi: Number(rsi.toFixed(2)),
      reasons: ['HTF Bullish Bias', 'Unmitigated Bullish SMC Zone / MSS', `RSI Confluence (${rsi.toFixed(1)})`]
    };
  }

  // 3. SHORT (SELL) Setup පරීක්ෂාව
  if (
    htfBias === 'BEARISH' &&
    (inBearishZone || smc.mss?.type === 'BEARISH_MSS') &&
    smc.structure !== 'BULLISH' &&
    rsi >= 38 && rsi <= 70
  ) {
    const validBearOB = smc.activeOBs.filter(o => o.type === 'BEARISH').pop();
    const stopLoss = validBearOB ? Math.max(validBearOB.top, currentPrice + atr * 1.5) : currentPrice + atr * 2;
    const risk = Math.max(stopLoss - currentPrice, atr * 0.5);

    return {
      signal: 'SHORT',
      entry: Number(currentPrice.toFixed(4)),
      stopLoss: Number(stopLoss.toFixed(4)),
      takeProfit: Number((currentPrice - risk * 2.5).toFixed(4)),
      rr: 2.5,
      confidence: inBearishZone && smc.mss?.type === 'BEARISH_MSS' ? 'HIGH' : 'MEDIUM',
      htfBias,
      ltfStructure: smc.structure,
      rsi: Number(rsi.toFixed(2)),
      reasons: ['HTF Bearish Bias', 'Unmitigated Bearish SMC Zone / MSS', `RSI Confluence (${rsi.toFixed(1)})`]
    };
  }

  return {
    signal: 'WAIT',
    htfBias,
    ltfStructure: smc.structure,
    rsi: Number(rsi.toFixed(2)),
    reason: 'Waiting for HTF + SMC + RSI alignment'
  };
}
