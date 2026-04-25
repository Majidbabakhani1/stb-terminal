'use strict';
// ═══════════════════════════════════════════
// STB v17.7 — ui.js
// Toast, Alarm, Analytics, Demo UI, Chip bar, Symbol bar
// نیاز دارد: config.js, trade.js
// ═══════════════════════════════════════════

// ─── TOAST ──────────────────────────────────────────
function showToast(title, msg, type='sell') {
  const wrap = document.getElementById('toastWrap');
  if (!wrap) return;
  const icons={buy:'📈',sell:'📉',warn:'⚠️',news:'📰',info:'ℹ️'};
  const cols={buy:'var(--g)',sell:'var(--r)',warn:'var(--a)',news:'var(--b)',info:'var(--c)'};
  const t = document.createElement('div');
  t.className = 'toast '+type;
  t.innerHTML = `<div class="t-icon">${icons[type]||'🔔'}</div><div class="t-body"><div class="t-title" style="color:${cols[type]||'var(--r)'}">${title}</div><div class="t-msg">${msg}</div></div><button class="t-close" onclick="this.parentElement.remove()">×</button>`;
  wrap.appendChild(t);
  setTimeout(()=>{ try{t.remove();}catch(e){} },9000);
}

// ─── ALARM ──────────────────────────────────────────
function fireAlarm(title, msg, type='sell') {
  showToast(title, msg, type);
  playSound(type);
  notify(title, msg);
  ALARM_LOG.push({title,msg,type,time:nowStr()});
  if (ALARM_LOG.length>100) ALARM_LOG.shift();
  S.alarmCount++;
  const btn=document.getElementById('alarmBtn');
  const badge=document.getElementById('alarmBadge');
  if (badge){badge.textContent=S.alarmCount;badge.classList.add('show');}
  if (btn) btn.classList.add('ringing');
  if (document.getElementById('alarmPanelModal')?.classList.contains('open')) renderAlarmPanel();
}

function clearAlarms() {
  S.alarmCount=0;
  document.getElementById('alarmBadge')?.classList.remove('show');
  document.getElementById('alarmBtn')?.classList.remove('ringing');
}

function playSound(type) {
  try {
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    const seq=type==='buy'?[[880,0],[1100,.1],[1320,.22]]:type==='warn'?[[660,0],[550,.1],[660,.22]]:[[660,0],[440,.1],[330,.2],[440,.3]];
    seq.forEach(([f,w])=>{const o=ctx.createOscillator(),g2=ctx.createGain();o.connect(g2);g2.connect(ctx.destination);o.frequency.value=f;o.type=type==='buy'?'sine':'sawtooth';g2.gain.setValueAtTime(.25,ctx.currentTime+w);g2.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+w+.12);o.start(ctx.currentTime+w);o.stop(ctx.currentTime+w+.14);});
  } catch(e){}
}

function notify(title, msg) {
  if(Notification.permission==='granted')try{new Notification('STB · '+title,{body:msg});}catch(e){}
  else if(Notification.permission==='default')Notification.requestPermission().then(p=>{if(p==='granted')try{new Notification('STB · '+title,{body:msg});}catch(e){}});
}

// ─── ALARM PANEL ────────────────────────────────────
function openAlarmPanel() {
  document.getElementById('alarmPanelModal')?.classList.add('open');
  S.alarmCount=0;
  document.getElementById('alarmBadge')?.classList.remove('show');
  document.getElementById('alarmBtn')?.classList.remove('ringing');
  switchAlarmTab(_alarmTab);
}
function closeAlarmPanel() { document.getElementById('alarmPanelModal')?.classList.remove('open'); }
function renderAlarmPanel() { if(_alarmTab==='alarms')renderAlarmHistory();else renderLogTab(); }

function switchAlarmTab(tab) {
  _alarmTab=tab;
  document.getElementById('alarmTab').style.display=tab==='alarms'?'flex':'none';
  document.getElementById('logTab').style.display=tab==='log'?'block':'none';
  document.getElementById('alarmTabBtn').style.background=tab==='alarms'?'var(--bdim)':'transparent';
  document.getElementById('alarmTabBtn').style.color=tab==='alarms'?'var(--b)':'var(--t3)';
  document.getElementById('logTabBtn').style.background=tab==='log'?'var(--bdim)':'transparent';
  document.getElementById('logTabBtn').style.color=tab==='log'?'var(--b)':'var(--t3)';
  if(tab==='alarms')renderAlarmHistory();else renderLogTab();
}

function clearAlarmLogs() { ALARM_HISTORY.length=0;renderAlarmHistory(); }

function renderAlarmHistory() {
  const el=document.getElementById('alarmTab');
  const sub=document.getElementById('alarmPanelSub');
  if(sub)sub.textContent=ALARM_HISTORY.length+' اعلان';
  const cols={buy:'var(--g)',sell:'var(--r)',warn:'var(--a)',news:'var(--b)',info:'var(--c)'};
  const icons={buy:'📈',sell:'📉',warn:'⚠️',news:'📰',info:'ℹ️'};
  if(!ALARM_HISTORY.length){el.innerHTML='<div style="color:var(--t3);font-size:11px;text-align:center;padding:20px;width:100%">هنوز الارمی ثبت نشده</div>';return;}
  el.innerHTML=[...ALARM_HISTORY].reverse().map(a=>`<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-radius:6px;border:1px solid var(--brd);background:var(--bg2);width:100%"><span style="font-size:16px;flex-shrink:0">${icons[a.type]||'🔔'}</span><div style="flex:1;min-width:0"><div style="font-size:11px;font-weight:800;color:${cols[a.type]||'var(--r)'};margin-bottom:2px">${a.title}</div><div style="font-size:10px;color:var(--t2);line-height:1.4">${a.msg}</div></div><div style="font-size:8.5px;color:var(--t3);font-family:monospace;white-space:nowrap;flex-shrink:0">${a.time}</div></div>`).join('');
}

function renderLogTab() {
  const logs=S.tradeLog||[];
  const wins=logs.filter(t=>t.win).length;
  document.getElementById('lt-total').textContent=logs.length;
  document.getElementById('lt-wins').textContent=wins;
  document.getElementById('lt-losses').textContent=logs.length-wins;
  document.getElementById('lt-wr').textContent=logs.length>0?Math.round(wins/logs.length*100)+'%':'—';
  const totalPnl=logs.reduce((a,t)=>a+(t.pnl||0),0);
  const pEl=document.getElementById('lt-pnl');
  if(pEl){pEl.textContent=(totalPnl>=0?'+':'')+'$'+totalPnl.toFixed(2);pEl.style.color=totalPnl>=0?'var(--g)':'var(--r)';}
  document.getElementById('alarmPanelSub').textContent=logs.length+' معامله';
  const tbody=document.getElementById('logTabBody');
  if(!logs.length){tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:16px;color:var(--t3)">هنوز معامله‌ای بسته نشده</td></tr>';return;}
  tbody.innerHTML=[...logs].reverse().map(t=>`<tr style="border-bottom:1px solid rgba(23,33,58,.5)"><td style="padding:3px 4px;color:${t.win?'var(--g)':'var(--r)'};font-weight:700;font-family:monospace">${t.win?'✅':'❌'}</td><td style="padding:3px 4px;font-weight:700">${DB[t.sym]?.label||t.sym}</td><td style="padding:3px 4px;color:${t.dir==='buy'?'var(--g)':'var(--r)'}">${t.dir==='buy'?'خرید':'فروش'}</td><td style="padding:3px 4px;font-family:monospace">${fmt(t.entry,t.sym)}</td><td style="padding:3px 4px;font-family:monospace">${fmt(t.exit,t.sym)}</td><td style="padding:3px 4px;font-family:monospace;color:${t.pnl>=0?'var(--g)':'var(--r)'}">${t.pnl>=0?'+':''}$${(t.pnl||0).toFixed(2)}</td><td style="padding:3px 4px;font-family:monospace;color:var(--a)">1:${(t.rr||0).toFixed(1)}</td><td style="padding:3px 4px;font-family:monospace;color:var(--t3)">${t.time||'—'}</td></tr>`).join('');
}

function copyAlarmData() {
  const isLog=_alarmTab==='log';
  let txt=isLog?'=== لاگ معاملات STB ===\n':'=== اعلانات STB ===\n';
  if(isLog){txt+=(S.tradeLog||[]).map(t=>`${t.win?'WIN':'LOSS'}|${t.sym}|${t.dir}|${fmt(t.entry,t.sym)}→${fmt(t.exit,t.sym)}|${(t.pnl||0).toFixed(2)}|${t.time}`).join('\n');}
  else{txt+=ALARM_HISTORY.map(a=>`[${a.time}]${a.title}: ${a.msg}`).join('\n');}
  navigator.clipboard.writeText(txt).then(()=>showToast('کپی شد','داده در کلیپ‌بورد قرار گرفت.','info')).catch(()=>showToast('خطا','کپی ممکن نشد.','warn'));
}

// ─── DEMO UI ─────────────────────────────────────────
function updateDemoUI() {
  const trades=DEMO.trades;
  const wins=trades.filter(t=>t.win).length;
  const totalPnl=trades.reduce((a,t)=>a+(t.netPnl||0),0);
  const grossProfit=trades.filter(t=>t.win).reduce((a,t)=>a+(t.netPnl||0),0);
  const grossLoss=Math.abs(trades.filter(t=>!t.win).reduce((a,t)=>a+(t.netPnl||0),0));
  const pf=grossLoss>0?grossProfit/grossLoss:grossProfit>0?Infinity:0;
  const wr=trades.length>0?Math.round(wins/trades.length*100):null;
  let maxDD=0,peak=DEMO_CONFIG.initialBalance,running=DEMO_CONFIG.initialBalance;
  for(const t of trades){running+=t.netPnl;if(running>peak)peak=running;const dd=(peak-running)/peak*100;if(dd>maxDD)maxDD=dd;}

  const setEl=(id,v,c)=>{const el=document.getElementById(id);if(el){el.textContent=v;if(c)el.style.color=c;}};
  setEl('demoBal','$'+DEMO.balance.toLocaleString('en-US',{maximumFractionDigits:0}),DEMO.balance>=DEMO_CONFIG.initialBalance?'var(--g)':'var(--r)');
  setEl('demoWR',wr!==null?wr+'%':'—',wr>=60?'var(--g)':wr>=45?'var(--a)':'var(--r)');
  setEl('demoPnl',(totalPnl>=0?'+':'')+'$'+totalPnl.toFixed(0),totalPnl>=0?'var(--g)':'var(--r)');
  setEl('demoPF',pf===Infinity?'∞':pf>0?pf.toFixed(2):'—',pf>=2?'var(--g)':pf>=1?'var(--a)':'var(--r)');
  setEl('demoDD',maxDD.toFixed(1)+'%',maxDD<10?'var(--g)':maxDD<20?'var(--a)':'var(--r)');
  setEl('demoTrades',trades.length+'','var(--b)');
  setEl('demoOpen',DEMO.openPositions.length+'',DEMO.openPositions.length>0?'var(--a)':'var(--t3)');

  // WR indicator header
  const wrEl=document.getElementById('demoWRHeader');
  if(wrEl)wrEl.textContent=wr!==null?'WR: '+wr+'%':'WR: 0%';
  wrEl&&(wrEl.style.color=wr>=60?'var(--g)':wr>=45?'var(--a)':'var(--r)');
}

function demoLog(msg) {
  const el=document.getElementById('demoLog');
  if(!el)return;
  el.innerHTML=`<span style="color:var(--b)">[${nowStr()}]</span> ${msg}<br>`+el.innerHTML.slice(0,3500);
}

function renderDemoOpenPos() {
  const el=document.getElementById('demoOpenPos');
  if(!el)return;
  if(!DEMO.openPositions.length){el.innerHTML='<div style="color:var(--t3);font-size:10px;text-align:center;padding:12px">هیچ پوزیشن بازی ندارید</div>';return;}
  el.innerHTML=DEMO.openPositions.map(pos=>{
    const pd=S.prices[pos.sym];
    const price=pd?.price||pos.entry;
    const pnl=pos.dir==='buy'?(price-pos.entry)/pos.entry*100:(pos.entry-price)/pos.entry*100;
    const pnlUSD=pnl/100*pos.tradeAmount*(pos.leverage||1);
    const effectiveSL=pos.trailingActive?pos.trailingSL:pos.sl;
    const slPct=Math.abs(price-effectiveSL)/price*100;
    const tpPct=Math.abs(pos.tp-price)/price*100;
    const progress=pos.tp!==pos.entry?Math.max(0,Math.min(100,(pos.dir==='buy'?(price-pos.entry)/(pos.tp-pos.entry):(pos.entry-price)/(pos.entry-pos.tp))*100)):0;
    const smartSLActive=pos.trailingActive&&pos.trailingSL!==pos.sl;
    return`<div class="demo-pos-card ${pos.dir}" style="border:1px solid ${pos.dir==='buy'?'rgba(0,230,118,.3)':'rgba(255,63,95,.3)'};border-radius:6px;padding:7px 9px;margin-bottom:6px;background:${pos.dir==='buy'?'rgba(0,230,118,.04)':'rgba(255,63,95,.04)'}">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
    <span style="font-size:9.5px;font-weight:700;color:${pos.dir==='buy'?'var(--g)':'var(--r)'}">${pos.dir==='buy'?'LONG':'SHORT'} ${DB[pos.sym]?.label||pos.sym}</span>
    <span style="font-size:8px;color:var(--t3)">[${pos.signalId}]</span>
    <span style="font-size:9px;font-weight:700;color:${pnlUSD>=0?'var(--g)':'var(--r)'}">${pnlUSD>=0?'+':''}$${pnlUSD.toFixed(2)}</span>
  </div>
  <div style="display:flex;gap:10px;font-size:8px;color:var(--t2);margin-bottom:3px">
    <span>ورود: <b style="color:var(--b)">${fmt(pos.entry,pos.sym)}</b></span>
    <span>الان: <b style="color:${pnl>=0?'var(--g)':'var(--r)'}">${fmt(price,pos.sym)}</b></span>
    <span style="color:${pnl>=0?'var(--g)':'var(--r)'}">${pnl>=0?'+':''}${pnl.toFixed(2)}%</span>
  </div>
  <div style="display:flex;gap:10px;font-size:8px;color:var(--t3);margin-bottom:4px">
    <span>SL: <span style="color:${smartSLActive?'var(--c)':'var(--r)'}">${fmt(effectiveSL,pos.sym)}${smartSLActive?' 🔐':''}</span></span>
    <span>TP: <span style="color:var(--g)">${fmt(pos.tp,pos.sym)}</span></span>
    <span>R:R 1:${pos.rr.toFixed(1)}</span>
    <span style="color:var(--a)">${pos.leverage||1}×</span>
  </div>
  <div style="height:3px;background:var(--brd);border-radius:2px;margin-bottom:4px;overflow:hidden">
    <div style="height:100%;width:${progress}%;background:${progress>=75?'var(--g)':progress>=40?'var(--a)':'var(--b)'};border-radius:2px;transition:width .3s"></div>
  </div>
  <div style="display:flex;gap:4px;flex-wrap:wrap">
    <span style="font-size:7.5px;padding:1px 5px;border-radius:3px;border:1px solid var(--brd2);color:var(--t3)">${pos.strategy||'AUTO'}</span>
    ${pos.trailingActive?'<span style="font-size:7.5px;padding:1px 5px;border-radius:3px;border:1px solid rgba(0,229,255,.3);color:var(--c)">Trail 🔄</span>':''}
    ${pos.strength==='strong'?'<span style="font-size:7.5px;padding:1px 5px;border-radius:3px;border:1px solid rgba(255,109,0,.3);color:var(--o)">💪 قوی</span>':''}
    <button onclick="closeDemoPos(DEMO.openPositions.find(p=>p.signalId==='${pos.signalId}'),S.prices['${pos.sym}']?.price||${pos.entry},'Manual')" style="font-size:7.5px;padding:1px 8px;border-radius:3px;border:1px solid rgba(255,63,95,.4);background:transparent;color:var(--r);cursor:pointer;font-family:var(--f);margin-right:auto">× بستن</button>
  </div>
</div>`;
  }).join('');
}

// ─── DEMO LOG ────────────────────────────────────────
function copyDemoLog() {
  const el=document.getElementById('demoLog');
  if(!el)return;
  navigator.clipboard.writeText(el.innerText||el.textContent).then(()=>showToast('کپی شد','لاگ در کلیپ‌بورد','info'));
}

// ─── ANALYTICS ──────────────────────────────────────
let _analyticsPeriod = 'all';

function filterTrades(period) {
  const trades=DEMO.trades,now=Date.now();
  if(period==='today') return trades.filter(t=>t.exitTs>now-86400000);
  if(period==='week')  return trades.filter(t=>t.exitTs>now-604800000);
  if(period==='month') return trades.filter(t=>t.exitTs>now-2592000000);
  if(period==='buy')   return trades.filter(t=>t.dir==='buy');
  if(period==='sell')  return trades.filter(t=>t.dir==='sell');
  if(period==='strong')return trades.filter(t=>t.strength==='strong');
  return trades;
}

function openAnalytics() { document.getElementById('analyticsModal')?.classList.add('open');renderAnalytics(); }
function closeAnalytics(){ document.getElementById('analyticsModal')?.classList.remove('open'); }

function setPeriod(p, btn) {
  _analyticsPeriod=p;
  document.querySelectorAll('.ptab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderAnalytics();
}

function renderAnalytics() {
  const trades=filterTrades(_analyticsPeriod);
  const wins=trades.filter(t=>t.win),losses=trades.filter(t=>!t.win);
  const totalPnl=trades.reduce((a,t)=>a+(t.netPnl||0),0);
  const grossProfit=wins.reduce((a,t)=>a+(t.netPnl||0),0);
  const grossLoss=Math.abs(losses.reduce((a,t)=>a+(t.netPnl||0),0));
  const pf=grossLoss>0?grossProfit/grossLoss:grossProfit>0?Infinity:0;
  const wr=trades.length>0?wins.length/trades.length:0;
  const avgWin=wins.length>0?grossProfit/wins.length:0;
  const avgLoss=losses.length>0?grossLoss/losses.length:0;
  const totalComm=trades.reduce((a,t)=>a+(t.commission||0),0);
  let maxDD=0,peak=DEMO_CONFIG.initialBalance,running=DEMO_CONFIG.initialBalance;
  for(const t of trades){running+=t.netPnl;if(running>peak)peak=running;const dd=(peak-running)/peak*100;if(dd>maxDD)maxDD=dd;}
  const avgDur=trades.length>0?Math.round(trades.reduce((a,t)=>a+(t.duration||0),0)/trades.length):0;
  let maxCW=0,maxCL=0,cw=0,cl=0;
  for(const t of trades){if(t.win){cw++;cl=0;maxCW=Math.max(maxCW,cw);}else{cl++;cw=0;maxCL=Math.max(maxCL,cl);}}
  const sub=document.getElementById('analyticsSubtitle');
  if(sub)sub.textContent=`${trades.length} معامله · ${_analyticsPeriod==='all'?'همه':_analyticsPeriod}`;
  const statsEl=document.getElementById('analyticsStats');
  if(!statsEl)return;
  const items=[
    {l:'Win Rate',v:wr>0?(wr*100).toFixed(1)+'%':'—',c:wr>=.6?'var(--g)':wr>=.45?'var(--a)':'var(--r)',s:'نسبت معاملات سودده'},
    {l:'Profit Factor',v:pf===Infinity?'∞':pf>0?pf.toFixed(2):'—',c:pf>=2?'var(--g)':pf>=1?'var(--a)':'var(--r)',s:'سود کل / ضرر کل'},
    {l:'Net P&L',v:(totalPnl>=0?'+':'')+'$'+totalPnl.toFixed(0),c:totalPnl>=0?'var(--g)':'var(--r)',s:'پس از کارمزد'},
    {l:'Max Drawdown',v:maxDD.toFixed(1)+'%',c:maxDD<10?'var(--g)':maxDD<20?'var(--a)':'var(--r)',s:'بیشترین افت'},
    {l:'Avg Win',v:'$'+avgWin.toFixed(1),c:'var(--g)',s:'میانگین سود'},
    {l:'Avg Loss',v:'$'+avgLoss.toFixed(1),c:'var(--r)',s:'میانگین ضرر'},
    {l:'کارمزد کل',v:'$'+totalComm.toFixed(2),c:'var(--a)',s:'Commission + Slippage'},
    {l:'Avg Duration',v:avgDur+'m',c:'var(--b)',s:'میانگین مدت'},
    {l:'Max Consec. W',v:maxCW+'',c:'var(--g)',s:'بیشترین برد متوالی'},
    {l:'Max Consec. L',v:maxCL+'',c:'var(--r)',s:'بیشترین باخت متوالی'},
    {l:'موجودی',v:'$'+DEMO.balance.toFixed(0),c:'var(--t1)',s:`شروع: $${DEMO_CONFIG.initialBalance}`},
    {l:'معاملات',v:trades.length+'',c:'var(--b)',s:`برد: ${wins.length} | باخت: ${losses.length}`},
  ];
  statsEl.innerHTML=items.map(s=>`<div class="stat-card"><div class="stat-card-l">${s.l}</div><div class="stat-card-v" style="color:${s.c}">${s.v}</div><div class="stat-card-s">${s.s}</div></div>`).join('');
  drawEquityCurve(trades);
  renderTradeTable(trades);
}

function renderTradeTable(trades) {
  const tbody=document.getElementById('analyticsTable');
  if(!tbody)return;
  if(!trades.length){tbody.innerHTML='<tr><td colspan="12" style="text-align:center;padding:16px;color:var(--t3)">هنوز معامله‌ای در این دوره ثبت نشده</td></tr>';return;}
  tbody.innerHTML=[...trades].reverse().map(t=>`
    <tr class="${t.win?'win-row':'loss-row'}">
      <td style="color:${t.win?'var(--g)':'var(--r)'}">${t.win?'✅':'❌'} ${t.status.replace('Closed ','')}</td>
      <td style="font-weight:700">${DB[t.sym]?.label||t.sym}</td>
      <td style="color:${t.dir==='buy'?'var(--g)':'var(--r)'}">${t.dir==='buy'?'خرید':'فروش'}</td>
      <td style="color:${t.strength==='strong'?'var(--a)':'var(--t3)'}">${t.strength==='strong'?'💪':'—'}</td>
      <td>${fmt(t.entry,t.sym)}</td>
      <td>${fmt(t.exit,t.sym)}</td>
      <td style="color:var(--a)">1:${(t.rr||0).toFixed(1)}</td>
      <td style="color:${t.netPnl>=0?'var(--g)':'var(--r)'}">${t.netPnl>=0?'+':''}$${t.netPnl.toFixed(2)}</td>
      <td style="color:${t.pnlPct>=0?'var(--g)':'var(--r)'}">${t.pnlPct>=0?'+':''}${t.pnlPct.toFixed(2)}%</td>
      <td style="color:var(--t3)">$${(t.commission||0).toFixed(3)}</td>
      <td style="color:var(--t3)">${t.duration||0}m</td>
      <td style="color:var(--t3);font-size:8px">${t.exitTime||'—'}</td>
    </tr>`).join('');
}

function drawEquityCurve(trades) {
  const cv=document.getElementById('equityCanvas');
  if(!cv)return;
  const ctx=cv.getContext('2d');
  const W=cv.offsetWidth||800,H=cv.offsetHeight||150;
  cv.width=W;cv.height=H;ctx.clearRect(0,0,W,H);
  if(!trades.length){ctx.fillStyle='#3a506c';ctx.font='11px Vazirmatn,sans-serif';ctx.textAlign='center';ctx.fillText('هنوز معامله‌ای ثبت نشده',W/2,H/2);return;}
  const series=[DEMO_CONFIG.initialBalance];
  for(const t of trades)series.push(series.at(-1)+(t.netPnl||0));
  const minV=Math.min(...series),maxV=Math.max(...series);
  const range=maxV-minV||1;
  const xStep=W/(series.length-1||1);
  const yp=v=>H-10-((v-minV)/range)*(H-20);
  const isProfit=series.at(-1)>=series[0];
  const grad=ctx.createLinearGradient(0,0,0,H);
  grad.addColorStop(0,isProfit?'rgba(0,230,118,.35)':'rgba(255,63,95,.35)');
  grad.addColorStop(1,isProfit?'rgba(0,230,118,.02)':'rgba(255,63,95,.02)');
  ctx.fillStyle=grad;ctx.beginPath();ctx.moveTo(0,H);
  series.forEach((v,i)=>ctx.lineTo(i*xStep,yp(v)));
  ctx.lineTo((series.length-1)*xStep,H);ctx.closePath();ctx.fill();
  ctx.strokeStyle=isProfit?'#00e676':'#ff3f5f';ctx.lineWidth=2;ctx.setLineDash([]);
  ctx.beginPath();series.forEach((v,i)=>{i===0?ctx.moveTo(0,yp(v)):ctx.lineTo(i*xStep,yp(v));});ctx.stroke();
  ctx.fillStyle='#7a94b4';ctx.font='9px monospace';ctx.textAlign='left';ctx.fillText('$'+series[0].toFixed(0),4,12);
  ctx.textAlign='right';ctx.fillStyle=isProfit?'#00e676':'#ff3f5f';ctx.fillText('$'+series.at(-1).toFixed(0),W-4,12);
}

function exportJSON() {
  const data={exportDate:new Date().toISOString(),config:DEMO_CONFIG,strategy:STRATEGY,trades:DEMO.trades};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='STB_trades.json';a.click();
  demoLog('📤 JSON export');
}

function exportCSV() {
  if(!DEMO.trades.length){showToast('خطا','هنوز معامله‌ای ثبت نشده','warn');return;}
  const h=['signalId','sym','dir','strength','entry','exit','sl','tp','rr','grossPnl','commission','netPnl','pnlPct','duration','status','win','entryTime','exitTime'];
  const csv=[h.join(','),...DEMO.trades.map(t=>h.map(k=>JSON.stringify(t[k]??'')).join(','))].join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='STB_trades.csv';a.click();
  demoLog('📤 CSV export');
}

// ─── CHIP BAR ────────────────────────────────────────
function renderChips() {
  const bar=document.getElementById('symBar');if(!bar)return;
  const cats={Forex:[],Crypto:[],Commodities:[],Other:[]};
  S.symbols.forEach(s=>{
    const cat=DB[s]?.cat;
    if(cat==='Forex')cats.Forex.push(s);
    else if(cat==='Crypto'||s.endsWith('USDT'))cats.Crypto.push(s);
    else if(cat==='Commodities')cats.Commodities.push(s);
    else cats.Other.push(s);
  });
  let html='';
  const sep='<div style="width:1px;height:22px;background:var(--brd2);flex-shrink:0;margin:0 4px"></div>';
  if(cats.Forex.length){html+='<span style="font-size:8px;color:var(--t4);font-weight:700;white-space:nowrap;flex-shrink:0">فارکس</span>';html+=cats.Forex.map(chipHTML).join('');}
  if(cats.Commodities.length){if(html)html+=sep;html+='<span style="font-size:8px;color:var(--t4);font-weight:700;white-space:nowrap;flex-shrink:0">کالا</span>';html+=cats.Commodities.map(chipHTML).join('');}
  if(cats.Crypto.length){if(html)html+=sep;html+='<span style="font-size:8px;color:var(--t4);font-weight:700;white-space:nowrap;flex-shrink:0">کریپتو</span>';html+=cats.Crypto.map(chipHTML).join('');}
  if(cats.Other.length){if(html)html+=sep;html+=cats.Other.map(chipHTML).join('');}
  bar.innerHTML=html;
  S.symbols.forEach(s=>{if(S.prices[s])updateChip(s);});
}

function chipHTML(s) {
  const db=DB[s]||{},lbl=db.label||s.replace('USDT','');
  const active=s===S.active;
  const hasBuy=S.positions.find(p=>p.sym===s&&(p.status==='active'||p.status==='warn')&&p.dir==='buy');
  const hasSell=S.positions.find(p=>p.sym===s&&(p.status==='active'||p.status==='warn')&&p.dir==='sell');
  const demoBuy=DEMO?.openPositions?.find(p=>p.sym===s&&p.dir==='buy');
  const demoSell=DEMO?.openPositions?.find(p=>p.sym===s&&p.dir==='sell');
  let cls='chip'+(active?' active':'')+(hasBuy||demoBuy?' pos-buy':hasSell||demoSell?' pos-sell':'');
  const pip=(hasBuy||demoBuy)?'<span style="width:5px;height:5px;border-radius:50%;background:var(--g);animation:blink .8s ease-in-out infinite;flex-shrink:0"></span>'
    :(hasSell||demoSell)?'<span style="width:5px;height:5px;border-radius:50%;background:var(--r);animation:blink .8s ease-in-out infinite;flex-shrink:0"></span>':'';
  return`<div class="${cls}" id="chip-${s}" onclick="selSym('${s}')">
    <span>${lbl}</span>
    <span style="font-family:monospace;font-size:9px;opacity:.8" id="cp-${s}">—</span>
    <span style="font-family:monospace;font-size:8px" id="cc-${s}">—</span>
    ${pip}
  </div>`;
}

function updateChip(sym) {
  const d=S.prices[sym];if(!d)return;
  const p=document.getElementById('cp-'+sym);
  const c=document.getElementById('cc-'+sym);
  if(p)p.textContent=fmt(d.price,sym);
  if(c){const up=d.chg>=0;c.textContent=(up?'+':'')+Number(d.chg||0).toFixed(2)+'%';c.style.color=up?'var(--g)':'var(--r)';}
}

function selSym(sym) {
  S.active=sym;renderChips();
  switchChart(sym);
  const db=DB[sym]||{};
  const hSym=document.getElementById('chartSym');
  const hSrc=document.getElementById('chartSrc');
  if(hSym)hSym.textContent=(db.label||sym)+' · '+S.tf+'m';
  if(hSrc)hSrc.textContent=db.src==='binance'?'Binance WS':db.src==='av'?'Alpha Vantage':'—';
  const pd=S.prices[sym];
  if(pd){const hP=document.getElementById('chartPrice');if(hP){hP.textContent=fmt(pd.price,sym);hP.style.color=pd.chg>=0?'var(--g)':'var(--r)';}}
  if(S.analysis[sym])renderSB(sym);
  else{setSt('stTrend','load','...');setSt('stSMC','load','...');runAnalysis(sym,S.mode);}
  if(isCanvas(sym)&&S.candles[sym]?.length)setTimeout(()=>drawChart(sym),50);
}

// ─── MODE UI ─────────────────────────────────────────
function updateModeUI() {
  document.querySelectorAll('.mode-btn').forEach(b=>{
    const m=b.getAttribute('data-mode');
    b.classList.toggle('active',m===ACTIVE_MODE);
    if(m===ACTIVE_MODE){const tm=TRADING_MODES[m];b.style.color=tm.color;b.style.borderColor=tm.color+'66';}
    else{b.style.color='';b.style.borderColor='';}
  });
}

// ─── DEMO DRAWER ─────────────────────────────────────
function toggleDemoPanel() {
  const drawer=document.getElementById('demoDrawer');
  const btn=document.getElementById('demoToggleBtn');
  const isOpen=drawer.classList.toggle('open');
  if(btn){btn.style.background=isOpen?'rgba(255,109,0,.15)':'';btn.style.borderColor=isOpen?'rgba(255,109,0,.5)':'';btn.style.color='#ff6d00';}
  if(isOpen){updateDemoUI();renderDemoOpenPos();}
}

function initDemoDrawer() {
  document.querySelectorAll('.dd-tab').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      const tab=btn.getAttribute('data-tab');
      document.querySelectorAll('.dd-tab').forEach(b=>b.classList.toggle('dd-tab-active',b.getAttribute('data-tab')===tab));
      document.querySelectorAll('.dd-panel').forEach(p=>p.style.display=p.getAttribute('data-panel')===tab?'block':'none');
      if(tab==='report'&&typeof renderReport==='function')renderReport();
    });
  });
}

// ─── REPORT ──────────────────────────────────────────
function renderReport() {
  const el=document.getElementById('reportContent');
  if(!el)return;
  const trades=DEMO.trades;
  if(!trades.length){el.innerHTML='<div style="color:var(--t3);text-align:center;padding:20px">هنوز معامله‌ای ثبت نشده</div>';return;}
  const wins=trades.filter(t=>t.win).length;
  const wr=trades.length>0?Math.round(wins/trades.length*100):0;
  const totalPnl=trades.reduce((a,t)=>a+(t.netPnl||0),0);
  el.innerHTML=`<div style="font-size:10px;color:var(--t2);line-height:1.8">
    <div>📊 تعداد معاملات: <b>${trades.length}</b> | WR: <b style="color:${wr>=50?'var(--g)':'var(--r)'}">${wr}%</b></div>
    <div>💰 سود/ضرر کل: <b style="color:${totalPnl>=0?'var(--g)':'var(--r)'}">${totalPnl>=0?'+':''}$${totalPnl.toFixed(2)}</b></div>
    <div>💵 موجودی فعلی: <b>$${DEMO.balance.toFixed(0)}</b></div>
    <div style="margin-top:8px;font-size:9px;color:var(--t3)">آخرین ۵ معامله:</div>
    ${[...trades].reverse().slice(0,5).map(t=>`<div style="font-size:8.5px;color:${t.win?'var(--g)':'var(--r)'}">${t.win?'✅':'❌'} ${DB[t.sym]?.label||t.sym} ${t.dir==='buy'?'↑':'↓'} ${(t.netPnl>=0?'+':'')+'$'+t.netPnl.toFixed(2)} | ${t.exitTime||''}</div>`).join('')}
  </div>`;
}
