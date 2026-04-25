'use strict';
// ═══════════════════════════════════════════
// STB v17.7 — trade.js
// openDemoPos, closeDemoPos, monitorDemoPos
// SmartTP, SmartSL, SmartPM, ReverseMode
// نیاز دارد: config.js, signal.js, ai.js, db.js, ui.js
// ═══════════════════════════════════════════

// ─── OPEN POSITION ──────────────────────────────────
function openDemoPos(sym, sigResult, price) {
  if (!sigResult || sigResult.sig === 'wait') return;
  if (DEMO.openPositions.find(p => p.sym===sym && p.status==='Open')) {
    demoLog(`⚠️ پوزیشن باز روی ${DB[sym]?.label||sym} وجود دارد`);
    return;
  }
  if (DEMO.openPositions.length >= DEMO_CONFIG.maxOpenPositions) {
    demoLog(`⚠️ حداکثر ${DEMO_CONFIG.maxOpenPositions} پوزیشن همزمان`);
    return;
  }
  if (DEMO.balance < DEMO.tradeAmount) {
    demoLog(`⚠️ موجودی کافی نیست: $${DEMO.balance.toFixed(0)} < $${DEMO.tradeAmount}`);
    return;
  }

  const slip = Math.min(DEMO_CONFIG.slippage, 0.0003);
  const _rawDir = sigResult.sig;
  const dir = REVERSE_MODE ? (_rawDir==='buy'?'sell':'buy') : _rawDir;
  if (REVERSE_MODE) demoLog(`🔄 Reverse: ${_rawDir.toUpperCase()}→${dir.toUpperCase()}`);

  const entry = dir==='buy' ? price*(1+slip) : price*(1-slip);
  const commission = DEMO.tradeAmount * DEMO_CONFIG.commission;
  const leverage = DEMO_CONFIG.leverage || 1;
  const positionValue = DEMO.tradeAmount * leverage;
  const size = positionValue / entry;
  const liqPrice = leverage > 1
    ? (dir==='buy' ? entry*(1-1/leverage*0.9) : entry*(1+1/leverage*0.9))
    : 0;

  DEMO.balance -= commission;
  DEMO.cooldowns[sym] = Date.now();
  if (!DEMO.strategyStats) DEMO.strategyStats = {};
  const sKey = sigResult.strategy||'AUTO';
  if (!DEMO.strategyStats[sKey]) DEMO.strategyStats[sKey] = {trades:0,wins:0,losses:0,pnl:0,totalR:0};

  const pos = {
    signalId:    demoNextId(),
    sym,
    dir:         sigResult.sig,   // اصل — قبل از Reverse
    entry,
    entryRaw:    price,
    sl:          sigResult.sl,
    tp:          sigResult.tp,
    trailingSL:  sigResult.sl,
    trailingActive: false,
    size,
    rr:          sigResult.rr,
    wr:          sigResult.wr,
    strength:    sigResult.strength,
    commission,
    tradeAmount: DEMO.tradeAmount,
    entryTime:   Date.now(),
    entryTimeStr:nowStr(),
    status:      'Open',
    strategy:    sKey,
    leverage,
    margin:      DEMO.tradeAmount,
    liqPrice,
    maxAdv:      0,
    maxAdverse:  0,
    buyScore:    sigResult.buyScore,
    sellScore:   sigResult.sellScore,
    ema:         sigResult.ema,
    rsiAtEntry:  sigResult.rsi?.m5,
    volSurge:    sigResult.volSurge,
  };

  DEMO.openPositions.push(pos);
  updateDemoUI();
  if (BRIDGE?.enabled) sendToBridge(sym, sigResult, price);

  // Update panel title
  const _pt = document.getElementById('demoPanelTitle');
  if (_pt) _pt.textContent = 'STB v17.7';

  // Log
  const _modeIcon = ACTIVE_MODE==='PRECISION'?'🎯':ACTIVE_MODE==='SCALP'?'⚡':'⚖️';
  const _stratMap = {AUTO:'هوشمند AUTO',SMC:'SMC کامل',TREND:'Trend Following',BREAKOUT:'Breakout',MEAN_REV:'Mean Reversion',GANN:'Gann+SMC'};
  const _sName = _stratMap[sKey]||sKey;
  const _t = sigResult.trend||{};
  const _tSum = `H4:${_t.h4==='bull'?'↑':_t.h4==='bear'?'↓':'→'} M15:${_t.m15==='bull'?'↑':_t.m15==='bear'?'↓':'→'} M5:${_t.m5==='bull'?'↑':_t.m5==='bear'?'↓':'→'}`;
  const _rsi = +(sigResult.rsi?.m5||50);
  const _reasons = [];
  if(sigResult.nearRangeTop&&sigResult.sig==='sell')_reasons.push(`قله range (${Math.round((sigResult.rangePct||0)*100)}%)`);
  if(sigResult.nearRangeBottom&&sigResult.sig==='buy')_reasons.push(`کف range (${Math.round((sigResult.rangePct||0)*100)}%)`);
  if(sigResult.ema?.bull4h&&sigResult.sig==='buy')_reasons.push('EMA H4 صعودی');
  else if(!sigResult.ema?.bull4h&&sigResult.sig==='sell')_reasons.push('EMA H4 نزولی');
  if(sigResult.ema?.crossBull)_reasons.push('Golden Cross');
  else if(sigResult.ema?.crossBear)_reasons.push('Death Cross');
  if(_rsi<35&&sigResult.sig==='buy')_reasons.push(`RSI ${_rsi.toFixed(0)} اشباع فروش`);
  else if(_rsi>65&&sigResult.sig==='sell')_reasons.push(`RSI ${_rsi.toFixed(0)} اشباع خرید`);
  else _reasons.push(`RSI ${_rsi.toFixed(0)}`);
  if(sigResult.nearOB)_reasons.push(sigResult.sig==='buy'?'Demand OB ✅':'Supply OB ✅');
  if(sigResult.volSurge)_reasons.push('حجم بالا ✅');
  if(sigResult.aiConfidence)_reasons.push(`AI ${sigResult.aiConfidence}%`);

  demoLog(`📥 [${pos.signalId}] ${pos.dir.toUpperCase()} ${DB[sym]?.label||sym} @ ${fmt(entry,sym)} | ${_sName}`);
  demoLog(`   🎯 تحلیل: ${_reasons.join(' | ')}`);
  demoLog(`   📊 روند: ${_tSum} | Score: ${Math.max(sigResult.buyScore||0,sigResult.sellScore||0)} | ${pos.strength==='strong'?'💪 قوی':'نرمال'}`);
  demoLog(`   🛡 SL: ${fmt(pos.sl,sym)} | 🎯 TP: ${fmt(pos.tp,sym)} | R:R 1:${pos.rr.toFixed(2)} | کارمزد: $${commission.toFixed(3)}`);

  renderDemoOpenPos();
  if (isCanvas(sym) && S.candles[sym]?.length) drawChart(sym);
}

// ─── CLOSE POSITION ──────────────────────────────────
function closeDemoPos(pos, exitPrice, reason) {
  if (!pos) return;
  const idx = DEMO.openPositions.findIndex(p => p.signalId===pos.signalId);
  if (idx >= 0) DEMO.openPositions.splice(idx, 1);

  const slip = Math.min(DEMO_CONFIG.slippage, 0.0003);
  const exit = reason==='SL'
    ? (pos.dir==='buy' ? exitPrice*(1-slip) : exitPrice*(1+slip))
    : exitPrice;

  const rawPnl = pos.dir==='buy'
    ? (exit-pos.entry)*pos.size
    : (pos.entry-exit)*pos.size;
  const exitComm = pos.tradeAmount * DEMO_CONFIG.commission;
  const netPnl = rawPnl - exitComm;
  const pnlPct = (netPnl/pos.tradeAmount)*100;
  const duration = Math.round((Date.now()-pos.entryTime)/60000);

  DEMO.balance = Math.max(0, DEMO.balance + netPnl);

  const trade = {
    signalId:     pos.signalId,
    sym:          pos.sym,
    dir:          pos.dir,
    strategy:     pos.strategy||'AUTO',
    strength:     pos.strength||'normal',
    entry:        pos.entry,
    exit,
    sl:           pos.sl,
    tp:           pos.tp,
    size:         pos.size,
    rr:           pos.rr||0,
    wr:           pos.wr||0,
    tradeAmount:  pos.tradeAmount,
    leverage:     pos.leverage||1,
    margin:       pos.margin||pos.tradeAmount,
    positionValue:(pos.margin||pos.tradeAmount)*(pos.leverage||1),
    liqPrice:     pos.liqPrice||0,
    grossPnl:     rawPnl,
    commission:   (pos.commission||0)+exitComm,
    netPnl,
    pnlPct,
    maxAdv:       pos.maxAdv||0,
    maxAdverse:   pos.maxAdverse||0,
    duration,
    status:       reason==='TP'?'Closed (TP)':reason==='SL'?'Closed (SL)':'Closed (Manual)',
    win:          netPnl>0,
    entryTime:    pos.entryTimeStr||'',
    exitTime:     nowStr(),
    entryTs:      pos.entryTime,
    exitTs:       Date.now(),
    balanceAfter: DEMO.balance,
    buyScore:     pos.buyScore||0,
    sellScore:    pos.sellScore||0,
    rsiAtEntry:   pos.rsiAtEntry||0,
    aiConfidence: pos.aiConfidence||0,
    aiProvider:   pos.aiProvider||'internal',
  };

  DEMO.trades.push(trade);
  sbSaveTrade(trade);   // save to Supabase
  S.tradeLog.push({sym:trade.sym,dir:trade.dir,entry:trade.entry,exit:trade.exit,pnl:netPnl,rr:trade.rr,win:trade.win,time:trade.exitTime});

  // Strategy stats
  const sk = trade.strategy||'AUTO';
  if (!DEMO.strategyStats) DEMO.strategyStats = {};
  if (!DEMO.strategyStats[sk]) DEMO.strategyStats[sk] = {trades:0,wins:0,losses:0,pnl:0,totalR:0};
  DEMO.strategyStats[sk].trades++;
  if (trade.win) DEMO.strategyStats[sk].wins++;
  else DEMO.strategyStats[sk].losses++;
  DEMO.strategyStats[sk].pnl += netPnl;
  DEMO.strategyStats[sk].totalR = (DEMO.strategyStats[sk].totalR||0) + (+trade.rr||0);

  updateDemoUI();

  const pnlStr = (netPnl>=0?'+':'')+'$'+netPnl.toFixed(2)+' ('+(pnlPct>=0?'+':'')+pnlPct.toFixed(2)+'%)';
  const stratWR = DEMO.strategyStats[sk].trades>0
    ? Math.round(DEMO.strategyStats[sk].wins/DEMO.strategyStats[sk].trades*100) : 0;
  const maxAdvPct = pos.tp>pos.entry?(pos.maxAdv||0)/Math.abs(pos.tp-pos.entry)*100:0;

  demoLog(`${trade.win?'✅ WIN':'❌ LOSS'} [${pos.signalId}] ${reason} ${DB[pos.sym]?.label||pos.sym} @ ${fmt(exit,pos.sym)}`);
  demoLog(`   📈 Max پیشرفت: ${maxAdvPct.toFixed(0)}% از TP | ⏱ ${duration}min`);
  demoLog(`   💰 ${pnlStr} | موجودی: $${DEMO.balance.toFixed(0)}`);
  demoLog(`   📈 ${sk} | WR: ${stratWR}% | Avg R: ${(DEMO.strategyStats[sk].totalR/Math.max(1,DEMO.strategyStats[sk].trades)).toFixed(2)}`);

  fireAlarm(
    `${trade.win?'✅':'❌'} ${reason} — ${DB[pos.sym]?.label||pos.sym}`,
    pnlStr+' | R:R 1:'+(trade.rr||0).toFixed(1),
    trade.win?'buy':'sell'
  );

  renderDemoOpenPos();
  if (isCanvas(pos.sym)&&S.candles[pos.sym]?.length) drawChart(pos.sym);
}

// ─── MONITOR POSITIONS (price tick) ─────────────────
function monitorDemoPos(sym, price) {
  const positions = DEMO.openPositions.filter(p => p.sym===sym && p.status==='Open');
  for (const pos of positions) {
    const { dir } = pos;

    // Smart SL update
    updateSmartSL(pos, price);

    // Max advance tracking
    const adv = dir==='buy' ? price-pos.entry : pos.entry-price;
    const adverse = dir==='buy' ? pos.entry-price : price-pos.entry;
    if (adv > (pos.maxAdv||0)) {
      pos.maxAdv = adv;
      const tpDist = Math.abs(pos.entry-pos.tp);
      if (!pos.trailingActive && tpDist>0 && adv >= tpDist*DEMO_CONFIG.trailActivePct) {
        pos.trailingActive = true;
        demoLog(`🔄 [${pos.signalId}] Trailing Stop فعال @ ${fmt(price,sym)}`);
      }
    }
    if (adverse > (pos.maxAdverse||0)) pos.maxAdverse = adverse;

    // Update trailing SL (legacy distance-based)
    if (pos.trailingActive) {
      const slDist = Math.abs(pos.entry-pos.sl) * DEMO_CONFIG.trailDistance;
      if (dir==='buy') {
        const newSL = price - slDist;
        if (newSL > pos.trailingSL) pos.trailingSL = newSL;
      } else {
        const newSL = price + slDist;
        if (newSL < pos.trailingSL) pos.trailingSL = newSL;
      }
    }

    const effectiveSL = pos.trailingActive ? pos.trailingSL : pos.sl;

    // Global SL (dollar-based)
    if (DEMO_CONFIG.globalMaxLossUSD > 0) {
      const lossUSD = (dir==='buy'
        ? (pos.entry-price)/pos.entry
        : (price-pos.entry)/pos.entry) * pos.tradeAmount * (pos.leverage||1);
      if (!pos.trailingActive && lossUSD >= DEMO_CONFIG.globalMaxLossUSD) {
        demoLog(`🛑 Global SL [${pos.signalId}] ضرر $${lossUSD.toFixed(2)}`);
        closeDemoPos(pos, price, 'GlobalSL');
        continue;
      }
    }

    // Liquidation
    if (pos.liqPrice && pos.leverage>1) {
      if ((dir==='buy'&&price<=pos.liqPrice)||(dir==='sell'&&price>=pos.liqPrice)) {
        demoLog(`💥 [${pos.signalId}] LIQUIDATED @ ${fmt(price,sym)} | لوریج ${pos.leverage}×`);
        closeDemoPos(pos, price, 'Liquidation');
        continue;
      }
    }

    // SL check
    if ((dir==='buy'&&price<=effectiveSL)||(dir==='sell'&&price>=effectiveSL)) {
      closeDemoPos(pos, price, 'SL');
      continue;
    }

    // TP check — FIX: مشکل اصلی ذکر شده در باگ گزارش
    // اطمینان از اینکه TP درست چک میشه
    if (dir==='buy' && price >= pos.tp && pos.tp > pos.entry) {
      closeDemoPos(pos, price, 'TP');
      continue;
    }
    if (dir==='sell' && price <= pos.tp && pos.tp < pos.entry) {
      closeDemoPos(pos, price, 'TP');
      continue;
    }
  }
  const drawer = document.getElementById('demoDrawer');
  if (drawer?.classList.contains('open') && positions.length) renderDemoOpenPos();
}

// ─── AUTO TRADE TRIGGER ──────────────────────────────
function checkAutoTrade(sym, sigResult, price) {
  if (!DEMO.autoOn) return;
  if (!sigResult || sigResult.sig==='wait') return;
  const src = DB[sym]?.src||'';
  if (src==='av'||src==='tv') return;
  if (src!=='binance'&&!sym.endsWith('USDT')) return;
  if (FULL_SCAN.enabled&&FULL_SCAN._activeSyms?.length&&!FULL_SCAN._activeSyms.includes(sym)) return;
  if (sigResult.strength!=='strong') return;
  if (Date.now()-(DEMO.cooldowns[sym]||0) < DEMO_CONFIG.cooldownMs) return;
  if (DEMO.openPositions.find(p=>p.sym===sym&&p.status==='Open')) return;
  if (DEMO.openPositions.length>=(DEMO_CONFIG.maxOpenPositions||10)) return;
  if (DEMO.balance < DEMO.tradeAmount) { demoLog(`⚠️ موجودی کم: $${DEMO.balance.toFixed(0)}`); return; }

  const mode = TRADING_MODES[ACTIVE_MODE]||TRADING_MODES.BALANCED;
  const score = Math.max(sigResult.buyScore||0, sigResult.sellScore||0);

  if (sigResult.rr < mode.minRR) {
    const hm=new Date().toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'});
    demoLog(`⏭ [${hm}] ${DB[sym]?.label||sym} | R:R ${sigResult.rr.toFixed(2)}<${mode.minRR}`);
    return;
  }
  if (score < mode.minScore) {
    DEMO._rejectCount = (DEMO._rejectCount||0)+1;
    const hm=new Date().toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'});
    demoLog(`⏭ [${hm}] ${DB[sym]?.label||sym} | Score ${score.toFixed(1)}<${mode.minScore} | ${sigResult.sig?.toUpperCase()||'?'}`);
    sbSaveReject(sym, price, 'Score<'+mode.minScore, score, sigResult.rr||0, sigResult.sig);
    return;
  }

  if (mode.requireEMA||AT_SETTINGS.requireAllEMA) {
    const e=sigResult.ema;
    if (sigResult.sig==='buy'&&!(e?.bull4h&&e?.bull15m)) { demoLog(`⏭ EMA ناهمسو BUY`); return; }
    if (sigResult.sig==='sell'&&(e?.bull4h||e?.bull15m)) { demoLog(`⏭ EMA ناهمسو SELL`); return; }
  }

  // AI analysis
  if (AI_CONFIG.provider!=='internal') {
    const aiIntervalMs = (AI_CONFIG.aiIntervalMin||3)*60000;
    const lastAI = AI_CONFIG['ai_last_'+sym]||0;
    if (Date.now()-lastAI < aiIntervalMs) {
      openDemoPos(sym, sigResult, price);
      return;
    }
    AI_CONFIG['ai_last_'+sym] = Date.now();
    demoLog(`🧠 AI تحلیل ${DB[sym]?.label||sym}...`);
    runAIAnalysis(sym, sigResult, price).then(aiResult => {
      if (!aiResult) { openDemoPos(sym, sigResult, price); return; }
      if (aiResult.signal==='WAIT') { demoLog(`🛑 AI: WAIT — ${aiResult.reason||''}`); return; }
      const merged = mergeAIWithInternal(sym, sigResult, aiResult, price);
      if (merged&&merged.sig!=='wait') openDemoPos(sym, merged, price);
      else openDemoPos(sym, sigResult, price);
    }).catch(e => {
      demoLog(`⚠️ AI خطا → داخلی: ${(e.message||'').slice(0,30)}`);
      openDemoPos(sym, sigResult, price);
    });
  } else {
    openDemoPos(sym, sigResult, price);
  }
}

// ─── SMART SL ────────────────────────────────────────
function updateSmartSL(pos, price) {
  if (!SMART_SL.enabled) return;
  if (pos.smartSL===false) return;
  const dir=pos.dir;
  const pnlPct = dir==='buy'
    ? (price-pos.entry)/pos.entry*100
    : (pos.entry-price)/pos.entry*100;
  let bestStep=null;
  for (const step of SMART_SL.steps) { if (pnlPct>=step.profitPct) bestStep=step; }
  if (!bestStep) return;
  const lockPct=bestStep.lockPct/100;
  const newSL = dir==='buy' ? pos.entry*(1+lockPct) : pos.entry*(1-lockPct);
  const currentSL = pos.trailingSL||pos.sl;
  const shouldUpdate = dir==='buy' ? newSL>currentSL : newSL<currentSL;
  if (shouldUpdate) {
    const oldSL = pos.trailingSL||pos.sl;
    pos.trailingSL = newSL;
    pos.trailingActive = true;
    if (bestStep.lockPct===0) demoLog(`🛡 SmartSL [${pos.signalId}] Breakeven @ ${fmt(newSL,pos.sym)} | سود ${pnlPct.toFixed(2)}%`);
    else demoLog(`🔐 SmartSL [${pos.signalId}] Lock ${bestStep.lockPct}% | SL: ${fmt(oldSL,pos.sym)}→${fmt(newSL,pos.sym)}`);
    renderDemoOpenPos();
  }
}

// ─── SMART TP ────────────────────────────────────────
async function runSmartTPForPos(pos) {
  const price = S.prices[pos.sym]?.price;
  if (!price) return;
  const pnl = pos.dir==='buy'
    ? (price-pos.entry)/pos.entry*100
    : (pos.entry-price)/pos.entry*100;
  const profitDollar = pnl/100 * pos.tradeAmount * (pos.leverage||1);
  if (profitDollar < SMART_TP.minProfitToActivate) return;

  let action=null,reason='';

  if (SMART_TP.mode==='groq') {
    const groqResult = await analyzeCandleWithGroq(pos.sym, pos);
    if (groqResult) {
      action = groqResult.action;
      reason = groqResult.reason||'';
      demoLog(`🧠 SmartTP [${pos.signalId}] Groq: ${action} (${groqResult.confidence}%) — ${reason}`);
    }
  }

  if (!action) {
    const analysis = analyzeCandlePressure(pos.sym);
    if (pos.dir==='buy') {
      if(analysis.pressure==='sell'&&analysis.score>=80)action='CLOSE';
      else if(analysis.pressure==='sell'&&analysis.score>=65)action='LOCK';
      else if(analysis.pressure==='buy'&&analysis.score>=70)action='EXTEND';
      else action='HOLD';
    } else {
      if(analysis.pressure==='buy'&&analysis.score>=80)action='CLOSE';
      else if(analysis.pressure==='buy'&&analysis.score>=65)action='LOCK';
      else if(analysis.pressure==='sell'&&analysis.score>=70)action='EXTEND';
      else action='HOLD';
    }
    reason=`فشار ${analysis.pressure==='buy'?'خرید':analysis.pressure==='sell'?'فروش':'خنثی'} ${analysis.score}%`;
    if (SMART_TP.mode==='internal') demoLog(`📊 SmartTP [${pos.signalId}] داخلی: ${action} — ${reason}`);
  }

  if (action==='CLOSE') {
    demoLog(`🔒 SmartTP: بستن [${pos.signalId}] سود $${profitDollar.toFixed(2)}`);
    closeDemoPos(pos, price, 'SmartTP-Close');
  } else if (action==='LOCK') {
    const newTP = pos.dir==='buy' ? price*(1-0.001) : price*(1+0.001);
    if ((pos.dir==='buy'&&newTP>pos.entry)||(pos.dir==='sell'&&newTP<pos.entry)) {
      pos.tp = newTP;
      demoLog(`🔒 SmartTP: Lock [${pos.signalId}] TP→${fmt(newTP,pos.sym)} سود $${profitDollar.toFixed(2)} محفوظ`);
    }
  } else if (action==='EXTEND') {
    const atr=(S.candles[pos.sym]||[]).slice(-14).reduce((a,c)=>a+(c.h-c.l),0)/14||price*0.005;
    pos.tp = pos.dir==='buy' ? pos.tp+atr*0.5 : pos.tp-atr*0.5;
    demoLog(`📈 SmartTP: Extend [${pos.signalId}] TP→${fmt(pos.tp,pos.sym)}`);
  }
}

function runSmartTP() {
  if (!DEMO.openPositions.length) return;
  for (const pos of [...DEMO.openPositions]) {
    if (pos.smartTP===false) continue;
    if (!SMART_TP.enabled&&pos.smartTP!==true) continue;
    runSmartTPForPos(pos).catch(e=>console.warn('SmartTP error:',e));
  }
}

function toggleSmartTP() {
  SMART_TP.enabled = !SMART_TP.enabled;
  const btn = document.getElementById('smartTPBtn');
  if (btn) {
    btn.style.background = SMART_TP.enabled?'rgba(0,229,255,.12)':'transparent';
    btn.style.color = SMART_TP.enabled?'var(--c)':'var(--t3)';
    btn.style.borderColor = SMART_TP.enabled?'var(--c)':'var(--brd2)';
    btn.textContent = '🎯 Smart TP: '+(SMART_TP.enabled?'روشن':'خاموش');
  }
  if (SMART_TP.enabled) {
    clearInterval(SMART_TP._timer);
    SMART_TP._timer = setInterval(runSmartTP, SMART_TP.intervalMs);
    demoLog('🎯 Smart Trailing TP فعال — حالت: '+(SMART_TP.mode==='groq'?'Groq':'منطق داخلی'));
    runSmartTP();
  } else {
    clearInterval(SMART_TP._timer);
    demoLog('⏹ Smart TP متوقف شد');
  }
}

// ─── SMART PM ────────────────────────────────────────
function runSmartPM() {
  if (!DEMO.openPositions.length) return;
  const now = Date.now();
  const toClose = [];
  for (const pos of DEMO.openPositions) {
    if (pos.smartPM===false) continue;
    if (!SMART_PM.enabled&&pos.smartPM!==true) continue;
    const pd = S.prices[pos.sym];
    const price = pd?.price||pos.entry;
    const pnl = pos.dir==='buy'
      ? (price-pos.entry)/pos.entry*100
      : (pos.entry-price)/pos.entry*100;
    const ageMin = (now-pos.entryTime)/60000;
    const stratKey = pos.strategy||'AUTO';
    const stratWR = DEMO.strategyStats?.[stratKey]
      ? Math.round(DEMO.strategyStats[stratKey].wins/Math.max(1,DEMO.strategyStats[stratKey].trades)*100)
      : 50;
    let closeReason=null;
    if (ageMin>SMART_PM.maxAgeMin&&pnl<0.1) closeReason=`⏰ پیر (${Math.round(ageMin)}min) + بدون سود`;
    else if (pnl<SMART_PM.maxLossToKeep&&stratWR<SMART_PM.minStratWR) closeReason=`📉 ضرر ${pnl.toFixed(2)}% + WR ${stratWR}% ضعیف`;
    else if (pnl>SMART_PM.minProfitToClose&&pnl<0.5) {
      const slDist=Math.abs(price-(pos.trailingActive?pos.trailingSL:pos.sl))/price*100;
      if (slDist<0.2&&stratWR<55) closeReason=`💰 سود ${pnl.toFixed(2)}% + SL خیلی نزدیک`;
    }
    if (closeReason&&stratWR>=SMART_PM.minStratWR+10) { demoLog(`🛡 [${pos.signalId}] نگه‌داشته شد — WR ${stratWR}% قوی`); closeReason=null; }
    if (closeReason) toClose.push({pos,reason:closeReason,pnl,price});
  }
  if (toClose.length) {
    demoLog(`🧹 Smart PM: ${toClose.length} پوزیشن برای بستن`);
    for (const {pos,reason,pnl,price} of toClose) {
      demoLog(`   [${pos.signalId}] ${DB[pos.sym]?.label||pos.sym} P&L:${pnl.toFixed(2)}% | ${reason}`);
      closeDemoPos(pos, price, 'SmartPM');
    }
  } else {
    demoLog('🧹 Smart PM: همه پوزیشن‌ها سالم هستند');
  }
}

function toggleSmartPM() {
  SMART_PM.enabled = !SMART_PM.enabled;
  const btn = document.getElementById('smartPMBtn');
  if (btn) {
    btn.style.background = SMART_PM.enabled?'rgba(0,229,255,.15)':'';
    btn.style.color = SMART_PM.enabled?'var(--c)':'';
    btn.style.borderColor = SMART_PM.enabled?'var(--c)':'';
    btn.textContent = '🧹 Smart PM: '+(SMART_PM.enabled?'روشن':'خاموش');
  }
  if (SMART_PM.enabled) {
    demoLog('🧹 Smart Position Manager فعال — هر '+SMART_PM.intervalMin+' دقیقه چک');
    if (SMART_PM._timer) clearInterval(SMART_PM._timer);
    SMART_PM._timer = setInterval(runSmartPM, SMART_PM.intervalMin*60000);
    runSmartPM();
  } else {
    if (SMART_PM._timer) { clearInterval(SMART_PM._timer); SMART_PM._timer=null; }
    demoLog('⏹ Smart Position Manager متوقف شد');
  }
}

// ─── TOGGLE SMART TP/PM PER POSITION ────────────────
function togglePosSmartTP(sigId) {
  const pos = DEMO.openPositions.find(p=>p.signalId===sigId);
  if (!pos) return;
  pos.smartTP = pos.smartTP===false ? true : false;
  demoLog(`[${sigId}] SmartTP: ${pos.smartTP===false?'خاموش':'روشن'}`);
  renderDemoOpenPos();
}

function togglePosSmartPM(sigId) {
  const pos = DEMO.openPositions.find(p=>p.signalId===sigId);
  if (!pos) return;
  pos.smartPM = pos.smartPM===false ? true : false;
  renderDemoOpenPos();
}

// ─── REVERSE MODE ────────────────────────────────────
function toggleReverseMode() {
  REVERSE_MODE = !REVERSE_MODE;
  const btn = document.getElementById('reverseModeBtn');
  if (btn) {
    btn.style.background = REVERSE_MODE?'rgba(255,63,95,.2)':'transparent';
    btn.style.color = REVERSE_MODE?'var(--r)':'var(--t3)';
    btn.style.borderColor = REVERSE_MODE?'var(--r)':'var(--brd2)';
    btn.textContent = '🔄 Reverse: '+(REVERSE_MODE?'روشن ⚠️':'خاموش');
  }
  demoLog(REVERSE_MODE?'🔄 Reverse Mode فعال — هر BUY→SELL و SELL→BUY':'⏹ Reverse Mode خاموش شد');
}

// ─── TRADING MODE ────────────────────────────────────
function setTradingMode(mode) {
  if (!TRADING_MODES[mode]) return;
  ACTIVE_MODE = mode;
  const m = TRADING_MODES[mode];
  AT_SETTINGS.minScore = m.minScore;
  AT_SETTINGS.minRR = m.minRR;
  AT_SETTINGS.requireAllEMA = m.requireEMA;
  DUAL_AI.enabled = m.requireDualAI;
  demoLog(`🔄 حالت: ${m.icon} ${m.nameFA} | Score>${m.minScore} R:R>${m.minRR}`);
  updateModeUI();
}

// ─── DEMO CONTROLS ───────────────────────────────────
function toggleAutoTrade() {
  DEMO.autoOn = !DEMO.autoOn;
  const btn = document.getElementById('autoTradeBtn');
  const ind = document.getElementById('demoAutoIndicator');
  const st  = document.getElementById('demoStatus');
  if (btn) {
    btn.className = 'demo-btn'+(DEMO.autoOn?' auto-on':'');
    btn.textContent = '🤖 Auto Trade: '+(DEMO.autoOn?'روشن':'خاموش');
  }
  if (ind) { ind.style.background=DEMO.autoOn?'var(--g)':'var(--t3)'; ind.style.boxShadow=DEMO.autoOn?'0 0 8px var(--g)':''; }
  if (st) st.textContent = DEMO.autoOn?'در حال اسکن...':'آماده';
  demoLog(DEMO.autoOn?'🤖 Auto Trade فعال':'⏹ Auto Trade متوقف شد');
  if (DEMO.autoOn) {
    clearInterval(DEMO._scanTicker);
    let lastScanTime = Date.now();
    DEMO._scanTicker = setInterval(()=>{ if(!DEMO.autoOn){clearInterval(DEMO._scanTicker);return;} const sec=Math.round((Date.now()-lastScanTime)/1000); if(st)st.textContent=`اسکن ${S.symbols.length} نماد | آخرین: ${sec}s پیش`; },1000);
    DEMO._lastScanUpdate = ()=>{ lastScanTime = Date.now(); };
  } else {
    clearInterval(DEMO._scanTicker);
  }
}

function chargeDemo(amount) {
  DEMO.balance = amount<0 ? Math.max(0,DEMO.balance+amount) : DEMO.balance+amount;
  updateDemoUI();
  demoLog(`💰 موجودی: $${DEMO.balance.toLocaleString('en-US',{maximumFractionDigits:0})}`);
  showToast('شارژ موفق',`$${amount} به حساب اضافه شد`,'info');
}

function resetDemo() {
  if (!confirm('آیا مطمئنید؟ تمام تاریخچه پاک می‌شود.')) return;
  DEMO.balance = DEMO_CONFIG.initialBalance;
  DEMO.initialBalance = DEMO_CONFIG.initialBalance;
  DEMO.tradeAmount = DEMO_CONFIG.tradeAmount;
  DEMO.trades = [];
  DEMO.openPositions = [];
  DEMO.signalIdCounter = 0;
  DEMO.cooldowns = {};
  S.tradeLog = [];
  updateDemoUI();
  demoLog('↺ ریست — موجودی: $'+DEMO_CONFIG.initialBalance);
  showToast('ریست شد','تمام تاریخچه پاک شد','warn');
}

// ─── FULL MARKET SCAN ────────────────────────────────
async function runFullMarketScan() {
  if (!FULL_SCAN.enabled) return;
  supervisorLog('🔭 اسکن کامل '+FULL_SCAN.allSymbols.length+' نماد...');
  const scores = {};
  const BATCH = Math.min(AI_CONFIG._allGroqKeys?.length||1, 10);
  for (let i=0; i<FULL_SCAN.allSymbols.length; i+=BATCH) {
    const batch = FULL_SCAN.allSymbols.slice(i, i+BATCH);
    await Promise.all(batch.map(async sym => {
      try {
        const candles = await getBinanceCandles(sym,'5m',30).catch(()=>[]);
        if (!candles.length) return;
        const price = candles[candles.length-1]?.c||0;
        if (!price) return;
        const closes = candles.map(c=>c.c);
        const rsi = +calcRSI(closes)||50;
        const last5 = candles.slice(-5);
        const bullCount = last5.filter(c=>c.c>c.o).length;
        const momentum = (bullCount-(5-bullCount))*10;
        const vols = candles.slice(-20).map(c=>c.v);
        const avgVol = vols.slice(0,-1).reduce((a,b)=>a+b,0)/vols.length;
        const volSurge = vols[vols.length-1]>avgVol*1.5;
        const highs = candles.map(c=>c.h), lows = candles.map(c=>c.l);
        const rHigh=Math.max(...highs),rLow=Math.min(...lows);
        const rangePct = rHigh>rLow?(price-rLow)/(rHigh-rLow):0.5;
        let score=0;
        if(rsi<30||rsi>70)score+=3;
        if(Math.abs(momentum)>20)score+=2;
        if(volSurge)score+=2;
        if(rangePct<0.2||rangePct>0.8)score+=1;
        scores[sym]={score,price,rsi,momentum,volSurge,rangePct};
        if(!S.prices[sym])S.prices[sym]={price,src:'binance'};
        if(!S.candles[sym])S.candles[sym]=candles;
      }catch(e){}
    }));
    if (i+BATCH<FULL_SCAN.allSymbols.length) await new Promise(r=>setTimeout(r,300));
  }
  FULL_SCAN._scores = scores;
  const sorted = Object.entries(scores).sort((a,b)=>b[1].score-a[1].score).slice(0,FULL_SCAN.topN);
  supervisorLog(`📊 Top ${FULL_SCAN.topN}: ${sorted.map(([s,v])=>s.replace('USDT','')+'('+v.score+')').slice(0,5).join(', ')}...`);
  FULL_SCAN._activeSyms = sorted.map(([s])=>s);
}

function toggleFullScan() {
  FULL_SCAN.enabled = !FULL_SCAN.enabled;
  const btn = document.getElementById('fullScanBtn');
  if (btn) {
    btn.style.background = FULL_SCAN.enabled?'rgba(200,160,40,.15)':'transparent';
    btn.style.color = FULL_SCAN.enabled?'var(--gold)':'var(--t3)';
    btn.style.borderColor = FULL_SCAN.enabled?'var(--gold)':'var(--brd2)';
    btn.textContent = '🌐 Full Scan: '+(FULL_SCAN.enabled?'روشن':'خاموش');
  }
  if (FULL_SCAN.enabled) {
    clearInterval(FULL_SCAN._timer);
    FULL_SCAN._timer = setInterval(runFullMarketScan, FULL_SCAN.scanInterval);
    runFullMarketScan();
    demoLog('🌐 Full Market Scan فعال — اسکن '+FULL_SCAN.allSymbols.length+' نماد');
  } else {
    clearInterval(FULL_SCAN._timer);
    FULL_SCAN._activeSyms = null;
    demoLog('⏹ Full Scan متوقف شد');
  }
}

async function getBinanceCandles(sym, interval, limit) {
  const url=`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${limit}`;
  const r = await fetch(url,{signal:AbortSignal.timeout(5000)});
  if (!r.ok) throw new Error('Binance '+r.status);
  return (await r.json()).map(k=>({t:k[0],o:+k[1],h:+k[2],l:+k[3],c:+k[4],v:+k[5]}));
}
