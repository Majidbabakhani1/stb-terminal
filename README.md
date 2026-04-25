# STB v17.7 — معماری ماژولار

## ساختار فایل‌ها

```
STB_modular/
├── config.js    — همه ثوابت، DB، state (307 خط)
├── db.js        — Supabase, save/load trade (181 خط)
├── signal.js    — SMC Engine, Signal V2, calcSL (425 خط)
├── ai.js        — Groq, Gemini, Claude, Dual AI, Supervisor (529 خط)
├── trade.js     — openPos, closePos, SmartTP/SL/PM (673 خط)
├── data.js      — WebSocket, Alpha Vantage, runAnalysis (180 خط)
├── ui.js        — Toast, Alarm, Analytics, Chip bar (432 خط)
└── chart.js     — drawChart (از فایل اصلی استخراج بشه)
```

**مجموع: ۲۷۲۷ خط** در مقابل ۶۰۴۹ خط فایل اصلی

## ترتیب لود در HTML

```html
<!-- External -->
<script src="https://s3.tradingview.com/tv.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

<!-- STB Modules — ترتیب مهمه -->
<script src="config.js"></script>   <!-- 1. ثوابت و state -->
<script src="db.js"></script>       <!-- 2. Supabase -->
<script src="signal.js"></script>   <!-- 3. موتور سیگنال -->
<script src="ai.js"></script>       <!-- 4. AI providers -->
<script src="trade.js"></script>    <!-- 5. پوزیشن‌ها -->
<script src="data.js"></script>     <!-- 6. دیتا و WebSocket -->
<script src="chart.js"></script>    <!-- 7. نمودار -->
<script src="ui.js"></script>       <!-- 8. رابط کاربری -->
```

## باگ‌های Fix شده

### TP Check Fix (trade.js - monitorDemoPos)
```javascript
// قبل — مشکل: شرط TP ممکن بود miss بشه
if ((dir === 'buy' && price >= pos.tp) || (dir === 'sell' && price <= pos.tp))

// بعد — fix: بررسی اضافی که TP معتبره
if (dir==='buy' && price >= pos.tp && pos.tp > pos.entry)
if (dir==='sell' && price <= pos.tp && pos.tp < pos.entry)
```

### detOB Fix (signal.js)
اضافه شد `lo` و `hi` به OB objects که calcSL درست کار کنه:
```javascript
r.push({type:'بلاک تقاضا', t:'ob-d', price:c[i].l, lo:c[i].l, hi:c[i].h, ...})
```

### calcRSI (signal.js)
حالا هم آرایه کندل‌ها و هم آرایه close قبول می‌کنه.

## TODO باقی‌مانده
- [ ] chart.js — استخراج drawChart از فایل اصلی
- [ ] Reverse Mode — تست WR بعد از فعال‌سازی
- [ ] آنالیتیکس — بررسی دلیل WR: 0%
- [ ] فارکس چارت — AV candles integration
