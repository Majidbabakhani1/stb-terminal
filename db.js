'use strict';
// ═══════════════════════════════════════════
// STB v17.7 — db.js
// Supabase: save/load trades, rejected signals, logs
// نیاز دارد: config.js (SB, DEMO, DB, demoLog, updateDemoUI)
// ═══════════════════════════════════════════

// ─── Supabase JS Client (legacy init) ───────────────
let _sb = null;
function initSupabase() {
  try {
    _sb = supabase.createClient(SB.url, SB.key);
    _sb.from('trades').select('id').limit(1).then(({error}) => {
      const el = document.getElementById('sbStatus');
      if (error && error.code === '42P01') {
        if(el){el.textContent='⚠️ جدول نیاز به ساخت';el.style.color='var(--a)';}
        demoLog('⚠️ Supabase: جدول trades رو در dashboard بساز');
      } else {
        if(el){el.textContent='✅ متصل';el.style.color='var(--g)';}
        demoLog('✅ Supabase متصل شد');
      }
    });
  } catch(e) { console.warn('Supabase:', e.message); }
}

// ─── REST Generic Request ────────────────────────────
async function sbReq(method, table, body=null, query='') {
  if (!SB.enabled) return null;
  try {
    const r = await fetch(`${SB.url}/rest/v1/${table}${query}`, {
      method,
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SB.key,
        'Authorization': 'Bearer ' + SB.key,
        'Prefer':        method==='POST' ? 'return=representation' : '',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) {
      const err = await r.text();
      console.warn('Supabase error:', r.status, err.slice(0,100));
      return null;
    }
    return method==='DELETE' ? true : await r.json();
  } catch(e) {
    console.warn('Supabase fetch error:', e.message);
    return null;
  }
}

// ─── Save Trade ──────────────────────────────────────
async function sbSaveTrade(trade) {
  if (!SB.enabled) return;
  const row = {
    signal_id:      trade.signalId,
    session_id:     SB.sessionId,
    sym:            trade.sym,
    label:          DB[trade.sym]?.label || trade.sym,
    dir:            trade.dir,
    strategy:       trade.strategy || 'AUTO',
    entry:          trade.entry,
    exit:           trade.exit,
    sl:             trade.sl,
    tp:             trade.tp,
    rr:             trade.rr,
    leverage:       trade.leverage || 1,
    trade_amount:   trade.tradeAmount,
    position_value: (trade.tradeAmount||100) * (trade.leverage||1),
    gross_pnl:      trade.grossPnl,
    commission:     trade.commission,
    net_pnl:        trade.netPnl,
    pnl_pct:        trade.pnlPct,
    max_advance:    trade.maxAdv || 0,
    max_adverse:    trade.maxAdverse || 0,
    duration_min:   trade.duration,
    status:         trade.status,
    win:            trade.win,
    buy_score:      trade.buyScore || 0,
    sell_score:     trade.sellScore || 0,
    rsi_entry:      trade.rsiAtEntry || 0,
    ai_confidence:  trade.aiConfidence || 0,
    ai_provider:    trade.aiProvider || 'internal',
    entry_time:     trade.entryTime,
    exit_time:      trade.exitTime,
    balance_after:  trade.balanceAfter,
    created_at:     new Date().toISOString(),
  };
  const result = await sbReq('POST', 'trades', row);
  if (result) demoLog(`💾 ذخیره در DB: [${trade.signalId}] ${trade.win?'WIN':'LOSS'}`);
}

// legacy wrapper (compat)
async function saveTrade(tr) {
  await sbSaveTrade(tr);
}

// ─── Save Rejected Signal ────────────────────────────
async function sbSaveReject(sym, price, reason, score, rr, sig) {
  if (!SB.enabled) return;
  await sbReq('POST', 'rejects', {
    session_id: SB.sessionId,
    sym, label: DB[sym]?.label||sym,
    price, sig: sig||'?',
    score, rr,
    reason,
    created_at: new Date().toISOString(),
  });
}

// legacy wrapper
async function saveRejected(sym, price, reason, score, sig) {
  await sbSaveReject(sym, price, reason, score, 0, sig);
}

// ─── Load Trades ─────────────────────────────────────
async function sbLoadTrades() {
  const rows = await sbReq('GET', 'trades', null, '?order=created_at.desc&limit=500');
  if (!rows?.length) return;
  const existing = new Set(DEMO.trades.map(t=>t.signalId));
  let added = 0;
  for (const row of rows) {
    if (!existing.has(row.signal_id)) {
      DEMO.trades.push({
        signalId:     row.signal_id,
        sym:          row.sym,
        dir:          row.dir,
        strategy:     row.strategy,
        entry:        row.entry,
        exit:         row.exit,
        sl:           row.sl,
        tp:           row.tp,
        rr:           row.rr,
        leverage:     row.leverage,
        tradeAmount:  row.trade_amount,
        netPnl:       row.net_pnl,
        grossPnl:     row.gross_pnl,
        commission:   row.commission,
        pnlPct:       row.pnl_pct,
        maxAdv:       row.max_advance,
        duration:     row.duration_min,
        status:       row.status,
        win:          row.win,
        buyScore:     row.buy_score,
        sellScore:    row.sell_score,
        aiConfidence: row.ai_confidence,
        entryTime:    row.entry_time,
        exitTime:     row.exit_time,
        balanceAfter: row.balance_after,
      });
      added++;
    }
  }
  if (added > 0) {
    demoLog(`📂 ${added} معامله از DB بارگذاری شد`);
    updateDemoUI();
  }
}

// legacy wrapper
async function loadTradeHistory() {
  return sbLoadTrades();
}

// ─── Init DB ─────────────────────────────────────────
async function sbInit() {
  if (!SB.enabled) return;
  demoLog('🔌 اتصال به Supabase...');
  const test = await sbReq('GET', 'trades', null, '?limit=1');
  if (test !== null) {
    demoLog('✅ Supabase متصل شد | جلسه: ' + SB.sessionId);
    await sbLoadTrades();
    const testLog = await sbReq('GET','logs',null,'?limit=1');
    if (testLog === null) {
      demoLog('⚠️ جدول logs در Supabase نیست — بساز:\nCREATE TABLE logs (id bigserial PRIMARY KEY, session_id text, message text, created_at timestamptz DEFAULT now());\nALTER TABLE logs ENABLE ROW LEVEL SECURITY;\nCREATE POLICY "allow all" ON logs FOR ALL USING (true) WITH CHECK (true);');
    }
  } else {
    demoLog('⚠️ Supabase: جدول trades وجود ندارد');
    SB.enabled = false;
  }
}
