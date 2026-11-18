import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, X, Check, Trash2, Settings, HandCoins, AlertTriangle, Copy, Search, Scale, Receipt, ArrowRight, Cloud, CloudOff, RefreshCw } from 'lucide-react'
import { useSyncedList } from './useSyncedList.js'
import {
  SETTINGS_ID, DEFAULT_SETTINGS, SH_CATS, PRESETS, other, tk, pct, bnInt, bnDate, bnMonth, gen, obj, today, monthKey,
  rangeFor, previousRange, inRange, shareOf, paidOf, outstanding, periodStats, verdict, monthly, personMessage, buildSummary
} from './shared.js'

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`
const TABS = [['overview', 'ড্যাশবোর্ড'], ['summary', 'সারাংশ'], ['daily', 'প্রতিদিনের হিসাব']]

export default function Shared({ cfg, addSignal }) {
  const { items, setItems, setDeleted, status, scheduleSync, runSync } = useSyncedList({
    storeKey: 'my-money-shared-v1', deletedKey: 'my-money-shared-deleted', cfg, path: 'shared.json'
  })
  const saved = items.find(i => i.id === SETTINGS_ID)
  const settings = useMemo(() => ({
    ratio: Number(saved?.ratio) || DEFAULT_SETTINGS.ratio,
    names: { ...DEFAULT_SETTINGS.names, ...(saved?.names || {}) }
  }), [saved])
  const { names, ratio } = settings
  const entries = useMemo(() => items.filter(i => i.kind === 'expense' || i.kind === 'settle'), [items])

  // ---------- filters ----------
  const [tab, setTab] = useState('overview')
  const [preset, setPreset] = useState('month')
  const [custom, setCustom] = useState({ from: today().slice(0, 8) + '01', to: today() })
  const [cat, setCat] = useState('all')
  const [who, setWho] = useState('all')
  const [kind, setKind] = useState('all')
  const [q, setQ] = useState('')
  const range = useMemo(() => rangeFor(preset, custom), [preset, custom])
  const catOk = e => cat === 'all' || (e.kind === 'expense' && (e.category || 'অন্যান্য') === cat)
  const scope = useMemo(() => entries.filter(e => inRange(e.date, range) && catOk(e)), [entries, range, cat])
  const s = useMemo(() => periodStats(scope), [scope])
  const out = useMemo(() => outstanding(entries), [entries])
  const months = useMemo(() => monthly(entries.filter(catOk)), [entries, cat])
  const persistent = useMemo(() => {
    const recent = months.filter(m => m.stats.total > 0 && (!range.to || m.month <= monthKey(range.to))).slice(0, 3)
    const count = p => recent.filter(m => verdict(m.stats, p) === 'short').length
    return { a: count('a') >= 2 && verdict(s, 'a') === 'short', b: count('b') >= 2 && verdict(s, 'b') === 'short' }
  }, [months, range, s])
  const prev = useMemo(() => {
    const r = previousRange(preset)
    return r ? { label: r.label, stats: periodStats(entries.filter(e => inRange(e.date, r) && catOk(e))) } : null
  }, [preset, entries, cat])
  const summary = useMemo(() => buildSummary({ s, range, names, out, prev, persistent, catFilter: cat === 'all' ? '' : cat }), [s, range, names, out, prev, persistent, cat])
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return scope.filter(e => {
      if (kind !== 'all' && e.kind !== kind) return false
      if (who !== 'all' && !(e.kind === 'expense' ? paidOf(e)[who] > 0 : e.from === who)) return false
      if (needle && !`${e.title || ''} ${e.category || ''} ${e.note || ''}`.toLowerCase().includes(needle)) return false
      return true
    }).sort((x, y) => y.date.localeCompare(x.date) || (y.createdAt || 0) - (x.createdAt || 0))
  }, [scope, kind, who, q])
  const allCats = useMemo(() => [...new Set([...SH_CATS, ...entries.filter(e => e.category).map(e => e.category)])], [entries])
  const listFiltered = who !== 'all' || kind !== 'all' || q.trim()

  // ---------- add / edit ----------
  const [form, setForm] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState('')
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 1800); return () => clearTimeout(id) }, [toast])
  useEffect(() => { document.body.style.overflow = form || settingsOpen ? 'hidden' : ''; return () => { document.body.style.overflow = '' } }, [form, settingsOpen])

  const openNew = k => setForm(k === 'settle'
    ? { kind: 'settle', amount: out.debtor ? String(Math.round(out.amount)) : '', date: today(), from: out.debtor || 'b', note: '' }
    : { kind: 'expense', amount: '', date: today(), title: '', category: 'বাজার', payer: 'a', paidA: '', ratio: String(ratio), note: '' })
  const openEdit = e => {
    if (e.kind === 'settle') return setForm({ ...e, amount: String(e.amount) })
    const p = paidOf(e)
    setForm({ ...e, amount: String(e.amount), ratio: String(e.ratio ?? ratio), payer: p.b === 0 ? 'a' : p.a === 0 ? 'b' : 'both', paidA: String(p.a) })
  }
  const seen = useRef(addSignal)
  useEffect(() => { if (addSignal !== seen.current) { seen.current = addSignal; openNew('expense') } }, [addSignal])

  const save = ev => {
    ev.preventDefault()
    const amount = Number(form.amount)
    if (!(amount > 0)) return
    const now = Date.now()
    const base = { id: form.id || uid(), date: form.date, amount, note: form.note || '', createdAt: form.createdAt || now, updatedAt: now }
    let item
    if (form.kind === 'settle') item = { ...base, kind: 'settle', from: form.from }
    else {
      const r = Math.min(99, Math.max(1, Number(form.ratio) || ratio))
      let paid = form.payer === 'a' ? { a: amount, b: 0 } : form.payer === 'b' ? { a: 0, b: amount } : null
      if (!paid) {
        const pa = Number(form.paidA)
        if (!(pa >= 0 && pa <= amount)) { alert(`${gen(names.a)} দেওয়া টাকা ০ থেকে ${tk(amount)} এর মধ্যে হতে হবে।`); return }
        paid = { a: pa, b: amount - pa }
      }
      item = { ...base, kind: 'expense', title: form.title.trim(), category: form.category, paid, ratio: r }
    }
    setItems(prev => form.id ? prev.map(i => i.id === form.id ? item : i) : [...prev, item])
    scheduleSync()
    setForm(null)
    setToast('সংরক্ষিত হয়েছে')
  }
  const remove = id => {
    if (!confirm('এন্ট্রিটি মুছে ফেলবেন?')) return
    setItems(prev => prev.filter(i => i.id !== id))
    setDeleted(prev => ({ ...prev, [id]: Date.now() }))
    scheduleSync()
    setForm(null)
  }
  const saveSettings = next => {
    const now = Date.now()
    setItems(prev => [...prev.filter(i => i.id !== SETTINGS_ID), { id: SETTINGS_ID, kind: 'settings', ...next, createdAt: saved?.createdAt || now, updatedAt: now }])
    scheduleSync()
    setSettingsOpen(false)
    setToast('সেটিংস সংরক্ষিত হয়েছে')
  }
  const copySummary = async () => {
    const text = `আমাদের নিজেদের খরচ: ${range.label}\n\n${summary.paragraph}\n\n${summary.points.map(p => '• ' + p.text).join('\n')}`
    try { await navigator.clipboard.writeText(text); setToast('সারাংশ কপি হয়েছে') } catch { setToast('কপি করা যায়নি') }
  }

  const filterNote = [cat !== 'all' && `খাত: ${cat}`, who !== 'all' && `${names[who]} যা দিয়েছেন`, kind !== 'all' && (kind === 'expense' ? 'শুধু খরচ' : 'শুধু শোধ'), q.trim() && `খোঁজ: “${q.trim()}”`].filter(Boolean)

  return <section className="content sh">
    <div className="welcome-row sh-top">
      <div>
        <h2>আমাদের নিজেদের খরচ</h2>
        <p>সংসারের খরচ ভাগ: {names.a} {pct(ratio)} · {names.b} {pct(100 - ratio)} <SyncPill status={status} onClick={runSync} /></p>
      </div>
      <div className="sh-actions">
        <button className="icon-btn sh-gear" onClick={() => setSettingsOpen(true)} aria-label="সেটিংস" title="সেটিংস"><Settings size={19} /></button>
        <button className="outline-btn" onClick={() => openNew('settle')}><HandCoins size={17} /> টাকা শোধ</button>
        <button className="primary-btn" onClick={() => openNew('expense')}><Plus size={17} /> খরচ যোগ</button>
      </div>
    </div>

    {!saved && <div className="empty-hint sh-setup">
      <div><b>প্রথমে দুজনের নাম বসান</b><span>নাম শুধু আপনার প্রাইভেট ডেটায় সেভ হবে, কোডে বা পাবলিক কোথাও থাকবে না।</span></div>
      <button className="primary-btn" onClick={() => setSettingsOpen(true)}><Settings size={16} /> নাম বসান</button>
    </div>}

    <Hero out={out} names={names} onSettle={() => openNew('settle')} />

    <div className="panel sh-filters">
      <div className="sh-presets">{PRESETS.map(([id, label]) => <button key={id} type="button" className={`chip ${preset === id ? 'on' : ''}`} onClick={() => setPreset(id)}>{label}</button>)}</div>
      {preset === 'custom' && <div className="sh-custom">
        <label>শুরু<input type="date" value={custom.from} onChange={e => setCustom({ ...custom, from: e.target.value })} /></label>
        <label>শেষ<input type="date" value={custom.to} onChange={e => setCustom({ ...custom, to: e.target.value })} /></label>
      </div>}
      <div className="sh-filter-grid">
        <select value={cat} onChange={e => setCat(e.target.value)} aria-label="খাত"><option value="all">সব খাত</option>{allCats.map(c => <option key={c} value={c}>{c}</option>)}</select>
        <select value={who} onChange={e => setWho(e.target.value)} aria-label="কে দিয়েছে"><option value="all">দুজনেই</option><option value="a">{names.a} যা দিয়েছেন</option><option value="b">{names.b} যা দিয়েছেন</option></select>
        <select value={kind} onChange={e => setKind(e.target.value)} aria-label="ধরন"><option value="all">খরচ ও শোধ</option><option value="expense">শুধু খরচ</option><option value="settle">শুধু শোধ</option></select>
        <div className="search-box"><Search size={17} /><input placeholder="খুঁজুন: বাজার, বিল…" value={q} onChange={e => setQ(e.target.value)} /></div>
      </div>
    </div>

    <div className="sh-tabs" role="tablist">{TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>

    {tab === 'overview' && <>
      <div className="stats-grid">
        <MiniStat label="মোট সংসার খরচ" value={tk(s.total)} sub={`${bnInt(s.count)}টি এন্ট্রি`} />
        <MiniStat label={`${gen(names.a)} ভাগ (${pct(s.total ? s.pctTarget.a : ratio)})`} value={tk(s.share.a)} sub={`দিয়েছেন ${tk(s.contrib.a)}`} />
        <MiniStat label={`${gen(names.b)} ভাগ (${pct(s.total ? s.pctTarget.b : 100 - ratio)})`} value={tk(s.share.b)} sub={`দিয়েছেন ${tk(s.contrib.b)}`} />
        <MiniStat label="শোধ হয়েছে" value={tk(s.gave.a + s.gave.b)} sub={`${bnInt(s.settleCount.a + s.settleCount.b)} বার`} />
      </div>
      <div className="sh-people">{['a', 'b'].map(p => <PersonCard key={p} p={p} s={s} names={names} out={out} persistent={persistent[p]} seed={range.label} ratio={ratio} />)}</div>
      <div className="two-col sh-two">
        <CategoryPanel s={s} />
        <MonthlyPanel months={months.slice(0, 12)} names={names} />
      </div>
    </>}

    {tab === 'summary' && <div className="panel sh-summary">
      <div className="panel-heading"><div><h3>হিসাব-নিকাশ সারাংশ</h3><p>{range.label}{cat !== 'all' ? ` · খাত: ${cat}` : ''}</p></div>
        <button className="outline-btn sh-sm" onClick={copySummary}><Copy size={15} /> কপি</button></div>
      <p className="sh-para">{summary.paragraph}</p>
      {summary.points.length > 0 && <div className="sh-points">{summary.points.map((pt, i) => <div key={i} className={`sh-point t-${pt.tone}`}>{pt.text}</div>)}</div>}
      {listFiltered && <p className="help small sh-filter-note">তালিকার ফিল্টার ({filterNote.join(', ')}) অনুযায়ী {bnInt(list.length)}টি এন্ট্রি, মোট {tk(list.reduce((t, e) => t + Number(e.amount), 0))}। সারাংশের হিসাব তারিখ ও খাত অনুযায়ী করা হয়েছে।</p>}
    </div>}

    {tab === 'daily' && <DailyList list={list} names={names} onEdit={openEdit} filterNote={filterNote} />}

    {form && <EntrySheet form={form} setForm={setForm} names={names} out={out} allCats={allCats} onSave={save} onDelete={remove} onClose={() => setForm(null)} />}
    {settingsOpen && <SettingsSheet settings={settings} syncOn={!!cfg.token} onSave={saveSettings} onClose={() => setSettingsOpen(false)} />}
    {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
  </section>
}

function SyncPill({ status, onClick }) {
  const map = { off: [CloudOff, 'শুধু এই ডিভাইসে'], syncing: [RefreshCw, 'সিঙ্ক হচ্ছে…'], ok: [Cloud, 'সিঙ্ক হয়েছে'], offline: [CloudOff, 'অফলাইন'] }
  const [Icon, label] = map[status] || [AlertTriangle, 'সিঙ্ক সমস্যা']
  return <button type="button" className={`sh-sync s-${status}`} onClick={onClick} title={label}><Icon size={12} className={status === 'syncing' ? 'spin' : ''} />{label}</button>
}

function Hero({ out, names, onSettle }) {
  const d = out.debtor
  return <div className={`balance-card sh-hero ${out.overdue ? 'overdue' : ''}`}>
    <div className="balance-top"><span>আজ পর্যন্ত মোট বাকি</span><Scale size={18} /></div>
    {d ? <>
      <div className="sh-hero-who">{names[d]} <ArrowRight size={16} /> {names[other(d)]}</div>
      <div className="balance-value">{tk(out.amount)}</div>
      <div className="balance-foot">
        <span>{names[d]} {obj(names[other(d)])} দেবেন · {out.days ? `${bnInt(out.days)} দিন ধরে বাকি` : 'আজকের হিসাব'}</span>
        <button type="button" className="sh-hero-btn" onClick={onSettle}>শোধ লিখুন</button>
      </div>
    </> : <>
      <div className="balance-value sh-clear"><Check size={30} strokeWidth={3} /> সব পরিষ্কার</div>
      <div className="balance-foot"><span>কেউ কারো কাছে কিছু পাবেন না</span></div>
    </>}
    {out.overdue && <div className="sh-overdue"><AlertTriangle size={16} /><span>এক মাসের বেশি সময় ধরে {tk(out.overdueAmount)} বাকি পড়ে আছে! শোধ করলে এই লাল দাগ চলে যাবে।</span></div>}
  </div>
}

function MiniStat({ label, value, sub }) {
  return <div className="stat-card"><span className="stat-label">{label}</span><strong>{value}</strong>{sub && <small className="sh-sub">{sub}</small>}</div>
}

function PersonCard({ p, s, names, out, persistent, seed, ratio }) {
  const v = verdict(s, p)
  const msg = personMessage({ p, names, s, persistent, seed })
  const target = s.total ? s.pctTarget[p] : (p === 'a' ? ratio : 100 - ratio)
  const actual = Math.max(0, Math.min(100, s.pctActual[p]))
  const overdue = out.overdue && out.debtor === p
  const diff = s.diff[p]
  return <div className={`panel sh-person v-${v} ${overdue ? 'overdue' : ''} ${persistent ? 'persistent' : ''}`}>
    <div className="sh-person-head">
      <div className="sh-avatar">{names[p].slice(0, 1)}</div>
      <div className="sh-person-name"><b>{names[p]}</b><small>ভাগ {pct(target)}</small></div>
      {overdue && <span className="sh-badge red"><AlertTriangle size={12} /> ১ মাস+ বাকি</span>}
      {!overdue && v === 'more' && <span className="sh-badge green">বেশি দিয়েছেন</span>}
      {!overdue && v === 'ok' && <span className="sh-badge green">ঠিকঠাক</span>}
      {!overdue && v === 'short' && <span className="sh-badge amber">কম দিয়েছেন</span>}
    </div>
    <div className="sh-pct"><strong>{pct(actual)}</strong><span>অবদান</span></div>
    <div className="sh-bar" aria-label={`অবদান ${pct(actual)}, লক্ষ্য ${pct(target)}`}>
      <i style={{ width: `${actual}%` }} /><em style={{ left: `${target}%` }} title={`লক্ষ্য ${pct(target)}`} />
    </div>
    <div className="sh-rows">
      <div><span>ভাগ</span><b>{tk(s.share[p])}</b></div>
      <div><span>খরচে দিয়েছেন</span><b>{tk(s.paid[p])}</b></div>
      {s.gave[p] > 0 && <div><span>শোধ দিয়েছেন</span><b>+{tk(s.gave[p])}</b></div>}
      {s.got[p] > 0 && <div><span>শোধ পেয়েছেন</span><b>−{tk(s.got[p])}</b></div>}
      <div className="sh-result"><span>ফলাফল</span><b>{Math.abs(diff) < 1 ? 'সমান' : diff > 0 ? `${tk(diff)} বেশি` : `${tk(-diff)} কম`}</b></div>
    </div>
    <div className={`sh-point t-${msg.tone}`}>{msg.text}</div>
  </div>
}

function CategoryPanel({ s }) {
  const cats = Object.entries(s.cats).sort((x, y) => y[1] - x[1])
  return <div className="panel">
    <div className="panel-heading"><div><h3>খাত অনুযায়ী খরচ</h3><p>কোন খাতে কত গেল</p></div></div>
    {!cats.length ? <Empty text="এই সময়ে কোনো খরচ নেই" /> : <div className="sh-cats">{cats.map(([c, v]) => <div key={c} className="sh-cat">
      <div className="sh-cat-top"><span>{c}</span><b>{tk(v)} <small>{pct(v / s.total * 100)}</small></b></div>
      <div className="sh-cat-bar"><i style={{ width: `${v / cats[0][1] * 100}%` }} /></div>
    </div>)}</div>}
  </div>
}

function MonthlyPanel({ months, names }) {
  return <div className="panel">
    <div className="panel-heading"><div><h3>মাসভিত্তিক অবদান</h3><p>প্রতি মাসে কে কত শতাংশ দিয়েছেন</p></div></div>
    {!months.length ? <Empty text="এখনো কোনো মাসের হিসাব নেই" /> : <div className="sh-months">
      <div className="sh-month head"><span>মাস</span><span>মোট</span><span>{names.a}</span><span>{names.b}</span></div>
      {months.map(({ month, stats }) => {
        const va = verdict(stats, 'a'), vb = verdict(stats, 'b')
        return <div className="sh-month" key={month}>
          <span>{bnMonth(month)}</span><span>{tk(stats.total)}</span>
          <span className={`v-${va}`}>{stats.total ? pct(Math.max(0, stats.pctActual.a)) : '—'}</span>
          <span className={`v-${vb}`}>{stats.total ? pct(Math.max(0, stats.pctActual.b)) : '—'}</span>
        </div>
      })}
      <p className="help small">সবুজ = ভাগ মতো বা বেশি দিয়েছেন, লাল = কম দিয়েছেন।</p>
    </div>}
  </div>
}

function DailyList({ list, names, onEdit, filterNote }) {
  const days = []
  for (const e of list) {
    let d = days[days.length - 1]
    if (!d || d.date !== e.date) days.push(d = { date: e.date, items: [], total: 0, a: 0, b: 0 })
    d.items.push(e)
    if (e.kind === 'expense') { const p = paidOf(e); d.total += Number(e.amount); d.a += p.a; d.b += p.b }
  }
  return <div className="panel">
    <div className="panel-heading"><div><h3>প্রতিদিনের হিসাব</h3><p>{bnInt(list.length)}টি এন্ট্রি{filterNote.length ? ` · ${filterNote.join(', ')}` : ''}</p></div></div>
    {!days.length ? <Empty text="এখনো কোনো এন্ট্রি নেই। উপরের “খরচ যোগ” চাপুন।" /> : days.map(d => <div className="sh-day" key={d.date}>
      <div className="sh-day-head">
        <b>{bnDate(d.date, { weekday: 'short', day: 'numeric', month: 'long' })}</b>
        {d.total > 0 && <span>খরচ {tk(d.total)} · {names.a} {tk(d.a)} · {names.b} {tk(d.b)}</span>}
      </div>
      {d.items.map(e => <Row key={e.id} e={e} names={names} onEdit={onEdit} />)}
    </div>)}
  </div>
}

function Row({ e, names, onEdit }) {
  if (e.kind === 'settle') return <div className="transaction" role="button" onClick={() => onEdit(e)}>
    <div className="transaction-icon positive"><HandCoins size={18} /></div>
    <div className="transaction-info"><b>{names[e.from]} → {names[other(e.from)]} শোধ</b><span>{e.note || 'বাকি টাকা ফেরত'}</span></div>
    <div className="transaction-meta"><strong>{tk(e.amount)}</strong><small>শোধ</small></div>
  </div>
  const p = paidOf(e), sh = shareOf(e)
  const payer = p.a > 0 && p.b > 0 ? `${names.a} ${tk(p.a)} + ${names.b} ${tk(p.b)}` : `দিয়েছেন ${p.b > 0 ? names.b : names.a}`
  return <div className="transaction" role="button" onClick={() => onEdit(e)}>
    <div className="transaction-icon negative"><Receipt size={18} /></div>
    <div className="transaction-info"><b>{e.title || e.category}</b><span>{e.category} · {payer}</span></div>
    <div className="transaction-meta"><strong className="amount-negative">{tk(e.amount)}</strong><small>{names.a} {tk(sh.a)} · {names.b} {tk(sh.b)}</small></div>
  </div>
}

function Empty({ text }) {
  return <div className="empty-state"><div className="empty-icon"><Receipt size={20} /></div><span>{text}</span></div>
}

function EntrySheet({ form, setForm, names, out, allCats, onSave, onDelete, onClose }) {
  const set = patch => setForm(f => ({ ...f, ...patch }))
  const amount = Number(form.amount) || 0
  const isExp = form.kind === 'expense'
  let preview = null
  if (isExp && amount > 0) {
    const r = Math.min(99, Math.max(1, Number(form.ratio) || 60))
    const shA = amount * r / 100, shB = amount - shA
    const pa = form.payer === 'a' ? amount : form.payer === 'b' ? 0 : Math.min(amount, Math.max(0, Number(form.paidA) || 0))
    const eff = pa - shA
    preview = <div className="sh-preview">
      <div><span>{gen(names.a)} ভাগ</span><b>{tk(shA)}</b></div>
      <div><span>{gen(names.b)} ভাগ</span><b>{tk(shB)}</b></div>
      <p>{Math.abs(eff) < 0.5 ? 'এই খরচে কেউ কারো কাছে কিছু পাবেন না।' : eff > 0 ? `এই খরচে ${names.b} ${obj(names.a)} ${tk(eff)} দেবেন।` : `এই খরচে ${names.a} ${obj(names.b)} ${tk(-eff)} দেবেন।`}</p>
    </div>
  }
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <form className="entry-modal sh-sheet" onSubmit={onSave}>
      <div className="grabber" />
      <div className="modal-head">
        <div><span className="eyebrow">{form.id ? 'এন্ট্রি এডিট' : 'নতুন এন্ট্রি'}</span><h2>{isExp ? 'সংসারের খরচ' : 'টাকা শোধ'}</h2></div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="বন্ধ"><X size={20} /></button>
      </div>
      {!form.id && <div className="chips">
        <button type="button" className={`chip ${isExp ? 'on' : ''}`} onClick={() => setForm({ kind: 'expense', amount: '', date: form.date, title: '', category: 'বাজার', payer: 'a', paidA: '', ratio: form.ratio || '60', note: '' })}>সংসারের খরচ</button>
        <button type="button" className={`chip ${!isExp ? 'on' : ''}`} onClick={() => setForm({ kind: 'settle', amount: out.debtor ? String(Math.round(out.amount)) : '', date: form.date, from: out.debtor || 'b', note: '', ratio: form.ratio })}>টাকা শোধ</button>
      </div>}
      <label>পরিমাণ
        <div className="amount-field"><span>৳</span><input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0" value={form.amount} onChange={e => set({ amount: e.target.value })} required autoFocus /></div>
      </label>
      {isExp ? <>
        <div className="form-two">
          <label>তারিখ<input type="date" value={form.date} onChange={e => set({ date: e.target.value })} required /></label>
          <label>খাত<select value={form.category} onChange={e => set({ category: e.target.value })}>{allCats.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
        </div>
        <label>কী কেনা হলো<input placeholder="যেমন: মাসের বাজার, বিদ্যুৎ বিল" value={form.title} onChange={e => set({ title: e.target.value })} /></label>
        <div className="sh-field"><span className="sh-field-label">টাকা কে দিয়েছে?</span>
          <div className="sh-seg">
            <button type="button" className={form.payer === 'a' ? 'on' : ''} onClick={() => set({ payer: 'a' })}>{names.a} পুরোটা</button>
            <button type="button" className={form.payer === 'b' ? 'on' : ''} onClick={() => set({ payer: 'b' })}>{names.b} পুরোটা</button>
            <button type="button" className={form.payer === 'both' ? 'on' : ''} onClick={() => set({ payer: 'both', paidA: form.paidA || (amount ? String(Math.round(amount / 2)) : '') })}>দুজনে মিলে</button>
          </div>
        </div>
        {form.payer === 'both' && <div className="form-two">
          <label>{names.a} দিয়েছেন<input type="number" inputMode="decimal" min="0" step="0.01" value={form.paidA} onChange={e => set({ paidA: e.target.value })} required /></label>
          <label>{names.b} দিয়েছেন<input value={amount ? tk(Math.max(0, amount - (Number(form.paidA) || 0))) : '—'} readOnly tabIndex={-1} /></label>
        </div>}
        {preview}
        <details className="sh-more">
          <summary>ভাগের হার বদলান (শুধু এই খরচে)</summary>
          <label>{gen(names.a)} ভাগ (%)<input type="number" min="1" max="99" value={form.ratio} onChange={e => set({ ratio: e.target.value })} /></label>
          <small>{gen(names.b)} ভাগ হবে {pct(100 - (Number(form.ratio) || 60))}।</small>
        </details>
      </> : <>
        <div className="sh-field"><span className="sh-field-label">কে কাকে দিল?</span>
          <div className="sh-seg two">
            <button type="button" className={form.from === 'b' ? 'on' : ''} onClick={() => set({ from: 'b' })}>{names.b} → {names.a}</button>
            <button type="button" className={form.from === 'a' ? 'on' : ''} onClick={() => set({ from: 'a' })}>{names.a} → {names.b}</button>
          </div>
        </div>
        <label>তারিখ<input type="date" value={form.date} onChange={e => set({ date: e.target.value })} required /></label>
        <p className="help small">{out.debtor ? `এখন ${names[out.debtor]} ${obj(names[other(out.debtor)])} ${tk(out.amount)} দেবেন।` : 'এখন কোনো বাকি নেই।'}</p>
      </>}
      <label>নোট (ঐচ্ছিক)<textarea rows="2" placeholder="নোট লিখুন" value={form.note} onChange={e => set({ note: e.target.value })} /></label>
      <div className="modal-actions">
        {form.id && <button type="button" className="outline-btn" onClick={() => onDelete(form.id)} aria-label="মুছুন"><Trash2 size={17} /></button>}
        <button className="primary-btn" type="submit"><Check size={17} />{form.id ? 'পরিবর্তন সংরক্ষণ' : 'সংরক্ষণ'}</button>
      </div>
    </form>
  </div>
}

function SettingsSheet({ settings, syncOn, onSave, onClose }) {
  const [f, setF] = useState({ a: settings.names.a, b: settings.names.b, ratio: String(settings.ratio) })
  const submit = e => {
    e.preventDefault()
    const r = Math.round(Number(f.ratio))
    if (!(r >= 1 && r <= 99) || !f.a.trim() || !f.b.trim()) return
    onSave({ names: { a: f.a.trim(), b: f.b.trim() }, ratio: r })
  }
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <form className="entry-modal" onSubmit={submit}>
      <div className="grabber" />
      <div className="modal-head">
        <div><span className="eyebrow">সেটিংস</span><h2>ভাগের নিয়ম</h2></div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="বন্ধ"><X size={20} /></button>
      </div>
      <div className="form-two">
        <label>প্রথম জন (বেশি ভাগ)<input value={f.a} onChange={e => setF({ ...f, a: e.target.value })} required /></label>
        <label>দ্বিতীয় জন<input value={f.b} onChange={e => setF({ ...f, b: e.target.value })} required /></label>
      </div>
      <label>{gen(f.a || 'প্রথম জন')} ভাগ (%)<input type="number" min="1" max="99" value={f.ratio} onChange={e => setF({ ...f, ratio: e.target.value })} required /></label>
      <p className="help small">{gen(f.b || 'দ্বিতীয় জন')} ভাগ হবে {pct(100 - (Number(f.ratio) || 0))}। নতুন হার শুধু নতুন খরচে লাগবে, আগের খরচের হিসাব বদলাবে না।</p>
      <p className="help small">{syncOn ? 'এই অংশের হিসাব আপনার প্রাইভেট GitHub রিপোর shared.json ফাইলে আলাদা করে সিঙ্ক হয়। ব্যক্তিগত হিসাবের সাথে মেশে না।' : 'সিঙ্ক বন্ধ, তাই এই হিসাব শুধু এই ডিভাইসে আছে। উপরের ক্লাউড বাটন থেকে সিঙ্ক চালু করুন।'}</p>
      <div className="modal-actions"><button className="primary-btn" type="submit"><Check size={17} />সংরক্ষণ</button></div>
    </form>
  </div>
}
