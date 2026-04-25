'use strict';
// ═══════════════════════════════════════════
// STB v17.7 — config.js
// همه ثوابت، DB، state اولیه
// ═══════════════════════════════════════════

const DB = {
  EURUSD:  {src:'av',  label:'EUR/USD', tv:'FX:EURUSD',      cat:'Forex', dp:5, avSym:'EUR', avFrom:'USD'},
  GBPUSD:  {src:'av',  label:'GBP/USD', tv:'FX:GBPUSD',      cat:'Forex', dp:5, avSym:'GBP', avFrom:'USD'},
  USDJPY:  {src:'av',  label:'USD/JPY', tv:'FX:USDJPY',      cat:'Forex', dp:3, avSym:'USD', avFrom:'JPY'},
  XAUUSD:  {src:'av',  label:'طلا',     tv:'OANDA:XAUUSD',   cat:'Commodities',dp:2, avSym:'XAU', avFrom:'USD'},
  XAGUSD:  {src:'av',  label:'نقره',    tv:'OANDA:XAGUSD',   cat:'Commodities',dp:3, avSym:'XAG', avFrom:'USD'},
  BRNUSD:  {src:'av',  label:'نفت برنت',tv:'OANDA:BCOUSD',  cat:'Commodities',dp:2, avSym:'XBR', avFrom:'USD'},
  BTCUSDT: {src:'binance',label:'BTC',  tv:'BINANCE:BTCUSDT', cat:'Crypto',dp:1},
  ETHUSDT: {src:'binance',label:'ETH',  tv:'BINANCE:ETHUSDT', cat:'Crypto',dp:2},
  BNBUSDT: {src:'binance',label:'BNB',  tv:'BINANCE:BNBUSDT', cat:'Crypto',dp:2},
  SOLUSDT: {src:'binance',label:'SOL',  tv:'BINANCE:SOLUSDT', cat:'Crypto',dp:3},
  ADAUSDT: {src:'binance',label:'ADA',  tv:'BINANCE:ADAUSDT', cat:'Crypto',dp:4},
  XRPUSDT: {src:'binance',label:'XRP',  tv:'BINANCE:XRPUSDT', cat:'Crypto',dp:4},
  DOGEUSDT:{src:'binance',label:'DOGE', tv:'BINANCE:DOGEUSDT',cat:'Crypto',dp:5},
  LINKUSDT:{src:'binance',label:'LINK', tv:'BINANCE:LINKUSDT', cat:'Crypto',dp:3},
  AVAXUSDT:{src:'binance',label:'AVAX', tv:'BINANCE:AVAXUSDT', cat:'Crypto',dp:3},
};

const SUGGESTIONS = [
  {sym:'XAUUSD',label:'XAU/USD · طلا',cat:'Commodities'},
  {sym:'XAGUSD',label:'XAG/USD · نقره',cat:'Commodities'},
  {sym:'BRNUSD',label:'BRN/USD · نفت برنت',cat:'Commodities'},
  {sym:'EURUSD',label:'EUR/USD · یورو/دلار',cat:'Forex'},
  {sym:'GBPUSD',label:'GBP/USD · پوند',cat:'Forex'},
  {sym:'USDJPY',label:'USD/JPY · ین',cat:'Forex'},
  {sym:'BTCUSDT',label:'BTC · Bitcoin',cat:'Crypto'},
  {sym:'ETHUSDT',label:'ETH · Ethereum',cat:'Crypto'},
  {sym:'SOLUSDT',label:'SOL · Solana',cat:'Crypto'},
  {sym:'XRPUSDT',label:'XRP · Ripple',cat:'Crypto'},
];

const DEFAULT_SYMS = [
  'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT',
  'LINKUSDT','AVAXUSDT','ARBUSDT','DOTUSDT','NEARUSDT','INJUSDT','SUIUSDT',
  'PEPEUSDT','BONKUSDT','WIFUSDT',
];

const STORAGE_KEY = 'stb_v8_syms';

// ─── GLOBAL STATE ───────────────────────────────────
const S = {
  symbols:[],active:'BTCUSDT',tradeLog:[],tf:'5',mode:'scalp',
  prices:{},candles:{},analysis:{},
  positions:[],
  alarmCount:0,
  ws:null,
  dashFilter:'all',
  dashOpen:false,
  dashTimer:null,
  dashCountdown:15,
  chartRAF:null,
};

// ─── UTILS ──────────────────────────────────────────
const dp = s => {
  const p = S.prices?.[s]?.price || DB[s]?.price || 0;
  if(p < 0.0001) return 8;
  if(p < 0.01)   return 6;
  if(p < 1)      return 4;
  return DB[s]?.dp || 2;
};

function fmt(p,sym){
  if(p==null||isNaN(p))return'—';
  const n=+p,d=dp(sym);
  if(d<=1)return n.toLocaleString('en-US',{maximumFractionDigits:1});
  return n.toFixed(d);
}
const fmtPct = v => v==null?'—':(+v>=0?'+':'')+Number(v).toFixed(2)+'%';
const fmtVol = v => {
  if(!v)return'—';const n=+v;
  if(n>=1e9)return(n/1e9).toFixed(1)+'B';
  if(n>=1e6)return(n/1e6).toFixed(1)+'M';
  if(n>=1e3)return(n/1e3).toFixed(0)+'K';
  return n.toFixed(0);
};
const nowStr = () => {
  const t=new Date();
  return`${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}:${t.getSeconds().toString().padStart(2,'0')}`;
};
const setSt = (id,type,txt) => {const el=document.getElementById(id);if(el){el.className='phs '+type;el.textContent=txt;}};
function isCanvas(sym){return DB[sym]?.src==='binance'||DB[sym]?.src==='av'||(sym.endsWith('USDT')&&!DB[sym]);}
const saveSyms = () => {try{localStorage.setItem(STORAGE_KEY,JSON.stringify(S.symbols));}catch(e){}};
const loadSyms = () => {
  try{
    const s=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(Array.isArray(s)&&s.length){
      const clean=s.filter(sym=>sym.endsWith('USDT')||sym.endsWith('BTC'));
      if(clean.length)return clean;
    }
  }catch(e){}
  return DEFAULT_SYMS;
};

// ─── ALPHA VANTAGE ──────────────────────────────────
const AV_KEY = 'L1QRU9DMMQCIPF7P';
const AV_BASE = 'https://www.alphavantage.co/query';
const AV_INTERVAL = {'5':'5min','15':'15min','240':'60min'};
const _avQueue = {lastCall:0,callCount:0,resetAt:0};

// ─── STRATEGY PARAMETERS ────────────────────────────
const STRATEGY = {
  emaFast:9, emaSlow:21, ema200:200,
  rsiBuy:40, rsiSell:60, rsiExtrBuy:30, rsiExtrSell:70,
  volMultiplier:1.3,
  requireOB:false, requireBOS:false,
  minScalp:4, minSwing:5, strongScore:6.5,
  allowedSrc:['binance'],
};

// ─── AUTO TRADE SETTINGS ────────────────────────────
const AT_SETTINGS = {
  strategy:'AUTO', mode:'scalp', slType:'auto',
  atrMultSL:1.5, atrMultTP:3.0, candlesSL:3,
  minRR:1.3, minScore:5.5, requireAllEMA:false,
  rsiFilterBuy:65, rsiFilterSell:35,
};

// ─── STRATEGY DEFINITIONS ───────────────────────────
const STRATEGIES = {
  SMC:      {id:'SMC',      name:'SMC کامل',        nameEn:'Smart Money Concept', desc:'Order Block + FVG + BOS + Liquidity',    color:'var(--b)', icon:'🧱', minScore:5.5, rrMin:1.5, slType:'orderblock', bestMarket:['Crypto','Forex'],       bestCondition:['trend','range']},
  TREND:    {id:'TREND',    name:'Trend Following', nameEn:'Trend Following',     desc:'EMA 9/21/200 + RSI فیلتر + حجم',       color:'var(--g)', icon:'📈', minScore:5.0, rrMin:1.5, slType:'structural', bestMarket:['Crypto'],              bestCondition:['trend']},
  BREAKOUT: {id:'BREAKOUT', name:'Breakout',        nameEn:'Breakout',            desc:'شکست سطوح + تایید حجم + BOS',          color:'var(--c)', icon:'⚡', minScore:5.5, rrMin:1.8, slType:'sr',         bestMarket:['Crypto','Commodities'], bestCondition:['trend']},
  MEAN_REV: {id:'MEAN_REV', name:'Mean Reversion',  nameEn:'Mean Reversion',      desc:'برگشت به میانگین: RSI اشباع + VWAP + OB',color:'var(--a)',icon:'🔄',minScore:5.0, rrMin:1.5, slType:'atr',        bestMarket:['Crypto','Commodities'], bestCondition:['range']},
  GANN:     {id:'GANN',     name:'Gann + SMC',      nameEn:'Gann + SMC',          desc:'سطوح Gann 50% + OB + روند',            color:'var(--p)', icon:'⚖️', minScore:6.0, rrMin:2.0, slType:'gann',       bestMarket:['Forex','Commodities'],  bestCondition:['trend','range']},
  AUTO:     {id:'AUTO',     name:'هوشمند (AUTO)',   nameEn:'Auto Select',         desc:'انتخاب خودکار بهترین استراتژی',        color:'var(--o)', icon:'🤖', minScore:5.5, rrMin:1.5, slType:'auto',       bestMarket:['All'],                  bestCondition:['all']},
};

// ─── DEMO CONFIG ────────────────────────────────────
const DEMO_CONFIG = {
  commission:0.001,
  slippage:0.0003,
  initialBalance:1000,
  tradeAmount:100,
  trailActivePct:0.5,
  trailDistance:0.5,
  leverage:10,
  globalMaxLossUSD:10,
  maxOpenPositions:5,
  cooldownMs:60000,
};

// ─── DEMO STATE ─────────────────────────────────────
const DEMO = {
  balance:        1000,
  initialBalance: 1000,
  tradeAmount:    100,
  autoOn:         false,
  trades:         [],
  openPositions:  [],
  signalIdCounter:0,
  cooldowns:      {},
  strategyStats:  {
    SMC:{trades:0,wins:0,losses:0,pnl:0,totalR:0},
    TREND:{trades:0,wins:0,losses:0,pnl:0,totalR:0},
    BREAKOUT:{trades:0,wins:0,losses:0,pnl:0,totalR:0},
    MEAN_REV:{trades:0,wins:0,losses:0,pnl:0,totalR:0},
    GANN:{trades:0,wins:0,losses:0,pnl:0,totalR:0},
    AUTO:{trades:0,wins:0,losses:0,pnl:0,totalR:0},
  },
};

// ─── TRADING MODES ──────────────────────────────────
const TRADING_MODES = {
  PRECISION:{name:'Precision',nameFA:'دقیق — کم ولی قوی',icon:'🎯',minScore:8.0,minRR:2.0,requireDualAI:true, requireEMA:true, minConfidence:75,color:'var(--g)'},
  SCALP:    {name:'Scalp',    nameFA:'اسکالپ — زیاد و سریع',icon:'⚡',minScore:6.0,minRR:1.3,requireDualAI:false,requireEMA:false,minConfidence:60,color:'var(--a)'},
  BALANCED: {name:'Balanced', nameFA:'متوازن',             icon:'⚖️',minScore:7.0,minRR:1.5,requireDualAI:false,requireEMA:true, minConfidence:70,color:'var(--b)'},
};
let ACTIVE_MODE = 'BALANCED';

// ─── AI CONFIG ──────────────────────────────────────
const AI_CONFIG = {
  provider:      'internal',
  geminiKey:     '',
  claudeKey:     '',
  openrouterKey: '',
  openrouterModel:'mistralai/mistral-7b-instruct:free',
  groqKey:       '',
  groqKey2:      '',
  groqKey3:      '',
  groqKey4:      '',
  groqKey5:      '',
  _groqKeyIndex: 0,
  _allGroqKeys:  [],
  groqModel:     'llama-3.3-70b-versatile',
  maxCallsPerDay:50,
  callsToday:    0,
  lastReset:     0,
  aiIntervalMin: 3,
  timeoutMs:     12000,
  autoFallback:  true,
};

// ─── SMART TP CONFIG ────────────────────────────────
const SMART_TP = {
  enabled:            false,
  mode:               'internal',   // 'groq' | 'internal'
  intervalMs:         120000,       // هر ۲ دقیقه
  minProfitToActivate:0.15,         // حداقل $0.15 سود
  _timer:             null,
  _lastGroqCall:      {},
};

// ─── SMART PM CONFIG ────────────────────────────────
const SMART_PM = {
  enabled:          false,
  intervalMin:      5,
  minProfitToClose: 0.1,
  maxLossToKeep:    -0.5,
  maxAgeMin:        120,
  minStratWR:       55,
  _timer:           null,
};

// ─── SMART SL CONFIG ────────────────────────────────
const SMART_SL = {
  enabled: true,
  steps:[
    {profitPct:0.5, lockPct:0},
    {profitPct:1.0, lockPct:0.5},
    {profitPct:2.0, lockPct:1.0},
    {profitPct:3.0, lockPct:2.0},
    {profitPct:5.0, lockPct:3.5},
    {profitPct:8.0, lockPct:6.0},
  ],
};

// ─── DUAL AI CONFIG ─────────────────────────────────
const DUAL_AI = {
  enabled:       false,
  groqKeyA:      '',
  groqKeyB:      '',
  minConfidence: 70,
  requireBoth:   true,
  callsA:        0,
  callsB:        0,
};

// ─── SUPERVISOR CONFIG ──────────────────────────────
const SUPERVISOR = {
  enabled:    false,
  intervalMs: 5*60*1000,
  maxLog:     50,
  _timer:     null,
  _log:       [],
};

// ─── FULL SCAN CONFIG ───────────────────────────────
const FULL_SCAN = {
  enabled:      false,
  topN:         20,
  scanInterval: 180000,
  _scores:      {},
  _timer:       null,
  _activeSyms:  null,
  allSymbols:[
    'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','TRXUSDT',
    'AVAXUSDT','DOTUSDT','ATOMUSDT','NEARUSDT','APTUSDT','SUIUSDT','TONUSDT','KASUSDT',
    'MATICUSDT','ARBUSDT','OPUSDT','IMXUSDT','STRKUSDT','INJUSDT','RUNEUSDT',
    'UNIUSDT','AAVEUSDT','CRVUSDT','MKRUSDT','LDOUSDT','PENDLEUSDT',
    'FETUSDT','AGIXUSDT','WLDUSDT','RNDRUSDT','GRTUSDT','TAOUSDT',
    'LINKUSDT','FILUSDT','LTCUSDT','ETCUSDT','XLMUSDT',
    'AXSUSDT','SANDUSDT','MANAUSDT','GALAUSDT','APEUSDT',
    'SHIBUSDT','FLOKIUSDT','PEPEUSDT','BONKUSDT','WIFUSDT',
    'JUPUSDT','NOTUSDT','MOVEUSDT','VIRTUALUSDT','EIGENUSDT',
    'ALGOUSDT','ICPUSDT','VETUSDT','EGLDUSDT','STXUSDT',
  ],
};

// ─── SUPABASE CONFIG ────────────────────────────────
const SB = {
  url:       'https://wmglswdbxuoklorwdqvg.supabase.co',
  key:       'sb_publishable_Ep8OrksO0iq9TSs4Mm9K1Q_TCo_g-su',
  enabled:   true,
  sessionId: Date.now().toString(36),
};

// ─── BRIDGE CONFIG ──────────────────────────────────
const BRIDGE = {
  enabled: false,
  url:     'http://localhost:8080',
};

// ─── ALARM ──────────────────────────────────────────
const ALARM_HISTORY = [];
const ALARM_LOG     = ALARM_HISTORY; // alias
let _alarmTab = 'alarms';

// ─── CHART STATE ────────────────────────────────────
const CHART_STATE = {};
let chartAnim = null;
let _chartDrag = null;
const _cs = CHART_STATE;

// ─── REVERSE MODE ───────────────────────────────────
let REVERSE_MODE = false;

// ─── ID GENERATOR ───────────────────────────────────
function demoNextId() {
  return 'SIG-' + (++DEMO.signalIdCounter).toString().padStart(4,'0');
}
