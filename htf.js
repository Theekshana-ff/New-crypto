// File: htf.js
import { getClosedCandles, calculateEMA } from './ta-core.js';

/**
 * Higher Timeframe (HTF) Trend Bias එක නිවැරදිව හඳුනා ගැනීම
 */
export function getHTFBias(htfRawCandles) {
  const candles = getClosedCandles(htfRawCandles);
  if (candles.length < 55) {
    return { bias: 'NEUTRAL', ema50: null, ema200: null, close: null };
  }

  const ema50 = calculateEMA(candles, 50);
  const ema200 = candles.length >= 200 ? calculateEMA(candles, 200) : calculateEMA(candles, 100);
  const lastClose = Number(candles[candles.length - 1].close);

  // අවසාන swing high / low පරීක්ෂාව
  const recent = candles.slice(-20);
  const highest = Math.max(...recent.map(c => Number(c.high)));
  const lowest = Math.min(...recent.map(c => Number(c.low)));
  const midPoint = (highest + lowest) / 2;

  let bias = 'NEUTRAL';
  if (lastClose > ema50 && (ema200 === null || ema50 >= ema200) && lastClose >= midPoint) {
    bias = 'BULLISH';
  } else if (lastClose < ema50 && (ema200 === null || ema50 <= ema200) && lastClose <= midPoint) {
    bias = 'BEARISH';
  }

  return {
    bias,
    ema50,
    ema200,
    close: lastClose,
    premiumZone: lastClose > midPoint,
    discountZone: lastClose <= midPoint
  };
}
