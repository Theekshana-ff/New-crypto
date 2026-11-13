// File: agent.js
const $ = id => document.getElementById(id);
const ls = {
  get: (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

setInterval(function t() {
  const d = new Date();
  if ($('time')) $('time').textContent = d.toLocaleTimeString();
  if ($('date')) $('date').textContent = d.toLocaleDateString('en', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  return t;
}(), 1000);

const tg = o => { if ($('drawer')) $('drawer').classList.toggle('open', o); if ($('scrim')) $('scrim').classList.toggle('show', o); };
if ($('menuBtn')) $('menuBtn').onclick = () => tg(1);
if ($('scrim')) $('scrim').onclick = () => tg(0);

const savedCfg = ls.get('mexcAgentCfg', {
  sec: '', stratMode: 'ALL25', margin: 1, autoLev: 'auto', lev: 10, tf: '15m',
  maxOpen: 1, tpRoe: 25, slRoe: 25, trailRoe: 12, dailyLossLimit: 3, btcFilter: 'on'
});
$('sec').value = savedCfg.sec || '';
if ($('stratMode')) $('stratMode').value = savedCfg.stratMode || 'ALL25';
$('margin').value = savedCfg.margin != null ? savedCfg.margin : 1;
$('autoLev').value = savedCfg.autoLev || 'auto';
$('lev').value = savedCfg.lev || 10;
$('tf').value = savedCfg.tf || '15m';
$('maxOpen').value = savedCfg.maxOpen || 1;
$('tpRoe').value = savedCfg.tpRoe != null ? savedCfg.tpRoe : 25;
$('slRoe').value = savedCfg.slRoe != null ? savedCfg.slRoe : 25;
$('trailRoe').value = savedCfg.trailRoe != null ? savedCfg.trailRoe : 12;
$('dailyLossLimit').value = savedCfg.dailyLossLimit != null ? savedCfg.dailyLossLimit : 3;
$('btcFilter').value = savedCfg.btcFilter || 'on';

function toggleLevInput() {
  $('lev').disabled = $('autoLev').value === 'auto';
  $('lev').style.opacity = $('autoLev').value === 'auto' ? '0.5' : '1';
}
toggleLevInput();

const saveCfg = () => {
  toggleLevInput();
  ls.set('mexcAgentCfg', {
    sec: $('sec').value.trim(),
    stratMode: $('stratMode') ? $('stratMode').value : 'ALL25',
    margin: +$('margin').value || 1,
    autoLev: $('autoLev').value,
    lev: +$('lev').value || 10,
    tf: $('tf').value,
    maxOpen: +$('maxOpen').value || 1,
    tpRoe: +$('tpRoe').value || 0,
    slRoe: +$('slRoe').value || 0,
    trailRoe: +$('trailRoe').value || 0,
    dailyLossLimit: +$('dailyLossLimit').value || 0,
    btcFilter: $('btcFilter').value
  });
};
['sec', 'stratMode', 'margin', 'autoLev', 'lev', 'tf', 'maxOpen', 'tpRoe', 'slRoe', 'trailRoe', 'dailyLossLimit', 'btcFilter'].forEach(id => {
  if ($(id)) $(id).onchange = saveCfg;
});

// --- LIVE TREND CHART ---
let chart, candleSeries, ema20Series, ema50Series, priceLines = [];
let currentChartCoin = 'BTC', currentLevels = null;

function initChart() {
  const box = $('agentChart');
  if (!box || !window.LightweightCharts) return;
  chart = LightweightCharts.createChart(box, {
    width: box.clientWidth,
    height: 360,
    layout: { background: { color: '#0e1621' }, textColor: '#d7e3f4' },
    grid: { vertLines: { color: '#1b2838' }, horzLines: { color: '#1b2838' } },
    timeScale: { timeVisible: true, secondsVisible: false }
  });
  candleSeries = chart.addCandlestickSeries({
    upColor: '#2ecc9a', downColor: '#ff5d5d', borderVisible: false, wickUpColor: '#2ecc9a', wickDownColor: '#ff5d5d'
  });
  ema20Series = chart.addLineSeries({ color: '#38bdf8', lineWidth: 2, title: 'EMA 20' });
  ema50Series = chart.addLineSeries({ color: '#f0b429', lineWidth: 2, title: 'EMA 50' });

  window.addEventListener('resize', () => chart && chart.applyOptions({ width: box.clientWidth }));
}

function calcEMA(candles, period) {
  const k = 2 / (period + 1);
  let ema = candles[0].close;
  return candles.map(c => {
    ema = c.close * k + ema * (1 - k);
    return { time: c.time, value: ema };
  });
}

async function loadChartCoin(coin, levels = null) {
  if (!chart) initChart();
  if (!chart) return;
  currentChartCoin = coin || currentChartCoin;
  if (levels) currentLevels = levels;
  const tf = $('tf').value || '15m';

  try {
    const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${currentChartCoin}USDT&interval=${tf}&limit=200`);
    if (!r.ok) return;
    const raw = await r.json();
    const candles = raw.map(x => ({
      time: Math.floor(x[0] / 1000), open: +x[1], high: +x[2], low: +x[3], close: +x[4]
    }));
    if (!candles.length) return;

    candleSeries.setData(candles);
    const e20 = calcEMA(candles, 20);
    const e50 = calcEMA(candles, 50);
    ema20Series.setData(e20);
    ema50Series.setData(e50);

    const last = candles[candles.length - 1].close;
    const v20 = e20[e20.length - 1].value;
    const v50 = e50[e50.length - 1].value;
    const isBull = v20 > v50 && last >= v20;
    const isBear = v20 < v50 && last <= v20;

    $('chartHeader').textContent = `📈 Live AI Trend & Position Chart (${currentChartCoin}/USDT · ${tf})`;
    if (isBull) {
      $('trendBadge').innerHTML = `<span class="tag up">🔥 LIVE TREND: STRONG BULLISH</span>`;
    } else if (isBear) {
      $('trendBadge').innerHTML = `<span class="tag down">🔥 LIVE TREND: STRONG BEARISH</span>`;
    } else {
      $('trendBadge').innerHTML = `<span class="tag">⚖️ LIVE TREND: CONSOLIDATING</span>`;
    }

    priceLines.forEach(l => candleSeries.removePriceLine(l));
    priceLines = [];
    if (currentLevels && currentLevels.coin === currentChartCoin) {
      if (currentLevels.entry) {
        priceLines.push(candleSeries.createPriceLine({
          price: +currentLevels.entry, color: '#38bdf8', lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: `ENTRY`
        }));
      }
      if (currentLevels.sl) {
        priceLines.push(candleSeries.createPriceLine({
          price: +currentLevels.sl, color: '#ff5d5d', lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: 'SL'
        }));
      }
      if (currentLevels.tp) {
        priceLines.push(candleSeries.createPriceLine({
          price: +currentLevels.tp, color: '#2ecc9a', lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: 'TP'
        }));
      }
    }
  } catch (e) {}
}

let autoPilot = false, closingIds = new Set(), isScanning = false, lastScanAttempt = 0;
let peakRoeMap = ls.get('mexcPeakRoe', {});
let lastTrackedPositions = ls.get('mexcLastPos', {});

// --- UPDATE #5: WIN-RATE & PROFIT ANALYTICS DASHBOARD ---
function recordClosedTrade(pos, exitReason) {
  const closed = ls.get('mexcClosedTrades', []);
  if (closed.some(c => c.positionId === pos.positionId)) return;
  const pnlVal = Number(pos.pnl || 0);
  closed.unshift({
    positionId: pos.positionId,
    time: Date.now(),
    coin: pos.coin,
    direction: pos.direction,
    leverage: pos.leverage,
    pnl: pnlVal,
    roe: Number(pos.roe || 0),
    exitReason
  });
  ls.set('mexcClosedTrades', closed.slice(0, 100));
  renderAnalytics();
}

function renderAnalytics() {
  const closed = ls.get('mexcClosedTrades', []);
  const todayStr = new Date().toDateString();
  const todayTrades = closed.filter(c => new Date(c.time).toDateString() === todayStr);
  const dailyPnl = todayTrades.reduce((s, c) => s + Number(c.pnl || 0), 0);

  if (!closed.length) {
    $('STATS').innerHTML = `<h3>📊 Update #5: AI Win-Rate &amp; Profit Analytics Dashboard</h3>
      <p class="msg">Total Closed Trades: <b>0</b> · Today's Net PnL: <b>$0.000 USDT</b> (Stats update automatically when positions close)</p>`;
    return { dailyPnl };
  }

  const wins = closed.filter(c => c.pnl > 0);
  const losses = closed.filter(c => c.pnl <= 0);
  const winRate = ((wins.length / closed.length) * 100).toFixed(1);
  const netPnl = closed.reduce((s, c) => s + Number(c.pnl || 0), 0);

  $('STATS').innerHTML = `<h3>📊 Update #5: AI Win-Rate &amp; Profit Analytics Dashboard</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:8px">
      <div style="background:rgba(255,255,255,0.04);padding:10px;border-radius:8px;border:1px solid var(--line)">
        <small class="msg">Win Rate %</small><br><b class="up" style="font-size:1.3em">${winRate}%</b><br><small>${wins.length}W / ${losses.length}L</small>
      </div>
      <div style="background:rgba(255,255,255,0.04);padding:10px;border-radius:8px;border:1px solid var(--line)">
        <small class="msg">All-Time Net PnL</small><br><b class="${netPnl >= 0 ? 'up' : 'down'}" style="font-size:1.3em">${netPnl >= 0 ? '+' : ''}$${netPnl.toFixed(3)}</b><br><small>${closed.length} Trades</small>
      </div>
      <div style="background:rgba(255,255,255,0.04);padding:10px;border-radius:8px;border:1px solid var(--line)">
        <small class="msg">Today's PnL</small><br><b class="${dailyPnl >= 0 ? 'up' : 'down'}" style="font-size:1.3em">${dailyPnl >= 0 ? '+' : ''}$${dailyPnl.toFixed(3)}</b><br><small>${todayTrades.length} Today</small>
      </div>
    </div>`;
  return { dailyPnl };
}

function renderAiBrain() {
  const logs = ls.get('mexcAgentLogs', []);
  if (!logs.length) return;
  const latest = logs[0];
  const radar = latest.topCandidates || [];
  const badges = (latest.matchedMethods || []).map(m =>
    `<span style="display:inline-block;background:rgba(46,204,154,0.15);border:1px solid #2ecc9a;border-radius:4px;padding:2px 6px;margin:2px;font-size:0.78em">${m}</span>`
  ).join('');

  $('AI_BRAIN').innerHTML = `
    <h3>🧠 Latest AI 25-Method Confluence Breakdown &amp; Top 3 Radar</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-top:8px">
      <div style="background:rgba(56,189,248,0.08);border:1px solid #38bdf8;border-radius:8px;padding:10px">
        <b>🎯 Selected Trade: ${latest.coin}_USDT <span class="tag ${latest.direction === 'LONG' ? 'up' : 'down'}">${latest.direction} (${latest.leverage}x)</span></b>
        <p style="margin:6px 0"><b>🏆 Confluence Score:</b> <span style="color:#f0b429;font-weight:700">${latest.method || '25-Method'}</span></p>
        <p style="margin:6px 0"><b>📊 Pillars &amp; BTC:</b> <small>${latest.indicators || ''}</small></p>
        ${badges ? `<div style="margin:6px 0">${badges}</div>` : ''}
        <p style="margin:6px 0"><small>${latest.reason}</small></p>
      </div>
      <div style="background:rgba(255,255,255,0.03);border:1px solid var(--line);border-radius:8px;padding:10px">
        <b>🏆 Top 3 Coins:</b>
        ${radar.length ? `<table style="margin-top:6px"><tr><th>Rank</th><th>Coin</th><th>Score</th></tr>` +
          radar.map((c, idx) => `<tr>
            <td>#${idx + 1}</td>
            <td><b>${c.coin}</b> <span class="tag ${c.direction === 'LONG' ? 'up' : 'down'}">${c.direction}</span></td>
            <td><b>${c.confidence}%</b></td>
          </tr>`).join('') + `</table>` : '<p class="msg">No radar data.</p>'}
      </div>
    </div>`;
}

function renderLogs() {
  const logs = ls.get('mexcAgentLogs', []);
  if (!logs.length) {
    $('logList').innerHTML = '<p class="msg">No trades executed yet.</p>';
    return;
  }
  renderAiBrain();
  $('logList').innerHTML = '<table><tr><th>Time</th><th>Coin &amp; Lev</th><th>Matrix</th><th>Entry / SL / TP</th><th>Reason</th></tr>' +
    logs.map(l => `<tr>
      <td><small>${new Date(l.time).toLocaleTimeString()}</small></td>
      <td><b>${l.coin}_USDT</b><br><span class="tag ${l.direction === 'LONG' ? 'up' : 'down'}">${l.direction} (${l.leverage}x)</span></td>
      <td><b style="color:#f0b429">${l.method || ''}</b></td>
      <td>Entry: <b>${l.entry}</b><br><span class="down">SL: ${l.sl}</span><br><span class="up">TP: ${l.tp}</span></td>
      <td><small>${l.reason}</small></td>
    </tr>`).join('') + '</table>';
}

async function closePositionApi(p, reasonLabel = 'Closed') {
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
    delete peakRoeMap[p.positionId];
    ls.set('mexcPeakRoe', peakRoeMap);
    $('statusMsg').innerHTML = `<span class="up">🛡️ Closed ${p.symbol} (${reasonLabel} at ${p.roe}% ROE)!</span>`;
  } catch (e) {}
  closingIds.delete(p.positionId);
}

// --- UPDATE #2: DAILY DRAWDOWN CIRCUIT BREAKER CHECK ---
function isCircuitBreakerTripped() {
  const limit = +$('dailyLossLimit').value || 0;
  if (limit <= 0) return false;
  const { dailyPnl } = renderAnalytics();
  if (dailyPnl <= -Math.abs(limit)) {
    if (autoPilot) {
      autoPilot = false;
      $('autoToggleBtn').textContent = '🔄 Start Auto-Pilot (Sequential Loop): OFF';
      $('autoToggleBtn').style.background = '#f0b429';
    }
    $('resetBreakerBtn').style.display = 'inline-block';
    $('statusMsg').innerHTML = `<span class="down">🛑 CIRCUIT BREAKER TRIGGERED: Today's loss ($${dailyPnl.toFixed(2)}) hit your -$${limit} daily limit. Auto-Pilot paused for safety!</span>`;
    return true;
  }
  $('resetBreakerBtn').style.display = 'none';
  return false;
}

$('resetBreakerBtn').onclick = () => {
  $('dailyLossLimit').value = 0;
  saveCfg();
  $('resetBreakerBtn').style.display = 'none';
  $('statusMsg').innerHTML = `<span class="up">🔓 Circuit Breaker reset. You may resume trading carefully.</span>`;
};

async function refreshStatus() {
  const secret = $('sec').value.trim();
  if (!secret) return;
  saveCfg();

  try {
    const r = await fetch(`/api/futures-agent?action=status&secret=${encodeURIComponent(secret)}`);
    const d = await r.json();
    if (!r.ok || d.error) return;

    const totPnl = Number(d.totalPnl || 0);
    const btcInfo = d.btcRegime ? ` · BTC: <b>${d.btcRegime.regime}</b>` : '';
    $('BAL').innerHTML = `<h3>💼 MEXC Futures Account &amp; BTC Regime</h3>
      <p>Available USDT: <b class="up">$${d.balance}</b> &nbsp;|&nbsp; Equity: <b>$${d.equity}</b> &nbsp;|&nbsp; Live PnL: <b class="${totPnl >= 0 ? 'up' : 'down'}">${totPnl >= 0 ? '+' : ''}$${d.totalPnl} USDT</b>${btcInfo}</p>`;

    // Detect positions closed natively on MEXC (SL/TP hit on exchange) and log to Analytics
    const currentIds = new Set(d.positions.map(p => p.positionId));
    Object.keys(lastTrackedPositions).forEach(oldId => {
      if (!currentIds.has(oldId) && !currentIds.has(Number(oldId))) {
        recordClosedTrade(lastTrackedPositions[oldId], 'Exchange TP/SL Hit');
        delete peakRoeMap[oldId];
      }
    });
    const nextTracked = {};
    d.positions.forEach(p => { nextTracked[p.positionId] = p; });
    lastTrackedPositions = nextTracked;
    ls.set('mexcLastPos', lastTrackedPositions);

    const tpTarget = +$('tpRoe').value || 0;
    const slLimit = +$('slRoe').value || 0;
    const trailActivate = +$('trailRoe').value || 0;

    for (const p of d.positions) {
      const roeNum = Number(p.roe);
      const prevPeak = Number(peakRoeMap[p.positionId] || 0);
      if (roeNum > prevPeak) {
        peakRoeMap[p.positionId] = roeNum;
        ls.set('mexcPeakRoe', peakRoeMap);
      }
      const peak = Math.max(prevPeak, roeNum);

      // Update #1: Dynamic Trailing Stop-Loss (Locks profit once peak >= trailActivate, closes if ROE drops 5% from peak)
      const trailFloor = peak >= trailActivate && trailActivate > 0 ? Math.max(2, peak - 5) : null;

      if (tpTarget > 0 && roeNum >= tpTarget) {
        await closePositionApi(p, `TP Target +${tpTarget}%`);
      } else if (trailFloor !== null && roeNum <= trailFloor) {
        await closePositionApi(p, `Trailing SL Lock (Peak +${peak.toFixed(1)}% -> +${roeNum.toFixed(1)}%)`);
      } else if (slLimit > 0 && roeNum <= -Math.abs(slLimit)) {
        await closePositionApi(p, `SL Guardian -${Math.abs(slLimit)}%`);
      }
    }

    if (!d.positions.length) {
      $('POS').innerHTML = `<h3>⚡ Live MEXC Futures Positions</h3><p class="msg">No open positions.</p>`;
      // Sequential Auto-Pilot Loop: Only triggers next trade after previous trade is completely closed!
      if (autoPilot && !isCircuitBreakerTripped() && !isScanning && (Date.now() - lastScanAttempt > 20000)) {
        runAgentTrade(true);
      }
    } else {
      const logs = ls.get('mexcAgentLogs', []);
      $('POS').innerHTML = `<h3>⚡ Live MEXC Futures Positions (Trailing SL &amp; Guardian Active)</h3>
        <table>
          <tr><th>Contract</th><th>Side / Lev</th><th>Entry / Live</th><th>Peak ROE / Trail</th><th>PnL</th><th>Action</th></tr>
          ${d.positions.map(p => {
            const isProfit = Number(p.pnl) >= 0;
            const peak = Number(peakRoeMap[p.positionId] || p.roe);
            const trailActivate = +$('trailRoe').value || 0;
            const trailActive = trailActivate > 0 && peak >= trailActivate;
            return `<tr>
              <td><b><a href="#agentChart" class="chartCoinLink" data-coin="${p.coin}" data-entry="${p.entryPrice}" data-dir="${p.direction}" style="color:#38bdf8">${p.symbol} 📈</a></b></td>
              <td><span class="tag ${p.direction === 'LONG' ? 'up' : 'down'}">${p.direction}</span> <b>${p.leverage}x</b></td>
              <td>${p.entryPrice} / ${p.markPrice}</td>
              <td>Peak: <b>${peak.toFixed(1)}%</b><br>${trailActive ? `<span class="tag up">🔒 Trail Locked (+${Math.max(2, peak - 5).toFixed(1)}%)</span>` : `<small class="msg">Locks at +${trailActivate}%</small>`}</td>
              <td class="${isProfit ? 'up' : 'down'}"><b>${isProfit ? '+' : ''}$${p.pnl} (${isProfit ? '+' : ''}${p.roe}%)</b></td>
              <td><button class="moreBtn closeBtn" data-sym="${p.symbol}" data-id="${p.positionId}" data-dir="${p.direction}" data-vol="${p.holdVol}" style="margin:0;padding:4px 8px">Close</button></td>
            </tr>`;
          }).join('')}
        </table>`;

      const activePos = d.positions[0];
      const matchLog = logs.find(l => l.coin === activePos.coin);
      loadChartCoin(activePos.coin, {
        coin: activePos.coin,
        direction: activePos.direction,
        entry: activePos.entryPrice,
        sl: matchLog?.sl,
        tp: matchLog?.tp
      });

      document.querySelectorAll('.closeBtn').forEach(btn => btn.onclick = async () => {
        if (!confirm(`Close position at market price?`)) return;
        const posObj = d.positions.find(x => String(x.positionId) === String(btn.dataset.id)) || {
          positionId: btn.dataset.id, coin: btn.dataset.sym.replace('_USDT', ''), direction: btn.dataset.dir, pnl: 0, roe: 0
        };
        await closePositionApi({ ...posObj, symbol: btn.dataset.sym, holdVol: btn.dataset.vol }, 'Manual Close');
        await refreshStatus();
      });
    }
  } catch (e) {}
}

async function runAgentTrade(isAutoLoop = false) {
  const secret = $('sec').value.trim();
  if (!secret) { if (!isAutoLoop) alert('Enter Agent Password!'); return; }
  if (isCircuitBreakerTripped()) return;
  saveCfg();

  isScanning = true;
  lastScanAttempt = Date.now();
  const marginVal = Math.max(0.5, +$('margin').value || 1);
  const isAutoLev = $('autoLev').value === 'auto';
  const stratMode = $('stratMode') ? $('stratMode').value : 'ALL25';
  const useBtcFilter = $('btcFilter').value === 'on';

  if (!isAutoLoop) $('runOnceBtn').disabled = true;
  $('statusMsg').innerHTML = `🤖 <b>Scanning 25 Methods + BTC Regime Filter for safest setup...</b>`;

  try {
    const r = await fetch('/api/futures-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'scan_and_trade',
        secret,
        strategyMode: stratMode,
        useBtcFilter,
        marginUsdt: marginVal,
        autoLeverage: isAutoLev,
        leverage: +$('lev').value || 10,
        timeframe: $('tf').value,
        maxOpen: +$('maxOpen').value || 1
      })
    });
    const d = await r.json();
    if (!r.ok || d.error) {
      $('statusMsg').innerHTML = `<span class="down">${d.error}</span>`;
    } else {
      const usedLev = d.exec.leverage || 10;
      const logs = ls.get('mexcAgentLogs', []);
      logs.unshift({
        time: Date.now(),
        coin: d.pick.coin,
        direction: d.pick.direction,
        method: d.pick.method,
        matchedMethods: d.pick.matchedMethods || [],
        indicators: d.pick.indicators,
        topCandidates: d.pick.topCandidates,
        leverage: usedLev,
        margin: marginVal,
        entry: d.pick.entry,
        sl: d.pick.sl,
        tp: d.pick.tp,
        confidence: d.pick.confidence,
        reason: d.pick.reason
      });
      ls.set('mexcAgentLogs', logs.slice(0, 50));
      renderLogs();
      loadChartCoin(d.pick.coin, d.pick);
      $('statusMsg').innerHTML = `<span class="up">✅ Executed ${d.pick.direction} on ${d.pick.coin}_USDT (${usedLev}x)!</span>`;
      await refreshStatus();
    }
  } catch (e) {
    $('statusMsg').innerHTML = `<span class="down">Execution failed.</span>`;
  }
  isScanning = false;
  if (!isAutoLoop) $('runOnceBtn').disabled = false;
}

$('runOnceBtn').onclick = () => runAgentTrade(false);
$('refreshBtn').onclick = refreshStatus;

$('autoToggleBtn').onclick = () => {
  autoPilot = !autoPilot;
  $('autoToggleBtn').textContent = `🔄 Start Auto-Pilot (Sequential Loop): ${autoPilot ? 'ON (Active)' : 'OFF'}`;
  $('autoToggleBtn').style.background = autoPilot ? '#2ecc9a' : '#f0b429';
  if (autoPilot) {
    lastScanAttempt = 0;
    refreshStatus();
  }
};

initChart();
renderAnalytics();
renderLogs();
loadChartCoin('BTC');
refreshStatus();
setInterval(refreshStatus, 5000);
