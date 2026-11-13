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
  sec: '', stratMode: 'ALL25', margin: 1, autoLev: 'auto', lev: 10, tf: '15m', maxOpen: 1, tpRoe: 20, slRoe: 25
});
$('sec').value = savedCfg.sec || '';
if ($('stratMode')) $('stratMode').value = savedCfg.stratMode || 'ALL25';
$('margin').value = savedCfg.margin != null ? savedCfg.margin : 1;
$('autoLev').value = savedCfg.autoLev || 'auto';
$('lev').value = savedCfg.lev || 10;
$('tf').value = savedCfg.tf || '15m';
$('maxOpen').value = savedCfg.maxOpen || 1;
$('tpRoe').value = savedCfg.tpRoe != null ? savedCfg.tpRoe : 20;
$('slRoe').value = savedCfg.slRoe != null ? savedCfg.slRoe : 25;

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
    slRoe: +$('slRoe').value || 0
  });
};
['sec', 'stratMode', 'margin', 'autoLev', 'lev', 'tf', 'maxOpen', 'tpRoe', 'slRoe'].forEach(id => {
  if ($(id)) $(id).onchange = saveCfg;
});

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

let autoPilot = false, autoTimer = null, closingIds = new Set();

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
        <p style="margin:6px 0"><b>📊 Pillars:</b> <small>${latest.indicators || ''}</small></p>
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

async function closePositionApi(p, reasonLabel = '') {
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
    if (reasonLabel) {
      $('statusMsg').innerHTML = `<span class="up">🛡️ Guardian Closed ${p.symbol} (${reasonLabel} at ${p.roe}% ROE)!</span>`;
    }
  } catch (e) {}
  closingIds.delete(p.positionId);
}

async function refreshStatus() {
  const secret = $('sec').value.trim();
  if (!secret) return;
  saveCfg();

  try {
    const r = await fetch(`/api/futures-agent?action=status&secret=${encodeURIComponent(secret)}`);
    const d = await r.json();
    if (!r.ok || d.error) return;

    const totPnl = Number(d.totalPnl || 0);
    $('BAL').innerHTML = `<h3>💼 MEXC Futures Account</h3>
      <p>Available USDT: <b class="up">$${d.balance}</b> &nbsp;|&nbsp; Equity: <b>$${d.equity}</b> &nbsp;|&nbsp; PnL: <b class="${totPnl >= 0 ? 'up' : 'down'}">${totPnl >= 0 ? '+' : ''}$${d.totalPnl} USDT</b> &nbsp;|&nbsp; Open: <b>${d.positions.length}</b></p>`;

    const tpTarget = +$('tpRoe').value || 0;
    const slLimit = +$('slRoe').value || 0;
    for (const p of d.positions) {
      const roeNum = Number(p.roe);
      if (tpTarget > 0 && roeNum >= tpTarget) {
        await closePositionApi(p, `TP Target +${tpTarget}%`);
      } else if (slLimit > 0 && roeNum <= -Math.abs(slLimit)) {
        await closePositionApi(p, `SL Guardian -${Math.abs(slLimit)}%`);
      }
    }

    if (!d.positions.length) {
      $('POS').innerHTML = `<h3>📊 Live MEXC Futures Positions</h3><p class="msg">No open positions.</p>`;
      // AUTO-PILOT CONTINUOUS LOOP: If no active trades and autoPilot is ON, immediately trigger next trade!
      if (autoPilot) {
        runAgentTrade(true);
      }
    } else {
      const logs = ls.get('mexcAgentLogs', []);
      $('POS').innerHTML = `<h3>📊 Live MEXC Futures Positions</h3>
        <table>
          <tr><th>Contract</th><th>Side / Lev</th><th>Entry / Live</th><th>Margin</th><th>PnL</th><th>Action</th></tr>
          ${d.positions.map(p => {
            const isProfit = Number(p.pnl) >= 0;
            return `<tr>
              <td><b><a href="#agentChart" class="chartCoinLink" data-coin="${p.coin}" data-entry="${p.entryPrice}" data-dir="${p.direction}" style="color:#38bdf8">${p.symbol} 📈</a></b></td>
              <td><span class="tag ${p.direction === 'LONG' ? 'up' : 'down'}">${p.direction}</span> <b>${p.leverage}x</b></td>
              <td>${p.entryPrice} / ${p.markPrice}</td>
              <td>$${p.margin}</td>
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
        if (!confirm(`Close position?`)) return;
        await closePositionApi({ symbol: btn.dataset.sym, positionId: btn.dataset.id, direction: btn.dataset.dir, holdVol: btn.dataset.vol });
        await refreshStatus();
      });
    }
  } catch (e) {}
}

async function runAgentTrade(isAutoLoop = false) {
  const secret = $('sec').value.trim();
  if (!secret) { if (!isAutoLoop) alert('Enter Agent Password!'); return; }
  saveCfg();

  const marginVal = Math.max(0.5, +$('margin').value || 1);
  const isAutoLev = $('autoLev').value === 'auto';
  const stratMode = $('stratMode') ? $('stratMode').value : 'ALL25';

  if (!isAutoLoop) $('runOnceBtn').disabled = true;
  $('statusMsg').innerHTML = `🤖 <b>Scanning 25 Methods for next trade...</b>`;

  try {
    const r = await fetch('/api/futures-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'scan_and_trade',
        secret,
        strategyMode: stratMode,
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
  if (!isAutoLoop) $('runOnceBtn').disabled = false;
}

$('runOnceBtn').onclick = () => runAgentTrade(false);
$('refreshBtn').onclick = refreshStatus;

$('autoToggleBtn').onclick = () => {
  autoPilot = !autoPilot;
  $('autoToggleBtn').textContent = `🔄 Start Auto-Pilot (Continuous Loop): ${autoPilot ? 'ON (Active)' : 'OFF'}`;
  $('autoToggleBtn').style.background = autoPilot ? '#2ecc9a' : '#f0b429';
  if (autoPilot) {
    refreshStatus();
  }
};

initChart();
renderLogs();
loadChartCoin('BTC');
refreshStatus();
setInterval(refreshStatus, 5000);
