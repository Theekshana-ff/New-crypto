// File: ta-core.js

/**
 * Repainting වැළැක්වීම සඳහා දැනට හැදෙමින් පවතින (unclosed) අවසාන candle එක ඉවත් කරයි.
 */
export function getClosedCandles(candles) {
  if (!Array.isArray(candles) || candles.length < 2) return [];
  const last = candles[candles.length - 1];
  if (last.isClosed === false || last.isClosed === undefined) {
    return candles.slice(0, -1);
  }
  return candles;
}

/**
 * Exponential Moving Average (EMA) ගණනය කිරීම
 */
export function calculateEMA(rawCandles, period = 50) {
  const candles = getClosedCandles(rawCandles);
  if (candles.length < period) return null;

  const k = 2 / (period + 1);
  let ema = candles.slice(0, period).reduce((sum, c) => sum + Number(c.close), 0) / period;

  for (let i = period; i < candles.length; i++) {
    ema = Number(candles[i].close) * k + ema * (1 - k);
  }
  return ema;
}

/**
 * Simple Moving Average (SMA) ගණනය කිරීම
 */
export function calculateSMA(rawCandles, period = 20) {
  const candles = getClosedCandles(rawCandles);
  if (candles.length < period) return null;

  const slice = candles.slice(-period);
  const sum = slice.reduce((acc, c) => acc + Number(c.close), 0);
  return sum / period;
}

/**
 * Wilder's RSI ගණනය කිරීම (Closed candles මත පමණක්)
 */
export function calculateRSI(rawCandles, period = 14) {
  const candles = getClosedCandles(rawCandles);
  if (candles.length <= period) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = Number(candles[i].close) - Number(candles[i - 1].close);
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < candles.length; i++) {
    const diff = Number(candles[i].close) - Number(candles[i - 1].close);
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Average True Range (ATR) - Stop Loss සහ Volatility බැලීමට
 */
export function calculateATR(rawCandles, period = 14) {
  const candles = getClosedCandles(rawCandles);
  if (candles.length <= period) return null;

  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const high = Number(candles[i].high);
    const low = Number(candles[i].low);
    const prevClose = Number(candles[i - 1].close);

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trs.push(tr);
  }

  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}
