// "আমাদের নিজেদের খরচ" — shared household expenses split between two people.
// Pure logic only (no React) so it can be tested on its own.
//
// Entry shapes (stored in their own file, shared.json — never mixed into data.json):
//   expense: { id, kind:'expense', date, amount, title, category, paid:{a,b}, ratio, note, createdAt, updatedAt }
//            ratio = person A's share in percent at the time of entry (so changing the
//            split later never rewrites old entries)
//   settle:  { id, kind:'settle', date, amount, from:'a'|'b', note, createdAt, updatedAt }
//            money handed from one person to the other to clear dues
//   settings:{ id:'__settings', kind:'settings', names:{a,b}, ratio, updatedAt }

export const SETTINGS_ID = '__settings'
// Real names are NOT kept in this public code: they are set in the section's settings
// and saved only in the private data repo (shared.json).
export const DEFAULT_SETTINGS = { names: { a: 'প্রথম জন', b: 'দ্বিতীয় জন' }, ratio: 60 }
export const SH_CATS = ['বাজার', 'বাসা ভাড়া', 'বিল', 'খাবার', 'যাতায়াত', 'স্বাস্থ্য', 'কেনাকাটা', 'অতিথি/দাওয়াত', 'পরিবার', 'অন্যান্য']
export const other = p => (p === 'a' ? 'b' : 'a')
const TINY = 0.5 // less than half a taka counts as settled

// ---------- formatting (Bangla) ----------
const nf = new Intl.NumberFormat('bn-BD', { maximumFractionDigits: 0 })
export const tk = n => '৳' + nf.format(Math.round(Number(n || 0)))
export const pct = n => nf.format(Math.round(Number(n || 0))) + '%'
export const bnInt = n => nf.format(n)
export const bnDate = (d, opts = { day: 'numeric', month: 'short' }) => new Date(d + 'T00:00:00').toLocaleDateString('bn-BD', opts)
export const bnMonth = mk => new Date(mk + '-01T00:00:00').toLocaleDateString('bn-BD', { month: 'long', year: 'numeric' })
// Bangla possessive / object forms: রহিম → রহিমের / রহিমকে, রিনি → রিনির / রিনিকে
const isBn = n => /[ঀ-৿]$/.test(n)
export const gen = n => isBn(n) ? (/[া-ৌঅ-ঔ]$/.test(n) ? n + 'র' : n + 'ের') : n + '-এর'
export const obj = n => isBn(n) ? n + 'কে' : n + '-কে'

// ---------- dates ----------
const pad = n => String(n).padStart(2, '0')
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const today = () => ymd(new Date())
export const monthKey = d => (d || '').slice(0, 7)
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000)
const monthName = (y, m) => new Date(y, m, 1).toLocaleDateString('bn-BD', { month: 'long', year: 'numeric' })

export const PRESETS = [['month', 'এই মাস'], ['lastmonth', 'গত মাস'], ['30d', 'গত ৩০ দিন'], ['year', 'এই বছর'], ['all', 'সব সময়'], ['custom', 'তারিখ বাছাই']]

export function rangeFor(preset, custom = {}, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth()
  switch (preset) {
    case 'month': return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)), label: `এই মাসে (${monthName(y, m)})` }
    case 'lastmonth': return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)), label: `গত মাসে (${monthName(y, m - 1)})` }
    case '30d': return { from: ymd(addDays(now, -29)), to: ymd(now), label: 'গত ৩০ দিনে' }
    case 'year': return { from: `${y}-01-01`, to: `${y}-12-31`, label: `${nf.format(y).replace(/,/g, '')} সালে` }
    case 'custom': {
      const { from = '', to = '' } = custom
      const label = from && to ? `${bnDate(from)} থেকে ${bnDate(to)} পর্যন্ত` : from ? `${bnDate(from)} থেকে এখন পর্যন্ত` : to ? `${bnDate(to)} পর্যন্ত` : 'শুরু থেকে এখন পর্যন্ত'
      return { from, to, label }
    }
    default: return { from: '', to: '', label: 'শুরু থেকে এখন পর্যন্ত' }
  }
}

// The period just before the selected one, for "compared with last month" lines
export function previousRange(preset, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth()
  if (preset === 'month') return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)), label: 'গত মাসের' }
  if (preset === 'lastmonth') return { from: ymd(new Date(y, m - 2, 1)), to: ymd(new Date(y, m - 1, 0)), label: 'তার আগের মাসের' }
  if (preset === '30d') return { from: ymd(addDays(now, -59)), to: ymd(addDays(now, -30)), label: 'তার আগের ৩০ দিনের' }
  if (preset === 'year') return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: 'গত বছরের' }
  return null
}
export const inRange = (d, r) => (!r.from || d >= r.from) && (!r.to || d <= r.to)

// ---------- money maths ----------
export const shareOf = e => { const amt = Number(e.amount || 0); const a = amt * Number(e.ratio ?? 60) / 100; return { a, b: amt - a } }
export const paidOf = e => ({ a: Number(e.paid?.a || 0), b: Number(e.paid?.b || 0) })
// Effect on the running balance. Positive = B owes A more; negative = A owes B more.
export const balanceEffect = e => {
  if (e.kind === 'expense') return paidOf(e).a - shareOf(e).a
  if (e.kind === 'settle') return e.from === 'b' ? -Number(e.amount) : Number(e.amount)
  return 0
}
const byDateAsc = (x, y) => x.date.localeCompare(y.date) || (x.createdAt || 0) - (y.createdAt || 0)

// Who owes whom right now, and since when. Dues are tracked first-in-first-out, so a
// payment clears the OLDEST dues first: "overdue" means some of it is older than 30 days.
export function outstanding(entries, asOf = today()) {
  let side = null // the person who owes
  let queue = [] // [{date, amt}] unpaid chunks, oldest first
  for (const e of entries.filter(e => e.kind === 'expense' || e.kind === 'settle').sort(byDateAsc)) {
    const eff = balanceEffect(e)
    const debtor = eff > 0 ? 'b' : 'a'
    let amt = Math.abs(eff)
    if (amt < 0.005) continue
    if (!side || side === debtor) { side = debtor; queue.push({ date: e.date, amt }); continue }
    while (amt > 0.005 && queue.length) {
      const c = queue[0]; const take = Math.min(c.amt, amt)
      c.amt -= take; amt -= take
      if (c.amt < 0.005) queue.shift()
    }
    if (!queue.length) { side = null; if (amt > 0.005) { side = debtor; queue = [{ date: e.date, amt }] } }
  }
  const total = queue.reduce((s, c) => s + c.amt, 0)
  if (!side || total < TINY) return { debtor: null, amount: 0, since: null, days: 0, overdue: false, overdueAmount: 0 }
  const since = queue[0].date
  const overdueAmount = queue.filter(c => daysBetween(c.date, asOf) > 30).reduce((s, c) => s + c.amt, 0)
  return { debtor: side, amount: total, since, days: Math.max(0, daysBetween(since, asOf)), overdue: overdueAmount >= TINY, overdueAmount }
}

export function periodStats(list) {
  const s = { total: 0, count: 0, share: { a: 0, b: 0 }, paid: { a: 0, b: 0 }, gave: { a: 0, b: 0 }, got: { a: 0, b: 0 }, settleCount: { a: 0, b: 0 }, cats: {}, days: {}, biggest: null }
  for (const e of list) {
    if (e.kind === 'expense') {
      const sh = shareOf(e), p = paidOf(e), amt = Number(e.amount)
      s.total += amt; s.count++
      s.share.a += sh.a; s.share.b += sh.b; s.paid.a += p.a; s.paid.b += p.b
      const c = e.category || 'অন্যান্য'
      s.cats[c] = (s.cats[c] || 0) + amt
      const d = s.days[e.date] || (s.days[e.date] = { total: 0, a: 0, b: 0 })
      d.total += amt; d.a += p.a; d.b += p.b
      if (!s.biggest || amt > Number(s.biggest.amount)) s.biggest = e
    } else if (e.kind === 'settle') {
      s.gave[e.from] += Number(e.amount); s.got[other(e.from)] += Number(e.amount); s.settleCount[e.from]++
    }
  }
  s.contrib = {}; s.diff = {}; s.pctActual = {}; s.pctTarget = {}
  for (const p of ['a', 'b']) {
    s.contrib[p] = s.paid[p] + s.gave[p] - s.got[p]
    s.diff[p] = s.contrib[p] - s.share[p] // > 0: gave more than their share
    s.pctActual[p] = s.total ? s.contrib[p] / s.total * 100 : 0
    s.pctTarget[p] = s.total ? s.share[p] / s.total * 100 : 0
  }
  return s
}

// 'none' (no spending), 'ok' (paid their share), 'more', 'short'
export function verdict(s, p) {
  if (!s.total) return 'none'
  const tol = Math.max(20, s.total * 0.02)
  if (s.diff[p] > tol) return 'more'
  if (s.diff[p] < -tol) return 'short'
  return 'ok'
}

export function monthly(entries) {
  const groups = {}
  for (const e of entries) (groups[monthKey(e.date)] ||= []).push(e)
  return Object.keys(groups).sort().reverse().map(month => ({ month, stats: periodStats(groups[month]) }))
}

// ---------- situational Bangla text ----------
const hash = str => { let h = 0; for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h) }
const pickOne = (arr, seed) => arr[hash(seed) % arr.length]

export function personMessage({ p, names, s, persistent, seed = '' }) {
  const me = names[p], you = names[other(p)]
  const v = verdict(s, p)
  const gap = tk(Math.abs(s.diff[p])), tgt = pct(s.pctTarget[p]), act = pct(Math.max(0, s.pctActual[p]))
  const k = seed + p + v
  if (v === 'none') return { tone: 'neutral', text: 'এই সময়ে কোনো সংসার খরচ নেই।' }
  if (v === 'ok') return {
    tone: 'good', text: pickOne([
      `${me} একদম ঠিকঠাক নিজের ভাগ (${tgt}) দিয়েছেন। চমৎকার! 👏`,
      `হিসাব নিখুঁত! ${gen(me)} অবদান ${act}, লক্ষ্যও ছিল ${tgt}। ✅`,
      `${me} কথা রেখেছেন, ভাগ মতো পুরো টাকাই দিয়েছেন। 🤝`
    ], k)
  }
  if (v === 'more') return {
    tone: 'great', text: pickOne([
      `সাবাস ${me}! নিজের ভাগের চেয়ে ${gap} বেশি দিয়েছেন। সংসারের আসল হিরো 🏆`,
      `${me} দিয়েছেন ${act}, অথচ ভাগ ছিল ${tgt}। এমন বড় মন সবার থাকে না! 💪`,
      `${gen(me)} কাঁধে ভর করেই সংসার চলছে, ${gap} বাড়তি দিয়েছেন। 🌟`
    ], k)
  }
  if (persistent) return {
    tone: 'bad', text: pickOne([
      `${me}, প্রায় প্রতি মাসেই নিজের ${tgt} ভাগ পুরো হচ্ছে না। সংসারের গাড়ি কি একা ${you} টানবেন? 😐`,
      `আবারও কম! ${me} দিয়েছেন মাত্র ${act}, ভাগ ছিল ${tgt}। এভাবে চললে ${obj(you)} আলাদা বাজেট মিটিং ডাকতে হবে। 📉`,
      `${gen(me)} খাতায় বাকির পাহাড় জমছে, ${gap} কম। অভ্যাসটা বদলানোর সময় হয়েছে। ⏳`
    ], k)
  }
  return {
    tone: 'warn', text: pickOne([
      `${me} এখনো ${gap} কম দিয়েছেন। লক্ষ্য ${tgt}, দেওয়া হয়েছে ${act}।`,
      `${gen(me)} ভাগ থেকে ${gap} বাকি। দেওয়া হয়েছে ${act}, ভাগ ${tgt}।`
    ], k)
  }
}

const payerText = (e, names) => {
  const p = paidOf(e)
  if (p.a > 0 && p.b > 0) return `${names.a} ${tk(p.a)} ও ${names.b} ${tk(p.b)}`
  return p.b > 0 ? names.b : names.a
}

export function buildSummary({ s, range, names, out, prev, persistent, catFilter }) {
  const A = names.a, B = names.b
  const parts = []
  const hasAny = s.total > 0 || s.gave.a > 0 || s.gave.b > 0
  if (!hasAny) {
    parts.push(`${range.label}${catFilter ? ` “${catFilter}” খাতে` : ''} কোনো সংসার খরচ বা শোধের এন্ট্রি নেই।`)
  } else {
    const dayList = Object.entries(s.days)
    if (s.total > 0) {
      parts.push(`${range.label}${catFilter ? ` “${catFilter}” খাতে` : ''} সংসারে মোট ${tk(s.total)} খরচ হয়েছে, ${bnInt(s.count)}টি এন্ট্রিতে, ${bnInt(dayList.length)} দিনে।`)
      if (dayList.length > 1) parts.push(`যেদিন খরচ হয়েছে, সেদিনগুলোতে গড়ে ${tk(s.total / dayList.length)} করে লেগেছে।`)
      parts.push(`ভাগ অনুযায়ী ${gen(A)} অংশ ${tk(s.share.a)} আর ${gen(B)} অংশ ${tk(s.share.b)}।`)
      const pa = s.paid.a, pb = s.paid.b
      if (pa > 0 && pb > 0) parts.push(`খরচের সময় ${A} নিজে দিয়েছেন ${tk(pa)} এবং ${B} দিয়েছেন ${tk(pb)}।`)
      else if (pa > 0) parts.push(`খরচের পুরো ${tk(pa)} ${A} নিজের পকেট থেকে দিয়েছেন, ${B} সরাসরি কোনো খরচ দেননি।`)
      else parts.push(`খরচের পুরো ${tk(pb)} ${B} নিজের পকেট থেকে দিয়েছেন, ${A} সরাসরি কোনো খরচ দেননি।`)
    }
    for (const p of ['b', 'a']) if (s.gave[p] > 0) parts.push(`এই সময়ে ${names[p]} ${obj(names[other(p)])} ${bnInt(s.settleCount[p])} বারে মোট ${tk(s.gave[p])} শোধ করেছেন।`)
    if (s.total > 0) {
      parts.push(`সব মিলিয়ে ${gen(A)} অবদান ${pct(Math.max(0, s.pctActual.a))} আর ${gen(B)} ${pct(Math.max(0, s.pctActual.b))}, যেখানে লক্ষ্য ছিল ${pct(s.pctTarget.a)} ও ${pct(s.pctTarget.b)}।`)
      const va = verdict(s, 'a')
      if (va === 'ok') parts.push('অর্থাৎ দুজনেই একদম ঠিকঠাক নিজের ভাগ দিয়েছেন।')
      else {
        const short = va === 'short' ? 'a' : 'b'
        parts.push(`অর্থাৎ এই সময়ের হিসাবে ${names[short]} নিজের ভাগের চেয়ে ${tk(Math.abs(s.diff[short]))} কম দিয়েছেন, আর ${names[other(short)]} ঠিক ততটাই বেশি দিয়েছেন।`)
      }
      const cats = Object.entries(s.cats).sort((x, y) => y[1] - x[1])
      if (!catFilter && cats.length > 1) parts.push(`সবচেয়ে বেশি খরচ হয়েছে “${cats[0][0]}” খাতে, ${tk(cats[0][1])} (মোটের ${pct(cats[0][1] / s.total * 100)})।`)
      if (s.biggest && s.count > 1) parts.push(`সবচেয়ে বড় একক খরচ ছিল “${s.biggest.title || s.biggest.category}”, ${tk(s.biggest.amount)} (${bnDate(s.biggest.date)}), যা দিয়েছেন ${payerText(s.biggest, names)}।`)
      if (dayList.length > 2) {
        const [d, v] = dayList.sort((x, y) => y[1].total - x[1].total)[0]
        parts.push(`সবচেয়ে বেশি খরচের দিন ছিল ${bnDate(d, { day: 'numeric', month: 'long' })}, ${tk(v.total)}।`)
      }
      if (prev && prev.stats.total > 0) {
        const ch = (s.total - prev.stats.total) / prev.stats.total * 100
        if (Math.abs(ch) < 3) parts.push(`${prev.label} তুলনায় খরচ প্রায় একই রকম আছে।`)
        else parts.push(`${prev.label} তুলনায় খরচ ${pct(Math.abs(ch))} ${ch > 0 ? 'বেশি' : 'কম'} হয়েছে।`)
      }
    }
  }
  if (out.debtor) parts.push(`আজ পর্যন্ত সব হিসাব মিলিয়ে ${names[out.debtor]} ${obj(names[other(out.debtor)])} ${tk(out.amount)} দেবেন${out.days ? `, যা ${bnInt(out.days)} দিন ধরে জমছে` : ''}।`)
  else parts.push('আজ পর্যন্ত সব হিসাব পরিষ্কার, কেউ কারো কাছে কিছু পাবেন না।')

  const points = []
  if (s.total > 0) for (const p of ['a', 'b']) points.push(personMessage({ p, names, s, persistent: persistent[p], seed: range.label }))
  if (out.overdue) points.push({ tone: 'bad', text: `⚠️ ${gen(names[out.debtor])} ${tk(out.overdueAmount)} বাকি এক মাসেরও বেশি পুরনো। শোধ করলে এই লাল সতর্কতা চলে যাবে।` })
  else if (out.debtor && out.amount >= TINY) points.push({ tone: 'neutral', text: `${names[out.debtor]} ${obj(names[other(out.debtor)])} ${tk(out.amount)} শোধ করলেই হিসাব সমান হয়ে যাবে।` })
  if (s.total > 0 && verdict(s, 'a') === 'ok' && !out.debtor) points.push({ tone: 'great', text: 'হিসাব সমান, বাকিও নেই। আপনারা দুজন পারফেক্ট টিম! ❤️' })
  return { paragraph: parts.join(' '), points }
}
