'use strict';
// ═══════════════════════════════════════════
// STB v17.7 — extra.js
// توابع مکمل: Position Modal, SB Panel, Calendar, RSS,
// Sym Add, Chart Controls, Bridge, Reports
// نیاز دارد: config.js, db.js, signal.js, ai.js, trade.js, data.js, chart.js, ui.js
// ═══════════════════════════════════════════

function openPosModal(){
  const sym=S.active,a=S.analysis[sym],pd=S.prices[sym];
  if(!pd){showToast('خطا','صبر کنید قیمت لود شود','warn');return;}
  // If already has active position → warn instead of close
  const existing=S.positions.find(p=>p.sym===sym&&(p.status==='active'||p.status==='warn'));
  if(existing){
    showToast('پوزیشن باز','روی این نماد پوزیشن باز دارید. ابتدا ببندید.','warn');
    return;
  }
  if(!a){showToast('در حال تحلیل...','چند ثانیه صبر کنید','warn');runAnalysis(sym,S.mode);return;}

  posDir=a.sig==='sell'?'sell':'buy';

  // Set preview
  const preview=document.getElementById('posSigPreview');
  if(preview){
    const isBuy=posDir==='buy';
    preview.style.background=isBuy?'rgba(0,230,118,.15)':'rgba(255,63,95,.15)';
    preview.style.color=isBuy?'var(--g)':'var(--r)';
    preview.style.border='1px solid '+(isBuy?'rgba(0,230,118,.4)':'rgba(255,63,95,.4)');
    preview.textContent=(isBuy?'⬆ سیگنال خرید':'⬇ سیگنال فروش')+' — '+(DB[sym]?.label||sym)+' (Score: '+Math.max(a.buyScore||0,a.sellScore||0)+')';
  }

  // Fill entry/SL/TP with actual values (editable)
  const entEl=document.getElementById('posPreviewEntry');
  const slEl=document.getElementById('posPreviewSL');
  const tpEl=document.getElementById('posPreviewTP');
  const sizeEl=document.getElementById('posSize');
  const slOvEl=document.getElementById('posSLOverride');
  const tpOvEl=document.getElementById('posTPOverride');

  if(entEl) entEl.textContent=fmt(pd.price,sym);
  // Fill SL/TP override inputs with computed defaults
  if(slOvEl) slOvEl.value=a.sl>0?a.sl.toFixed(DB[sym]?.dp||2):'';
  if(tpOvEl) tpOvEl.value=a.tp>0?a.tp.toFixed(DB[sym]?.dp||2):'';
  if(sizeEl) sizeEl.value='1';

  // Update confirm button color
  const confirmBtn=document.getElementById('confirmBtn');
  if(confirmBtn){
    confirmBtn.className='confirm-btn '+posDir;
    confirmBtn.textContent=posDir==='buy'?'✅ تایید خرید (Long)':'✅ تایید فروش (Short)';
  }

  document.getElementById('posModalTitle').textContent='تایید ورود · '+(DB[sym]?.label||sym);
  recalcPosPreview();
  document.getElementById('posModal').classList.add('open');
}

function recalcPosPreview(){
  const sym=S.active,a=S.analysis[sym],pd=S.prices[sym];
  if(!a||!pd)return;
  const price=pd.price;
  const size=parseFloat(document.getElementById('posSize')?.value)||1;
  // Use override if provided, else use analysis default
  const slRaw=parseFloat(document.getElementById('posSLOverride')?.value);
  const tpRaw=parseFloat(document.getElementById('posTPOverride')?.value);
  const sl=(!isNaN(slRaw)&&slRaw>0)?slRaw:a.sl;
  const tp=(!isNaN(tpRaw)&&tpRaw>0)?tpRaw:a.tp;

  // Update display
  const slEl=document.getElementById('posPreviewSL');
  const tpEl=document.getElementById('posPreviewTP');
  const rrEl=document.getElementById('posPreviewRR');
  const riskEl=document.getElementById('posPreviewRisk');
  const rewEl=document.getElementById('posPreviewReward');
  const wrEl=document.getElementById('posPreviewWR');
  const sizeValEl=document.getElementById('posSizeDollar');

  const risk=Math.abs(price-sl);
  const reward=Math.abs(tp-price);
  const rr=risk>0?reward/risk:0;
  const dollarVal=(size*price).toFixed(0);

  if(slEl)slEl.textContent=fmt(sl,sym);
  if(tpEl)tpEl.textContent=fmt(tp,sym);
  if(rrEl)rrEl.textContent='1 : '+rr.toFixed(2);
  if(riskEl)riskEl.textContent=(risk/price*100).toFixed(2)+'%  ($'+(risk*size).toFixed(2)+')';
  if(rewEl)rewEl.textContent=(reward/price*100).toFixed(2)+'%  ($'+(reward*size).toFixed(2)+')';
  if(wrEl)wrEl.textContent=a.wr?Math.round(a.wr*100)+'%':'—';
  if(sizeValEl)sizeValEl.textContent='≈ $'+dollarVal;
}

function closePosModal(){document.getElementById('posModal').classList.remove('open');}
function setPosDir(dir){posDir=dir;}

function confirmPos(){
  const sym=S.active,a=S.analysis[sym],pd=S.prices[sym];
  if(!pd||!a)return;
  const price=pd.price;
  const size=parseFloat(document.getElementById('posSize')?.value)||1;
  const slRaw=parseFloat(document.getElementById('posSLOverride')?.value);
  const tpRaw=parseFloat(document.getElementById('posTPOverride')?.value);
  const sl=(!isNaN(slRaw)&&slRaw>0)?slRaw:a.sl;
  const tp=(!isNaN(tpRaw)&&tpRaw>0)?tpRaw:a.tp;
  if(!sl||!tp){showToast('خطا','SL و TP را وارد کنید','warn');return;}
  const risk=Math.abs(price-sl),reward=Math.abs(tp-price);
  const rr=risk>0?reward/risk:0;
  const pos={id:Date.now(),sym,dir:posDir,entry:price,sl,tp,size,rr,time:Date.now(),
    status:'active',maxAdv:0,warnSent:false,isDemo:false};
  S.positions=S.positions.filter(p=>p.sym!==sym||p.status==='closed'||p.status==='tp');
  S.positions.push(pos);
  closePosModal();
  renderPosList();updatePosButton();renderChips();
  if(isCanvas(sym)&&S.candles[sym]?.length)drawChart(sym);
  fireAlarm(
    `${posDir==='buy'?'⬆ خرید':'⬇ فروش'} — ${DB[sym]?.label||sym}`,
    `ورود: ${fmt(price,sym)} · SL: ${fmt(sl,sym)} · TP: ${fmt(tp,sym)} · R:R 1:${rr.toFixed(2)}`,
    posDir
  );
}

function monitorPositions(sym,price){
  const active=S.positions.filter(p=>p.sym===sym&&p.status==='active');
  for(const pos of active){
    const{dir,entry,sl,tp}=pos;
    if(dir==='buy')pos.maxAdv=Math.max(pos.maxAdv||0,price-entry);
    if(dir==='sell')pos.maxAdv=Math.max(pos.maxAdv||0,entry-price);
    // SL hit
    if((dir==='buy'&&price<=sl)||(dir==='sell'&&price>=sl)){
      pos.status='closed';
      const pnl=dir==='buy'?price-entry:entry-price;
      fireAlarm(`⛔ حد ضرر — ${DB[sym]?.label||sym}`,`قیمت ${fmt(price,sym)} به SL ${fmt(sl,sym)} رسید! P&L: ${pnl>0?'+':''}${fmt(pnl,sym)}`,'sell');
      renderPosList();updatePosButton();renderChips();
      if(DB[sym]?.src==='binance'||DB[sym]?.src==='av')drawChart(sym);
      continue;
    }
    // TP hit
    if((dir==='buy'&&price>=tp)||(dir==='sell'&&price<=tp)){
      pos.status='tp';
      const pnl=dir==='buy'?price-entry:entry-price;
      fireAlarm(`✅ هدف سود — ${DB[sym]?.label||sym}`,`TP ${fmt(tp,sym)} رسید! P&L: +${fmt(pnl,sym)}`,'buy');
      renderPosList();updatePosButton();renderChips();
      if(DB[sym]?.src==='binance'||DB[sym]?.src==='av')drawChart(sym);
      continue;
    }
    // Reversal warning
    if(!pos.warnSent&&pos.maxAdv>0){
      const risk=Math.abs(entry-sl);
      const retrace=dir==='buy'?pos.maxAdv-(price-entry):pos.maxAdv-(entry-price);
      if(retrace>pos.maxAdv*.55&&retrace>risk*.3){
        pos.warnSent=true;pos.status='warn';
        fireAlarm(`⚠️ برگشت بازار — ${DB[sym]?.label||sym}`,`سود کاهش یافت. Trailing stop یا خروج توصیه می‌شود.`,'warn');
        renderPosList();
      }
    }
    // Counter-trend
    const a=S.analysis[sym];
    if(a&&!pos.trendWarn&&((dir==='buy'&&a.trend?.h4==='bear')||(dir==='sell'&&a.trend?.h4==='bull'))){
      pos.trendWarn=true;
      fireAlarm(`⚠️ خلاف روند H4 — ${DB[sym]?.label||sym}`,`روند H4 با جهت پوزیشن مخالف است.`,'warn');
    }
    // Update protect panel if this is active sym
    if(sym===S.active)updateProtectPanel(pos,price);
  }
}

function updateProtectPanel(pos,price){
  if(!pos){
    ['pSt','pPnl','pSL','pTP'].forEach(id=>document.getElementById(id).textContent='—');
    return;
  }
  const pnl=pos.dir==='buy'?price-pos.entry:pos.entry-price;
  const pnlPct=(pnl/pos.entry*100).toFixed(2);
  const dSL=(Math.abs(price-pos.sl)/price*100).toFixed(2);
  const dTP=(Math.abs(pos.tp-price)/price*100).toFixed(2);
  document.getElementById('pSt').textContent=`${pos.dir==='buy'?'خرید':'فروش'} · ${pos.status==='active'?'فعال':pos.status==='warn'?'هشدار':pos.status==='tp'?'TP رسید':'SL فعال'}`;
  document.getElementById('pSt').style.color=pos.status==='active'?'var(--g)':pos.status==='warn'?'var(--a)':'var(--r)';
  const pEl=document.getElementById('pPnl');
  pEl.textContent=`${pnl>=0?'+':''}${fmt(pnl,pos.sym)} (${pnl>=0?'+':''}${pnlPct}%)`;
  pEl.style.color=pnl>=0?'var(--g)':'var(--r)';
  document.getElementById('pSL').textContent=`${fmt(pos.sl,pos.sym)} (${dSL}%)`;
  document.getElementById('pTP').textContent=`${fmt(pos.tp,pos.sym)} (+${dTP}%)`;
}

function renderPosList(){
  const el=document.getElementById('posList');
  const all=S.positions.slice().reverse();
  if(!all.length){el.innerHTML='<div style="color:var(--t3);font-size:10px;text-align:center;padding:8px">هنوز پوزیشنی ثبت نشده</div>';return;}
  el.innerHTML=all.map(p=>{
    const pd=S.prices[p.sym];const price=pd?.price||p.entry;
    const pnl=p.dir==='buy'?price-p.entry:p.entry-price;
    const pnlPct=(pnl/p.entry*100).toFixed(2);
    const stCls=p.status==='active'?'active':p.status==='warn'?'warn':p.status==='tp'?'tp':'closed';
    const stTxt=p.status==='active'?'فعال':p.status==='warn'?'هشدار':p.status==='tp'?'TP':'SL';
    if(p.status==='closed'&&!p._showClosed)return null; // hide closed from list
    return`<div class="pos-row ${p.status==='warn'?'alarm':''}">
      <span class="pos-sym">${DB[p.sym]?.label||p.sym}</span>
      <span class="pos-dir ${p.dir}">${p.dir==='buy'?'خرید':'فروش'}</span>
      <div style="flex:1;display:flex;flex-direction:column;gap:1px">
        <div style="font-family:monospace;font-size:9px;color:var(--t3)">ورود: ${fmt(p.entry,p.sym)}</div>
        <div style="font-family:monospace;font-size:9px;color:${pnl>=0?'var(--g)':'var(--r)'}">لحظه: ${fmt(price,p.sym)} (${pnl>=0?'+':''}${pnlPct}%)</div>
      </div>
      <span class="pos-st ${stCls}">${stTxt}</span>
      <button class="pos-close-btn" onclick="closePos(${p.id})">بستن ×</button>
    </div>`;
  }).join('');
}

function closePos(id){
  const pos=S.positions.find(p=>p.id===id);if(!pos)return;
  const pd=S.prices[pos.sym];const price=pd?.price||pos.entry;
  const pnl=pos.dir==='buy'?price-pos.entry:pos.entry-price;
  const pnlPct=pos.entry>0?(pnl/pos.entry*100).toFixed(2):'0';
  pos.status='closed';
  // Log to alarm panel
  fireAlarm(
    `پوزیشن بسته شد — ${DB[pos.sym]?.label||pos.sym}`,
    `${pos.dir==='buy'?'خرید':'فروش'} | ورود: ${fmt(pos.entry,pos.sym)} → بسته: ${fmt(price,pos.sym)} | P&L: ${pnl>=0?'+':''}${fmt(pnl,pos.sym)} (${pnl>=0?'+':''}${pnlPct}%)`,
    pnl>=0?'buy':'sell'
  );
  renderPosList();updatePosButton();renderChips();
  if(DB[pos.sym]?.src==='binance'||DB[pos.sym]?.src==='av')drawChart(pos.sym);
}

function updatePosButton(){
  const sym=S.active;
  const pos=S.positions.find(p=>p.sym===sym&&p.status==='active');
  const a=S.analysis[sym];
  const btn=document.getElementById('enterPosBtn');
  if(pos){
    btn.className='enter-pos-btn has-pos';
    btn.textContent=`📊 پوزیشن ${pos.dir==='buy'?'خرید ⬆':'فروش ⬇'} باز — کلیک برای بستن`;
  }else if(a&&a.sig!=='wait'){
    const isBuy=a.sig==='buy';
    btn.className='enter-pos-btn '+(isBuy?'enter-buy':'enter-sell');
    btn.textContent=isBuy?'⬆ ورود به پوزیشن خرید':'⬇ ورود به پوزیشن فروش';
  }else{
    btn.className='enter-pos-btn';
    btn.textContent='➕ ورود به پوزیشن';
  }
}

// ═══════════════════════════════════════════
// RENDER SIDEBAR
// ═══════════════════════════════════════════
const TM={bull:'صعودی',bear:'نزولی',side:'رنج'};
function renderSB(sym){
  const d=S.analysis[sym];if(!d)return;
  const setTC=(id,cls,v)=>{const el=document.getElementById(id);el.className='tc '+cls;el.querySelector('.tc-v').textContent=TM[v]||v;};
  setTC('tH4',d.trend.h4,d.trend.h4);setTC('tM15',d.trend.m15,d.trend.m15);setTC('tM5',d.trend.m5,d.trend.m5);
  const bar=document.getElementById('sigBar');bar.className='sig '+(d.sig==='wait'?'wait':d.sig);
  bar.textContent=d.sig==='sell'?'⬇ سیگنال فروش':d.sig==='buy'?'⬆ سیگنال خرید':'⏸ انتظار برای تاییدیه';
  document.getElementById('entV').textContent=fmt(d.entry,sym);
  document.getElementById('slV').textContent=fmt(d.sl,sym);
  document.getElementById('tpV').textContent=fmt(d.tp,sym);
  document.getElementById('rrV').textContent=d.rr>0?'1 : '+d.rr.toFixed(2):'—';
  updatePosButton();
  // Active position protect
  const pos=S.positions.find(p=>p.sym===sym&&p.status==='active');
  if(pos)updateProtectPanel(pos,d.price);else updateProtectPanel(null,0);
  // SMC
  const p=d.price;
  document.getElementById('smcBody').innerHTML=d.levels.map(l=>{
    const cls=l.t==='ob-d'?'tob-d':l.t==='ob-s'?'tob-s':l.t==='fvg'?'tfvg':'tliq';
    const near=Math.abs(l.price-p)/p<.012;
    return`<tr class="${near?'hi':''}"><td style="${!near?'color:var(--t3)':''}">${l.type}</td><td class="num" style="${!near?'opacity:.5':''}">${fmt(l.price,sym)}</td><td><span class="tg ${cls}">${l.tf}</span></td></tr>`;
  }).join('')||'<tr><td colspan="3" style="color:var(--t3);text-align:center;padding:6px;font-size:10px">—</td></tr>';
  document.getElementById('structBody').innerHTML=d.struct.map(s=>`<div class="sr"><span class="sr-l">${s.type}</span><div class="sr-r"><span class="sr-p">${fmt(s.price,sym)}</span><span class="tg ${s.cls}">${s.tf}</span></div></div>`).join('')||'<div style="color:var(--t3);font-size:10px;text-align:center;padding:4px">—</div>';
  const{trend,sig,entry,sl,tp,rr,rsi:_rsiRaw,atr,vwap,levels}=d;
  const rsi = +(typeof _rsiRaw==='object' ? _rsiRaw?.m5||50 : _rsiRaw)||50;
  const trendLabel=tr=>`<span class="hl-${tr==='bull'?'g':tr==='bear'?'r':'a'}">${TM[tr]}</span>`;
  let h='';
  // 1. Multi-TF trend summary
  h+=`<b>روند:</b> H4 ${trendLabel(trend.h4)} | M15 ${trendLabel(trend.m15)} | M5 ${trendLabel(trend.m5)}<br>`;
  // 2. Trend alignment assessment
  const aligned=trend.h4===trend.m15&&trend.m15===trend.m5;
  const partAlign=trend.h4===trend.m15||trend.h4===trend.m5;
  if(aligned&&trend.h4!=='side')h+=`✅ <span class="hl-${trend.h4==='bull'?'g':'r'}">همسویی کامل ${TM[trend.h4]} در سه تایم‌فریم</span> — اعتبار بالا<br>`;
  else if(partAlign)h+=`⚠️ <span class="hl-a">همسویی جزئی</span> — H4 و M15 هماهنگ، M5 متفاوت<br>`;
  else h+=`❌ <span class="hl-r">تضاد تایم‌فریم</span> — احتیاط در ورود<br>`;
  // 3. RSI + VWAP
  if(rsi>75)h+=`📊 RSI: <span class="hl-r">${rsi.toFixed(0)} — اشباع خرید شدید</span> · احتمال برگشت نزولی<br>`;
  else if(rsi>65)h+=`📊 RSI: <span class="hl-a">${rsi.toFixed(0)} — در محدوده اشباع خرید</span><br>`;
  else if(rsi<25)h+=`📊 RSI: <span class="hl-g">${rsi.toFixed(0)} — اشباع فروش شدید</span> · احتمال بازگشت صعودی<br>`;
  else if(rsi<35)h+=`📊 RSI: <span class="hl-a">${rsi.toFixed(0)} — در محدوده اشباع فروش</span><br>`;
  else h+=`📊 RSI: <span class="hl-b">${rsi.toFixed(0)}</span> — خنثی`;
  if(vwap){const aboveVwap=entry>vwap;h+=` | VWAP: <span class="hl-b">${fmt(vwap,sym)}</span> (قیمت <span class="hl-${aboveVwap?'g':'r'}">${aboveVwap?'بالا':'زیر'}</span> VWAP)<br>`;}else h+='<br>';
  // 4. Key SMC levels
  const obS=levels.find(l=>l.t==='ob-s'),obD=levels.find(l=>l.t==='ob-d');
  const fvg=levels.find(l=>l.t==='fvg'),liq=levels.find(l=>l.t==='liq');
  if(obS){const dist=((Math.abs(entry-obS.price)/entry)*100).toFixed(2);h+=`🔴 Supply OB ${obS.tf}: <span class="hl-r">${fmt(obS.price,sym)}</span> (فاصله ${dist}%)<br>`;}
  if(obD){const dist=((Math.abs(entry-obD.price)/entry)*100).toFixed(2);h+=`🟢 Demand OB ${obD.tf}: <span class="hl-g">${fmt(obD.price,sym)}</span> (فاصله ${dist}%)<br>`;}
  if(fvg)h+=`🟡 FVG ${fvg.tf}: <span class="hl-a">${fmt(fvg.price,sym)}</span> — ناحیه عدم تعادل<br>`;
  if(liq)h+=`🔮 نقدینگی: <span class="hl-p">${fmt(liq.price,sym)}</span> — هدف احتمالی<br>`;
  // 5. ATR context
  h+=`📐 ATR(14): <span class="hl-b">${fmt(atr,sym)}</span> — نوسان روزانه تخمینی: <span class="hl-b">${fmt(atr*3,sym)}</span><br>`;
  // 6. Signal conclusion
  h+='<hr style="border:none;border-top:1px solid var(--brd);margin:4px 0">';
  if(sig==='sell'){
    const rrQ=rr>=3?'عالی':rr>=2?'خوب':rr>=1.5?'قابل قبول':'ضعیف';
    h+=`📉 <span class="hl-r">سیگنال فروش — R:R 1:${rr.toFixed(2)} (${rrQ})</span><br>`;
    h+=`ورود: <span class="hl-a">${fmt(entry,sym)}</span> | SL: <span class="hl-r">${fmt(sl,sym)}</span> | TP: <span class="hl-g">${fmt(tp,sym)}</span>`;
  } else if(sig==='buy'){
    const rrQ=rr>=3?'عالی':rr>=2?'خوب':rr>=1.5?'قابل قبول':'ضعیف';
    h+=`📈 <span class="hl-g">سیگنال خرید — R:R 1:${rr.toFixed(2)} (${rrQ})</span><br>`;
    h+=`ورود: <span class="hl-a">${fmt(entry,sym)}</span> | SL: <span class="hl-r">${fmt(sl,sym)}</span> | TP: <span class="hl-g">${fmt(tp,sym)}</span>`;
  } else {
    h+=`⏸ <span class="hl-a">انتظار — شرایط کافی برای ورود وجود ندارد</span><br>`;
    h+=`منتظر شکست سطح کلیدی یا تایید اندیکاتورها باشید.`;
  }
  document.getElementById('rsnBox').innerHTML=h;setSt('stRsn','ok','✓');
}

// ═══════════════════════════════════════════
// NEWS & CALENDAR
// ═══════════════════════════════════════════
const ECON_FA={
  'Non-Farm Payrolls':'اشتغال غیرکشاورزی (NFP)',
  'FOMC':'نشست فدرال رزرو (FOMC)',
  'CPI':'تورم مصرف‌کننده (CPI)',
  'GDP':'تولید ناخالص داخلی (GDP)',
  'PMI':'شاخص مدیران خرید (PMI)',
  'Interest Rate Decision':'تصمیم نرخ بهره',
  'Unemployment Rate':'نرخ بیکاری',
  'Retail Sales':'فروش خرده‌فروشی',
  'PCE':'مخارج مصرف شخصی (PCE)',
  'PPI':'قیمت تولیدکننده (PPI)',
  'ISM':'شاخص ISM',
  'Trade Balance':'تراز تجاری',
  'Housing Starts':'شروع ساخت مسکن',
  'EIA Crude Oil':'موجودی نفت (EIA)',
  'Consumer Confidence':'اطمینان مصرف‌کننده',
};
function translateEv(t){for(const[en,fa]of Object.entries(ECON_FA))if((t||'').toLowerCase().includes(en.toLowerCase()))return fa;return t||'';}
let _calEvents = [];
let _calTimer = null;

async function fetchCalendar(){
  document.getElementById('newsSpn').style.display='inline-block';
  setSt('stEcon','load','دریافت...');
  const CAL_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
  const proxies=[
    (typeof CORS_PROXY!=='undefined' ? CORS_PROXY+'?url='+encodeURIComponent(CAL_URL) : null),
    'https://api.allorigins.win/get?url='+encodeURIComponent(CAL_URL),
    'https://corsproxy.io/?'+encodeURIComponent(CAL_URL),
  ].filter(Boolean);
  let evts=null;
  for(const url of proxies){
    try{
      const r=await fetch(url,{signal:AbortSignal.timeout(8000)});
      if(!r.ok) continue;
      const j=await r.json();
      const raw=j.contents?JSON.parse(j.contents):j;
      if(Array.isArray(raw)&&raw.length>0){evts=raw;break;}
    }catch(e){}
  }
  document.getElementById('newsSpn').style.display='none';
  if(evts&&evts.length){
    _calEvents=evts;
    renderCal(evts);
    renderNewsFromEvts(evts);
    setSt('stEcon','ok',evts.length+' رویداد');
    // Start countdown timer for today's events
    if(_calTimer)clearInterval(_calTimer);
    _calTimer=setInterval(()=>{if(_calEvents.length)renderCal(_calEvents);},30000);
  }else{
    renderCalFallback();
    await fetchRSS();
    setSt('stEcon','load','جایگزین فعال');
  }
}
function faTr(t){
  const map={
    'Non-Farm Payrolls':'اشتغال غیرکشاورزی (NFP)',
    'FOMC':'نشست فدرال رزرو (FOMC)',
    'Federal Funds Rate':'نرخ بهره فدرال',
    'CPI':'شاخص تورم (CPI)',
    'Consumer Price Index':'شاخص قیمت مصرف‌کننده',
    'Interest Rate Decision':'تصمیم نرخ بهره',
    'GDP':'تولید ناخالص داخلی (GDP)',
    'PMI':'شاخص مدیران خرید (PMI)',
    'Unemployment Rate':'نرخ بیکاری',
    'Retail Sales':'فروش خرده‌فروشی',
    'PCE':'مخارج مصرف شخصی (PCE)',
    'ISM Manufacturing':'شاخص تولیدی ISM',
    'ISM Services':'شاخص خدماتی ISM',
    'Trade Balance':'تراز تجاری',
    'EIA Crude Oil':'موجودی نفت (EIA)',
    'ECB':'نشست بانک مرکزی اروپا (ECB)',
    'Durable Goods':'کالاهای بادوام',
    'Housing Starts':'شروع ساخت مسکن',
    'Consumer Confidence':'اعتماد مصرف‌کننده',
    'Initial Jobless Claims':'مطالبات اولیه بیکاری',
    'PPI':'شاخص قیمت تولیدکننده (PPI)',
    'Building Permits':'مجوزهای ساختمانی',
    'Core CPI':'CPI هسته‌ای',
    'Fed Chair':'رئیس فدرال رزرو',
    'Treasury':'خزانه‌داری آمریکا',
  };
  const tl = t || '';
  for(const [en, fa] of Object.entries(map)){
    if(tl.toLowerCase().includes(en.toLowerCase())) return fa;
  }
  return tl;
}

function renderCal(evts){
  const now=Date.now();
  const events=evts&&evts.length?evts:S.calEvents||[];
  const sorted=[...events]
    .filter(e=>new Date(e.date||e.dateUtc||0).getTime()>now-7200000)
    .sort((a,b)=>new Date(a.date||a.dateUtc||0)-new Date(b.date||b.dateUtc||0))
    .slice(0,12);
  const el=document.getElementById('econList');
  if(!el)return;
  if(!sorted.length){el.innerHTML='<div style="color:var(--t3);font-size:10px;text-align:center;padding:4px">رویداد یافت نشد</div>';return;}

  // Market mapping
  function eventMarket(e){
    const cur=(e.country||e.currency||'').toUpperCase();
    const t=(e.title||e.event||'').toLowerCase();
    if(cur==='USD'||t.includes('fed')||t.includes('fomc'))return'USD';
    if(cur==='EUR'||t.includes('ecb'))return'EUR';
    if(cur==='GBP')return'GBP';
    if(cur==='JPY')return'JPY';
    if(t.includes('oil')||t.includes('crude')||t.includes('eia'))return'نفت';
    if(t.includes('gold'))return'طلا';
    return cur||'—';
  }

  el.innerHTML=sorted.map(ev=>{
    const evT=new Date(ev.date||ev.dateUtc||0).getTime();
    const diff=(evT-now)/60000;
    let tHtml='',cls='',cdStyle='';
    if(diff<0){
      tHtml=`<span style="font-size:8px">${Math.abs(diff)<60?Math.abs(Math.round(diff))+'m':Math.abs((diff/60).toFixed(0))+'h'} پیش</span>`;
    }else if(diff<60){
      const mm=Math.floor(diff);
      const ss=Math.floor((diff-mm)*60);
      tHtml=`<span style="color:var(--r);font-family:monospace;font-weight:900;font-size:11px;animation:blink .8s ease-in-out infinite">${mm}:${ss.toString().padStart(2,'0')}</span>`;
      cls='now';cdStyle='font-weight:700';
    }else if(diff<240){
      tHtml=`<span style="color:var(--a)">${Math.floor(diff/60)}h${Math.round(diff%60)}m</span>`;
      cls='soon';
    }else{
      const dt=new Date(evT);
      const mo=(dt.getMonth()+1).toString().padStart(2,'0');
      const da=dt.getDate().toString().padStart(2,'0');
      const h=dt.getHours().toString().padStart(2,'0');
      const mn=dt.getMinutes().toString().padStart(2,'0');
      tHtml=`<span>${mo}/${da} ${h}:${mn}</span>`;
    }
    const imp=ev.impact==='High'?'H':ev.impact==='Medium'?'M':'L';
    const title=faTr(ev.title||ev.event||'');
    const market=eventMarket(ev);
    const src=ev.source||'ForexFactory';
    const extras=[];
    if(ev.actual)extras.push(`واقعی: <b style="color:var(--g)">${ev.actual}</b>`);
    if(ev.forecast)extras.push(`پیش‌بینی: ${ev.forecast}`);
    if(ev.previous)extras.push(`قبلی: ${ev.previous}`);
    return`<div class="er ${cls}" style="${cdStyle}">
      <span style="font-family:monospace;font-size:9px;color:var(--t3);min-width:44px">${tHtml}</span>
      <span style="font-size:9px;color:var(--b);font-weight:700;min-width:28px">${ev.country||ev.currency||'—'}</span>
      <span class="er-imp ${imp}">${imp}</span>
      <div style="flex:1">
        <div style="font-size:10px">${title}</div>
        <div style="font-size:7.5px;color:var(--t3);margin-top:1px;display:flex;gap:6px;flex-wrap:wrap">
          <span>📡 ${src}</span>
          <span style="color:var(--c)">🎯 ${market}</span>
          ${extras.length?'<span>'+extras.join(' · ')+'</span>':''}
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderCalFallback(){
  const evs=[{t:'هفته',c:'USD',i:'H',e:'نشست FOMC'},{t:'۴۸h',c:'USD',i:'H',e:'NFP'},{t:'۲۴h',c:'USD',i:'H',e:'CPI'},{t:'۷۲h',c:'EUR',i:'M',e:'PMI'},{t:'هفته',c:'GBP',i:'M',e:'GDP'}];
  document.getElementById('econList').innerHTML=evs.map(e=>`<div class="econ-row"><span class="econ-time">${e.t}</span><span class="econ-cur">${e.c}</span><span class="econ-imp ${e.i}">${e.i}</span><span class="econ-event">${e.e}</span></div>`).join('');
}
function renderNewsFromEvts(evts){
  document.getElementById('newsList').innerHTML=evts.filter(e=>e.impact==='High').slice(0,8).map(ev=>{
    const t=new Date(ev.date||ev.dateUtc||0);
    const ts=`${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}`;
    return`<div class="ni H"><span class="ni-imp H">بالا</span><span class="ni-text">${translateEv(ev.title||ev.event||'')} (${ev.country||''})</span><span class="ni-time">${ts}</span></div>`;
  }).join('')||'<div style="color:var(--t3);font-size:10px;padding:5px">—</div>';
}
// Persian news keyword translations
const NEWS_FA_KW = {
  'inflation':'تورم','rate hike':'افزایش نرخ بهره','rate cut':'کاهش نرخ بهره',
  'federal reserve':'فدرال رزرو','fed':'فدرال رزرو','fomc':'نشست FOMC',
  'nonfarm payroll':'اشتغال غیرکشاورزی','nfp':'NFP','gdp':'تولید ناخالص داخلی',
  'recession':'رکود','unemployment':'بیکاری','cpi':'تورم مصرف‌کننده',
  'oil':'نفت','gold':'طلا','bitcoin':'بیت‌کوین','crypto':'رمزارز',
  'dollar':'دلار','euro':'یورو','interest rate':'نرخ بهره',
  'war':'جنگ','sanctions':'تحریم','opec':'اوپک','ecb':'بانک مرکزی اروپا',
};

function translateNewsTitle(title) {
  // Keep original English — just highlight keywords with Persian tooltip
  return title; // Return as-is; Persian shown in impact label
}

function getNewsImpact(title) {
  const t = (title||'').toLowerCase();
  const hiKw=['fed','fomc','nfp','nonfarm','cpi','inflation','rate hike','rate cut','gdp','recession','war','crisis','opec'];
  const miKw=['oil','gold','bitcoin','crypto','dollar','euro','bank','economy'];
  if(hiKw.some(k=>t.includes(k)))return'H';
  if(miKw.some(k=>t.includes(k)))return'M';
  return'L';
}

function getPersianImpactLabel(title) {
  const t=(title||'').toLowerCase();
  if(t.includes('fed')||t.includes('fomc'))return'فدرال رزرو';
  if(t.includes('nfp')||t.includes('nonfarm'))return'NFP';
  if(t.includes('cpi')||t.includes('inflation'))return'تورم';
  if(t.includes('rate'))return'نرخ بهره';
  if(t.includes('gdp'))return'GDP';
  if(t.includes('gold'))return'طلا';
  if(t.includes('oil')||t.includes('opec'))return'نفت';
  if(t.includes('bitcoin')||t.includes('crypto'))return'کریپتو';
  if(t.includes('war')||t.includes('sanction'))return'ژئوپلیتیک';
  return getNewsImpact(title)==='H'?'بالا':'متوسط';
}

async function fetchRSS(){
  const newsEl=document.getElementById('newsList')||document.getElementById('newsList');
  if(!newsEl)return;
  const spn=document.getElementById('newsSpn');
  if(spn)spn.style.display='inline-block';

  const sources=[
    {url:'https://www.investing.com/rss/news_301.rss',name:'Investing.com',markets:['USD','کل']},
    {url:'https://www.cnbc.com/id/100003114/device/rss/rss.html',name:'CNBC',markets:['USD','سهام']},
    {url:'https://feeds.marketwatch.com/marketwatch/topstories/',name:'MarketWatch',markets:['USD','سهام']},
    {url:'https://www.forexfactory.com/rss',name:'ForexFactory',markets:['فارکس','اقتصاد کلان']},
  ];
  const proxies=[
    u=>'https://api.rss2json.com/v1/api.json?rss_url='+encodeURIComponent(u),
    u=>'https://corsproxy.io/?'+encodeURIComponent(u),
    u=>'https://api.allorigins.win/get?url='+encodeURIComponent(u),
  ];

  const impactKeywords={
    H:['fed','fomc','nfp','nonfarm','cpi','inflation','rate hike','rate cut','gdp','recession','war','crisis','opec','emergency'],
    M:['oil','gold','bitcoin','crypto','dollar','euro','bank','economy','trade','tariff','pmi'],
  };
  function getImpact(t){
    const tl=(t||'').toLowerCase();
    if(impactKeywords.H.some(k=>tl.includes(k)))return'H';
    if(impactKeywords.M.some(k=>tl.includes(k)))return'M';
    return'L';
  }
  function getMarket(t){
    const tl=(t||'').toLowerCase();
    if(tl.includes('bitcoin')||tl.includes('crypto')||tl.includes('btc')||tl.includes('eth'))return'کریپتو';
    if(tl.includes('gold')||tl.includes('xau'))return'طلا';
    if(tl.includes('oil')||tl.includes('opec')||tl.includes('crude'))return'نفت';
    if(tl.includes('euro')||tl.includes('eur'))return'EUR';
    if(tl.includes('yen')||tl.includes('jpy'))return'JPY';
    if(tl.includes('fed')||tl.includes('fomc')||tl.includes('dollar')||tl.includes('usd'))return'USD';
    if(tl.includes('stock')||tl.includes('nasdaq')||tl.includes('s&p'))return'سهام';
    return'کل';
  }
  function faPersianLabel(t){
    const tl=(t||'').toLowerCase();
    if(tl.includes('fed')||tl.includes('fomc'))return'فدرال رزرو';
    if(tl.includes('nfp')||tl.includes('nonfarm'))return'NFP';
    if(tl.includes('cpi')||tl.includes('inflation'))return'تورم';
    if(tl.includes('rate'))return'نرخ بهره';
    if(tl.includes('gdp'))return'GDP';
    if(tl.includes('gold'))return'طلا';
    if(tl.includes('oil')||tl.includes('opec'))return'نفت';
    if(tl.includes('bitcoin')||tl.includes('crypto'))return'کریپتو';
    return getImpact(t)==='H'?'مهم':'متوسط';
  }
  function formatDate(d){
    if(!d)return'—';
    try{
      const dt=new Date(d);
      if(isNaN(dt))return'—';
      const mo=(dt.getMonth()+1).toString().padStart(2,'0');
      const da=dt.getDate().toString().padStart(2,'0');
      const h=dt.getHours().toString().padStart(2,'0');
      const mn=dt.getMinutes().toString().padStart(2,'0');
      return mo+'/'+da+' '+h+':'+mn;
    }catch(e){return'—';}
  }

  for(const src of sources){
    for(const pfn of proxies){
      try{
        const r=await fetch(pfn(src.url),{signal:AbortSignal.timeout(8000)});
        const j=await r.json();
        // Handle rss2json format
        let items=[];
        if(j.items&&Array.isArray(j.items)){
          items=j.items.slice(0,12).map(it=>({title:it.title,link:it.link,pubDate:it.pubDate}));
        }else{
          const raw=j.contents||j;
          if(typeof raw!=='string'||!raw.includes('<item'))continue;
          const xml=new DOMParser().parseFromString(raw,'text/xml');
          items=Array.from(xml.querySelectorAll('item')).slice(0,12).map(item=>({
            title:(item.querySelector('title')?.textContent||'').replace(/<!\[CDATA\[|\]\]>/g,'').trim(),
            link:(item.querySelector('link')?.textContent||item.querySelector('guid')?.textContent||'#').trim(),
            pubDate:item.querySelector('pubDate')?.textContent||'',
          }));
        }
        if(!items.length)continue;
        newsEl.innerHTML=items.map(item=>{
          const title=(item.title||'').trim();
          const link=(item.link||'#').trim();
          const pubDate=item.pubDate||'';
          const ts=formatDate(pubDate);
          const imp=getImpact(title);
          const fa=faPersianLabel(title);
          const market=getMarket(title);
          return`<div class="ni ${imp}" onclick="if('${link}'!=='#')window.open('${link}','_blank')" style="cursor:pointer">
            <span class="ni-imp ${imp}">${fa}</span>
            <div class="ni-body">
              <div class="ni-title">${title}</div>
              <div class="ni-meta">${src.name} · ${ts} · <span style="color:var(--b)">${market}</span></div>
            </div>
          </div>`;
        }).join('');
        if(spn)spn.style.display='none';
        return;
      }catch(e){}
    }
  }
  if(spn)spn.style.display='none';
  newsEl.innerHTML='<div style="color:var(--t3);font-size:10px;text-align:center;padding:8px">اتصال به منابع خبری ممکن نشد</div>';
}


async function openDash(){
  document.getElementById('dashModal').classList.add('open');
  S.dashOpen=true;
  await refreshDash();
  startDashCD();
}
function closeDash(){
  document.getElementById('dashModal').classList.remove('open');
  S.dashOpen=false;
  if(dashCDTimer)clearInterval(dashCDTimer);
}
function startDashCD(){
  if(dashCDTimer)clearInterval(dashCDTimer);
  let cd=15;
  document.getElementById('dashCountdown').textContent=cd;
  dashCDTimer=setInterval(async()=>{
    cd--;
    document.getElementById('dashCountdown').textContent=cd;
    if(cd<=0){cd=15;await refreshDash();}
  },1000);
}
async function refreshDash(){
  document.getElementById('dashGrid').innerHTML='<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--t3)"><div class="spin" style="width:22px;height:22px;border-width:2px"></div></div>';
  document.getElementById('dashSub').textContent='آنالیز '+S.symbols.length+' نماد...';
  const tasks=S.symbols.map(async sym=>{
    if(!S.prices[sym]){if(DB[sym]?.src==='av')await pollTwelveData();else await fetch24h(sym);}
    if(!S.analysis[sym])await runAnalysis(sym,S.mode);
    return{sym,a:S.analysis[sym],pd:S.prices[sym]};
  });
  const results=(await Promise.all(tasks)).filter(r=>r.a&&r.pd);
  window._dashR=results;
  renderDash(results,S.dashFilter);
  const now=new Date();
  document.getElementById('dashLastUpdate').textContent=`${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
  document.getElementById('dashSub').textContent=`${results.length} نماد تحلیل شد`;
}
function filterDash(f,btn){
  S.dashFilter=f;document.querySelectorAll('.df-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');
  if(window._dashR)renderDash(window._dashR,f);
}
function renderDash(results,filter){
  let items=[...results];
  if(filter==='buy')items=items.filter(r=>r.a.sig==='buy'||r.a.swingData?.sig==='buy');
  else if(filter==='sell')items=items.filter(r=>r.a.sig==='sell'||r.a.swingData?.sig==='sell');
  else if(filter==='scalp')items=items.filter(r=>r.a.sig!=='wait');
  else if(filter==='swing')items=items.filter(r=>r.a.swingData?.sig!=='wait');
  else if(filter==='highwr')items=items.filter(r=>r.a.wr>=.63||r.a.swingData?.wr>=.63);
  else if(filter==='haspos')items=items.filter(r=>S.positions.some(p=>p.sym===r.sym&&p.status==='active'));
  items.sort((a,b)=>Math.max(b.a.wr||0,b.a.swingData?.wr||0)-Math.max(a.a.wr||0,a.a.swingData?.wr||0));
  if(!items.length){document.getElementById('dashGrid').innerHTML='<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--t3)">نماد یافت نشد</div>';return;}
  document.getElementById('dashGrid').innerHTML=items.map(({sym,a,pd})=>{
    const db=DB[sym]||{};const lbl=db.label||sym.replace('USDT','');
    const sc=a.sig,sw2=a.swingData?.sig||'wait';
    const topCls=sc==='buy'||sw2==='buy'?'has-buy':sc==='sell'||sw2==='sell'?'has-sell':'has-wait';
    const wrP=Math.round((a.wr||.5)*100),swWrP=Math.round((a.swingData?.wr||.5)*100);
    const wrC=wrP>=70?'var(--g)':wrP>=55?'var(--a)':'var(--r)';
    const scRR=a.rr>0?a.rr.toFixed(1):'—',swRR=a.swingData?.rr>0?a.swingData.rr.toFixed(1):'—';
    const pos=S.positions.find(p=>p.sym===sym&&p.status==='active');
    const posTag=pos?`<span style="font-size:9px;padding:2px 5px;border-radius:3px;background:${pos.dir==='buy'?'var(--gdim)':'var(--rdim)'};color:${pos.dir==='buy'?'var(--g)':'var(--r)'};border:1px solid ${pos.dir==='buy'?'rgba(0,230,118,.3)':'rgba(255,63,95,.3)'};font-weight:700">پوزیشن ${pos.dir==='buy'?'خرید':'فروش'} باز</span>`:'';
    return`<div class="dc ${topCls}" onclick="closeDash();selSym('${sym}')">
      ${posTag?`<div style="margin-bottom:5px">${posTag}</div>`:''}
      <div class="dc-head"><div><div class="dc-sym">${lbl}</div><div class="dc-sub">${sym} · ${db.cat||'—'}</div></div><div style="text-align:left"><div class="dc-price">${fmt(pd.price,sym)}</div><div class="dc-chg ${pd.chg>=0?'up':'dn'}">${fmtPct(pd.chg)}</div></div></div>
      <div class="dc-sigs"><span class="dc-sig ${sc}">اسکالپ: ${sc==='buy'?'خرید':sc==='sell'?'فروش':'انتظار'}</span><span class="dc-sig ${sw2}">سویینگ: ${sw2==='buy'?'خرید':sw2==='sell'?'فروش':'انتظار'}</span></div>
      <div class="dc-stats">
        <div class="dc-s"><div class="dc-sl">R:R اسکالپ</div><div class="dc-sv" style="color:var(--a)">1:${scRR}</div></div>
        <div class="dc-s"><div class="dc-sl">R:R سویینگ</div><div class="dc-sv" style="color:var(--p)">1:${swRR}</div></div>
        <div class="dc-s"><div class="dc-sl">RSI</div><div class="dc-sv" style="color:${a.rsi>70?'var(--r)':a.rsi<30?'var(--g)':'var(--a)'}">${a.rsi?.toFixed(0)||'—'}</div></div>
        <div class="dc-s"><div class="dc-sl">H4</div><div class="dc-sv" style="color:${a.trend?.h4==='bull'?'var(--g)':a.trend?.h4==='bear'?'var(--r)':'var(--a)'}">${TM[a.trend?.h4]||'—'}</div></div>
      </div>
      <div class="dc-wr"><span class="dc-wrl">وین‌ریت اسکالپ</span><div class="dc-wrbar"><div class="dc-wrfill" style="width:${wrP}%;background:${wrC}"></div></div><span class="dc-wrp" style="color:${wrC}">${wrP}%</span></div>
      <div class="dc-wr" style="margin-top:3px"><span class="dc-wrl">وین‌ریت سویینگ</span><div class="dc-wrbar"><div class="dc-wrfill" style="width:${swWrP}%;background:var(--p)"></div></div><span class="dc-wrp" style="color:var(--p)">${swWrP}%</span></div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
// ═══════════════════════════════════════════
// ALARM PANEL
// ═══════════════════════════════════════════
function renderAlarmPanel() {
  const el = document.getElementById('alarmTab');
  const sub = document.getElementById('alarmPanelSub');
  sub.textContent = ALARM_LOG.length + ' اعلان ثبت شده';
  if (!ALARM_LOG.length) {
    el.innerHTML = '<div style="color:var(--t3);font-size:11px;text-align:center;padding:20px">هنوز الارمی ثبت نشده</div>';
    return;
  }
  el.innerHTML = [...ALARM_LOG].reverse().map(a => {
    const cols = {buy:'var(--g)',sell:'var(--r)',warn:'var(--a)',news:'var(--b)',info:'var(--c)'};
    const icons = {buy:'📈',sell:'📉',warn:'⚠️',news:'📰',info:'ℹ️'};
    return `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-radius:6px;border:1px solid var(--brd);background:var(--bg2)">
      <span style="font-size:16px;flex-shrink:0">${icons[a.type]||'🔔'}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:11.5px;font-weight:800;color:${cols[a.type]||'var(--r)'};margin-bottom:2px">${a.title}</div>
        <div style="font-size:10.5px;color:var(--t2);line-height:1.5">${a.msg}</div>
      </div>
      <div style="font-size:8.5px;color:var(--t3);font-family:monospace;white-space:nowrap;flex-shrink:0">${a.time}</div>
    </div>`;
  }).join('');
}

// Override fireAlarm to also log to panel
const _origFireAlarm = fireAlarm;
// We'll patch it below after definition


// ═══════════════════════════════════════════════════════════
//  DEMO TRADING ENGINE v2 — Only Crypto (Binance Real Data)
//  Strategy: EMA Cross + RSI + SMC Confluence
// ═══════════════════════════════════════════════════════════

function addSymDirect(sym){
  if(!sym) return;
  const s = sym.toUpperCase().trim();
  if(!s.endsWith('USDT') && !DB[s]) return;
  if(S.symbols.includes(s)) return;
  S.symbols.push(s);
  if(!DB[s]) DB[s]={label:s.replace('USDT',''),src:'binance',dp:4};
  saveSyms(); renderChips(); selSym(s);
  document.getElementById('addInp').value='';
}

function showSug(val){
  const box=document.getElementById('sugDrop');
  if(!box) return;
  const inp=document.getElementById('addInp');
  if(inp){
    const rect=inp.getBoundingClientRect();
    box.style.top=(rect.bottom+4)+'px';
    box.style.right=(window.innerWidth-rect.right)+'px';
    box.style.left='auto';
    box.style.width='300px';
  }
  const q=(val||'').trim().toUpperCase();

  const CATS = {
    'Major':   ['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','TRXUSDT'],
    'Layer 1': ['AVAXUSDT','DOTUSDT','ATOMUSDT','NEARUSDT','APTUSDT','SUIUSDT','TONUSDT','KASUSDT','ALGOUSDT','ICPUSDT'],
    'Layer 2': ['MATICUSDT','ARBUSDT','OPUSDT','IMXUSDT','STRKUSDT','ZKUSDT'],
    'DeFi':    ['UNIUSDT','AAVEUSDT','CRVUSDT','MKRUSDT','LDOUSDT','INJUSDT','RUNEUSDT','PENDLEUSDT','1INCHUSDT'],
    'AI/Data': ['FETUSDT','AGIXUSDT','WLDUSDT','RNDRUSDT','GRTUSDT','TAOUSDT','OCEANUSDT'],
    'GameFi':  ['AXSUSDT','SANDUSDT','MANAUSDT','GALAUSDT','APEUSDT','IMXUSDT'],
    'Meme':    ['SHIBUSDT','FLOKIUSDT','PEPEUSDT','BONKUSDT','WIFUSDT','MEMEUSDT','DOGSUSDT'],
    'Hot':     ['JUPUSDT','NOTUSDT','MOVEUSDT','VIRTUALUSDT','PYTHUSDT','ONDOUSDT','EIGENUSDT'],
    // Forex & Metals غیرفعال — در دست بررسی
    // 'Forex': ['EURUSD',...],
    // 'Metals': ['XAUUSD',...],
  };

  const LABELS = {
    'BTCUSDT':'BTC · Bitcoin','ETHUSDT':'ETH · Ethereum','BNBUSDT':'BNB','SOLUSDT':'SOL · Solana',
    'XRPUSDT':'XRP · Ripple','ADAUSDT':'ADA · Cardano','DOGEUSDT':'DOGE','TRXUSDT':'TRX · Tron',
    'AVAXUSDT':'AVAX · Avalanche','DOTUSDT':'DOT · Polkadot','ATOMUSDT':'ATOM · Cosmos',
    'NEARUSDT':'NEAR','APTUSDT':'APT · Aptos','SUIUSDT':'SUI','TONUSDT':'TON','KASUSDT':'KAS',
    'MATICUSDT':'MATIC · Polygon','ARBUSDT':'ARB · Arbitrum','OPUSDT':'OP · Optimism',
    'UNIUSDT':'UNI · Uniswap','AAVEUSDT':'AAVE','CRVUSDT':'CRV · Curve','LDOUSDT':'LDO · Lido',
    'INJUSDT':'INJ · Injective','RUNEUSDT':'RUNE · THORChain',
    'FETUSDT':'FET · Fetch.ai','AGIXUSDT':'AGIX · SingularityNET','WLDUSDT':'WLD · Worldcoin',
    'RNDRUSDT':'RNDR · Render','GRTUSDT':'GRT · The Graph','TAOUSDT':'TAO · Bittensor',
    'AXSUSDT':'AXS · Axie','SANDUSDT':'SAND · Sandbox','MANAUSDT':'MANA · Decentraland',
    'SHIBUSDT':'SHIB · Shiba','FLOKIUSDT':'FLOKI','PEPEUSDT':'PEPE','BONKUSDT':'BONK',
    'WIFUSDT':'WIF · dogwifhat','JUPUSDT':'JUP · Jupiter','NOTUSDT':'NOT','MOVEUSDT':'MOVE',
    'EURUSD':'EUR/USD · یورو/دلار','GBPUSD':'GBP/USD · پوند','USDJPY':'USD/JPY · ین',
    'XAUUSD':'XAU/USD · طلا','XAGUSD':'XAG/USD · نقره','BRNUSD':'BRN/USD · نفت',
  };

  const catColors = {
    'Major':'#ffd700','Layer 1':'#c8a028','Layer 2':'#a07820',
    'DeFi':'#00e676','AI/Data':'#00e5ff','GameFi':'#ce93d8',
    'Meme':'#ff6d00','Hot':'#ff3f5f','Forex':'#4caf50','Metals':'#ffa726',
  };

  let html = '';

  if(q){
    // Search mode
    const all = Object.values(CATS).flat();
    const results = all.filter(s=>s.includes(q)||(LABELS[s]||'').toUpperCase().includes(q)).slice(0,15);
    if(!results.length){
      html = '<div style="padding:12px;text-align:center;color:var(--t3);font-size:10px">یافت نشد</div>';
    } else {
      html = results.map(s=>{
        const added = S.symbols.includes(s);
        const cat = Object.entries(CATS).find(([k,v])=>v.includes(s))?.[0]||'';
        return `<div class="sug-item" data-sym="${s}">
          <div>
            <span style="font-weight:700;color:${added?'var(--g)':'var(--t1)'}">${LABELS[s]||s}</span>
            ${added?'<span style="font-size:8px;color:var(--g);margin-right:3px">✓</span>':''}
          </div>
          <span style="font-size:7px;padding:1px 5px;border-radius:3px;border:1px solid ${catColors[cat]||'var(--brd2)'}33;color:${catColors[cat]||'var(--t3)'}">${cat}</span>
        </div>`;
      }).join('');
    }
  } else {
    // Browse mode — grouped by category
    for(const [cat, syms] of Object.entries(CATS)){
      const available = syms.filter(s=>!S.symbols.includes(s));
      const added = syms.filter(s=>S.symbols.includes(s));
      if(available.length===0 && added.length===0) continue;
      
      html += `<div style="padding:5px 12px 3px;font-size:8px;font-weight:700;color:${catColors[cat]};
        letter-spacing:.8px;text-transform:uppercase;border-bottom:1px solid ${catColors[cat]}22;
        background:${catColors[cat]}08">${cat}</div>`;
      
      [...added, ...available].forEach(s=>{
        const isAdded = S.symbols.includes(s);
        html += `<div class="sug-item" data-sym="${s}" style="opacity:${isAdded?'0.5':'1'}">
          <span style="font-weight:700;color:${isAdded?'var(--g)':'var(--t1)'}">${LABELS[s]||s.replace('USDT','')}</span>
          ${isAdded?'<span style="font-size:9px;color:var(--g)">✓ added</span>':'<span style="font-size:9px;color:var(--t4)">+</span>'}
        </div>`;
      });
    }
  }

  box.innerHTML = html;
  
  // Click handlers
  box.querySelectorAll('.sug-item').forEach(el=>{
    el.addEventListener('mouseenter',()=>{ if(!el.style.opacity||el.style.opacity!=='0.5') el.style.background='rgba(200,160,40,.1)'; });
    el.addEventListener('mouseleave',()=>el.style.background='');
    el.addEventListener('click',()=>{
      const sym=el.getAttribute('data-sym');
      if(!sym) return;
      const inp=document.getElementById('addInp');
      if(inp) inp.value=sym;
      hideSug();
      addSym();
    });
  });

  box.classList.add('open');
}
function hideSug(){setTimeout(()=>{const b=document.getElementById('sugDrop');if(b)b.classList.remove('open');},200);}
function pickSug(sym){const inp=document.getElementById('addInp');if(inp)inp.value=sym;hideSug();addSym();}
function addSym(){
  const inp=document.getElementById('addInp');if(!inp)return;
  let v=inp.value.trim().toUpperCase();if(!v)return;hideSug();
  if(!v.includes('USD')&&!v.includes('BTC')&&!v.includes('ETH')&&!v.endsWith('USDT'))v+='USDT';
  if(S.symbols.includes(v)){selSym(v);inp.value='';return;}
  if(S.symbols.length>=18){showToast('محدودیت','حداکثر ۱۸ نماد','warn');return;}
  S.symbols.push(v);
  if(!DB[v]){const ic=v.endsWith('USDT');DB[v]={src:ic?'binance':'av',label:v.replace('USDT',''),tv:(ic?'BINANCE:':'FX:')+v,cat:ic?'Crypto':'Forex',dp:ic?2:4,avSym:ic?null:v,avFrom:'USD'};}
  saveSyms();renderChips();connectWS();
  if(DB[v]?.src==='binance')fetch24h(v);else pollAV();
  selSym(v);inp.value='';
}

// ═══════════════════════════════════════════════════════
// MODE & TF
// ═══════════════════════════════════════════════════════
function setMode(m){
  S.mode=m;
  document.getElementById('mScalp')?.classList.toggle('active',m==='scalp');
  document.getElementById('mSwing')?.classList.toggle('active',m==='swing');
  if(m==='swing'){S.tf='240';document.querySelectorAll('.tf-p').forEach(b=>b.classList.remove('active'));document.getElementById('tfBtn240')?.classList.add('active');}
  else{S.tf='5';document.querySelectorAll('.tf-p').forEach(b=>b.classList.remove('active'));document.getElementById('tfBtn5')?.classList.add('active');}
  delete S.analysis[S.active];
  if(isCanvas(S.active))delete S.candles[S.active];
  runAnalysis(S.active,m);
}
function setTF(btn,tf){
  document.querySelectorAll('.tf-p').forEach(b=>b.classList.remove('active'));
  btn?.classList.add('active');S.tf=tf;
  delete S.analysis[S.active];
  if(isCanvas(S.active))delete S.candles[S.active];
  runAnalysis(S.active,S.mode);
}

// chart controls (getCS/gcs/chartZoom* defined in chart.js)

// ═══════════════════════════════════════════════════════
// SOUND
// ═══════════════════════════════════════════════════════
function playAlarmSound(type){
  try{
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    const notes=type==='buy'?[[880,0],[1046,.1],[1318,.2]]:[[660,0],[440,.1],[330,.2]];
    notes.forEach(([f,w])=>{
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.connect(g);g.connect(ctx.destination);
      o.frequency.value=f;o.type='sine';
      g.gain.setValueAtTime(.15,ctx.currentTime+w);
      g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+w+.15);
      o.start(ctx.currentTime+w);o.stop(ctx.currentTime+w+.2);
    });
  }catch(e){}
}

// ═══════════════════════════════════════════════════════
// REAL BRIDGE — MT4/MT5 Connector
// ═══════════════════════════════════════════════════════

async function toggleBridge() {
  BRIDGE.enabled = !BRIDGE.enabled;
  const btn = document.getElementById('bridgeBtn');
  if (BRIDGE.enabled) {
    // Test connection
    try {
      const r = await fetch(BRIDGE.url + '/status', {signal: AbortSignal.timeout(3000)});
      const j = await r.json();
      BRIDGE.status = 'connected';
      if (btn) { btn.textContent = '🔗 Bridge: متصل'; btn.style.background = 'var(--gdim)'; btn.style.borderColor = 'rgba(0,230,118,.4)'; btn.style.color = 'var(--g)'; }
      showToast('Bridge متصل شد', 'سیگنال‌های واقعی به MT4 ارسال می‌شود', 'buy');
      demoLog('🔗 Real Bridge فعال — MT4: ' + BRIDGE.url);
    } catch(e) {
      BRIDGE.enabled = false; BRIDGE.status = 'disconnected';
      if (btn) { btn.textContent = '🔗 Bridge: خاموش'; btn.style.background = ''; btn.style.borderColor = ''; btn.style.color = ''; }
      showToast('Bridge خطا', 'STB_Bridge.py را روی کامپیوتر اجرا کنید\nآدرس: ' + BRIDGE.url, 'warn');
      demoLog('❌ Bridge وصل نشد — آیا STB_Bridge.py در حال اجراست؟');
    }
  } else {
    BRIDGE.status = 'disconnected';
    if (btn) { btn.textContent = '🔗 Bridge: خاموش'; btn.style.background = ''; btn.style.borderColor = ''; btn.style.color = ''; }
    demoLog('⏹ Real Bridge غیرفعال شد');
  }
}

async function sendToBridge(sym, sigResult, price) {
  if (!BRIDGE.enabled) return false;
  try {
    const payload = {
      action:    sigResult.sig.toUpperCase(),
      dir:       sigResult.sig,
      sym:       sym,
      symbol:    sym.replace('USDT',''),  // MT4 format
      price:     price,
      sl:        sigResult.sl,
      tp:        sigResult.tp,
      rr:        sigResult.rr,
      lot:       0.01,
      magic:     12345,
      signalId:  'SIG-' + DEMO.signalIdCounter,
      strategy:  sigResult.strategy || 'AUTO',
      strength:  sigResult.strength,
      comment:   'STB_' + (sigResult.strategy||'AUTO'),
    };
    const r = await fetch(BRIDGE.url + '/signal', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    const j = await r.json();
    if (j.status === 'sent' || j.status === 'queued') {
      demoLog('🔗 Bridge → MT4: ' + sigResult.sig.toUpperCase() + ' ' + sym + ' @ ' + fmt(price, sym));
      return true;
    }
    return false;
  } catch(e) {
    BRIDGE.status = 'disconnected';
    demoLog('❌ Bridge خطا: ' + e.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
//  STB AI ENGINE v1.0
//  پشتیبانی از: منطق داخلی | Gemini | Claude Haiku | Claude Sonnet
// ═══════════════════════════════════════════════════════════════

function renderReport(){
  const el=document.getElementById('reportContent');
  if(!el)return;
  const trades=DEMO.trades||[];
  if(!trades.length){
    el.innerHTML='<div style="color:var(--t3);font-size:10px;text-align:center;padding:16px">هنوز معامله‌ای ثبت نشده</div>';
    return;
  }
  const wins=trades.filter(t=>t.win);
  const totalPnl=trades.reduce((a,t)=>a+(t.netPnl||0),0);
  const grossP=wins.reduce((a,t)=>a+(t.netPnl||0),0);
  const grossL=Math.abs(trades.filter(t=>!t.win).reduce((a,t)=>a+(t.netPnl||0),0));
  const pf=grossL>0?(grossP/grossL).toFixed(2):grossP>0?'∞':'—';
  const wr=trades.length>0?Math.round(wins.length/trades.length*100):0;
  const totalComm=trades.reduce((a,t)=>a+(t.commission||0),0);
  const stratStats=DEMO.strategyStats||{};
  const stratRows=Object.entries(stratStats).filter(([k,v])=>v.trades>0)
    .sort((a,b)=>b[1].pnl-a[1].pnl)
    .map(([k,v])=>{
      const sWR=v.trades>0?Math.round(v.wins/v.trades*100):0;
      const sC=sWR>=60?'var(--g)':sWR>=45?'var(--a)':'var(--r)';
      return`<tr><td style="color:var(--t1)">${k}</td><td style="color:var(--b);text-align:center">${v.trades}</td><td style="color:${sC};text-align:center;font-weight:700">${sWR}%</td><td style="color:${v.pnl>=0?'var(--g)':'var(--r)'};text-align:center">${v.pnl>=0?'+':''}$${v.pnl.toFixed(1)}</td><td style="color:var(--t3);text-align:center">${v.trades>0?(v.totalR/v.trades).toFixed(1):'—'}</td></tr>`;
    }).join('');
  const tradeRows=[...trades].reverse().slice(0,30).map(t=>{
    const pipVal=t.sym?.endsWith('USDT')?1:0.0001;
    const slPips=Math.abs(t.entry-(t.sl||t.entry))/pipVal;
    const tpPips=Math.abs(t.entry-(t.tp||t.entry))/pipVal;
    const actPips=Math.abs(t.entry-(t.exit||t.entry))/pipVal*(t.win?1:-1);
    const maxPips=(t.maxAdv||0)/pipVal;
    return`<tr><td style="color:${t.win?'var(--g)':'var(--r)'}">${t.win?'✅':'❌'}</td><td>${DB[t.sym]?.label||t.sym}</td><td style="color:${t.dir==='buy'?'var(--g)':'var(--r)'}">${t.dir==='buy'?'B':'S'}</td><td style="font-size:8px;color:var(--a)">${t.strategy||'AUTO'}</td><td style="color:${t.netPnl>=0?'var(--g)':'var(--r)'}">${t.netPnl>=0?'+':''}$${(t.netPnl||0).toFixed(2)}</td><td style="color:var(--t3)">${slPips.toFixed(1)}</td><td style="color:var(--t3)">${tpPips.toFixed(1)}</td><td style="color:${actPips>=0?'var(--g)':'var(--r)'}">${actPips>=0?'+':''}${actPips.toFixed(1)}</td><td style="color:var(--c);font-weight:700">${maxPips.toFixed(1)}</td><td style="color:var(--a)">1:${(t.rr||0).toFixed(1)}</td><td style="color:var(--t3)">${(t.duration||0)}m</td></tr>`;
  }).join('');
  el.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-bottom:10px">
      <div class="dd-stat"><div class="dd-stat-l">P&L کل</div><div class="dd-stat-v" style="color:${totalPnl>=0?'var(--g)':'var(--r)'}">${totalPnl>=0?'+':''}$${totalPnl.toFixed(0)}</div></div>
      <div class="dd-stat"><div class="dd-stat-l">Win Rate</div><div class="dd-stat-v" style="color:${wr>=60?'var(--g)':wr>=45?'var(--a)':'var(--r)'}">${wr}%</div></div>
      <div class="dd-stat"><div class="dd-stat-l">Profit Factor</div><div class="dd-stat-v" style="color:var(--p)">${pf}</div></div>
      <div class="dd-stat"><div class="dd-stat-l">موجودی</div><div class="dd-stat-v" style="color:var(--g)">$${DEMO.balance.toFixed(0)}</div></div>
      <div class="dd-stat"><div class="dd-stat-l">کارمزد</div><div class="dd-stat-v" style="color:var(--a)">$${totalComm.toFixed(2)}</div></div>
      <div class="dd-stat"><div class="dd-stat-l">اهرم</div><div class="dd-stat-v" style="color:var(--o)">${DEMO_CONFIG.leverage||1}×</div></div>
      <div class="dd-stat"><div class="dd-stat-l">حجم کل</div><div class="dd-stat-v" style="color:var(--c)">$${(trades.reduce((a,t)=>a+(t.positionValue||t.tradeAmount||0),0)).toFixed(0)}</div></div>
      <div class="dd-stat"><div class="dd-stat-l">معاملات</div><div class="dd-stat-v" style="color:var(--b)">${trades.length}</div></div>
    </div>
    ${stratRows?`<div style="font-size:9px;font-weight:700;color:var(--t3);margin-bottom:5px">عملکرد استراتژی‌ها</div>
    <div style="overflow-x:auto;margin-bottom:10px"><table style="width:100%;border-collapse:collapse;font-size:9px;font-family:monospace">
      <thead><tr style="border-bottom:1px solid var(--brd)"><th style="padding:3px;color:var(--t3);text-align:right">استراتژی</th><th style="padding:3px;color:var(--t3);text-align:center">#</th><th style="padding:3px;color:var(--t3);text-align:center">WR</th><th style="padding:3px;color:var(--t3);text-align:center">P&L</th><th style="padding:3px;color:var(--t3);text-align:center">Avg R</th></tr></thead>
      <tbody>${stratRows}</tbody></table></div>`:''}
    <div style="font-size:9px;font-weight:700;color:var(--t3);margin-bottom:5px">جزئیات (پیپ)</div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:8px;font-family:monospace;min-width:500px">
      <thead><tr style="border-bottom:1px solid var(--brd)"><th style="padding:2px;color:var(--t3)">نتیجه</th><th style="padding:2px;color:var(--t3)">نماد</th><th style="padding:2px;color:var(--t3)">جهت</th><th style="padding:2px;color:var(--t3)">استراتژی</th><th style="padding:2px;color:var(--t3)">P&L$</th><th style="padding:2px;color:var(--t3)">SL پیپ</th><th style="padding:2px;color:var(--t3)">TP پیپ</th><th style="padding:2px;color:var(--t3)">واقعی</th><th style="padding:2px;color:var(--c)">Max→</th><th style="padding:2px;color:var(--t3)">R:R</th><th style="padding:2px;color:var(--o)">Lev</th><th style="padding:2px;color:var(--t3)">مدت</th></tr></thead>
      <tbody>${tradeRows}</tbody></table></div>`;
}

function exportReport(){
  renderReport();
  const trades=DEMO.trades||[];
  const report={
    generated:new Date().toISOString(),
    version:'STB v17.7',
    summary:{
      initialBalance: DEMO.initialBalance,
      finalBalance: +DEMO.balance.toFixed(4),
      totalPnl: +(DEMO.balance-DEMO.initialBalance).toFixed(2),
      trades: trades.length,
      wins: trades.filter(t=>t.win).length,
      losses: trades.filter(t=>!t.win).length,
      winRate: trades.length>0?(trades.filter(t=>t.win).length/trades.length*100).toFixed(1)+'%':'0%',
      avgRR: trades.length>0?(trades.reduce((a,t)=>a+(t.rr||0),0)/trades.length).toFixed(2):'0',
      totalCommission: +trades.reduce((a,t)=>a+(t.commission||0),0).toFixed(3),
      netPnl: +trades.reduce((a,t)=>a+(t.netPnl||0),0).toFixed(2),
    },
    strategyPerformance:DEMO.strategyStats||{},
    trades:trades.map(t=>{
      const pv=t.sym?.endsWith('USDT')?1:0.0001;
      return{...t,slPips:Math.abs(t.entry-(t.sl||t.entry))/pv,tpPips:Math.abs(t.entry-(t.tp||t.entry))/pv,maxAdvancePips:(t.maxAdv||0)/pv};
    }),
  };
  const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='STB_Report_'+new Date().toISOString().slice(0,10)+'.json';a.click();
  demoLog('📤 گزارش export شد');
}

