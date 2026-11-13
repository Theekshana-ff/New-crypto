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

// Load saved configuration
const cfg = ls.get('mexc100Cfg', {
  sec: '', autoMargin: 'auto', margin: 2, autoLev: 'auto', lev: 15,
  dailyGoal: 5, lockRetention: 90, maxLossRoe: 10, tpRoe: 35, tf: '15m'
});
$('sec').value = cfg.sec || '';
$('autoMargin').value = cfg.autoMargin || 'auto';
$('margin').value = cfg.margin != null ? cfg.margin : 2;
$('autoLev').value = cfg.autoLev || 'auto';
$('lev').value = cfg.lev || 15;
$('dailyGoal').value = cfg.dailyGoal != null ? cfg.dailyGoal : 5;
$('lockRetention').value = cfg.lockRetention != null ? cfg.lockRetention : 90;
$('maxLossRoe').value = cfg.maxLossRoe != null ? cfg.maxLossRoe : 10;
$('tpRoe').value = cfg.tpRoe != null ? cfg.tpRoe : 35;
$('tf').value = cfg.tf || '15m';

function updateInputStates() {
  $('margin').disabled = $('autoMargin').value === 'auto';
  $('margin').style.opacity = $('autoMargin').value === 'auto' ? '0.5' : '1';
  $('lev').disabled = $('autoLev').value === 'auto';
  $('lev').style.opacity = $('autoLev').value === 'auto' ? '0.5' : '1';
}
updateInputStates();

function saveCfg() {
  updateInputStates();
  ls.set('mexc100Cfg', {
    sec: $('sec').value.trim(),
    autoMargin: $('autoMargin').value,
    margin: +$('margin').value || 2,
    autoLev: $('autoLev').value,
    lev: +$('lev').value || 15,
    dailyGoal: +$('dailyGoal').value || 5,
    lockRetention: +$('lockRetention').value || 90,
    maxLossRoe: +$('maxLossRoe').value || 10,
    tpRoe: +$('tpRoe').value || 35,
    tf: $('tf').value
  });
}
['sec', 'autoMargin', 'margin', 'autoLev', 'lev', 'dailyGoal', 'lockRetention', 'maxLossRoe', 'tpRoe', 'tf'].forEach(id => {
  if ($(id)) $(id).onchange = saveCfg;
});

// --- CHART SETUP ---
let chart, candleSeries, emaSeries, priceLines = [];
let currentChartCoin = 'BTC', currentLevels = null;

function initChart() {
  const box = $('agentChart');
  if (!box || !window.LightweightCharts) return;
  chart = LightweightCharts.createChart(box, {
    width: box.clientWidth,
    height: 340,
    layout: { background: { color: '#0e1621' }, textColor: '#d7e3f4' },
    grid: { vertLines: { color: '#1b2838' }, horzLines: { color: '#1b2838' } },
    timeScale: { timeVisible: true, secondsVisible: false }
  });
  candleSeries = chart.addCandlestickSeries({
    upColor: '#2ecc9a', downColor: '#ff5d5d', borderVisible: false, wickUpColor: '#2ecc9a', wickDownColor: '#ff5d5d'
  });
  emaSeries = chart.addLineSeries({ color: '#38bdf8', lineWidth: 2, title: 'EMA 21' });
  window.addEventListener('resize', () => chart && chart.applyOptions({ width: box.clientWidth }));
}

async function loadChartCoin(coin, levels = null) {
  if (!chart) initChart();
  if (!chart) return;
  currentChartCoin = coin || currentChartCoin;
  if (levels) currentLevels = levels;
  const tf = $('tf').value || '15m';

  try {
    const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${currentChartCoin}USDT&interval=${tf}&limit=150`);
    if (!r.ok) return;
    const raw = await r.json();
    const candles = raw.map(x => ({
      time: Math.floor(x[0] / 1000), open: +x[1], high: +x[2], low: +x[3], close: +x[4]
    }));
    if (!candles.length) return;
    candleSeries.setData(candles);

    const k = 2 / 22;
    let ema = candles[0].close;
    emaSeries.setData(candles.map(c => { ema = c.close * k + ema * (1 - k); return { time: c.time, value: ema }; }));

    $('chartHeader').textContent = `📈 Live AI Trade Chart (${currentChartCoin}/USDT · ${tf})`;
    priceLines.forEach(l => candleSeries.removePriceLine(l));
    priceLines = [];
    if (currentLevels && currentLevels.coin === currentChartCoin) {
      if (currentLevels.entry) priceLines.push(candleSeries.createPriceLine({ price: +currentLevels.entry, color: '#38bdf8', lineWidth: 2, lineStyle: 2, title: 'ENTRY' }));
      if (currentLevels.sl) priceLines.push(candleSeries.createPriceLine({ price: +currentLevels.sl, color: '#ff5d5d', lineWidth: 2, lineStyle: 2, title: 'SL (-10%)' }));
      if (currentLevels.tp) priceLines.push(candleSeries.createPriceLine({ price: +currentLevels.tp, color: '#2ecc9a', lineWidth: 2, lineStyle: 2, title: 'TP' }));
    }
  } catch (e) {}
}

// --- STATE FOR 90% PROFIT LOCK & 10% LOSS SHIELD ---
let autoPilot = false, isScanning = false, lastScanTime = 0;
let closingIds = new Set();
let peakTracker = ls.get('mexcPeakTracker', {}); // tracks { positionId: { peakPnl, peakRoe } }
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

  // If closed in loss, put coin on 15-min cooldown so AI picks a fresh coin next
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
  const goal = +$('dailyGoal').value || 5;
  $('wDaily').textContent = `${dailyProfit >= 0 ? '+' : ''}$${dailyProfit.toFixed(3)} / $${goal.toFixed(2)}`;
  $('wDaily').className = dailyProfit >= 0 ? 'up' : 'down';

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
    $('statusMsg').innerHTML = `<span class="up">⚡ <b>${reasonLabel}</b> on ${p.symbol}! Profit/Balance secured in Wallet. Preparing next 100-coin scan...</span>`;
  } catch (e) {}
  closingIds.delete(p.positionId);
}

// LIVE MONITOR (EVERY 3 SECONDS): WALLET + 90% PROFIT LOCK + 10% LOSS SHIELD
async function refreshLiveStatus() {
  const secret = $('sec').value.trim();
  if (!secret) return;
  saveCfg();

  try {
    const r = await fetch(`/api/futures-agent?action=status&secret=${encodeURIComponent(secret)}`);
    const d = await r.json();
    if (!r.ok || d.error) return;

    // Update top wallet banner
    $('wBal').textContent = `$${d.balance} USDT`;
    $('wEq').textContent = `$${d.equity} USDT`;
    const totPnl = Number(d.totalPnl || 0);
    $('wPnl').textContent = `${totPnl >= 0 ? '+' : ''}$${totPnl.toFixed(4)} USDT`;
    $('wPnl').className = totPnl >= 0 ? 'up' : 'down';

    const dailyProfit = getTodayRealizedProfit();
    const dailyGoal = +$('dailyGoal').value || 5;
    $('wDaily').textContent = `${dailyProfit >= 0 ? '+' : ''}$${dailyProfit.toFixed(3)} / $${dailyGoal.toFixed(2)}`;

    // Detect positions closed by exchange
    const openIds = new Set(d.positions.map(p => String(p.positionId)));
    Object.keys(activeSnapshot).forEach(oldId => {
      if (!openIds.has(String(oldId))) {
        recordClosedTrade(activeSnapshot[oldId], 'Exchange TP/SL Executed');
        delete peakTracker[oldId];
      }
    });
    const nextSnap = {};
    d.positions.forEach(p => { nextSnap[p.positionId] = p; });
    activeSnapshot = nextSnap;
    ls.set('mexcActiveSnap', activeSnapshot);

    const retentionPct = (+$('lockRetention').value || 90) / 100; // default 0.90 (90% lock)
    const maxLossRoe = Math.abs(+$('maxLossRoe').value || 10);    // default -10% ROE cut
    const fullTpRoe = +$('tpRoe').value || 35;

    for (const p of d.positions) {
      const livePnl = Number(p.pnl);
      const liveRoe = Number(p.roe);
      const prev = peakTracker[p.positionId] || { peakPnl: 0, peakRoe: 0 };

      if (livePnl > prev.peakPnl) prev.peakPnl = livePnl;
      if (liveRoe > prev.peakRoe) prev.peakRoe = liveRoe;
      peakTracker[p.positionId] = prev;
      ls.set('mexcPeakTracker', peakTracker);

      // RULE 1: 90% PROFIT LOCK!
      // Once trade reaches meaningful profit (e.g. >= +3% ROE or >= $0.05 USDT), lock 90% of Peak Profit.
      // Example: Peak Profit is $1.00 -> Lock Floor is $0.90. If livePnl drops to <= $0.90, close immediately!
      const lockActive = prev.peakRoe >= 3.0 || prev.peakPnl >= 0.05;
      const lockedPnlFloor = lockActive ? +(prev.peakPnl * retentionPct).toFixed(4) : null;
      const lockedRoeFloor = lockActive ? +(prev.peakRoe * retentionPct).toFixed(2) : null;

      if (fullTpRoe > 0 && liveRoe >= fullTpRoe) {
        await closePositionNow(p, `Full Take-Profit Hit (+${liveRoe}% ROE)`);
      } else if (lockActive && (livePnl <= lockedPnlFloor || liveRoe <= lockedRoeFloor)) {
        await closePositionNow(
          p,
          `90% Profit Lock Triggered (Peak $${prev.peakPnl.toFixed(3)} -> Locked $${livePnl.toFixed(3)} into Wallet)`
        );
      } else if (liveRoe <= -maxLossRoe) {
        // RULE 2: 10% LOSS SHIELD (Saves 90% of Margin back to Wallet)
        await closePositionNow(
          p,
          `10% Loss Shield Triggered (${liveRoe}% ROE -> 90% Margin Saved to Wallet)`
        );
      }
    }

    // Render Live Position Table
    if (!d.positions.length) {
      $('POS').innerHTML = `<h3>⚡ Active Futures Trade (Live Profit, Peak Profit &amp; 90% Lock Floor)</h3>
        <p class="msg">No open position right now. ${autoPilot ? '🤖 Auto-Pilot is ready to scan 100 coins for the next trade...' : ''}</p>`;

      // Check if $5 Daily Goal is reached
      if (dailyGoal > 0 && dailyProfit >= dailyGoal) {
        if (autoPilot) {
          autoPilot = false;
          $('autoToggleBtn').textContent = '▶️ Start 100-Coin Auto-Pilot: OFF';
          $('autoToggleBtn').style.background = '#2ecc9a';
        }
        $('statusMsg').innerHTML = `<span class="up">🎉 <b>DAILY $${dailyGoal} PROFIT TARGET ACHIEVED (+$${dailyProfit.toFixed(3)} USDT)!</b> Auto-Pilot paused so your profit stays safe in your wallet.</span>`;
        return;
      }

      // AUTO-START NEXT TRADE IMMEDIATELY AFTER PREVIOUS TRADE CLOSES
      if (autoPilot && !isScanning && (Date.now() - lastScanTime > 12000)) {
        scanAndOpenBestTrade(true);
      }
    } else {
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

      const active = d.positions[0];
      loadChartCoin(active.coin, { coin: active.coin, entry: active.entryPrice });

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

async function scanAndOpenBestTrade(isAuto = false) {
  const secret = $('sec').value.trim();
  if (!secret) { if (!isAuto) alert('Please enter your Agent Password (AGENT_SECRET)!'); return; }
  saveCfg();

  isScanning = true;
  lastScanTime = Date.now();
  if (!isAuto) $('runOnceBtn').disabled = true;
  $('statusMsg').innerHTML = `🤖 <b>Scanning 100 MEXC Futures Coins &amp; Calculating Best Trade Setup...</b>`;

  const now = Date.now();
  const activeCooldowns = Object.keys(cooldownMap).filter(sym => cooldownMap[sym] > now);

  try {
    const r = await fetch('/api/futures-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'scan_and_trade',
        secret,
        autoMargin: $('autoMargin').value === 'auto',
        marginUsdt: +$('margin').value || 2,
        autoLeverage: $('autoLev').value === 'auto',
        leverage: +$('lev').value || 15,
        timeframe: $('tf').value,
        cooldownCoins: activeCooldowns
      })
    });
    const d = await r.json();
    if (!r.ok || d.error) {
      $('statusMsg').innerHTML = `<span class="down">${d.error}</span>`;
    } else {
      const pick = d.pick;
      const exec = d.exec;
      const radar = pick.topCandidates || [];

      $('RADAR').innerHTML = `<h3>📡 100-Coin AI Scanner Result (Scanned ${d.scannedCount} Active Coins)</h3>
        <p style="margin:6px 0">🏆 <b>Winner Opened: ${exec.symbol}</b> <span class="tag ${pick.direction === 'LONG' ? 'up' : 'down'}">${pick.direction} ${exec.leverage}x</span> · Margin: <b>$${d.usedMargin} USDT</b> · Score: <b>${pick.confidence}%</b></p>
        <p style="margin:4px 0"><small>${pick.reason}</small></p>
        ${radar.length ? `<table style="margin-top:8px"><tr><th>Rank</th><th>Coin</th><th>Direction</th><th>24h Change</th><th>AI Score</th></tr>
          ${radar.map((c, i) => `<tr><td>#${i + 1}</td><td><b>${c.coin}_USDT</b></td><td><span class="tag ${c.direction === 'LONG' ? 'up' : 'down'}">${c.direction}</span></td><td>${c.change24h}</td><td><b>${c.confidence}%</b></td></tr>`).join('')}
        </table>` : ''}`;

      loadChartCoin(pick.coin, { coin: pick.coin, entry: exec.entryPrice, sl: pick.sl, tp: pick.tp });
      $('statusMsg').innerHTML = `<span class="up">✅ Opened ${pick.direction} on ${exec.symbol} ($${d.usedMargin} @ ${exec.leverage}x)! 90% Profit Lock &amp; 10% Loss Shield Active.</span>`;
      await refreshLiveStatus();
    }
  } catch (e) {
    $('statusMsg').innerHTML = `<span class="down">Scan request failed. Retrying...</span>`;
  }

  isScanning = false;
  if (!isAuto) $('runOnceBtn').disabled = false;
}

$('runOnceBtn').onclick = () => scanAndOpenBestTrade(false);
$('refreshBtn').onclick = refreshLiveStatus;

$('autoToggleBtn').onclick = () => {
  autoPilot = !autoPilot;
  $('autoToggleBtn').textContent = `▶️ Start 100-Coin Auto-Pilot: ${autoPilot ? 'ON (Running)' : 'OFF'}`;
  $('autoToggleBtn').style.background = autoPilot ? '#f0b429' : '#2ecc9a';
  if (autoPilot) {
    lastScanTime = 0;
    refreshLiveStatus();
  }
};

initChart();
renderClosedHistory();
loadChartCoin('BTC');
refreshLiveStatus();
setInterval(refreshLiveStatus, 3000); // Checks live profit & 90% lock every 3 seconds
