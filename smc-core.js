// File: smc-core.js
import { getClosedCandles } from './ta-core.js';

/**
 * SMC Engine: Swing High/Low, Active FVGs, Active Order Blocks, සහ BOS/MSS
 */
export function detectSMC(rawCandles, swingLength = 4) {
  const candles = getClosedCandles(rawCandles);
  if (candles.length < swingLength * 2 + 5) {
    return {
      activeFVGs: [],
      activeOBs: [],
      swingHighs: [],
      swingLows: [],
      structure: 'NEUTRAL',
      mss: null,
      lastClose: null
    };
  }

  const fvgs = [];
  const orderBlocks = [];
  const swingHighs = [];
  const swingLows = [];

  // 1. Confirmed Swing Highs & Lows (Repaint නොවන ලෙස දෙපසම පරීක්ෂා කෙරේ)
  for (let i = swingLength; i < candles.length - swingLength; i++) {
    let isHigh = true;
    let isLow = true;
    const currHigh = Number(candles[i].high);
    const currLow = Number(candles[i].low);

    for (let j = i - swingLength; j <= i + swingLength; j++) {
      if (i === j) continue;
      if (Number(candles[j].high) >= currHigh) isHigh = false;
      if (Number(candles[j].low) <= currLow) isLow = false;
    }

    if (isHigh) swingHighs.push({ index: i, price: currHigh, time: candles[i].time });
    if (isLow) swingLows.push({ index: i, price: currLow, time: candles[i].time });
  }

  // 2. Fair Value Gaps (FVG) හඳුනාගැනීම සහ Invalidation පරීක්ෂාව
  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c2 = candles[i - 1];
    const c3 = candles[i];

    const c1High = Number(c1.high), c1Low = Number(c1.low);
    const c2Open = Number(c2.open), c2Close = Number(c2.close);
    const c3High = Number(c3.high), c3Low = Number(c3.low);

    // Bullish FVG
    if (c3Low > c1High && c2Close > c2Open) {
      fvgs.push({
        type: 'BULLISH',
        top: c3Low,
        bottom: c1High,
        createdIndex: i,
        time: c2.time,
        mitigated: false,
        invalidated: false
      });
    }

    // Bearish FVG
    if (c3High < c1Low && c2Close < c2Open) {
      fvgs.push({
        type: 'BEARISH',
        top: c1Low,
        bottom: c3High,
        createdIndex: i,
        time: c2.time,
        mitigated: false,
        invalidated: false
      });
    }

    // පසුකාලීන candles මඟින් පරණ FVGs කඩා දමා (Invalidate) ඇත්දැයි බැලීම
    const currLow = Number(c3.low);
    const currHigh = Number(c3.high);
    const currClose = Number(c3.close);

    for (const fvg of fvgs) {
      if (fvg.createdIndex >= i || fvg.invalidated) continue;

      if (fvg.type === 'BULLISH') {
        if (currLow <= fvg.top) fvg.mitigated = true;
        if (currClose < fvg.bottom) fvg.invalidated = true; // Zone එක කැඩී ඇත
      } else if (fvg.type === 'BEARISH') {
        if (currHigh >= fvg.bottom) fvg.mitigated = true;
        if (currClose > fvg.top) fvg.invalidated = true; // Zone එක කැඩී ඇත
      }
    }
  }

  // 3. Order Blocks (OB) හඳුනාගැනීම සහ Invalidation පරීක්ෂාව
  for (let i = 2; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const next = candles[i + 1];

    // Bullish Order Block
    if (Number(prev.close) < Number(prev.open) &&
        Number(curr.close) > Number(curr.open) &&
        Number(next.close) > Number(prev.high)) {
      orderBlocks.push({
        type: 'BULLISH',
        top: Number(prev.high),
        bottom: Number(prev.low),
        createdIndex: i - 1,
        time: prev.time,
        invalidated: false
      });
    }

    // Bearish Order Block
    if (Number(prev.close) > Number(prev.open) &&
        Number(curr.close) < Number(curr.open) &&
        Number(next.close) < Number(prev.low)) {
      orderBlocks.push({
        type: 'BEARISH',
        top: Number(prev.high),
        bottom: Number(prev.low),
        createdIndex: i - 1,
        time: prev.time,
        invalidated: false
      });
    }
  }

  // කැඩී ගිය (Invalidated) Order Blocks ඉවත් කිරීම
  for (const ob of orderBlocks) {
    for (let j = ob.createdIndex + 2; j < candles.length; j++) {
      const closePrice = Number(candles[j].close);
      if (ob.type === 'BULLISH' && closePrice < ob.bottom) {
        ob.invalidated = true;
        break;
      }
      if (ob.type === 'BEARISH' && closePrice > ob.top) {
        ob.invalidated = true;
        break;
      }
    }
  }

  // 4. Market Structure Shift (MSS / BOS)
  const lastCandle = candles[candles.length - 1];
  const lastClose = Number(lastCandle.close);
  const lastSwingHigh = swingHighs[swingHighs.length - 1];
  const lastSwingLow = swingLows[swingLows.length - 1];

  let structure = 'NEUTRAL';
  let mss = null;

  if (lastSwingHigh && lastClose > lastSwingHigh.price) {
    structure = 'BULLISH';
    mss = { type: 'BULLISH_MSS', brokenLevel: lastSwingHigh.price, time: lastCandle.time };
  } else if (lastSwingLow && lastClose < lastSwingLow.price) {
    structure = 'BEARISH';
    mss = { type: 'BEARISH_MSS', brokenLevel: lastSwingLow.price, time: lastCandle.time };
  } else if (swingHighs.length >= 2 && swingLows.length >= 2) {
    const sh1 = swingHighs[swingHighs.length - 2].price;
    const sh2 = swingHighs[swingHighs.length - 1].price;
    const sl1 = swingLows[swingLows.length - 2].price;
    const sl2 = swingLows[swingLows.length - 1].price;

    if (sh2 > sh1 && sl2 > sl1) structure = 'BULLISH';
    else if (sh2 < sh1 && sl2 < sl1) structure = 'BEARISH';
  }

  return {
    activeFVGs: fvgs.filter(f => !f.invalidated).slice(-5),
    activeOBs: orderBlocks.filter(ob => !ob.invalidated).slice(-5),
    swingHighs,
    swingLows,
    structure,
    mss,
    lastClose
  };
}
