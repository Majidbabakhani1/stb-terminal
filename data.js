'use strict';
// ═══════════════════════════════════════════
// STB v17.7 — data.js
// WebSocket Binance, Alpha Vantage, Klines, runAnalysis
// نیاز دارد: config.js, signal.js, ui.js, chart.js, trade.js
// ═══════════════════════════════════════════

// ─── BINANCE WEBSOCKET ───────────────────────────────
function buildWS() {
  const syms = S.symbols.filter(s=>DB[s]?.src==='binance'||(s.endsWith('USDT')&&!DB[s]));
  return syms.length
    ? 'wss://stream.binance.com:9443/stream?streams='+syms.map(s=>s.toLowerCase()+'@miniTicker').join('/')
    : null;
}

function connectWS() {
  if (S.ws) { try{S.ws.close();}catch(e){} S.ws=null; }
  const url = buildWS();
  if (!url) return;
  S.ws = new WebSocket(url);
  S.ws.onmessage = (e) => {
    try {
      const msg=JSON.parse(e.data),d=msg.data||msg;
      if (!d.s) return;
      const sym=d.s,price=+d.c,open=+d.o;
      const prev = S.prices[sym]?.price;
      S.prices[sym] = {price,open,high:+d.h,low:+d.l,vol:+d.q,chg:((price-open)/open)*100,prev:prev||price,src:'binance'};
      updateChip(sym);
      if (sym===S.active) { updateChartPrice(price); monitorPositions(sym,price); }
      monitorDemoPos(sym, price);
    } catch(err){}
  };
  S.ws.onclose = () => setTimeout(connectWS, 5000);
}

async function fetch24h(sym) {
  if (!sym||DB[sym]?.src!=='binance') return;
  try {
    const r = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol='+sym);
    if (!r.ok) return;
    const d = await r.json();
    if (!d.lastPrice) return;
    const p=+d.lastPrice,o=+d.openPrice;
    S.prices[sym] = {price:p,open:o,high:+d.highPrice,low:+d.lowPrice,vol:+d.quoteVolume,chg:((p-o)/o)*100,prev:p,src:'binance'};
    updateChip(sym);
  } catch(e){}
}

// ─── ALPHA VANTAGE ───────────────────────────────────
async function avGetRate(sym) {
  const db = DB[sym];
  if (!db?.avSym) return null;
  try {
    const url = `${AV_BASE}?function=CURRENCY_EXCHANGE_RATE&from_currency=${db.avSym}&to_currency=${db.avFrom||'USD'}&apikey=${AV_KEY}`;
    const r = await fetch(url,{signal:AbortSignal.timeout(6000)});
    const j = await r.json();
    const rate = parseFloat(j?.['Realtime Currency Exchange Rate']?.['5. Exchange Rate']);
    return isNaN(rate)?null:rate;
  } catch(e) { return null; }
}

async function avGetCandles(sym, tfKey, limit=100) {
  const db = DB[sym];
  if (!db?.avSym) throw new Error('No AV config for '+sym);
  const now = Date.now();
  if (now>_avQueue.resetAt) { _avQueue.callCount=0; _avQueue.resetAt=now+60000; }
  if (_avQueue.callCount>=5) throw new Error('AV_KEY_LIMIT');
  const sinceLastCall = now - _avQueue.lastCall;
  if (sinceLastCall<13000) await new Promise(r=>setTimeout(r,13000-sinceLastCall));
  _avQueue.lastCall = Date.now();
  _avQueue.callCount++;
  const interval = AV_INTERVAL[tfKey]||'5min';
  const url = `${AV_BASE}?function=FX_INTRADAY&from_symbol=${db.avSym}&to_symbol=${db.avFrom||'USD'}&interval=${interval}&outputsize=compact&apikey=${AV_KEY}`;
  const r = await fetch(url,{signal:AbortSignal.timeout(12000)});
  if (!r.ok) throw new Error('AV HTTP '+r.status);
  const j = await r.json();
  if (j['Note']||j['Information']) throw new Error('AV_KEY_LIMIT');
  const key = `Time Series FX (${interval})`;
  const ts = j[key];
  if (!ts) throw new Error('AV no data: '+sym);
  return Object.entries(ts).sort((a,b)=>a[0]>b[0]?1:-1).slice(-limit).map(([dt,v])=>({
    t:new Date(dt).getTime(),o:+v['1. open'],h:+v['2. high'],l:+v['3. low'],c:+v['4. close'],v:500
  }));
}

async function pollAV() {
  const avSyms = S.symbols.filter(s=>DB[s]?.src==='av');
  if (!avSyms.length) return;
  for (const sym of avSyms) {
    try {
      const price = await avGetRate(sym);
      if (!price||isNaN(price)) continue;
      const prev = S.prices[sym]?.price;
      const chg = prev?((price-prev)/prev)*100:0;
      S.prices[sym] = {price,open:prev||price,high:price,low:price,vol:0,chg,prev:prev||price,src:'av'};
      updateChip(sym);
      if (sym===S.active) { updateChartPrice(price); monitorPositions(sym,price); }
      monitorDemoPos(sym, price);
    } catch(e){}
    await new Promise(r=>setTimeout(r,300));
  }
}

// ─── KLINES (Binance) ────────────────────────────────
async function fetchKlines(sym, tf, limit=200) {
  const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${tf}&limit=${limit}`);
  if (!r.ok) throw new Error('Binance '+r.status+' '+sym);
  return (await r.json()).map(k=>({t:+k[0],o:+k[1],h:+k[2],l:+k[3],c:+k[4],v:+k[5]}));
}

function synthCandles(price, hi, lo, n=120) {
  const c=[],range=Math.max(hi-lo,price*.015);let p=price;
  for(let i=0;i<n;i++){const o=p,h=o+Math.random()*range*.04,l=o-Math.random()*range*.04,cv=o+(Math.random()-.5)*range*.05;c.push({o,h:Math.max(o,cv,h),l:Math.min(o,cv,l),c:cv,v:1000,t:Date.now()-((n-i)*300000)});p=cv;}
  c[c.length-1].c=price;return c;
}

// ─── RUN ANALYSIS ────────────────────────────────────
async function runAnalysis(sym, mode) {
  if (!sym) return;
  const src = DB[sym]?.src||'binance';
  const isBinance = src==='binance'||(sym.endsWith('USDT')&&!DB[sym]);
  const isAV = src==='av';

  setSt('stTrend','load','...');
  setSt('stSMC','load','...');

  try {
    // ── دریافت کندل ──
    if (isBinance) {
      const [c5m,c15m,c4h] = await Promise.all([
        fetchKlines(sym,'5m',200),
        fetchKlines(sym,'15m',100),
        fetchKlines(sym,'4h',100),
      ]);
      S.candles[sym] = c5m;
      const price = S.prices[sym]?.price || c5m[c5m.length-1]?.c || 0;
      if (!price) return;

      const result = computeSignalV2(sym, c4h, c15m, c5m, price);
      if (!result) return;
      S.analysis[sym] = result;

      // به‌روزرسانی UI
      renderSB(sym);
      if (sym===S.active&&isCanvas(sym)) drawChart(sym);

      // Auto trade check
      if (DEMO.autoOn) checkAutoTrade(sym, result, price);

    } else if (isAV) {
      try {
        const c5m = await avGetCandles(sym,'5',100);
        S.candles[sym] = c5m;
        const price = S.prices[sym]?.price || c5m[c5m.length-1]?.c || 0;
        if (!price) return;
        // برای AV از candles M15 و H4 ساختگی میسازیم
        const c15m = c5m.filter((_,i)=>i%3===0);
        const c4h  = c5m.filter((_,i)=>i%48===0);
        const result = computeSignalV2(sym, c4h.length>5?c4h:c5m, c15m.length>5?c15m:c5m, c5m, price);
        if (!result) return;
        S.analysis[sym] = result;
        renderSB(sym);
        if (sym===S.active) drawChart(sym);
      } catch(e) {
        if (e.message==='AV_KEY_LIMIT') {
          demoLog('⚠️ AV rate limit — ۶۰ ثانیه صبر کن');
          const price = S.prices[sym]?.price||0;
          if (price) {
            S.candles[sym] = synthCandles(price, price*1.02, price*0.98);
          }
        }
      }
    }

  } catch(e) {
    console.warn('runAnalysis error:', sym, e.message);
    setSt('stTrend','load','خطا');
    setSt('stSMC','load','خطا');
  }
}
