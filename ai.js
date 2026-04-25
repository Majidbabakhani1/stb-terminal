'use strict';
// ═══════════════════════════════════════════
// STB v17.7 — ai.js
// Groq, Gemini, Claude, OpenRouter, Dual AI, Supervisor
// نیاز دارد: config.js, signal.js (buildMarketPrompt), db.js
// ═══════════════════════════════════════════

// ─── AI RESET ───────────────────────────────────────
function checkAIReset() {
  const now = Date.now();
  const oneDay = 86400000;
  if (now - AI_CONFIG.lastReset > oneDay) {
    AI_CONFIG.callsToday = 0;
    AI_CONFIG.lastReset = now;
  }
}

// ─── KEY ROTATION ───────────────────────────────────
function getNextGroqKey() {
  const allKeys = (AI_CONFIG._allGroqKeys?.length > 0)
    ? AI_CONFIG._allGroqKeys
    : ['groqKey','groqKey2','groqKey3','groqKey4','groqKey5']
        .map(k=>AI_CONFIG[k]).filter(k=>k&&k.length>10);
  if (!allKeys.length) return null;
  const idx = (AI_CONFIG._groqKeyIndex||0) % allKeys.length;
  AI_CONFIG._groqKeyIndex = idx + 1;
  return allKeys[idx];
}

function parseGroqKeysFromTextarea() {
  const ta = document.getElementById('groqKeysArea');
  if (!ta) return;
  const lines = ta.value.split('\n').map(l=>l.trim()).filter(l=>l.length>15);
  AI_CONFIG._allGroqKeys = lines;
  ['groqKey','groqKey2','groqKey3','groqKey4','groqKey5'].forEach((k,i)=>{
    AI_CONFIG[k] = lines[i] || '';
  });
  const el = document.getElementById('groqKeyActive');
  if (el) el.textContent = `(${lines.length} key)`;
  if (lines.length) demoLog(`⚡ ${lines.length} Groq key لود شد`);
}

// ─── GEMINI MUTEX ───────────────────────────────────
let _geminiLocked = false;
const _geminiQueue_list = [];
async function _geminiQueue() {
  if (!_geminiLocked) { _geminiLocked = true; return; }
  await new Promise(res => _geminiQueue_list.push(res));
}
function _geminiRelease() {
  _geminiLocked = false;
  if (_geminiQueue_list.length) { _geminiLocked = true; _geminiQueue_list.shift()(); }
}

// ─── BUILD PROMPT ───────────────────────────────────
function buildMarketPrompt(sym, sigResult, candles5m, price) {
  const db = DB[sym]||{};
  const atr = sigResult?.atr5||price*0.002;

  const candleData = (candles5m||[]).slice(-30).map(c=>{
    const chg=c.o>0?((c.c-c.o)/c.o*100).toFixed(2):'0';
    const type=c.c>c.o?'Bull':'Bear';
    return`${type} O:${c.o.toFixed(4)} H:${c.h.toFixed(4)} L:${c.l.toFixed(4)} C:${c.c.toFixed(4)} (${chg}%)`;
  }).join('\n');

  const smcLevels=(sigResult?.levels||[]).slice(0,6).map(l=>
    `  - ${l.type} @ ${Number(l.price).toFixed(4)} [${l.tf}]${Math.abs(price-l.price)/price<0.01?' ← NEARBY':''}`
  ).join('\n');

  const struct=(sigResult?.struct||[]).slice(0,4).map(s=>
    `  - ${s.en||s.type} @ ${Number(s.price).toFixed(4)} [${s.tf}]`
  ).join('\n');

  const trend=sigResult?.trend||{};
  const rsi  =sigResult?.rsi||{};
  const ema  =sigResult?.ema||{};

  return `You are an expert algorithmic trader specializing in crypto markets.
Analyze ${db.label||sym} and provide a precise trading decision.

=== PRICE ACTION (Last 30 x 5min candles) ===
${candleData}

=== CURRENT MARKET STATE ===
Price: ${price.toFixed(4)}
ATR(14): ${atr.toFixed(4)} = ${(atr/price*100).toFixed(3)}%
VWAP: ${(sigResult?.vwap||price).toFixed(4)} — Price is ${price>(sigResult?.vwap||price)?'ABOVE':'BELOW'} VWAP

=== TREND ALIGNMENT ===
H4: ${trend.h4==='bull'?'BULLISH ↑':trend.h4==='bear'?'BEARISH ↓':'SIDEWAYS →'}
M15: ${trend.m15==='bull'?'BULLISH ↑':trend.m15==='bear'?'BEARISH ↓':'SIDEWAYS →'}
M5: ${trend.m5==='bull'?'BULLISH ↑':trend.m5==='bear'?'BEARISH ↓':'SIDEWAYS →'}
EMA200: Price ${ema.above200?'ABOVE (bullish bias)':'BELOW (bearish bias)'}
EMA Cross: ${ema.crossBull?'GOLDEN CROSS ✓':ema.crossBear?'DEATH CROSS ✓':'None'}

=== INDICATORS ===
RSI M5:  ${(+(rsi?.m5||50)).toFixed(1)} ${rsi.m5>70?'⚠️ OVERBOUGHT':rsi.m5<30?'⚠️ OVERSOLD':''}
RSI M15: ${rsi.m15?.toFixed(1)||50}
RSI H4:  ${rsi.h4?.toFixed(1)||50}
Volume Surge: ${sigResult?.volSurge?'YES — strong momentum':'No'}

=== SMC STRUCTURE ===
${smcLevels||'No major levels detected'}

=== MARKET STRUCTURE (BOS/CHoCH) ===
${struct||'No structure breaks detected'}

=== INTERNAL SIGNAL ===
Signal: ${(sigResult?.sig||'wait').toUpperCase()}
Buy Score: ${sigResult?.buyScore||0} / Sell Score: ${sigResult?.sellScore||0}
Demand OB: ${sigResult?.nearD?'YES @ '+sigResult.nearD.price?.toFixed(4):'None near price'}
Supply OB: ${sigResult?.nearS?'YES @ '+sigResult.nearS.price?.toFixed(4):'None near price'}

=== YOUR TASK ===
1. Analyze the candles, trend, RSI, and SMC levels
2. Identify the market condition (trending/ranging/reversal)
3. Find the optimal entry, SL, and TP
4. SL RULES: minimum 0.3% from price, maximum 5%, SL for BUY must be below price, SL for SELL above price
5. TP RULES: minimum R:R 1.5, target nearest significant structure level

Respond with ONLY this JSON (no markdown, no extra text):
{"signal":"BUY or SELL or WAIT","confidence":0-100,"sl":exact_number,"tp":exact_number,"rr":number,"sl_method":"structural or atr or orderblock or sr","reason":"Persian text max 60 chars","key_level":important_price_number,"market_condition":"trending or ranging or reversal","analysis":"one line English summary"}`;
}

// ─── GROQ API ────────────────────────────────────────
async function callGroq(prompt) {
  const key = getNextGroqKey();
  if (!key) throw new Error('Groq key ندارید — از console.groq.com رایگان بگیرید');
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {'Content-Type':'application/json','Authorization':'Bearer '+key},
    body: JSON.stringify({
      model:           AI_CONFIG.groqModel,
      messages:        [{role:'user',content:prompt}],
      temperature:     0.1,
      max_tokens:      400,
      response_format: {type:'json_object'},
    }),
    signal: AbortSignal.timeout(AI_CONFIG.timeoutMs),
  });
  if (!r.ok) {
    const j = await r.json().catch(()=>({}));
    if (r.status===429) throw new Error('Groq rate limit');
    throw new Error('Groq '+r.status+': '+(j.error?.message||'').slice(0,50));
  }
  const j = await r.json();
  const text = j.choices?.[0]?.message?.content||'';
  try { return JSON.parse(text.replace(/```json|```/g,'').trim()); }
  catch(e) { const m=text.match(/\{[\s\S]+\}/);if(m)return JSON.parse(m[0]);throw new Error('Groq JSON parse failed'); }
}

async function callGroqWithKey(prompt, key) {
  if (!key) throw new Error('No key');
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {'Content-Type':'application/json','Authorization':'Bearer '+key},
    body: JSON.stringify({
      model: AI_CONFIG.groqModel,
      messages: [{role:'user',content:prompt}],
      temperature:0.1, max_tokens:400,
      response_format:{type:'json_object'},
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error('Groq '+r.status);
  const j = await r.json();
  const text = j.choices?.[0]?.message?.content||'';
  return JSON.parse(text.replace(/```json|```/g,'').trim());
}

// ─── GEMINI API ──────────────────────────────────────
async function callGemini(prompt) {
  const key = AI_CONFIG.geminiKey;
  if (!key) throw new Error('Gemini key ندارید — از aistudio.google.com رایگان بگیرید');
  await _geminiQueue();
  AI_CONFIG._lastCall = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
  const body = {
    contents: [{role:'user',parts:[{text:prompt}]}],
    generationConfig: {temperature:0.1,maxOutputTokens:400,responseMimeType:'application/json'},
    safetySettings: [
      {category:'HARM_CATEGORY_HARASSMENT',threshold:'BLOCK_NONE'},
      {category:'HARM_CATEGORY_HATE_SPEECH',threshold:'BLOCK_NONE'},
      {category:'HARM_CATEGORY_SEXUALLY_EXPLICIT',threshold:'BLOCK_NONE'},
      {category:'HARM_CATEGORY_DANGEROUS_CONTENT',threshold:'BLOCK_NONE'},
    ],
  };
  let r,j;
  try {
    r = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(AI_CONFIG.timeoutMs)});
    j = await r.json();
  } catch(e) { _geminiRelease();throw new Error('Gemini network error: '+e.message); }
  _geminiRelease();
  if (!r.ok||j.error) {
    const m=j.error?.message||('HTTP '+r.status);
    if(r.status===400)throw new Error('Gemini key نامعتبر است');
    if(r.status===429){demoLog('⏳ Gemini rate limit — ۱۵ ثانیه صبر...');await new Promise(r=>setTimeout(r,15000));throw new Error('Gemini rate limit');}
    throw new Error('Gemini: '+m.slice(0,50));
  }
  const text=j.candidates?.[0]?.content?.parts?.[0]?.text||'';
  if(!text)throw new Error('Gemini پاسخ خالی داد');
  try{const c=text.replace(/^```json\n?/,'').replace(/\n?```$/,'').trim();return JSON.parse(c);}
  catch(e){const m=text.match(/\{[\s\S]+\}/);if(m)return JSON.parse(m[0]);throw new Error('Gemini JSON parse failed');}
}

// ─── OPENROUTER API ──────────────────────────────────
async function callOpenRouter(prompt) {
  const key = AI_CONFIG.openrouterKey;
  if (!key) throw new Error('OpenRouter key ندارید');
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+key,'HTTP-Referer':'https://stb-terminal.app'},
    body:JSON.stringify({
      model: AI_CONFIG.openrouterModel||'mistralai/mistral-7b-instruct:free',
      messages:[{role:'user',content:prompt}],
      temperature:0.1,max_tokens:400,
    }),
    signal:AbortSignal.timeout(AI_CONFIG.timeoutMs),
  });
  if(!r.ok)throw new Error('OpenRouter '+r.status);
  const j=await r.json();
  const text=j.choices?.[0]?.message?.content||'';
  try{return JSON.parse(text.replace(/```json|```/g,'').trim());}
  catch(e){const m=text.match(/\{[\s\S]+\}/);if(m)return JSON.parse(m[0]);throw new Error('OpenRouter JSON parse failed');}
}

// ─── CLAUDE API ──────────────────────────────────────
async function callClaude(prompt, model='claude-haiku-4-5-20251001') {
  const key = AI_CONFIG.claudeKey;
  if (!key) throw new Error('Claude key ندارید');
  const r = await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
    body:JSON.stringify({model,max_tokens:400,messages:[{role:'user',content:prompt}]}),
    signal:AbortSignal.timeout(AI_CONFIG.timeoutMs),
  });
  if(!r.ok)throw new Error('Claude '+r.status);
  const j=await r.json();
  const text=j.content?.[0]?.text||'';
  return JSON.parse(text.replace(/```json|```/g,'').trim());
}

// ─── ANALYZE CANDLE WITH GROQ (SmartTP) ─────────────
async function analyzeCandleWithGroq(sym, pos) {
  const now=Date.now();
  if(now-(SMART_TP._lastGroqCall[sym]||0)<120000)return null;
  SMART_TP._lastGroqCall[sym]=now;
  const candles=(S.candles[sym]||[]).slice(-10);
  const price=S.prices[sym]?.price||pos.entry;
  const pnlPct=pos.dir==='buy'?(price-pos.entry)/pos.entry*100:(pos.entry-price)/pos.entry*100;
  const currentProfit=pnlPct/100*pos.tradeAmount*(pos.leverage||1);
  const candleStr=candles.map(c=>{const d=c.c>=c.o?'▲':'▼';return`${d}O:${c.o.toFixed(4)} H:${c.h.toFixed(4)} L:${c.l.toFixed(4)} C:${c.c.toFixed(4)}`;}).join(' | ');
  const prompt=`You are analyzing a ${pos.dir.toUpperCase()} position on ${DB[sym]?.label||sym}.
Entry: ${pos.entry.toFixed(4)}, Current: ${price.toFixed(4)}, Profit: $${currentProfit.toFixed(2)}
SL: ${pos.sl.toFixed(4)}, TP: ${pos.tp.toFixed(4)}

Last 10 candles (5min): ${candleStr}

Should we:
1. HOLD - keep current TP, trend continues
2. LOCK - move TP closer to lock profit (momentum weakening)  
3. CLOSE - close now (strong reversal signal)
4. EXTEND - move TP higher (strong continuation)

Respond ONLY with JSON: {"action":"HOLD|LOCK|CLOSE|EXTEND","reason":"max 40 chars","confidence":0-100}`;
  try{
    const key=getNextGroqKey();if(!key)return null;
    const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
      body:JSON.stringify({model:AI_CONFIG.groqModel,messages:[{role:'user',content:prompt}],temperature:0.1,max_tokens:100,response_format:{type:'json_object'}}),
      signal:AbortSignal.timeout(8000),
    });
    if(!r.ok)return null;
    const j=await r.json();const text=j.choices?.[0]?.message?.content||'';
    return JSON.parse(text);
  }catch(e){return null;}
}

// ─── TEST AI CONNECTION ──────────────────────────────
async function testAIConnection() {
  saveAIConfig();
  const provider=AI_CONFIG.provider;
  if(provider==='internal'){showToast('منطق داخلی','هیچ API لازم نیست — همین الان فعاله','info');return;}
  demoLog(`🧪 تست اتصال ${provider}...`);
  const testPrompt='Respond with only this JSON: {"signal":"WAIT","confidence":100,"sl":0,"tp":0,"rr":0,"sl_method":"test","reason":"تست موفق","key_level":0,"market_condition":"ranging","analysis":"Connection test OK"}';
  try{
    let result;
    if(provider==='gemini')result=await callGemini(testPrompt);
    else if(provider==='groq')result=await callGroq(testPrompt);
    else if(provider==='openrouter')result=await callOpenRouter(testPrompt);
    else result=await callClaude(testPrompt,provider==='sonnet'?'claude-sonnet-4-20250514':'claude-haiku-4-5-20251001');
    demoLog(`✅ ${provider.toUpperCase()} متصل شد — ${result.reason||'OK'}`);
    showToast('اتصال موفق',provider.toUpperCase()+' آماده تحلیل است','buy');
    updateAIStatusUI();
  }catch(e){
    demoLog(`❌ ${provider.toUpperCase()} خطا: ${e.message}`);
    showToast('خطای اتصال',e.message,'warn');
  }
}

// ─── MAIN AI ANALYZER ────────────────────────────────
async function runAIAnalysis(sym, sigResult, price) {
  checkAIReset();
  const provider=AI_CONFIG.provider;
  if(provider==='internal')return null;
  const prompt=buildMarketPrompt(sym,sigResult,S.candles[sym],price);
  let result=null,usedProvider=provider;
  try{
    if(provider==='gemini')result=await callGemini(prompt);
    else if(provider==='groq')result=await callGroq(prompt);
    else if(provider==='openrouter')result=await callOpenRouter(prompt);
    else if(provider==='haiku')result=await callClaude(prompt,'claude-haiku-4-5-20251001');
    else if(provider==='sonnet')result=await callClaude(prompt,'claude-sonnet-4-20250514');
    AI_CONFIG.callsToday++;
    if(!result?.signal||!['BUY','SELL','WAIT'].includes(result.signal))throw new Error('Invalid AI response');
    const conf=result.confidence||0;
    const icon=conf>=75?'🟢':conf>=50?'🟡':'🔴';
    const condIcon=result.market_condition==='trending'?'📈':result.market_condition==='ranging'?'↔️':'🔄';
    demoLog(`${icon} [${usedProvider.toUpperCase()}] ${sym}: ${result.signal} — اطمینان: ${conf}% | ${condIcon} ${result.market_condition||''}`);
    demoLog(`   📝 ${result.reason||''}`);
    if(result.signal!=='WAIT'){
      demoLog(`   SL: ${Number(result.sl||0).toFixed(4)} | TP: ${Number(result.tp||0).toFixed(4)} | R:R 1:${(result.rr||0).toFixed(2)} | روش: ${result.sl_method||'auto'}`);
    }
    updateAIStatusUI();
    return result;
  }catch(e){
    console.warn('AI error:',e.message);
    demoLog(`⚠️ AI خطا (${usedProvider}): ${e.message.slice(0,40)} — منطق داخلی`);
    if(AI_CONFIG.autoFallback)return null;
    throw e;
  }
}

// ─── MERGE AI WITH INTERNAL ──────────────────────────
function mergeAIWithInternal(sym, internalSig, aiResult, price) {
  if (!aiResult) return internalSig;
  const aiSig = aiResult.signal?.toLowerCase();
  if (aiSig === 'wait') return null;
  if (aiSig !== internalSig.sig) {
    demoLog(`⚡ AI/Internal اختلاف: AI=${aiSig.toUpperCase()} Internal=${internalSig.sig.toUpperCase()} → داخلی`);
    return internalSig;
  }
  const merged = { ...internalSig };
  merged.aiConfidence = aiResult.confidence || 0;
  merged.aiProvider = AI_CONFIG.provider;
  // اگه AI یه SL/TP بهتر داره استفاده کن
  if (aiResult.sl && typeof aiResult.sl === 'number' && aiResult.sl > 0) {
    const aiSlDist = Math.abs(price - aiResult.sl);
    const intSlDist = Math.abs(price - internalSig.sl);
    // برای BUY: SL پایین‌تر (فاصله بیشتر = محافظه‌کارانه‌تر)
    if (internalSig.sig==='buy' && aiResult.sl < price && aiResult.sl > price*0.9)
      merged.sl = Math.min(internalSig.sl, aiResult.sl);
    if (internalSig.sig==='sell' && aiResult.sl > price && aiResult.sl < price*1.1)
      merged.sl = Math.max(internalSig.sl, aiResult.sl);
  }
  if (aiResult.tp && typeof aiResult.tp === 'number' && aiResult.tp > 0) {
    if (internalSig.sig==='buy' && aiResult.tp > price)
      merged.tp = Math.min(internalSig.tp, aiResult.tp); // محافظه‌کارانه‌تر
    if (internalSig.sig==='sell' && aiResult.tp < price)
      merged.tp = Math.max(internalSig.tp, aiResult.tp);
  }
  const risk = Math.abs(price - merged.sl);
  const reward = Math.abs(merged.tp - price);
  merged.rr = risk > 0 ? reward/risk : internalSig.rr;
  return merged;
}

// ─── DUAL AI ENGINE ──────────────────────────────────
async function dualAIAnalyze(sym, sigResult, price) {
  if (!DUAL_AI.enabled) return null;
  const keyA = DUAL_AI.groqKeyA || AI_CONFIG.groqKey;
  const keyB = DUAL_AI.groqKeyB || AI_CONFIG.groqKey2;
  if (!keyA || !keyB) { demoLog('⚠️ Dual AI: هر دو Groq key لازمه'); return null; }
  const prompt = buildMarketPrompt(sym, sigResult, S.candles[sym], price);
  const promptA = prompt + `\n\nFocus on: EMA alignment, RSI, volume, trend direction. Be strict.`;
  const promptB = prompt + `\n\nFocus on: Order blocks, BOS/CHoCH, liquidity levels, market structure. Be strict.`;
  let resultA=null,resultB=null;
  try{
    const [rA,rB] = await Promise.allSettled([callGroqWithKey(promptA,keyA),callGroqWithKey(promptB,keyB)]);
    DUAL_AI.callsA++;DUAL_AI.callsB++;
    if(rA.status==='fulfilled')resultA=rA.value;
    if(rB.status==='fulfilled')resultB=rB.value;
  }catch(e){demoLog('⚠️ Dual AI خطا: '+e.message);return null;}
  if(!resultA&&!resultB)return null;
  if(!resultA||!resultB){
    const r=resultA||resultB;
    demoLog(`🔵 Dual AI (یک‌طرفه): ${r.signal} ${(r.confidence||0)}%`);
    return r.confidence>=DUAL_AI.minConfidence?r:null;
  }
  const bothAgree=resultA.signal===resultB.signal;
  const avgConf=((resultA.confidence||0)+(resultB.confidence||0))/2;
  const icon=bothAgree&&avgConf>=DUAL_AI.minConfidence?'🟢':'🔴';
  demoLog(`${icon} Dual AI: A=${resultA.signal}(${resultA.confidence}%) B=${resultB.signal}(${resultB.confidence}%) Avg=${avgConf.toFixed(0)}%`);
  if(!bothAgree){demoLog('   ❌ اختلاف نظر — معامله رد شد');return null;}
  if(avgConf<DUAL_AI.minConfidence){demoLog(`   ❌ اطمینان کم (${avgConf.toFixed(0)}% < ${DUAL_AI.minConfidence}%) — رد شد`);return null;}
  return{
    ...resultA,signal:resultA.signal,confidence:avgConf,
    sl:resultA.signal==='BUY'?Math.min(resultA.sl||0,resultB.sl||Infinity):Math.max(resultA.sl||0,resultB.sl||0),
    tp:resultA.signal==='BUY'?Math.min(resultA.tp||Infinity,resultB.tp||Infinity):Math.max(resultA.tp||0,resultB.tp||0),
    reason:`A: ${resultA.reason||''} | B: ${resultB.reason||''}`,
    dualAI:true,
  };
}

// ─── SUPERVISOR ──────────────────────────────────────
function supervisorLog(msg) {
  const time=new Date().toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const entry=`[${time}] ${msg}`;
  SUPERVISOR._log.unshift(entry);
  if(SUPERVISOR._log.length>SUPERVISOR.maxLog)SUPERVISOR._log.pop();
  const el=document.getElementById('supervisorLog');
  if(el){
    el.innerHTML=SUPERVISOR._log.map(l=>`<div style="border-bottom:1px solid rgba(200,160,40,.08);padding:3px 0;font-size:8.5px;color:var(--t2)">${l}</div>`).join('');
    el.scrollTop=0;
  }
}

async function runSupervisor() {
  if(!SUPERVISOR.enabled)return;
  supervisorLog('🔍 شروع بررسی وضعیت بازار...');
  const allKeys=AI_CONFIG._allGroqKeys?.length>0?AI_CONFIG._allGroqKeys:[AI_CONFIG.groqKey].filter(k=>k&&k.length>10);
  if(!allKeys.length){supervisorLog('⚠️ Groq key ندارید — Supervisor غیرفعال');return;}
  const openPos=DEMO.openPositions.length,balance=DEMO.balance;
  const trades=DEMO.trades.length,wins=DEMO.trades.filter(t=>t.win).length;
  const wr=trades>0?Math.round(wins/trades*100):0;
  const activeSym=S.symbols.filter(s=>DB[s]?.src==='binance'||(s.endsWith('USDT'))).slice(0,5);
  const pricesSummary=activeSym.map(s=>`${DB[s]?.label||s}:${S.prices[s]?.price?.toFixed(2)||'?'}`).join(', ');
  const prompt=`You are the Supervisor AI for STB trading system.

SYSTEM STATUS:
- Open positions: ${openPos}
- Balance: $${balance.toFixed(0)}
- Today: ${trades} trades, ${wr}% win rate
- Active symbols prices: ${pricesSummary}
- Mode: ${ACTIVE_MODE}

RECENT TRADES:
${DEMO.trades.slice(-3).map(t=>`${t.win?'WIN':'LOSS'} ${t.sym} ${t.dir} entry:${t.entry?.toFixed?.(4)||t.entry} pnl:$${t.netPnl?.toFixed?.(2)||0}`).join('\n')||'No trades yet'}

OPEN POSITIONS:
${DEMO.openPositions.slice(0,3).map(p=>{const pr=S.prices[p.sym]?.price||p.entry;const pnl=p.dir==='buy'?(pr-p.entry)/p.entry*100:(p.entry-pr)/p.entry*100;return`${p.sym} ${p.dir} entry:${p.entry?.toFixed?.(4)||p.entry} pnl:${pnl.toFixed(2)}%`;}).join('\n')||'None'}

Analyze the situation and provide:
1. Market assessment (1 sentence)
2. Recommendation for open positions (hold/close/adjust)
3. Suggested action for next 30 minutes
4. Risk warning if any

Respond in Persian, maximum 4 short sentences total. Be direct and actionable.`;
  try{
    const key=allKeys[allKeys.length-1]||allKeys[0];
    const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
      body:JSON.stringify({model:AI_CONFIG.groqModel,messages:[{role:'user',content:prompt}],temperature:0.3,max_tokens:200}),
      signal:AbortSignal.timeout(10000),
    });
    if(!r.ok)throw new Error('HTTP '+r.status);
    const j=await r.json();const text=j.choices?.[0]?.message?.content||'';
    if(text){supervisorLog('🧠 تحلیل Supervisor:');text.split('\n').filter(l=>l.trim()).forEach(l=>supervisorLog('   '+l.trim()));}
  }catch(e){supervisorLog('⚠️ Supervisor خطا: '+e.message.slice(0,40));}
}

function toggleSupervisor() {
  SUPERVISOR.enabled=!SUPERVISOR.enabled;
  const btn=document.getElementById('supervisorBtn');
  if(btn){
    btn.style.background=SUPERVISOR.enabled?'rgba(200,160,40,.15)':'transparent';
    btn.style.color=SUPERVISOR.enabled?'var(--gold)':'var(--t3)';
    btn.style.borderColor=SUPERVISOR.enabled?'var(--gold)':'var(--brd2)';
    btn.textContent='🔭 Supervisor: '+(SUPERVISOR.enabled?'روشن':'خاموش');
  }
  if(SUPERVISOR.enabled){
    clearInterval(SUPERVISOR._timer);
    SUPERVISOR._timer=setInterval(runSupervisor,SUPERVISOR.intervalMs);
    supervisorLog('✅ Supervisor فعال شد — هر ۵ دقیقه تحلیل');
    runSupervisor();
  } else {
    clearInterval(SUPERVISOR._timer);
    supervisorLog('⏹ Supervisor متوقف شد');
  }
}

// ─── AI SETTINGS UI ──────────────────────────────────
function saveAIConfig() {
  const prov=document.getElementById('aiProvider')?.value||'internal';
  const gKey=document.getElementById('geminiKey')?.value?.trim()||'';
  const cKey=document.getElementById('claudeKey')?.value?.trim()||'';
  const orKey=document.getElementById('openrouterKey')?.value?.trim()||'';
  const groqKey=document.getElementById('groqKey')?.value?.trim()||'';
  AI_CONFIG.provider=prov;
  AI_CONFIG.geminiKey=gKey;
  AI_CONFIG.claudeKey=cKey;
  AI_CONFIG.openrouterKey=orKey;
  AI_CONFIG.groqKey=groqKey;
  AI_CONFIG.groqKey2=document.getElementById('groqKey2')?.value?.trim()||'';
  AI_CONFIG.groqKey3=document.getElementById('groqKey3')?.value?.trim()||'';
  AI_CONFIG.groqKey4=document.getElementById('groqKey4')?.value?.trim()||'';
  AI_CONFIG.groqKey5=document.getElementById('groqKey5')?.value?.trim()||'';
  const model=document.getElementById('groqModel')?.value||'llama-3.3-70b-versatile';
  AI_CONFIG.groqModel=model;
  try{localStorage.setItem('stb_ai_cfg',JSON.stringify({provider:prov,geminiKey:gKey,claudeKey:cKey,groqKey,openrouterKey:orKey,groqKey2:AI_CONFIG.groqKey2,groqKey3:AI_CONFIG.groqKey3,groqKey4:AI_CONFIG.groqKey4,groqKey5:AI_CONFIG.groqKey5}));}catch(e){}
  updateAIStatusUI();
  demoLog(`⚙️ AI provider: ${prov.toUpperCase()}`);
}

function loadAIConfig() {
  try{
    const saved=JSON.parse(localStorage.getItem('stb_ai_cfg')||'null');
    if(!saved)return;
    if(saved.provider)AI_CONFIG.provider=saved.provider;
    if(saved.geminiKey){AI_CONFIG.geminiKey=saved.geminiKey;const el=document.getElementById('geminiKey');if(el)el.value=saved.geminiKey;}
    if(saved.groqKey){AI_CONFIG.groqKey=saved.groqKey;const el=document.getElementById('groqKey');if(el)el.value=saved.groqKey;}
    if(saved.groqKey2){AI_CONFIG.groqKey2=saved.groqKey2;const el=document.getElementById('groqKey2');if(el)el.value=saved.groqKey2;}
    if(saved.claudeKey)AI_CONFIG.claudeKey=saved.claudeKey;
    if(saved.openrouterKey)AI_CONFIG.openrouterKey=saved.openrouterKey;
    const provEl=document.getElementById('aiProvider');
    if(provEl&&saved.provider)provEl.value=saved.provider;
  }catch(e){}
}

function updateAIStatusUI() {
  const p=AI_CONFIG.provider;
  const el=document.getElementById('aiStatusBadge');
  if(!el)return;
  const labels={internal:'داخلی',gemini:'Gemini',groq:'Groq',openrouter:'OpenRouter',haiku:'Claude Haiku',sonnet:'Claude Sonnet'};
  const hasKey=p==='internal'||p==='groq'?!!AI_CONFIG.groqKey:p==='gemini'?!!AI_CONFIG.geminiKey:p==='openrouter'?!!AI_CONFIG.openrouterKey:!!AI_CONFIG.claudeKey;
  el.textContent=labels[p]||p;
  el.style.color=hasKey?'var(--g)':'var(--a)';
}
