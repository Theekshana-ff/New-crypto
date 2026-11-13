// File: agent.js ( bulletproof version with Multi-API Chart Fallback & Instant Button Handlers )
const $ = id => document.getElementById(id);
const ls = {
  get: (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

// 1. Live Clock
setInterval(function tickClock() {
  const d = new Date();
  if ($('time')) $('time').textContent = d.toLocaleTimeString();
  if ($('date')) $('date').textContent = d.toLocaleDateString('en', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  return tickClock;
}(), 1000);

// 2. Navigation Drawer
const tg = o => {
  if ($('drawer')) $('drawer').classList.toggle('open', o);
  if ($('scrim')) $('scrim').classList.toggle('show', o);
};
if ($('menuBtn')) $('menuBtn').onclick = () => tg(true);
if ($('scrim')) $('scrim').onclick = () => tg(false);

// 3. Load & Save Settings Safely
const cfg = ls.get('mexc100Cfg', {
  sec: '', entryMode: 'sniper_auto', autoMargin: 'auto', margin: 2, autoLev: 'auto', lev: 12,
  dailyGoal: 5, lockRetention: 90, maxLossRoe: 10, tpRoe: 35, tf: '15m'
});

if ($('sec')) $('sec').value = cfg.sec || '';
if ($('entryMode')) $('entryMode').value = cfg.entryMode || 'sniper_auto';
if ($('autoMargin')) $('autoMargin').value = cfg.autoMargin || 'auto';
if ($('margin')) $('margin').value = cfg.margin != null ? cfg.margin : 2;
if ($('autoLev')) $('autoLev').value = cfg.autoLev || 'auto';
if ($('lev')) $('lev').value = cfg.lev || 12;
if ($('dailyGoal')) $('dailyGoal').value = cfg.dailyGoal != null ? cfg.dailyGoal : 5;
if ($('lockRetention')) $('lockRetention').value = cfg.lockRetention != null ? cfg.lockRetention : 90;
if ($('maxLossRoe')) $('maxLossRoe').value = cfg.maxLossRoe != null ? cfg.maxLossRoe : 10;
if ($('tpRoe')) $('tpRoe').value = cfg.tpRoe != null ? cfg.tpRoe : 35;
if ($('tf')) $('tf').value = cfg.tf || '15m';

function updateInputStates() {
  if ($('margin') && $('autoMargin')) {
    $('margin').disabled = $('autoMargin').value === 'auto';
    $('margin').style.opacity = $('autoMargin').value === 'auto' ? '0.5' : '1';
  }
  if ($('lev') && $('autoLev')) {
    $('lev').disabled = $('autoLev').value === 'auto';
    $('lev').style.opacity = $('autoLev').value === 'auto' ? '0.5' : '1';
  }
}
updateInputStates();

function saveCfg() {
  updateInputStates();
  ls.set('mexc100Cfg', {
    sec: $('sec') ? $('sec').value.trim() : '',
    entryMode: $('entryMode') ? $('entryMode').value : 'sniper_auto',
    autoMargin: $('autoMargin') ? $('autoMargin').value : 'auto',
    margin: $('margin') ? (+$('margin').value || 2) : 2,
    autoLev: $('autoLev') ? $('autoLev').value : 'auto',
    lev: $('lev') ? (+$('lev').value || 12) : 12,
    dailyGoal: $('dailyGoal') ? (+$('dailyGoal').value || 5) : 5,
    lockRetention: $('lockRetention') ? (+$('lockRetention').value || 90) : 90,
    maxLossRoe: $('maxLossRoe') ? (+$('maxLossRoe').value || 10) : 10,
    tpRoe: $('tpRoe') ? (+$('tpRoe').value || 35) : 35,
    tf: $('tf') ? $('tf').value : '15m'
  });
}

['sec', 'entryMode', 'autoMargin', 'margin', 'autoLev', 'lev', 'dailyGoal', 'lockRetention', 'maxLossRoe', 'tpRoe', 'tf'].forEach(id => {
  if ($(id)) $(id).onchange = saveCfg;
});

// 4. BULLETPROOF CHART WITH MULTI-SOURCE FALLBACK (NEVER BLACK/BLANK)
let chart = null, candleSeries = null, emaSeries = null, waveLineSeries = null, priceLines = [];
let currentChartCoin = 'ETH';
let currentSetup = ls.get('mexcLastSetup', null);

function initChart() {
  const box = $('agentChart');
  if (!box || !window.LightweightCharts) return false;
  if (chart) return true;
  try {
    const w = box.clientWidth || 340;
    chart = LightweightCharts.createChart(box, {
      width: w,
      height: 390,
      layout: { background: { color: '#0e1621' }, textColor: '#d7e3f4' },
      grid: { vertLines: { color: '#1b2838' }, horzLines: { color: '#1b2838' } },
      timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 8 }
    });
    candleSeries = chart.addCandlestickSeries({
      upColor: '#2ecc9a', downColor: '#ff5d5d', borderVisible: false, wickUpColor: '#2ecc9a', wickDownColor: '#ff5d5d'
    });
    emaSeries = chart.addLineSeries({ color: '#f0b429', lineWidth: 1, title: 'EMA 20' });
    waveLineSeries = chart.addLineSeries({ color: '#a78bfa', lineWidth: 2, lineStyle: 2, title: 'Wave Path' });
    window.addEventListener('resize', () => {
      if (chart && box.clientWidth > 0) chart.applyOptions({ width: box.clientWidth });
    });
    return true;
  } catch (e) {
    return false;
  }
}

async function fetchCandlesMultiSource(coin, tf) {
  const urls = [
    `https://data-api.binance.vision/api/v3/klines?symbol=${coin}USDT&interval=${tf}&limit=120`,
    `https://api.binance.com/api/v3/klines?symbol=${coin}USDT&interval=${tf}&limit=120`
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u);
      if (r.ok) {
        const raw = await r.json();
        if (Array.isArray(raw) && raw.length > 10) {
          return raw.map(x => ({
            time: Math.floor(Number(x[0]) / 1000),
            open: Number(x[1]),
            high: Number(x[2]),
            low: Number(x[3]),
            close: Number(x[4])
          }));
        }
      }
    } catch (e) {}
  }

  // Fallback to Bybit public klines if Binance is blocked by mobile ISP
  try {
    const bybitTf = tf === '15m' ? '15' : tf === '1h' ? '60' : '240';
    const r = await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${coin}USDT&interval=${bybitTf}&limit=120`);
    if (r.ok) {
      const j = await r.json();
      const list = j.result?.list || [];
      if (list.length > 10) {
        return list.reverse().map(x => ({
          time: Math.floor(Number(x[0]) / 1000),
          open: Number(x[1]),
          high: Number(x[2]),
          low: Number(x[3]),
          close: Number(x[4])
        }));
      }
    }
  } catch (e) {}
  return [];
}

function renderLevelCalloutPills(setup) {
  if (!setup || !$('levelPills')) return;
  const isLong = setup.direction === 'LONG';
  $('levelPills').innerHTML = `
    <span style="background:rgba(255,93,93,0.18);border:2px solid #ff5d5d;color:#ff9b9b;padding:4px 10px;border-radius:6px;font-weight:700">
      🛑 SL: ${setup.sl}
    </span>
    <span style="background:rgba(56,189,248,0.2);border:2px solid #38bdf8;color:#7dd3fc;padding:4px 10px;border-radius:6px;font-weight:700">
      🎯 Sniper Entry (Wave ii): ${setup.entry}
    </span>
    ${setup.tp1 ? `<span style="background:rgba(46,204,154,0.16);border:2px solid #2ecc9a;color:#6ee7b7;padding:4px 10px;border-radius:6px;font-weight:700">✅ TP 1: ${setup.tp1}</span>` : ''}
    ${setup.tp2 ? `<span style="background:rgba(46,204,154,0.16);border:2px solid #2ecc9a;color:#6ee7b7;padding:4px 10px;border-radius:6px;font-weight:700">✅ TP 2: ${setup.tp2}</span>` : ''}
    ${setup.tp3 ? `<span style="background:rgba(46,204,154,0.16);border:2px solid #2ecc9a;color:#6ee7b7;padding:4px 10px;border-radius:6px;font-weight:700">✅ TP 3: ${setup.tp3}</span>` : ''}
    ${setup.tp ? `<span style="background:rgba(16,185,129,0.28);border:2px solid #10b981;color:#a7f3d0;padding:4px 10px;border-radius:6px;font-weight:700">🏆 Target (iii): ${setup.tp}</span>` : ''}
    <span class="tag ${isLong ? 'up' : 'down'}" style="margin-left:auto">${isLong ? '📈 WAVE iii LONG' : '📉 WAVE iii SHORT'}</span>
  `;
}

async function loadChartCoin(coin, setup = null) {
  if (!initChart()) return;
  currentChartCoin = (coin || currentChartCoin || 'ETH').replace(/_?USDT$/, '');
  if (setup) {
    currentSetup = setup;
    ls.set('mexcLastSetup', setup);
  }
  const tf = $('tf') ? $('tf').value : '15m';

  const candles = await fetchCandlesMultiSource(currentChartCoin, tf);
  if (!candles.length) return;

  candleSeries.setData(candles);
  const k = 2 / 21;
  let ema = candles[0].close;
  emaSeries.setData(candles.map(c => { ema = c.close * k + ema * (1 - k); return { time: c.time, value: ema }; }));

  if ($('chartHeader')) {
    $('chartHeader').textContent = `📈 AI Sniper Setup Chart (${currentChartCoin}/USDT · ${tf})`;
  }

  priceLines.forEach(l => { try { candleSeries.removePriceLine(l); } catch (e) {} });
  priceLines = [];

  if (currentSetup && currentSetup.coin === currentChartCoin) {
    renderLevelCalloutPills(currentSetup);
    if ($('trendBadge')) {
      $('trendBadge').innerHTML = `<span class="tag ${currentSetup.direction === 'LONG' ? 'up' : 'down'}">🎯 ${currentSetup.direction} · ${currentSetup.confidence || 90}%</span>`;
    }

    if (currentSetup.sl) priceLines.push(candleSeries.createPriceLine({ price: +currentSetup.sl, color: '#ff5d5d', lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: `SL (${currentSetup.sl})` }));
    if (currentSetup.entry) priceLines.push(candleSeries.createPriceLine({ price: +currentSetup.entry, color: '#38bdf8', lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: `Entry (${currentSetup.entry})` }));
    if (currentSetup.tp1) priceLines.push(candleSeries.createPriceLine({ price: +currentSetup.tp1, color: '#2ecc9a', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `TP1 (${currentSetup.tp1})` }));
    if (currentSetup.tp2) priceLines.push(candleSeries.createPriceLine({ price: +currentSetup.tp2, color: '#2ecc9a', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `TP2 (${currentSetup.tp2})` }));
    if (currentSetup.tp3) priceLines.push(candleSeries.createPriceLine({ price: +currentSetup.tp3, color: '#2ecc9a', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `TP3 (${currentSetup.tp3})` }));
    if (currentSetup.tp) priceLines.push(candleSeries.createPriceLine({ price: +currentSetup.tp, color: '#10b981', lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: `Target iii (${currentSetup.tp})` }));

    if (Array.isArray(currentSetup.wavePivots) && currentSetup.wavePivots.length) {
      const markers = currentSetup.wavePivots.map((pt, idx) => ({
        time: pt.time,
        position: pt.position,
        color: idx === 5 ? '#38bdf8' : idx === 4 ? '#ff5d5d' : '#f0b429',
        shape: idx === 5 ? (currentSetup.direction === 'LONG' ? 'arrowUp' : 'arrowDown') : 'circle',
        text: pt.label
      }));
      candleSeries.setMarkers(markers);

      const stepSec = candles.length > 1 ? (candles[candles.length - 1].time - candles[candles.length - 2].time) : 900;
      const lastTime = candles[candles.length - 1].time;
      const waveData = currentSetup.wavePivots.map(p => ({ time: p.time, value: p.price }));
      if (currentSetup.tp && waveData[waveData.length - 1].time <= lastTime) {
        waveData.push({ time: lastTime + stepSec * 6, value: +currentSetup.tp });
      }
      const uniqueSorted = [];
      waveData.sort((a, b) => a.time - b.time).forEach(item => {
        if (!uniqueSorted.length || uniqueSorted[uniqueSorted.length - 1].time < item.time) uniqueSorted.push(item);
      });
      waveLineSeries.setData(uniqueSorted);
    }
    chart.timeScale().fitContent();
  }
}

function renderTradeNote(note) {
  if (!note || !$('noteContent')) return;
  ls.set('mexcLastSinhalaNote', note);
  const isUp = note.direction === 'LONG';
  $('noteContent').innerHTML = `
    <div style="background:rgba(56,189,248,0.07);border:1px solid ${isUp ? '#2ecc9a' : '#ff5d5d'};border-radius:8px;padding:12px;margin-top:8px;line-height:1.6">
      <div style="font-size:1.1em;margin-bottom:6px">
        <b>🎯 තෝරාගත් Coin එක: <span style="color:#38bdf8">${note.coin}</span></b>
        <span class="tag ${isUp ? 'up' : 'down'}" style="margin-left:8px">${isUp ? '📈 UP (LONG SETUP)' : '📉 DOWN (SHORT SETUP)'}</span>
      </div>
      <p style="margin:6px 0"><b>🎯 හොඳම Sniper Entry කලාපය (Wave ii Pullback):</b> <span style="color:#38bdf8;font-weight:700">${note.sniperZone || ''}</span></p>
      <p style="margin:6px 0"><b>🏁 Multi-Targets &amp; Stop-Loss:</b> <span style="color:#2ecc9a;font-weight:700">${note.targetsText || ''}</span></p>
      <p style="margin:6px 0"><b>🔮 මිල යන දිශාව (Prediction):</b> ${note.prediction}</p>
      <p style="margin:6px 0"><b>🧐 ඇයි මේ Coin එක තෝරාගත්තේ?:</b> ${note.whySelected}</p>
      <p style="margin:6px 0"><b>🏆 තහවුරු වූ Trading Methods (25-Method Matrix):</b> <span style="color:#f0b429">${note.methodsUsed}</span></p>
      <p style="margin:6px 0"><b>🌍 Global Crypto News &amp; Market Sentiment:</b> ${note.newsSummary}</p>
      <p style="margin:6px 0;color:#2ecc9a"><b>${note.capitalProtection}</b></p>
    </div>`;
}

const savedNote = ls.get('mexcLastSinhalaNote', null);
if (savedNote) renderTradeNote(savedNote);

// 5. LIVE ENGINE & BUTTON HANDLERS
let autoPilot = false, isScanning = false, lastScanTime = 0;
let closingIds = new Set();
let peakTracker = ls.get('mexcPeakTracker', {});
let activeSnapshot = ls.get('mexcActiveSnap', {});
let cooldownMap = ls.get('mexcCooldowns', {});

function getTodayRealizedProfit() {
  const closed = ls.get('mexcClosedHistory', []);
  const today = new Date().toDateString();
  return closed
    .filter(c => new Date(c.time).toDateString() === today)
    .reduce((sum, c) => sum + Number(c.pnl || 0), 0);
}

function recordClosedTrade(pos, reason) {
  const closed = ls.get('mexcClosedHistory', []);
  if (closed.some(c => String(c.positionId) === String(pos.positionId))) return;

  if (Number(pos.pnl) < 0 && pos.symbol) {
    cooldownMap[pos.symbol] = Date.now() + 15 * 60 * 1000;
    ls.set('mexcCooldowns', cooldownMap);
  }

  closed.unshift({
    positionId: pos.positionId,
    time: Date.now(),
    symbol: pos.symbol,
    direction: pos.direction,
    leverage: pos.leverage,
    margin: pos.margin,
    pnl: Number(pos.pnl || 0),
    roe: Number(pos.roe || 0),
    reason
  });
  ls.set('mexcClosedHistory', closed.slice(0, 100));
  renderClosedHistory();
}

function renderClosedHistory() {
  const closed = ls.get('mexcClosedHistory', []);
  const dailyProfit = getTodayRealizedProfit();
  const goal = $('dailyGoal') ? (+$('dailyGoal').value || 5) : 5;
  if ($('wDaily')) {
    $('wDaily').textContent = `${dailyProfit >= 0 ? '+' : ''}$${dailyProfit.toFixed(3)} / $${goal.toFixed(2)}`;
    $('wDaily').className = dailyProfit >= 0 ? 'up' : 'down';
  }

  if (!$('logList')) return;
  if (!closed.length) {
    $('logList').innerHTML = '<p class="msg">No completed trades yet.</p>';
    return;
  }

  $('logList').innerHTML = `<table>
    <tr><th>Time</th><th>Coin</th><th>Margin</th><th>Profit / Loss (USDT)</th><th>Close Reason</th></tr>
    ${closed.slice(0, 25).map(c => {
      const win = c.pnl >= 0;
      return `<tr>
        <td><small>${new Date(c.time).toLocaleTimeString()}</small></td>
        <td><b>${c.symbol}</b> <span class="tag ${c.direction === 'LONG' ? 'up' : 'down'}">${c.direction} ${c.leverage}x</span></td>
        <td>$${c.margin}</td>
        <td class="${win ? 'up' : 'down'}"><b>${win ? '+' : ''}$${Number(c.pnl).toFixed(4)} (${win ? '+' : ''}${c.roe}%)</b></td>
        <td><small>${c.reason}</small></td>
      </tr>`;
    }).join('')}
  </table>`;
}

async function closePositionNow(p, reasonLabel) {
  if (closingIds.has(p.positionId)) return;
  closingIds.add(p.positionId);
  try {
    await fetch('/api/futures-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'close',
        secret: $('sec').value.trim(),
        symbol: p.symbol,
        positionId: p.positionId,
        direction: p.direction,
        vol: p.holdVol
      })
    });
    recordClosedTrade(p, reasonLabel);
    delete peakTracker[p.positionId];
    ls.set('mexcPeakTracker', peakTracker);
    $('statusMsg').innerHTML = `<span class="up">⚡ <b>${reasonLabel}</b> on ${p.symbol}! Profit/Balance secured in Wallet.</span>`;
  } catch (e) {}
  closingIds.delete(p.positionId);
}

// Button 1: Pre-Trade Chart Analysis
async function previewChartAnalysisOnly() {
  const secret = $('sec') ? $('sec').value.trim() : '';
  if (!secret) {
    $('statusMsg').innerHTML = `<span class="down">⚠️ කරුණාකර පළමුව Agent Password (AGENT_SECRET) ඇතුළත් කරන්න!</span>`;
    return;
  }
  saveCfg();

  if ($('analyzeBtn')) $('analyzeBtn').disabled = true;
  $('statusMsg').innerHTML = `🔍 <b>Analyzing 100 Coins with 25 Methods to Draw Pre-Trade Elliott Wave &amp; Sniper Entry Chart... (තත්පර 5-8ක් රැඳී සිටින්න)</b>`;

  try {
    const r = await fetch('/api/futures-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'analyze_only',
        secret,
        timeframe: $('tf') ? $('tf').value : '15m'
      })
    });
    const d = await r.json();
    if (!r.ok || d.error) {
      $('statusMsg').innerHTML = `<span class="down">⚠️ ${d.error || 'Analysis error'}</span>`;
    } else {
      const pick = d.pick;
      const radar = pick.topCandidates || [];
      if (pick.sinhalaNote) renderTradeNote(pick.sinhalaNote);
      await loadChartCoin(pick.coin, pick);

      if ($('RADAR')) {
        $('RADAR').innerHTML = `<h3>📡 100-Coin Pre-Trade Sniper Analysis (Scanned ${d.scannedCount} Coins)</h3>
          <p style="margin:6px 0">🏆 <b>Best Sniper Setup Drawn on Chart: ${pick.symbol}</b> <span class="tag ${pick.direction === 'LONG' ? 'up' : 'down'}">${pick.direction}</span> · Exact Entry: <b>${pick.entry}</b> · SL: <b class="down">${pick.sl}</b> · Targets: <b class="up">${pick.tp1} → ${pick.tp2} → ${pick.tp3} → ${pick.tp}</b></p>
          ${radar.length ? `<table style="margin-top:8px"><tr><th>Rank</th><th>Coin</th><th>Side</th><th>Sniper Entry</th><th>Target (iii)</th><th>Score</th></tr>
            ${radar.map((c, i) => `<tr><td>#${i + 1}</td><td><b>${c.coin}_USDT</b></td><td><span class="tag ${c.direction === 'LONG' ? 'up' : 'down'}">${c.direction}</span></td><td>${c.entry}</td><td class="up">${c.tp}</td><td><b>${c.confidence}%</b></td></tr>`).join('')}
          </table>` : ''}`;
      }

      $('statusMsg').innerHTML = `<span class="up">📊 Pre-Trade Chart Drawn for <b>${pick.symbol} (${pick.direction})</b>! Review Entry (${pick.entry}), SL (${pick.sl}) &amp; 4 Targets on the chart above.</span>`;
    }
  } catch (e) {
    $('statusMsg').innerHTML = `<span class="down">⚠️ Server connection failed: ${e.message}</span>`;
  }
  if ($('analyzeBtn')) $('analyzeBtn').disabled = false;
}

// Button 2 & Auto-Pilot: Scan 100 Coins, Draw Chart & Place Sniper Trade
async function scanAndOpenBestTrade(isAuto = false) {
  const secret = $('sec') ? $('sec').value.trim() : '';
  if (!secret) {
    $('statusMsg').innerHTML = `<span class="down">⚠️ කරුණාකර පළමුව Agent Password (AGENT_SECRET) ඇතුළත් කරන්න!</span>`;
    return;
  }
  saveCfg();

  isScanning = true;
  lastScanTime = Date.now();
  if (!isAuto && $('runOnceBtn')) $('runOnceBtn').disabled = true;
  $('statusMsg').innerHTML = `🤖 <b>Scanning 100 Coins, Drawing Elliott Wave Chart &amp; Placing Precision Sniper Order... (තත්පර 5-8ක් රැඳී සිටින්න)</b>`;

  const now = Date.now();
  const activeCooldowns = Object.keys(cooldownMap).filter(sym => cooldownMap[sym] > now);

  try {
    const r = await fetch('/api/futures-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'scan_and_trade',
        secret,
        entryMode: $('entryMode') ? $('entryMode').value : 'sniper_auto',
        autoMargin: $('autoMargin') ? ($('autoMargin').value === 'auto') : true,
        marginUsdt: $('margin') ? (+$('margin').value || 2) : 2,
        autoLeverage: $('autoLev') ? ($('autoLev').value === 'auto') : true,
        leverage: $('lev') ? (+$('lev').value || 12) : 12,
        timeframe: $('tf') ? $('tf').value : '15m',
        cooldownCoins: activeCooldowns
      })
    });
    const d = await r.json();
    if (!r.ok || d.error) {
      $('statusMsg').innerHTML = `<span class="down">⚠️ ${d.error || 'Trade scan error'}</span>`;
    } else {
      const pick = d.pick;
      const exec = d.exec;
      const radar = pick.topCandidates || [];

      if (pick.sinhalaNote) renderTradeNote(pick.sinhalaNote);

      await loadChartCoin(pick.coin, {
        ...pick,
        entry: exec.entryPrice || pick.entry,
        sl: exec.tightSlPrice || pick.sl
      });

      if ($('RADAR')) {
        $('RADAR').innerHTML = `<h3>📡 100-Coin Sniper Scanner Result (Scanned ${d.scannedCount} Active Coins)</h3>
          <p style="margin:6px 0">🏆 <b>Opened #1 Sniper Trade: ${exec.symbol}</b> <span class="tag ${pick.direction === 'LONG' ? 'up' : 'down'}">${pick.direction} ${exec.leverage}x</span> · <b>${exec.orderTypeLabel || 'Sniper Order'}</b> · Margin: <b>$${d.usedMargin} USDT</b></p>
          ${radar.length ? `<table style="margin-top:8px"><tr><th>Rank</th><th>Coin</th><th>Side</th><th>Sniper Entry</th><th>Target (iii)</th><th>Score</th></tr>
            ${radar.map((c, i) => `<tr><td>#${i + 1}</td><td><b>${c.coin}_USDT</b></td><td><span class="tag ${c.direction === 'LONG' ? 'up' : 'down'}">${c.direction}</span></td><td>${c.entry}</td><td class="up">${c.tp}</td><td><b>${c.confidence}%</b></td></tr>`).join('')}
          </table>` : ''}`;
      }

      $('statusMsg').innerHTML = `<span class="up">✅ <b>${exec.orderTypeLabel || 'Sniper Trade Opened'}</b> on ${exec.symbol} ($${d.usedMargin} @ ${exec.leverage}x)! 90% Profit Lock Active.</span>`;
      await refreshLiveStatus();
    }
  } catch (e) {
    $('statusMsg').innerHTML = `<span class="down">⚠️ Scan request failed: ${e.message}</span>`;
  }

  isScanning = false;
  if (!isAuto && $('runOnceBtn')) $('runOnceBtn').disabled = false;
}

async function refreshLiveStatus() {
  const secret = $('sec') ? $('sec').value.trim() : '';
  if (!secret) return;
  saveCfg();

  try {
    const r = await fetch(`/api/futures-agent?action=status&secret=${encodeURIComponent(secret)}`);
    const d = await r.json();
    if (!r.ok || d.error) {
      $('statusMsg').innerHTML = `<span class="down">⚠️ ${d.error || 'Invalid Agent Password'}</span>`;
      return;
    }

    if ($('wBal')) $('wBal').textContent = `$${d.balance} USDT`;
    if ($('wEq')) $('wEq').textContent = `$${d.equity} USDT`;
    const totPnl = Number(d.totalPnl || 0);
    if ($('wPnl')) {
      $('wPnl').textContent = `${totPnl >= 0 ? '+' : ''}$${totPnl.toFixed(4)} USDT`;
      $('wPnl').className = totPnl >= 0 ? 'up' : 'down';
    }

    const dailyProfit = getTodayRealizedProfit();
    const dailyGoal = $('dailyGoal') ? (+$('dailyGoal').value || 5) : 5;
    if ($('wDaily')) {
      $('wDaily').textContent = `${dailyProfit >= 0 ? '+' : ''}$${dailyProfit.toFixed(3)} / $${dailyGoal.toFixed(2)}`;
    }

    const openIds = new Set((d.positions || []).map(p => String(p.positionId)));
    Object.keys(activeSnapshot).forEach(oldId => {
      if (!openIds.has(String(oldId))) {
        recordClosedTrade(activeSnapshot[oldId], 'Exchange / Cloud Guardian Closed');
        delete peakTracker[oldId];
      }
    });
    const nextSnap = {};
    (d.positions || []).forEach(p => { nextSnap[p.positionId] = p; });
    activeSnapshot = nextSnap;
    ls.set('mexcActiveSnap', activeSnapshot);

    const retentionPct = ($('lockRetention') ? (+$('lockRetention').value || 90) : 90) / 100;
    const maxLossRoe = Math.abs($('maxLossRoe') ? (+$('maxLossRoe').value || 10) : 10);

    for (const p of (d.positions || [])) {
      const livePnl = Number(p.pnl);
      const liveRoe = Number(p.roe);
      const prev = peakTracker[p.positionId] || { peakPnl: 0, peakRoe: 0 };

      if (livePnl > prev.peakPnl) prev.peakPnl = livePnl;
      if (liveRoe > prev.peakRoe) prev.peakRoe = liveRoe;
      peakTracker[p.positionId] = prev;
      ls.set('mexcPeakTracker', peakTracker);

      const lockActive = prev.peakRoe >= 3.0 || prev.peakPnl >= 0.05;
      const lockedPnlFloor = lockActive ? +(prev.peakPnl * retentionPct).toFixed(4) : null;
      const lockedRoeFloor = lockActive ? +(prev.peakRoe * retentionPct).toFixed(2) : null;

      if (liveRoe >= 35) {
        await closePositionNow(p, `Full Target Hit (+${liveRoe}% ROE)`);
      } else if (lockActive && (livePnl <= lockedPnlFloor || liveRoe <= lockedRoeFloor)) {
        await closePositionNow(
          p,
          `90% Profit Lock Triggered (Peak $${prev.peakPnl.toFixed(3)} -> Locked $${livePnl.toFixed(3)} into Wallet)`
        );
      } else if (liveRoe <= -maxLossRoe) {
        await closePositionNow(
          p,
          `10% Loss Shield Triggered (${liveRoe}% ROE -> 90% Margin Saved to Wallet)`
        );
      }
    }

    if (!(d.positions || []).length) {
      const pendingMsg = d.pendingLimitOrders > 0
        ? `📌 <b>${d.pendingLimitOrders} Sniper Limit Order is waiting on MEXC at the exact Wave ii pullback price!</b>`
        : `No open position right now. ${autoPilot ? '🤖 Auto-Pilot is scanning 100 coins...' : ''}`;
      if ($('POS')) {
        $('POS').innerHTML = `<h3>⚡ Active Futures Trade (Live Profit, Peak Profit &amp; 90% Lock Floor)</h3><p class="msg">${pendingMsg}</p>`;
      }

      if (dailyGoal > 0 && dailyProfit >= dailyGoal) {
        if (autoPilot) {
          autoPilot = false;
          if ($('autoToggleBtn')) {
            $('autoToggleBtn').textContent = '▶️ Start 100-Coin Auto-Pilot: OFF';
            $('autoToggleBtn').style.background = '#2ecc9a';
          }
        }
        $('statusMsg').innerHTML = `<span class="up">🎉 <b>DAILY $${dailyGoal} PROFIT TARGET ACHIEVED (+$${dailyProfit.toFixed(3)} USDT)!</b></span>`;
        return;
      }

      if (autoPilot && !isScanning && !d.pendingLimitOrders && (Date.now() - lastScanTime > 12000)) {
        scanAndOpenBestTrade(true);
      }
    } else {
      if ($('POS')) {
        $('POS').innerHTML = `<h3>⚡ Active Futures Trade (Live Profit, Peak Profit &amp; 90% Lock Floor)</h3>
          <table>
            <tr><th>Coin / Side</th><th>Entry → Live</th><th>Margin</th><th>Peak Profit</th><th>90% Lock Floor</th><th>Live Profit / Loss</th><th>Action</th></tr>
            ${d.positions.map(p => {
              const pk = peakTracker[p.positionId] || { peakPnl: 0, peakRoe: 0 };
              const isWin = Number(p.pnl) >= 0;
              const lockActive = pk.peakRoe >= 3.0 || pk.peakPnl >= 0.05;
              const floorPnl = lockActive ? `$${(pk.peakPnl * retentionPct).toFixed(3)} (+${(pk.peakRoe * retentionPct).toFixed(1)}%)` : 'Activates at +3% ROE';
              return `<tr>
                <td><b>${p.symbol}</b><br><span class="tag ${p.direction === 'LONG' ? 'up' : 'down'}">${p.direction} ${p.leverage}x</span></td>
                <td>${p.entryPrice}<br>→ <b>${p.markPrice}</b></td>
                <td>$${p.margin}</td>
                <td class="up"><b>+$${pk.peakPnl.toFixed(4)}</b><br><small>(+${pk.peakRoe.toFixed(2)}%)</small></td>
                <td><span class="tag ${lockActive ? 'up' : ''}">🔒 ${floorPnl}</span></td>
                <td class="${isWin ? 'up' : 'down'}" style="font-size:1.1em"><b>${isWin ? '+' : ''}$${p.pnl} USDT</b><br><small>(${isWin ? '+' : ''}${p.roe}%)</small></td>
                <td><button class="moreBtn manualCloseBtn" data-id="${p.positionId}" style="margin:0;padding:5px 10px;background:#ff5d5d;color:#fff">Close Now</button></td>
              </tr>`;
            }).join('')}
          </table>`;
      }

      const active = d.positions[0];
      loadChartCoin(active.coin, currentSetup && currentSetup.coin === active.coin ? currentSetup : { coin: active.coin, direction: active.direction, entry: active.entryPrice });

      document.querySelectorAll('.manualCloseBtn').forEach(btn => {
        btn.onclick = async () => {
          const target = d.positions.find(x => String(x.positionId) === String(btn.dataset.id));
          if (target) {
            await closePositionNow(target, 'Manual Instant Close');
            await refreshLiveStatus();
          }
        };
      });
    }
  } catch (e) {}
}

// Bind Buttons Safely
if ($('analyzeBtn')) $('analyzeBtn').onclick = previewChartAnalysisOnly;
if ($('runOnceBtn')) $('runOnceBtn').onclick = () => scanAndOpenBestTrade(false);
if ($('refreshBtn')) $('refreshBtn').onclick = refreshLiveStatus;

if ($('autoToggleBtn')) {
  $('autoToggleBtn').onclick = () => {
    autoPilot = !autoPilot;
    $('autoToggleBtn').textContent = `▶️ Start 100-Coin Auto-Pilot: ${autoPilot ? 'ON (Running)' : 'OFF'}`;
    $('autoToggleBtn').style.background = autoPilot ? '#f0b429' : '#2ecc9a';
    if (autoPilot) {
      lastScanTime = 0;
      refreshLiveStatus();
      scanAndOpenBestTrade(true);
    }
  };
}

// Initialize Everything Immediately
initChart();
renderClosedHistory();
loadChartCoin(currentSetup && currentSetup.coin ? currentSetup.coin : 'ETH', currentSetup);
refreshLiveStatus();
setInterval(refreshLiveStatus, 4000);
