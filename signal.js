'use strict';
// ═══════════════════════════════════════════
// STB v17.7 — signal.js
// SMC Engine + Signal v2 + calcSL
// نیاز دارد: config.js
// ═══════════════════════════════════════════

// ─── SMC ENGINE ─────────────────────────────────────
function swings(c, n=3) {
  const h=[],l=[];
  for(let i=n;i<c.length-n;i++){
    let iH=true,iL=true;
    for(let j=1;j<=n;j++){
      if(c[i].h<=c[i-j].h||c[i].h<=c[i+j].h)iH=false;
      if(c[i].l>=c[i-j].l||c[i].l>=c[i+j].l)iL=false;
    }
    if(iH)h.push({i,p:c[i].h});
    if(iL)l.push({i,p:c[i].l});
  }
  return{h,l};
}

function detOB(c, sw2) {
  const r=[];
  for(const sh of sw2.h.slice(-3)){
    for(let i=sh.i-1;i>=Math.max(0,sh.i-6);i--){
      if(c[i].c<c[i].o){r.push({type:'بلاک عرضه',t:'ob-s',price:c[i].h,lo:c[i].l,hi:c[i].h,low:c[i].l,high:c[i].h});break;}
    }
  }
  for(const sl of sw2.l.slice(-3)){
    for(let i=sl.i-1;i>=Math.max(0,sl.i-6);i--){
      if(c[i].c>c[i].o){r.push({type:'بلاک تقاضا',t:'ob-d',price:c[i].l,lo:c[i].l,hi:c[i].h,low:c[i].l,high:c[i].h});break;}
    }
  }
  return r;
}

function detFVG(c) {
  const r=[];
  for(let i=2;i<c.length;i++){
    const a=c[i-2],b=c[i];
    if(b.l>a.h)r.push({type:'FVG صعودی',t:'fvg',price:(b.l+a.h)/2,low:a.h,high:b.l});
    if(b.h<a.l)r.push({type:'FVG نزولی',t:'fvg',price:(b.h+a.l)/2,low:b.h,high:a.l});
  }
  return r.slice(-3);
}

function detLiq(c, sw2, p) {
  const tol=p*0.0008,r=[];
  for(let i=0;i<sw2.h.length-1;i++)
    if(Math.abs(sw2.h[i].p-sw2.h[i+1].p)<tol)
      r.push({type:'نقدینگی سقف ❌',t:'liq',price:(sw2.h[i].p+sw2.h[i+1].p)/2});
  for(let i=0;i<sw2.l.length-1;i++)
    if(Math.abs(sw2.l[i].p-sw2.l[i+1].p)<tol)
      r.push({type:'نقدینگی کف ❌',t:'liq',price:(sw2.l[i].p+sw2.l[i+1].p)/2});
  return r.slice(-2);
}

function detBOS(c, sw2) {
  const last=c[c.length-1],e=[];
  if(sw2.l.length>=2){
    const ll=sw2.l[sw2.l.length-1];
    e.push({type:last.c<ll.p?'BOS نزولی ✓':'BOS نزولی',cls:'tbos-r',price:ll.p,tf:'—'});
  }
  if(sw2.h.length>=2){
    const lh=sw2.h[sw2.h.length-1];
    e.push({type:last.c>lh.p?'BOS صعودی ✓':'BOS صعودی',cls:'tbos-b',price:lh.p,tf:'—'});
  }
  return e.slice(0,4);
}

// ─── MATH HELPERS ───────────────────────────────────
function ema(d, n) {
  const k=2/(n+1);
  const r=[d[0]];
  for(let i=1;i<d.length;i++)r.push(d[i]*k+r[i-1]*(1-k));
  return r;
}

function trendDir(c) {
  if(c.length<25)return'side';
  const cls=c.slice(-30).map(x=>x.c);
  const e9=ema(cls,9),e21=ema(cls,21);
  const dv=e9[e9.length-1]-e21[e21.length-1];
  const rng=c[c.length-1].c*.001;
  if(dv>rng)return'bull';
  if(dv<-rng)return'bear';
  return'side';
}

function calcATR(c, n=14) {
  if(c.length<n+1)return(c[c.length-1]?.h-c[c.length-1]?.l)||0;
  const t=[];
  for(let i=1;i<c.length;i++)
    t.push(Math.max(c[i].h-c[i].l,Math.abs(c[i].h-c[i-1].c),Math.abs(c[i].l-c[i-1].c)));
  return t.slice(-n).reduce((a,b)=>a+b,0)/n;
}

function calcRSI(c, n=14) {
  // accepts array of candles OR array of closes
  const closes = Array.isArray(c) && typeof c[0]==='object' ? c.map(x=>x.c) : c;
  if(closes.length<n+2)return 50;
  const s=closes.slice(-(n+5));
  let g=0,l=0;
  for(let i=1;i<=n;i++){const d=s[i]-s[i-1];if(d>0)g+=d;else l-=d;}
  if(!l)return 100;
  return 100-(100/(1+(g/n)/(l/n)));
}

function calcVWAP(c) {
  let pv=0,v=0;
  for(const x of c){const tp=(x.h+x.l+x.c)/3;pv+=tp*x.v;v+=x.v;}
  return v?pv/v:c[c.length-1]?.c||0;
}

// ─── AUTO SELECT STRATEGY ───────────────────────────
function autoSelectStrategy(trendH4, rsi5m, volSurge, nearOB) {
  if(trendH4==='side'){
    if(nearOB)return'SMC';
    return'MEAN_REV';
  }
  if(trendH4!=='side'&&volSurge)return'TREND';
  if(nearOB&&volSurge)return'BREAKOUT';
  return'SMC';
}

// ─── SIGNAL ENGINE v2 ───────────────────────────────
function computeSignalV2(sym, c4h, c15m, c5m, price) {
  if(!c5m?.length||!c4h?.length||!price)return null;

  function _ema(data,n){
    if(!data||data.length<n)return null;
    const k=2/(n+1);let e=data[0];
    for(let i=1;i<data.length;i++)e=data[i]*k+e*(1-k);
    return e;
  }
  function _rsi(data,n=14){
    if(!data||data.length<n+2)return 50;
    const s=data.slice(-(n+5));let g=0,l=0;
    for(let i=1;i<=n;i++){const d=s[i]-s[i-1];if(d>0)g+=d;else l-=d;}
    if(!l)return 100;
    return 100-(100/(1+(g/n)/(l/n)));
  }

  const cls5=c5m.map(c=>c.c), cls15=c15m.map(c=>c.c), cls4h_=c4h.map(c=>c.c);
  const e9_5=_ema(cls5,9),  e21_5=_ema(cls5,21);
  const e9_15=_ema(cls15,9),e21_15=_ema(cls15,21);
  const e9_4h=_ema(cls4h_,9),e21_4h=_ema(cls4h_,21);
  const e200=cls4h_.length>=200?_ema(cls4h_,200):null;
  const bull5=e9_5>e21_5, bull15=e9_15>e21_15, bull4h=e9_4h>e21_4h;
  const above200=!e200||price>e200;
  const prev9=_ema(cls5.slice(0,-1),9),prev21=_ema(cls5.slice(0,-1),21);
  const crossBull=prev9&&prev21&&prev9<=prev21&&bull5;
  const crossBear=prev9&&prev21&&prev9>=prev21&&!bull5;

  const rsi5v=_rsi(cls5),rsi15v=_rsi(cls15),rsi4hv=_rsi(cls4h_);
  const rsi5=isNaN(+rsi5v)?50:+rsi5v;
  const rsi15=isNaN(+rsi15v)?50:+rsi15v;
  const rsi4h=isNaN(+rsi4hv)?50:+rsi4hv;

  const atrs=[];
  for(let i=1;i<c5m.length;i++)
    atrs.push(Math.max(c5m[i].h-c5m[i].l,Math.abs(c5m[i].h-c5m[i-1].c),Math.abs(c5m[i].l-c5m[i-1].c)));
  const atr=atrs.slice(-14).reduce((a,b)=>a+b,0)/14||price*0.002;

  const atr4hArr=[];
  for(let i=1;i<c4h.length;i++)
    atr4hArr.push(Math.max(c4h[i].h-c4h[i].l,Math.abs(c4h[i].h-c4h[i-1].c),Math.abs(c4h[i].l-c4h[i-1].c)));
  const atr4h=atr4hArr.slice(-14).reduce((a,b)=>a+b,0)/14||price*0.01;

  let pv=0,tv=0;
  for(const c of c5m){const tp=(c.h+c.l+c.c)/3;pv+=tp*c.v;tv+=c.v;}
  const vwap=tv?pv/tv:price;

  const recent20=c5m.slice(-20);
  const rangeHigh20=Math.max(...recent20.map(c=>c.h));
  const rangeLow20 =Math.min(...recent20.map(c=>c.l));
  const rangeSize20=rangeHigh20-rangeLow20;
  const rangePct   =rangeSize20>0?(price-rangeLow20)/rangeSize20:0.5;
  const nearRangeTop    =rangePct>0.75;
  const nearRangeBottom =rangePct<0.25;

  const vols=c5m.slice(-21).map(c=>c.v);
  const avgVol=vols.slice(0,-1).reduce((a,b)=>a+b,0)/Math.max(1,vols.length-1);
  const volSurge=avgVol>0&&(vols.at(-1)||0)>=avgVol*1.3;

  const sw4h=swings(c4h,3),sw15m=swings(c15m,3);
  const ob4hArr=detOB(c4h,sw4h).map(o=>({...o,tf:'H4'}));
  const ob15mArr=detOB(c15m,sw15m).map(o=>({...o,tf:'M15'}));
  const allOB=[...ob4hArr,...ob15mArr];
  const tol=price*0.015;
  const nearD=allOB.find(o=>o.t==='ob-d'&&Math.abs(price-o.price)<tol);
  const nearS=allOB.find(o=>o.t==='ob-s'&&Math.abs(price-o.price)<tol);

  let buyScore=0,sellScore=0;
  if(bull4h)buyScore+=2;else sellScore+=2;
  if(bull15)buyScore+=1.5;else sellScore+=1.5;
  if(bull5)buyScore+=1;else sellScore+=1;
  if(above200)buyScore+=0.5;else sellScore+=0.5;
  if(crossBull)buyScore+=1.5;
  if(crossBear)sellScore+=1.5;
  if(rsi5<25)buyScore+=2.5;
  else if(rsi5<35)buyScore+=1.5;
  else if(rsi5<45)buyScore+=0.5;
  if(rsi5>75)sellScore+=2.5;
  else if(rsi5>65)sellScore+=1.5;
  else if(rsi5>55)sellScore+=0.5;
  if(rsi15<35)buyScore+=0.8;
  if(rsi15>65)sellScore+=0.8;
  if(rsi4h<40)buyScore+=0.5;
  if(rsi4h>60)sellScore+=0.5;
  if(volSurge){const lc=c5m.at(-1);if(lc.c>lc.o)buyScore+=1.2;else sellScore+=1.2;}
  if(price>vwap)buyScore+=0.5;else sellScore+=0.5;
  if(nearRangeTop){sellScore+=2.0;buyScore=Math.max(0,buyScore-1.5);}
  if(nearRangeBottom){buyScore+=2.0;sellScore=Math.max(0,sellScore-1.5);}
  if(nearD)buyScore+=2;
  if(nearS)sellScore+=2;

  const activeStrat=(typeof AT_SETTINGS!=='undefined')
    ?(AT_SETTINGS.strategy==='AUTO'
      ?autoSelectStrategy(bull4h?'bull':'bear',rsi5,volSurge,nearD||nearS)
      :AT_SETTINGS.strategy)
    :'SMC';
  const strat=(typeof STRATEGIES!=='undefined'&&STRATEGIES[activeStrat])
    ?STRATEGIES[activeStrat]:{name:'SMC',slType:'auto',minScore:6.5,rrMin:1.5};
  const minScore=strat.minScore;

  const last3=c5m.slice(-3);
  const last3BullCount=last3.filter(c=>c.c>=c.o).length;
  const momentumBull=last3BullCount>=2;
  const momentumBear=last3BullCount<=1;
  const rsiBuyOK =rsi5<(AT_SETTINGS?.rsiFilterBuy ||65);
  const rsiSellOK=rsi5>(AT_SETTINGS?.rsiFilterSell||35);
  if(momentumBull)buyScore +=0.5;
  if(momentumBear)sellScore+=0.5;

  let sig='wait',strength='normal',sl=0,tp=0;

  if(buyScore>sellScore&&buyScore>=minScore&&rsiBuyOK){
    sig='buy';
    strength=buyScore>=(minScore+1)?'strong':'normal';
    sl=(typeof calcSL==='function')
      ?calcSL('buy',price,c5m,c4h,sw4h,sw15m,atr,{ob_d:nearD,ob_s:nearS},strat.slType)
      :(nearD?nearD.lo*0.998:price-atr*1.5);
    const tgtH=(sw4h.h||[]).filter(h=>h.p>price*1.005).sort((a,b)=>a.p-b.p);
    const minTP=price+Math.abs(price-sl)*Math.max(AT_SETTINGS?.minRR||1.5,1.5);
    tp=tgtH.length&&tgtH[0].p>minTP?tgtH[0].p:minTP;
  } else if(sellScore>buyScore&&sellScore>=minScore&&rsiSellOK){
    sig='sell';
    strength=sellScore>=(minScore+1)?'strong':'normal';
    sl=(typeof calcSL==='function')
      ?calcSL('sell',price,c5m,c4h,sw4h,sw15m,atr,{ob_d:nearD,ob_s:nearS},strat.slType)
      :(nearS?nearS.hi*1.002:price+atr*1.5);
    const tgtL=(sw4h.l||[]).filter(l=>l.p<price*0.995).sort((a,b)=>b.p-a.p);
    const minTPSell=price-Math.abs(sl-price)*Math.max(AT_SETTINGS?.minRR||1.5,1.5);
    tp=tgtL.length&&tgtL[0].p<minTPSell?tgtL[0].p:minTPSell;
  }

  // ── Validate SL/TP ──
  const minDist=price*0.003;
  const maxDist=price*0.06;
  if(sig==='buy'){
    if(!sl||sl>=price||price-sl<minDist)sl=price-Math.max(atr*1.8,minDist*1.5);
    if(price-sl>maxDist)sl=price-maxDist;
    const risk=price-sl;
    if(!tp||tp<=price||tp-price<risk*1.5)tp=price+risk*2.5;
  }
  if(sig==='sell'){
    if(!sl||sl<=price||sl-price<minDist)sl=price+Math.max(atr*1.8,minDist*1.5);
    if(sl-price>maxDist)sl=price+maxDist;
    const risk=sl-price;
    if(!tp||tp>=price||price-tp<risk*1.5)tp=price-risk*2.5;
  }

  const risk=Math.abs(price-sl);
  const reward=Math.abs(tp-price);
  const rr=risk>0?reward/risk:0;
  const maxScore=Math.max(buyScore,sellScore);
  const wr=Math.min(0.80,Math.max(0.38,0.42+(maxScore-minScore)*0.05+(nearD||nearS?0.05:0)));

  // SMC levels for UI
  const fvg=detFVG(c5m);
  const liq=detLiq(c5m,swings(c5m,3),price);
  const bos=detBOS(c5m,swings(c5m,3)).map(b=>({...b,tf:'M5'}));
  const levels=[
    ...ob4hArr.map(o=>({...o,tf:'H4'})),
    ...ob15mArr.map(o=>({...o,tf:'M15'})),
    ...fvg.map(f=>({...f,tf:'M5'})),
    ...liq,
  ];

  return {
    sig, strength, sl, tp, rr, wr,
    strategy:activeStrat, strategyName:strat.name, slType:strat.slType,
    trend:{h4:bull4h?'bull':'bear',m15:bull15?'bull':'bear',m5:bull5?'bull':'bear'},
    rsi:{m5:rsi5,m15:rsi15,h4:rsi4h},
    atr5:atr, atr4h, vwap,
    buyScore:Math.round(buyScore*10)/10,
    sellScore:Math.round(sellScore*10)/10,
    nearOB:!!(nearD||nearS), nearS, nearD,
    rangePct:+rangePct.toFixed(2), nearRangeTop, nearRangeBottom,
    nearOBobj:{ob_d:nearD,ob_s:nearS},
    volSurge,
    ema:{bull5m:bull5,bull15m:bull15,bull4h,crossBull,crossBear,above200},
    sw4h, sw15m,
    rsiBuyBlocked:!rsiBuyOK, rsiSellBlocked:!rsiSellOK,
    price, entry:price,
    levels, struct:bos,
    swing:{sig:'wait',sl:0,tp:0,rr:0,wr:0.5},
  };
}

// ─── CALC SL ENGINE ─────────────────────────────────
function calcSL(dir, price, candles5m, candles4h, sw4h, sw15m, atr, nearOB, slTypeOverride) {
  const slType=slTypeOverride||AT_SETTINGS?.slType||'atr';
  const isCrypto=price>0.01;
  const minPct=isCrypto?0.004:0.0015;
  const maxPct=isCrypto?0.04 :0.02;
  const minDist=price*minPct;
  const maxDist=price*maxPct;
  const minPriceUnit=price<0.001?price*0.05:price<0.01?price*0.03:price*0.003;
  const safeATR=Math.max(atr||minPriceUnit*1.5,minPriceUnit);

  function validate(sl){
    if(!sl||isNaN(sl))return dir==='buy'?price-safeATR*1.5:price+safeATR*1.5;
    const dist=Math.abs(price-sl);
    if(dist<minDist)return dir==='buy'?price-Math.max(safeATR*1.5,minDist*1.2):price+Math.max(safeATR*1.5,minDist*1.2);
    if(dist>maxDist)return dir==='buy'?price-maxDist:price+maxDist;
    if(dir==='buy'&&sl>=price)return price-Math.max(safeATR*1.5,minDist*1.2);
    if(dir==='sell'&&sl<=price)return price+Math.max(safeATR*1.5,minDist*1.2);
    return sl;
  }

  function structuralSL(){
    if(dir==='buy'){
      const lows=[...(sw15m?.l||[]),...(sw4h?.l||[])].filter(l=>l.p<price*0.998).sort((a,b)=>b.p-a.p);
      if(lows[0])return lows[0].p*0.9985;
    } else {
      const highs=[...(sw15m?.h||[]),...(sw4h?.h||[])].filter(h=>h.p>price*1.002).sort((a,b)=>a.p-b.p);
      if(highs[0])return highs[0].p*1.0015;
    }
    return atrSL();
  }

  function srSL(){
    const step=price>50000?1000:price>10000?500:price>1000?50:price>100?5:price>1?0.5:0.001;
    const levels=[];
    [...(sw4h?.h||[]),...(sw4h?.l||[]),...(sw15m?.h||[]),...(sw15m?.l||[])].forEach(s=>levels.push(s.p));
    levels.push(Math.floor(price/step)*step,Math.ceil(price/step)*step);
    if(dir==='buy'){const sup=levels.filter(l=>l<price*0.998).sort((a,b)=>b-a);if(sup[0])return sup[0]*0.999;}
    else{const res=levels.filter(l=>l>price*1.002).sort((a,b)=>a-b);if(res[0])return res[0]*1.001;}
    return structuralSL();
  }

  function atrSL(){
    const mult=Math.max(AT_SETTINGS?.atrMultSL||1.5,1.2);
    return dir==='buy'?price-safeATR*mult:price+safeATR*mult;
  }

  function obSL(){
    if(dir==='buy'&&nearOB?.ob_d){const l=nearOB.ob_d.lo||nearOB.ob_d.price;if(l&&l<price*0.998)return l*0.998;}
    if(dir==='sell'&&nearOB?.ob_s){const h=nearOB.ob_s.hi||nearOB.ob_s.price;if(h&&h>price*1.002)return h*1.002;}
    return atrSL();
  }

  function candleSL(){
    const n=Math.max(AT_SETTINGS?.candlesSL||3,2);
    const recent=(candles5m||[]).slice(-n-1,-1);
    if(!recent.length)return atrSL();
    return dir==='buy'?Math.min(...recent.map(c=>c.l))*0.9985:Math.max(...recent.map(c=>c.h))*1.0015;
  }

  function gannSL(){
    const swH=(sw4h?.h||[]).filter(h=>h.p>price).sort((a,b)=>a.p-b.p)[0]?.p||price*1.05;
    const swL=(sw4h?.l||[]).filter(l=>l.p<price).sort((a,b)=>b.p-a.p)[0]?.p||price*0.95;
    const g382=swL+(swH-swL)*0.382;
    const g618=swL+(swH-swL)*0.618;
    return dir==='buy'?g382*0.999:g618*1.001;
  }

  function autoSL(){
    if(nearOB?.ob_d&&dir==='buy')return obSL();
    if(nearOB?.ob_s&&dir==='sell')return obSL();
    const s=structuralSL();if(s)return s;
    return atrSL();
  }

  const map={structural:structuralSL,sr:srSL,atr:atrSL,orderblock:obSL,candle:candleSL,gann:gannSL,auto:autoSL};
  return validate((map[slType]||autoSL)());
}

// ─── ESTIMATE WIN RATE ───────────────────────────────
function estWR(tr4h, rsi, rr, hasOB) {
  let s=.5;
  if(tr4h!=='side')s+=.06;
  if(rsi>68||rsi<32)s+=.07;
  if(rr>=2)s+=.05;
  if(rr>=3)s+=.05;
  if(hasOB)s+=.08;
  return Math.min(.88,Math.max(.38,s));
}

// ─── CANDLE PRESSURE ANALYSIS ───────────────────────
function analyzeCandlePressure(sym) {
  const candles=(S.candles[sym]||[]).slice(-5);
  if(candles.length<3)return{pressure:'neutral',score:0};
  let buyPressure=0,sellPressure=0;
  for(const c of candles){
    const body=Math.abs(c.c-c.o);
    const range=c.h-c.l||0.0001;
    const upperWick=c.h-Math.max(c.c,c.o);
    const lowerWick=Math.min(c.c,c.o)-c.l;
    const bodyRatio=body/range;
    if(c.c>c.o){buyPressure+=bodyRatio*2;buyPressure+=(lowerWick/range);sellPressure+=(upperWick/range)*0.5;}
    else{sellPressure+=bodyRatio*2;sellPressure+=(upperWick/range);buyPressure+=(lowerWick/range)*0.5;}
  }
  const last=candles[candles.length-1];
  if(last.c>last.o)buyPressure*=1.3;else sellPressure*=1.3;
  const total=buyPressure+sellPressure||1;
  const buyPct=Math.round(buyPressure/total*100);
  const sellPct=100-buyPct;
  if(buyPct>=65)return{pressure:'buy',score:buyPct,buyPct,sellPct};
  if(sellPct>=65)return{pressure:'sell',score:sellPct,buyPct,sellPct};
  return{pressure:'neutral',score:50,buyPct,sellPct};
}
