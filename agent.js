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

// Load saved settings
const savedCfg = ls.get('mexcAgentCfg', { sec: '', margin: 10, lev: 10, tf: '15m' });
$('sec').value = savedCfg.sec || '';
$('margin').value = savedCfg.margin || 10;
$('lev').value = savedCfg.lev || 10;
$('tf').value = savedCfg.tf || '15m';

const saveCfg = () => ls.set('mexcAgentCfg', {
  sec: $('sec').value.trim(),
  margin: +$('margin').value || 10,
  lev: +$('lev').value || 10,
  tf: $('tf').value
});
['sec', 'margin', 'lev', 'tf'].forEach(id => $(id).onchange = saveCfg);

let autoPilot = false, autoTimer = null;

function renderLogs() {
  const logs = ls.get('mexcAgentLogs', []);
  if (!logs.length) {
    $('logList').innerHTML = '<p class="msg">No trades executed by AI Agent yet.</p>';
    return;
  }
  $('logList').innerHTML = '<table><tr><th>Time</th><th>Coin &amp; Side</th><th>Entry / SL / TP</th><th>AI Reasoning</th></tr>' +
    logs.map(l => `<tr>
      <td><small>${new Date(l.time).toLocaleString()}</small></td>
      <td><b>${l.coin}_USDT</b><br><span class="tag ${l.direction === 'LONG' ? 'up' : 'down'}">${l.direction} (${l.leverage}x)</span><br><small>Margin: $${l.margin}</small></td>
      <td>Entry: <b>${l.entry}</b><br><span class="down">SL: ${l.sl}</span><br><span class="up">TP: ${l.tp}</span></td>
      <td><small>${l.reason} (Conf: ${l.confidence}%)</small></td>
    </tr>`).join('') + '</table>';
}

// Fetch Live MEXC Futures Balance & Open Positions (PnL)
async function refreshStatus() {
  const secret = $('sec').value.trim();
  if (!secret) return;
  saveCfg();

  try {
    const r = await fetch(`/api/futures-agent?action=status&secret=${encodeURIComponent(secret)}`);
    const d = await r.json();
    if (!r.ok || d.error) {
      $('statusMsg').innerHTML = `<span class="down">⚠ ${d.error || 'Connection failed'}</span>`;
      return;
    }

    $('BAL').innerHTML = `<h3>💼 MEXC Futures Account</h3>
      <p>Available USDT: <b class="up">$${d.balance}</b> &nbsp;|&nbsp; Total Equity: <b>$${d.equity}</b> &nbsp;|&nbsp; Open Positions: <b>${d.positions.length}</b></p>`;

    if (!d.positions.length) {
      $('POS').innerHTML = `<h3>📊 Live MEXC Futures Positions (Profit / Loss)</h3><p class="msg">No open Futures positions right now.</p>`;
    } else {
      $('POS').innerHTML = `<h3>📊 Live MEXC Futures Positions (Profit / Loss)</h3>
        <table>
          <tr><th>Contract</th><th>Side / Lev</th><th>Entry Price</th><th>Margin</th><th>Live Profit / Loss</th><th>Action</th></tr>
          ${d.positions.map(p => {
            const isProfit = Number(p.pnl) >= 0;
            return `<tr>
              <td><b>${p.symbol}</b><br><small class="msg">${new Date(p.openTime).toLocaleTimeString()}</small></td>
              <td><span class="tag ${p.direction === 'LONG' ? 'up' : 'down'}">${p.direction}</span> <b>${p.leverage}x</b></td>
              <td>${p.entryPrice}</td>
              <td>$${p.margin}</td>
              <td class="${isProfit ? 'up' : 'down'}" style="font-size:1.05em">
                <b>${isProfit ? '+' : ''}$${p.pnl} USDT (${isProfit ? '+' : ''}${p.roe}%)</b>
              </td>
              <td><button class="moreBtn closeBtn" data-sym="${p.symbol}" data-id="${p.positionId}" data-dir="${p.direction}" style="margin:0;padding:4px 8px">Close</button></td>
            </tr>`;
          }).join('')}
        </table>`;
    }
    $('statusMsg').innerHTML = `<span class="up">✓ Connected to MEXC Futures Live (${new Date().toLocaleTimeString()})</span>`;
  } catch (e) {
    $('statusMsg').innerHTML = `<span class="down">⚠ Network error checking MEXC status.</span>`;
  }
}

// Scan Top 30 Coins & Execute Best Trade via Gemini AI
async function runAgentTrade() {
  const secret = $('sec').value.trim();
  if (!secret) { alert('Please enter your Agent Password first!'); return; }
  saveCfg();

  $('runOnceBtn').disabled = true;
  $('statusMsg').innerHTML = '🤖 <b>Scanning Top 30 Coins &amp; Consulting Gemini AI...</b>';

  try {
    const r = await fetch('/api/futures-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'scan_and_trade',
        secret,
        marginUsdt: +$('margin').value || 10,
        leverage: +$('lev').value || 10,
        timeframe: $('tf').value
      })
    });
    const d = await r.json();
    if (!r.ok || d.error) {
      $('statusMsg').innerHTML = `<span class="down">❌ Error: ${d.error}</span>`;
    } else {
      const logs = ls.get('mexcAgentLogs', []);
      logs.unshift({
        time: Date.now(),
        coin: d.pick.coin,
        direction: d.pick.direction,
        leverage: +$('lev').value || 10,
        margin: +$('margin').value || 10,
        entry: d.pick.entry,
        sl: d.pick.sl,
        tp: d.pick.tp,
        confidence: d.pick.confidence,
        reason: d.pick.reason
      });
      ls.set('mexcAgentLogs', logs.slice(0, 50));
      renderLogs();
      $('statusMsg').innerHTML = `<span class="up">✅ AI Executed ${d.pick.direction} on ${d.pick.coin}_USDT!</span>`;
      await refreshStatus();
    }
  } catch (e) {
    $('statusMsg').innerHTML = `<span class="down">❌ Execution failed: ${e.message}</span>`;
  }
  $('runOnceBtn').disabled = false;
}

$('runOnceBtn').onclick = runAgentTrade;
$('refreshBtn').onclick = refreshStatus;

$('autoToggleBtn').onclick = () => {
  autoPilot = !autoPilot;
  $('autoToggleBtn').textContent = `🔄 Start 24/7 Auto-Pilot: ${autoPilot ? 'ON (Active)' : 'OFF'}`;
  $('autoToggleBtn').style.background = autoPilot ? '#2ecc9a' : '#f0b429';
  if (autoPilot) {
    runAgentTrade();
    autoTimer = setInterval(runAgentTrade, 15 * 60 * 1000); // Scans & trades every 15 mins
  } else {
    clearInterval(autoTimer);
  }
};

renderLogs();
refreshStatus();
setInterval(refreshStatus, 10000); // Live PnL updates every 10 seconds
