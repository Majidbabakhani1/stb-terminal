'use strict';
// ═══════════════════════════════════════════
// STB v17.7 — chart.js
// drawChart, TradingView, Chart Interaction
// نیاز دارد: config.js, signal.js, ui.js
// ═══════════════════════════════════════════

function drawChart(sym){
  const cv=document.getElementById('myChart');
  if(!cv)return;
  const zone=cv.parentElement||document.querySelector('.chart-zone');
  if(!zone)return;
  // Get dimensions - try multiple sources
  let W=zone.getBoundingClientRect().width||zone.offsetWidth||zone.clientWidth;
  let H=zone.getBoundingClientRect().height||zone.offsetHeight||zone.clientHeight;
  if(!W||!H){W=window.innerWidth-300;H=window.innerHeight-250;}
  W=Math.max(W,200); H=Math.max(H,300);
  cv.width=W; cv.height=H;
  const ctx=cv.getContext('2d');
  const candles=S.candles[sym]||[];
  const pd=S.prices[sym];
  const price=pd?.price||0;

  // Update header
  const db2=DB[sym]||{};
  document.getElementById('chartSym').textContent=(db2.label||sym)+' · '+S.tf+'m';
  document.getElementById('chartPrice').textContent=fmt(price,sym);
  document.getElementById('chartSrc').textContent=db2.src==='binance'?'Binance WS':db2.src==='td'?'Twelve Data':db2.src||'—';
  if(candles.length){
    const last=candles[candles.length-1];
    const chgPct=last.o>0?((last.c-last.o)/last.o*100).toFixed(2):'0';
    const chgCol=+chgPct>=0?'#00e676':'#ff3f5f';
    document.getElementById('chartOHLC').innerHTML=`<span>O:<span style="color:#dce8f8">${fmt(last.o,sym)}</span></span><span>H:<span style="color:#00e676">${fmt(last.h,sym)}</span></span><span>L:<span style="color:#ff3f5f">${fmt(last.l,sym)}</span></span><span style="color:${chgCol}">${+chgPct>=0?'+':''}${chgPct}%</span>`;
  }

  if(!candles.length){ctx.fillStyle='var(--t3)';ctx.font='14px Vazirmatn,sans-serif';ctx.textAlign='center';ctx.fillText('در حال دریافت کندل‌ها...',W/2,H/2);return;}

  // Layout: top chart + bottom volume panel
  const volPanelH = Math.floor(H * 0.18);
  const pad={top:30,right:72,bottom:volPanelH+4,left:8};
  const cw=W-pad.left-pad.right,ch=H-pad.top-pad.bottom;

  // Price range
  const prices=candles.flatMap(c=>[c.h,c.l]);
  let vMin=Math.min(...prices), vMax=Math.max(...prices);
  const margin=(vMax-vMin)*.08||price*.005;
  vMin-=margin; vMax+=margin;
  const yp=v=>pad.top+ch*(1-(v-vMin)/(vMax-vMin));
  // Apply zoom and offset
  const cs=getCS(sym);
  const zoom=cs.zoom||1;
  const totalC=candles.length;
  const visibleCount=Math.max(10,Math.min(totalC,Math.round(totalC/zoom)));
  const offset=Math.max(0,Math.min(totalC-visibleCount,cs.offset||0));
  const visCan=candles.slice(Math.max(0,totalC-visibleCount-offset), totalC-offset||undefined);
  // Re-calc price range for visible candles only
  const visPrices=visCan.flatMap(c=>[c.h,c.l]);
  if(visPrices.length){
    vMin=Math.min(...visPrices)-(vMax-vMin)*.05;
    vMax=Math.max(...visPrices)+(vMax-vMin)*.05;
  }
  const step=cw/Math.max(1,visCan.length);
  const candleW=Math.max(1,Math.floor(step)-1);

  ctx.clearRect(0,0,W,H);

  // Volume panel background
  ctx.fillStyle='rgba(11,16,32,0.6)';
  ctx.fillRect(pad.left,H-volPanelH,cw,volPanelH);

  // Grid lines — 6 levels, clear bold font
  const gridN=6;
  ctx.strokeStyle='rgba(23,33,58,0.55)';ctx.lineWidth=0.5;
  for(let i=0;i<=gridN;i++){
    const y=pad.top+i*(ch/gridN);
    const pv=vMax-i*(vMax-vMin)/gridN;
    ctx.beginPath();ctx.moveTo(pad.left,y);ctx.lineTo(W-pad.right,y);ctx.stroke();
    const label=fmt(pv,sym);
    ctx.font='bold 10px monospace';
    const lw=ctx.measureText(label).width;
    ctx.fillStyle='rgba(7,12,22,0.88)';ctx.fillRect(W-pad.right+1,y-9,lw+7,13);
    ctx.fillStyle='#8aabb0';ctx.textAlign='left';
    ctx.fillText(label,W-pad.right+4,y+2);
  }

  // Volume separator line
  ctx.strokeStyle='rgba(23,33,58,0.8)';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(pad.left,H-volPanelH);ctx.lineTo(W-pad.right,H-volPanelH);ctx.stroke();

  // Volume bars
  const maxVol=Math.max(...visCan.map(c=>c.v||0))||1;
  const volH=volPanelH-6;
  visCan.forEach((c,i)=>{
    const x=pad.left+i*step;
    const bull=c.c>=c.o;
    const bh=Math.max(1,(c.v||0)/maxVol*volH);
    ctx.fillStyle=bull?'rgba(0,230,118,0.4)':'rgba(255,63,95,0.4)';
    ctx.fillRect(x,H-bh-3,Math.max(1,candleW),bh);
  });

  // EMA9 + EMA21 — calculated on full dataset, drawn on visible slice
  function drawEMA(period, color, width){
    if(candles.length<=period)return;
    // Calculate EMA on ALL candles for accuracy
    const allCls=candles.map(c=>c.c);
    const k=2/(period+1);let e=allCls[0];
    const fullEma=[e];
    for(let i=1;i<allCls.length;i++){e=allCls[i]*k+e*(1-k);fullEma.push(e);}
    // Draw only the visible slice
    const startIdx=Math.max(0,candles.length-visCan.length);
    const visEma=fullEma.slice(startIdx);
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash([]);
    ctx.beginPath();let started=false;
    visEma.forEach((v,i)=>{
      if(isNaN(v)||v<vMin||v>vMax){started=false;ctx.beginPath();return;}
      const x=pad.left+i*step+candleW/2;
      if(!started){ctx.moveTo(x,yp(v));started=true;}else ctx.lineTo(x,yp(v));
    });
    ctx.stroke();
  }
  drawEMA(9,'rgba(0,229,255,0.72)',1.4);
  drawEMA(21,'rgba(61,159,255,0.82)',1.8);

  // Candles
  visCan.forEach((c,i)=>{
    const x=pad.left+i*step;const cx=x+candleW/2;
    const bull=c.c>=c.o;
    const col=bull?'#00e676':'#ff3f5f';
    ctx.strokeStyle=col;ctx.lineWidth=.8;ctx.setLineDash([]);
    ctx.beginPath();ctx.moveTo(cx,yp(c.h));ctx.lineTo(cx,yp(c.l));ctx.stroke();
    const bodyTop=yp(Math.max(c.o,c.c));const bodyH=Math.max(1.5,Math.abs(yp(c.o)-yp(c.c)));
    ctx.fillStyle=bull?'rgba(0,230,118,.88)':'rgba(255,63,95,.88)';
    ctx.fillRect(x,bodyTop,candleW,bodyH);
  });

  // SMC overlays
  const a=S.analysis[sym];
  if(a?.levels){
    for(const lv of a.levels){
      if(lv.price<vMin||lv.price>vMax)continue;
      const y=yp(lv.price);
      if(lv.t==='ob-s'){
        ctx.fillStyle='rgba(255,63,95,.07)';ctx.fillRect(pad.left,y-8,cw,16);
        ctx.strokeStyle='rgba(255,63,95,.5)';ctx.lineWidth=.8;ctx.setLineDash([4,3]);
        ctx.beginPath();ctx.moveTo(pad.left,y);ctx.lineTo(W-pad.right,y);ctx.stroke();
        ctx.setLineDash([]);ctx.fillStyle='rgba(255,63,95,.8)';ctx.font='9px Vazirmatn,sans-serif';ctx.textAlign='left';
        ctx.fillText('عرضه '+lv.tf+' '+fmt(lv.price,sym),pad.left+4,y-2);
      }else if(lv.t==='ob-d'){
        ctx.fillStyle='rgba(0,230,118,.07)';ctx.fillRect(pad.left,y-8,cw,16);
        ctx.strokeStyle='rgba(0,230,118,.5)';ctx.lineWidth=.8;ctx.setLineDash([4,3]);
        ctx.beginPath();ctx.moveTo(pad.left,y);ctx.lineTo(W-pad.right,y);ctx.stroke();
        ctx.setLineDash([]);ctx.fillStyle='rgba(0,230,118,.8)';ctx.font='9px Vazirmatn,sans-serif';ctx.textAlign='left';
        ctx.fillText('تقاضا '+lv.tf+' '+fmt(lv.price,sym),pad.left+4,y+10);
      }else if(lv.t==='liq'){
        ctx.strokeStyle='rgba(179,136,255,.7)';ctx.lineWidth=1;ctx.setLineDash([8,4]);
        ctx.beginPath();ctx.moveTo(pad.left,y);ctx.lineTo(W-pad.right,y);ctx.stroke();
        ctx.setLineDash([]);ctx.fillStyle='rgba(179,136,255,.8)';ctx.font='9px Vazirmatn,sans-serif';ctx.textAlign='left';
        ctx.fillText('❌ نقدینگی '+fmt(lv.price,sym),pad.left+4,y-2);
      }
    }
  }

  // Open positions
  const openPos=S.positions.filter(p=>p.sym===sym&&p.status==='active');
  for(const pos of openPos){
    if(pos.sl>=vMin&&pos.sl<=vMax){
      const ySL=yp(pos.sl);ctx.strokeStyle='rgba(255,63,95,.9)';ctx.lineWidth=1.5;ctx.setLineDash([6,3]);
      ctx.beginPath();ctx.moveTo(pad.left,ySL);ctx.lineTo(W-pad.right,ySL);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#ff3f5f';ctx.font='bold 9px monospace';ctx.textAlign='left';ctx.fillText('SL '+fmt(pos.sl,sym),pad.left+4,ySL-2);
    }
    if(pos.tp>=vMin&&pos.tp<=vMax){
      const yTP=yp(pos.tp);ctx.strokeStyle='rgba(0,230,118,.9)';ctx.lineWidth=1.5;ctx.setLineDash([6,3]);
      ctx.beginPath();ctx.moveTo(pad.left,yTP);ctx.lineTo(W-pad.right,yTP);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#00e676';ctx.font='bold 9px monospace';ctx.textAlign='left';ctx.fillText('TP '+fmt(pos.tp,sym),pad.left+4,yTP+10);
    }
    if(pos.entry>=vMin&&pos.entry<=vMax){
      const yEn=yp(pos.entry);ctx.strokeStyle='rgba(61,159,255,.7)';ctx.lineWidth=1;ctx.setLineDash([3,3]);
      ctx.beginPath();ctx.moveTo(pad.left,yEn);ctx.lineTo(W-pad.right,yEn);ctx.stroke();ctx.setLineDash([]);
    }
  }

  // Current price line
  if(price>=vMin&&price<=vMax){
    const py=yp(price);
    ctx.strokeStyle='rgba(0,229,255,.7)';ctx.lineWidth=1;ctx.setLineDash([5,3]);
    ctx.beginPath();ctx.moveTo(pad.left,py);ctx.lineTo(W-pad.right,py);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='#0d3a5c';ctx.fillRect(W-pad.right,py-10,pad.right-1,20);
    ctx.fillStyle='#00e5ff';ctx.font='bold 10px monospace';ctx.textAlign='center';
    ctx.fillText(fmt(price,sym),W-pad.right+(pad.right-1)/2,py+4);
  }
}

function updateChartPrice(price){
  document.getElementById('chartPrice').style.color=price>(S.prices[S.active]?.prev||price)?'var(--g)':'var(--r)';
  document.getElementById('chartPrice').textContent=fmt(price,S.active);
  // Redraw chart
  if(DB[S.active]?.src==='binance'||DB[S.active]?.src==='av')drawChart(S.active);
}

// ═══════════════════════════════════════════
// TRADINGVIEW (for forex/commodities)
// ═══════════════════════════════════════════
function loadTV(sym,tf){
  const tv=document.getElementById('tvCont');
  tv.innerHTML='';
  if(typeof TradingView==='undefined'){setTimeout(()=>loadTV(sym,tf),4000);return;}
  const divId='tv_'+Date.now();
  const d=document.createElement('div');d.id=divId;d.style.cssText='width:100%;height:100%';
  tv.appendChild(d);
  const db=DB[sym]||{};
  new TradingView.widget({
    autosize:true,symbol:db.tv||(sym.endsWith('USDT')?'BINANCE:'+sym:'FX:'+sym),
    interval:tf,container_id:divId,locale:'en',theme:'dark',style:'1',timezone:'Asia/Tehran',
    toolbar_bg:'#070c16',enable_publishing:false,allow_symbol_change:false,
    hide_top_toolbar:false,hide_side_toolbar:false,withdateranges:true,save_image:true,
    studies:['MAExp@tv-basicstudies','RSI@tv-basicstudies'],
    overrides:{
      'paneProperties.background':'#04070d','paneProperties.backgroundType':'solid',
      'paneProperties.horzGridProperties.color':'#17213a','paneProperties.vertGridProperties.color':'#17213a',
      'scalesProperties.textColor':'#3a506c','scalesProperties.backgroundColor':'#070c16',
      'mainSeriesProperties.candleStyle.upColor':'#00e676','mainSeriesProperties.candleStyle.downColor':'#ff3f5f',
      'mainSeriesProperties.candleStyle.borderUpColor':'#00b248','mainSeriesProperties.candleStyle.borderDownColor':'#c42840',
      'mainSeriesProperties.candleStyle.wickUpColor':'#00b248','mainSeriesProperties.candleStyle.wickDownColor':'#c42840',
    },
  });
}

// Switch between self-chart and TradingView
function switchChart(sym){
  const cv=document.getElementById('myChart');
  const tv=document.getElementById('tvCont');
  if(!cv||!tv)return;
  const canvas=(typeof isCanvas==='function')?isCanvas(sym):true;
  if(canvas){
    cv.style.display='block';tv.style.display='none';
    // Force canvas size
    const zone=cv.parentElement;
    if(zone){cv.width=zone.offsetWidth||800;cv.height=zone.offsetHeight||450;}
  }else{
    cv.style.display='none';tv.style.display='block';
    if(typeof loadTV==='function')loadTV(sym,S.tf||'5');
  }
  const db=DB[sym]||{};
  const srcLabel=db.src==='binance'?'Binance WS':db.src==='av'?'Alpha Vantage':'—';
  const hSym=document.getElementById('chartSym');
  const hSrc=document.getElementById('chartSrc');
  if(hSym)hSym.textContent=(db.label||sym)+' · '+(S.tf||'5')+'m';
  if(hSrc)hSrc.textContent=srcLabel;
  if(canvas&&typeof setupChartInteraction==='function')setupChartInteraction();
  // Draw after browser renders layout
  if(canvas){
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        if(S.candles[sym]?.length)drawChart(sym);
        else{
          // Show loading state on canvas
          const cv2=document.getElementById('myChart');
          if(cv2){
            const z=cv2.parentElement;
            cv2.width=z.offsetWidth||800;cv2.height=z.offsetHeight||450;
            const ctx2=cv2.getContext('2d');
            ctx2.fillStyle='#04070d';ctx2.fillRect(0,0,cv2.width,cv2.height);
            ctx2.fillStyle='#3a506c';ctx2.font='14px Vazirmatn,sans-serif';ctx2.textAlign='center';
            ctx2.fillText('در حال دریافت کندل‌ها...',cv2.width/2,cv2.height/2);
          }
        }
      });
    });
  }
}

let _chartDrag = null;
function setupChartInteraction(){
  const cv=document.getElementById('myChart');
  // Remove old listeners by replacing element
  const newCv=cv.cloneNode(false);
  cv.parentNode.replaceChild(newCv,cv);
  newCv.id='myChart';
  // Wheel zoom
  newCv.addEventListener('wheel',e=>{
    e.preventDefault();
    const cs=getCS(S.active);
    const delta=e.deltaY>0?0.85:1.18;
    cs.zoom=Math.max(0.2,Math.min(8,cs.zoom*delta));
    if((DB[S.active]?.src==='binance'||DB[S.active]?.src==='av')&&S.candles[S.active]?.length)drawChart(S.active);
  },{passive:false});
  // Mouse pan
  newCv.addEventListener('mousedown',e=>{_chartDrag={x:e.clientX,sym:S.active,off:getCS(S.active).offset};});
  newCv.addEventListener('mousemove',e=>{
    if(!_chartDrag)return;
    const dx=e.clientX-_chartDrag.x;
    const cs=getCS(_chartDrag.sym);
    const candles=S.candles[_chartDrag.sym]||[];
    const move=Math.round(dx/Math.max(2,newCv.offsetWidth/Math.max(10,candles.length)));
    cs.offset=Math.max(0,Math.min(candles.length-10,_chartDrag.off-move));
    if((DB[S.active]?.src==='binance'||DB[S.active]?.src==='av')&&S.candles[S.active]?.length)drawChart(S.active);
  });
  newCv.addEventListener('mouseup',()=>{_chartDrag=null;});
  newCv.addEventListener('mouseleave',()=>{_chartDrag=null;});
}

// ═══════════════════════════════════════════
// SMC ENGINE
// ═══════════════════════════════════════════
function swings(c,n=3){const h=[],l=[];for(let i=n;i<c.length-n;i++){let iH=true,iL=true;for(let j=1;j<=n;j++){if(c[i].h<=c[i-j].h||c[i].h<=c[i+j].h)iH=false;if(c[i].l>=c[i-j].l||c[i].l>=c[i+j].l)iL=false;}if(iH)h.push({i,p:c[i].h});if(iL)l.push({i,p:c[i].l});}return{h,l};}
function detOB(c,sw2){const r=[];for(const sh of sw2.h.slice(-3)){for(let i=sh.i-1;i>=Math.max(0,sh.i-6);i--){if(c[i].c<c[i].o){r.push({type:'بلاک عرضه',t:'ob-s',price:c[i].h,low:c[i].l,high:c[i].h});break;}}}for(const sl of sw2.l.slice(-3)){for(let i=sl.i-1;i>=Math.max(0,sl.i-6);i--){if(c[i].c>c[i].o){r.push({type:'بلاک تقاضا',t:'ob-d',price:c[i].l,low:c[i].l,high:c[i].h});break;}}}return r;}
function detFVG(c){const r=[];for(let i=2;i<c.length;i++){const a=c[i-2],b=c[i];if(b.l>a.h)r.push({type:'FVG صعودی',t:'fvg',price:(b.l+a.h)/2,low:a.h,high:b.l});if(b.h<a.l)r.push({type:'FVG نزولی',t:'fvg',price:(b.h+a.l)/2,low:b.h,high:a.l});}return r.slice(-3);}
function detLiq(c,sw2,p){const tol=p*0.0008,r=[];for(let i=0;i<sw2.h.length-1;i++)if(Math.abs(sw2.h[i].p-sw2.h[i+1].p)<tol)r.push({type:'نقدینگی سقف ❌',t:'liq',price:(sw2.h[i].p+sw2.h[i+1].p)/2});for(let i=0;i<sw2.l.length-1;i++)if(Math.abs(sw2.l[i].p-sw2.l[i+1].p)<tol)r.push({type:'نقدینگی کف ❌',t:'liq',price:(sw2.l[i].p+sw2.l[i+1].p)/2});return r.slice(-2);}
function detBOS(c,sw2){const last=c[c.length-1],e=[];if(sw2.l.length>=2){const ll=sw2.l[sw2.l.length-1];e.push({type:last.c<ll.p?'BOS نزولی ✓':'BOS نزولی',cls:'tbos-r',price:ll.p,tf:'—'});}if(sw2.h.length>=2){const lh=sw2.h[sw2.h.length-1];e.push({type:last.c>lh.p?'BOS صعودی ✓':'BOS صعودی',cls:'tbos-b',price:lh.p,tf:'—'});}return e.slice(0,4);}
function ema(d,n){const k=2/(n+1);const r=[d[0]];for(let i=1;i<d.length;i++)r.push(d[i]*k+r[i-1]*(1-k));return r;}
function trendDir(c){if(c.length<25)return'side';const cls=c.slice(-30).map(x=>x.c);const e9=ema(cls,9),e21=ema(cls,21);const dv=e9[e9.length-1]-e21[e21.length-1];const rng=c[c.length-1].c*.001;if(dv>rng)return'bull';if(dv<-rng)return'bear';return'side';}
function calcATR(c,n=14){if(c.length<n+1)return(c[c.length-1]?.h-c[c.length-1]?.l)||0;const t=[];for(let i=1;i<c.length;i++)t.push(Math.max(c[i].h-c[i].l,Math.abs(c[i].h-c[i-1].c),Math.abs(c[i].l-c[i-1].c)));return t.slice(-n).reduce((a,b)=>a+b,0)/n;}
function calcRSI(c,n=14){if(c.length<n+2)return 50;const cls=c.slice(-(n+5)).map(x=>x.c);let g=0,l=0;for(let i=1;i<=n;i++){const d=cls[i]-cls[i-1];if(d>0)g+=d;else l-=d;}return 100-(100/(1+(g/n)/((l/n)||.001)));}
function calcVWAP(c){let pv=0,v=0;for(const x of c){const tp=(x.h+x.l+x.c)/3;pv+=tp*x.v;v+=x.v;}return v?pv/v:c[c.length-1]?.c||0;}
function compSig(mode,tr4h,tr15m,tr5m,rsi,atr,price,sw4h,ob4h,ob15m){
  const pct=mode==='scalp'?.008:.018,slM=mode==='scalp'?1.2:2.5,tpM=mode==='scalp'?2.5:5;
  const nearS=ob4h.concat(ob15m).find(o=>o.t==='ob-s'&&Math.abs(price-o.price)/price<pct);
  const nearD=ob4h.concat(ob15m).find(o=>o.t==='ob-d'&&Math.abs(price-o.price)/price<pct);
  let sig='wait',sl=price-atr*slM,tp=price+atr*tpM;
  if(mode==='scalp'){if((tr5m==='bear'||tr15m==='bear')&&(nearS||rsi>65)){sig='sell';sl=price+atr*slM;const t=sw4h.l.filter(x=>x.p<price);tp=t.length?t[t.length-1].p:price-atr*tpM;}else if((tr5m==='bull'||tr15m==='bull')&&(nearD||rsi<35)){sig='buy';sl=price-atr*slM;const t=sw4h.h.filter(x=>x.p>price);tp=t.length?t[0].p:price+atr*tpM;}}
  else{if((tr4h==='bear'||(tr4h==='side'&&tr15m==='bear'))&&(nearS||rsi>70)){sig='sell';sl=price+atr*slM;const t=sw4h.l.filter(x=>x.p<price);tp=t.length?t[0].p:price-atr*tpM;}else if((tr4h==='bull'||(tr4h==='side'&&tr15m==='bull'))&&(nearD||rsi<30)){sig='buy';sl=price-atr*slM;const t=sw4h.h.filter(x=>x.p>price);tp=t.length?t[t.length-1].p:price+atr*tpM;}}
  return{sig,sl,tp,hasOB:!!(nearS||nearD)};
}
function estWR(tr4h,rsi,rr,hasOB){let s=.5;if(tr4h!=='side')s+=.06;if(rsi>68||rsi<32)s+=.07;if(rr>=2)s+=.05;if(rr>=3)s+=.05;if(hasOB)s+=.08;return Math.min(.88,Math.max(.38,s));}

// ═══════════════════════════════════════════
// ANALYSIS
// ═══════════════════════════════════════════
async function runAnalysis(sym,mode){
  const isMine=sym===S.active,m=mode||S.mode;
  const db=DB[sym]||{};
  const isBin=db.src==='binance'||(sym.endsWith('USDT')&&!db.src);
  try{
    let c4h,c15m,c5m,price=S.prices[sym]?.price||0;
    if(isBin){
      [c4h,c15m,c5m]=await Promise.all([fetchKlines(sym,'4h',150),fetchKlines(sym,'15m',150),fetchKlines(sym,'5m',150)]);
      price=S.prices[sym]?.price||c5m[c5m.length-1]?.c||0;
      const tf2map={'5':'5m','15':'15m','240':'4h'};
      S.candles[sym]=await fetchKlines(sym,tf2map[S.tf]||'5m',200);
    }else if(DB[sym]?.src==='av'){
      // Alpha Vantage: real candles (rate limited — 5/min free tier)
      try{
        // Fetch sequentially with rate limit queue
        c5m = await avGetCandles(sym,'5',100);
        c15m = await avGetCandles(sym,'15',100);
        c4h = await avGetCandles(sym,'240',100);
        price = S.prices[sym]?.price || c5m.at(-1)?.c || 0;
        S.candles[sym] = await avGetCandles(sym, S.tf, 150);
        if(!S.prices[sym]?.price && c5m.length){
          const lc=c5m.at(-1).c;
          S.prices[sym]={price:lc,open:lc,high:lc,low:lc,vol:0,chg:0,prev:lc,src:'av'};
          updateChip(sym);
        }
      }catch(avErr){
        console.warn('AV candles:',avErr.message);
        // Rate limited — use synth candles as fallback
        const pd=S.prices[sym];
        price=pd?.price||0;
        if(!price){
          if(isMine)setSt('stSMC','err','AV محدود — ۶۵ ثانیه دیگر');
          setTimeout(()=>runAnalysis(sym,S.mode),65000);
          return;
        }
        // Use synth candles as fallback
        const sc=synthCandles(price,price*1.02,price*.98,150);
        c4h=sc;c15m=sc.slice(-100);c5m=sc.slice(-50);
        S.candles[sym]=sc.slice(-120);
        if(isMine){
          setSt('stSMC','load','AV محدود');
          // Show price on chart anyway
          setTimeout(()=>{if(isCanvas(sym)&&S.candles[sym]?.length)drawChart(sym);},100);
        }
      }
    }else{
      // Synth fallback for unknown sources
      const pd=S.prices[sym];if(!pd?.price)return;price=pd.price;
      const sc=synthCandles(price,pd.high||price*1.02,pd.low||price*.98,150);
      c4h=sc;c15m=sc.slice(-80);c5m=sc.slice(-40);S.candles[sym]=sc.slice(-100);
    }
    if(!c5m?.length||!price)return;
    const sw4h=swings(c4h,3),sw15m=swings(c15m,3);
    const tr4h=trendDir(c4h),tr15m=trendDir(c15m),tr5m=trendDir(c5m);
    const atr5=calcATR(c5m),rsi5=calcRSI(c5m),vwap5=calcVWAP(c5m);
    const ob4h=detOB(c4h,sw4h).map(o=>({...o,tf:'H4'}));
    const ob15m2=detOB(c15m,sw15m).map(o=>({...o,tf:'M15'}));
    const allSMC=[...ob4h,...ob15m2,...detFVG(c15m).slice(-1).map(f=>({...f,tf:'M15'})),...detFVG(c5m).slice(-1).map(f=>({...f,tf:'M5'})),...detLiq(c4h,sw4h,price).map(l=>({...l,tf:'H4'}))].filter(l=>l.price>0).sort((a,b)=>Math.abs(a.price-price)-Math.abs(b.price-price)).slice(0,8);
    const allStr=[...detBOS(c4h,sw4h).map(b=>({...b,tf:'H4'})),...detBOS(c15m,sw15m).map(b=>({...b,tf:'M15'}))].slice(0,5);
    // Use new signal engine v2 (EMA + RSI + SMC + Volume)
    const v2=computeSignalV2(sym,c4h,c15m,c5m,price);
    const oldSc=compSig(m,tr4h,tr15m,tr5m,rsi5,atr5,price,sw4h,ob4h,ob15m2);
    // Merge: v2 takes priority for sig/sl/tp, old for compatibility
    const sig=v2?.sig||oldSc.sig;
    const sl=v2?.sl||oldSc.sl;
    const tp=v2?.tp||oldSc.tp;
    const risk=Math.abs(price-sl),reward=Math.abs(tp-price);
    const rr=risk>0?reward/risk:0;
    const sw2=compSig('swing',tr4h,tr15m,tr5m,rsi5,calcATR(c4h),price,sw4h,ob4h,ob15m2);
    const swR=Math.abs(price-sw2.sl),swRew=Math.abs(sw2.tp-price);
    // Full merged analysis object
    const analysisObj={
      levels:allSMC,struct:allStr,
      trend:{h4:tr4h,m15:tr15m,m5:tr5m},
      sig,entry:price,sl,tp,rr,
      strength:v2?.strength||'normal',
      wr:v2?.wr||estWR(tr4h,rsi5,rr,oldSc.hasOB),
      rsi:v2?.rsi||{m5:rsi5,m15:rsi5,h4:rsi5},
      atr5,vwap:vwap5,price,sw4h,
      buyScore:v2?.buyScore||0,
      sellScore:v2?.sellScore||0,
      nearOB:v2?.nearOB||false,
      nearS:v2?.nearS||null,
      nearD:v2?.nearD||null,
      volSurge:v2?.volSurge||false,
      ema:v2?.ema||{bull5m:false,bull15m:false,bull4h:false},
      swing:{sig:sw2.sig,sl:sw2.sl,tp:sw2.tp,rr:swR>0?swRew/swR:0,wr:estWR(tr4h,rsi5,swR>0?swRew/swR:0,sw2.hasOB)},
    };
    S.analysis[sym]=analysisObj;
    // Auto-trade hook
    if(DEMO._lastScanUpdate) DEMO._lastScanUpdate(sym);
    if(sig!=='wait'&&price>0)checkAutoTrade(sym,analysisObj,price);
    if(isMine){
      renderSB(sym);
      if(isCanvas(sym))drawChart(sym);
      const sLabel=v2?.strength==='strong'?'💪 قوی':sig==='sell'?'فروش':sig==='buy'?'خرید':'انتظار';
      setSt('stTrend','ok','✓');setSt('stSig','ok',sLabel);
      setSt('stSMC','ok',allSMC.length+'');setSt('stStr','ok',allStr.length+'');setSt('stRsn','ok','✓');
    }
  }catch(e){if(isMine)setSt('stSMC','err','خطا: '+e.message.slice(0,20));}
}

// ═══════════════════════════════════════════
// POSITION TRACKING — the real alarm engine
// ═══════════════════════════════════════════
let posDir = 'buy';
let _posData = {};

