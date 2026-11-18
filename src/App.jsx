import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LayoutDashboard, ArrowLeftRight, HandCoins, FileText, Plus, X,
  TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownLeft,
  Search, Download, Trash2, Pencil, CalendarDays, CircleDollarSign, Check, ChevronRight, History,
  Cloud, CloudOff, RefreshCw, AlertTriangle, Users
} from 'lucide-react'
import { checkRepo, syncOnce, merge, canon } from './sync.js'
import Shared from './Shared.jsx'
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts'

const STORE_KEY = 'my-money-tracker-v1'
const LANG_KEY = 'my-money-lang'
const DELETED_KEY = 'my-money-deleted'
const SYNC_KEY = 'my-money-sync'
const SYNC_DEFAULTS = { owner: 'sbhSajid', repo: 'my-money-data', path: 'data.json', token: '' }
const readJSON = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback } }
const pdfMoney = n => 'BDT ' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(n || 0))
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const monthKey = d => (d || '').slice(0, 7)
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`

const TYPES = [
  { id: 'expense', en: 'Expense', bn: 'খরচ' },
  { id: 'income', en: 'Income', bn: 'আয়' },
  { id: 'lent', en: 'Money lent', bn: 'ধার দিয়েছি' },
  { id: 'lent_return', en: 'Lent returned', bn: 'ধার ফেরত পেয়েছি' },
  { id: 'borrowed', en: 'Money borrowed', bn: 'ধার নিয়েছি' },
  { id: 'borrowed_return', en: 'Borrowed repaid', bn: 'ধার শোধ করেছি' },
  { id: 'opening', en: 'Opening balance', bn: 'শুরুর ব্যালেন্স' }
]
const CATS = {
  income: [['Salary', 'বেতন'], ['Business', 'ব্যবসা'], ['Freelance', 'ফ্রিল্যান্স'], ['Gift', 'উপহার'], ['Other', 'অন্যান্য']],
  expense: [['Food', 'খাবার'], ['Transport', 'যাতায়াত'], ['Shopping', 'কেনাকাটা'], ['Bills', 'বিল'], ['Health', 'স্বাস্থ্য'], ['Education', 'শিক্ষা'], ['Entertainment', 'বিনোদন'], ['Family', 'পরিবার'], ['Other', 'অন্যান্য']]
}
const CAT_BN = Object.fromEntries([...CATS.income, ...CATS.expense])
const DEBT = ['lent', 'lent_return', 'borrowed', 'borrowed_return']
const POSITIVE = ['opening', 'income', 'lent_return', 'borrowed']
// "Old" loans: given/taken before the user started tracking. They count toward
// "people owe me" / "I owe others" but never change the current cash balance.
const OLD_OK = ['lent', 'borrowed']
const isOld = t => !!t.previous && OLD_OK.includes(t.type)
const typeOf = id => TYPES.find(t => t.id === id) || { en: id, bn: id }
const cashEffect = t => {
  if (isOld(t)) return 0
  const amount = Number(t.amount || 0)
  if (POSITIVE.includes(t.type)) return amount
  if (['expense', 'lent', 'borrowed_return'].includes(t.type)) return -amount
  return 0
}
const sum = (list, type) => list.filter(t => t.type === type).reduce((s, t) => s + Number(t.amount), 0)

const NAV = [
  { id: 'home', en: 'Home', bn: 'হোম', icon: LayoutDashboard },
  { id: 'transactions', en: 'Activity', bn: 'লেনদেন', icon: ArrowLeftRight },
  { id: 'debts', en: 'Lending', bn: 'ধার-দেনা', icon: HandCoins },
  // Shared household section is Bangla-only by design
  { id: 'shared', en: 'আমাদের খরচ', bn: 'আমাদের খরচ', short: 'সংসার', icon: Users },
  { id: 'reports', en: 'Reports', bn: 'রিপোর্ট', icon: FileText }
]

// Language helpers: L(en, bn) picks the text, money/date use Bangla digits in bn mode
const makeLang = lang => {
  const loc = lang === 'bn' ? 'bn-BD' : 'en-GB'
  return {
    lang,
    L: (en, bn) => lang === 'bn' ? bn : en,
    pick: o => o[lang],
    money: n => '৳' + new Intl.NumberFormat(lang === 'bn' ? 'bn-BD' : 'en-IN', { maximumFractionDigits: 0 }).format(Number(n || 0)),
    num: n => new Intl.NumberFormat(loc).format(n),
    date: (d, opts) => new Date(d ? d + 'T00:00:00' : Date.now()).toLocaleDateString(loc, opts),
    cat: c => lang === 'bn' ? (CAT_BN[c] || c) : c
  }
}

function App() {
  const [transactions, setTransactions] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]') } catch { return [] }
  })
  const [lang, setLang] = useState(() => {
    const q = new URLSearchParams(location.search).get('lang')
    if (q === 'en' || q === 'bn') return q
    try { return localStorage.getItem(LANG_KEY) === 'bn' ? 'bn' : 'en' } catch { return 'en' }
  })
  const [page, setPage] = useState('home')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ type: 'expense', amount: '', date: today(), title: '', category: 'Food', person: '', note: '', previous: false })
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [sharedAdd, setSharedAdd] = useState(0) // bumps to open the shared-expense form
  const [toast, setToast] = useState('')
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 1800); return () => clearTimeout(id) }, [toast])

  // ---------- Cross-device sync (GitHub private repo) ----------
  const [deleted, setDeleted] = useState(() => readJSON(DELETED_KEY, {}))
  const [syncCfg, setSyncCfg] = useState(() => ({ ...SYNC_DEFAULTS, ...readJSON(SYNC_KEY, {}) }))
  const [syncStatus, setSyncStatus] = useState(() => readJSON(SYNC_KEY, {}).token ? 'syncing' : 'off')
  const [syncMsg, setSyncMsg] = useState('')
  const [lastSync, setLastSync] = useState(null)
  const [syncOpen, setSyncOpen] = useState(false)
  const dataRef = useRef({ transactions, deleted })
  const cfgRef = useRef(syncCfg)
  const syncRun = useRef({ running: false, again: false, timer: null })
  dataRef.current = { transactions, deleted }
  cfgRef.current = syncCfg

  useEffect(() => { try { localStorage.setItem(DELETED_KEY, JSON.stringify(deleted)) } catch {} }, [deleted])
  useEffect(() => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(syncCfg)) } catch {} }, [syncCfg])

  const runSync = useCallback(async () => {
    const cfg = cfgRef.current
    if (!cfg.token) return
    const run = syncRun.current
    if (run.running) { run.again = true; return }
    run.running = true
    setSyncStatus('syncing')
    try {
      const merged = await syncOnce(cfg, dataRef.current)
      // keep anything the user added while the request was in flight
      const combined = merge(merged, dataRef.current)
      if (canon(combined) !== canon(dataRef.current)) {
        setTransactions(combined.transactions)
        setDeleted(combined.deleted)
      }
      if (canon(combined) !== canon(merged)) run.again = true
      setSyncStatus('ok'); setSyncMsg(''); setLastSync(Date.now())
    } catch (e) {
      setSyncStatus(['auth', 'offline', 'notfound', 'public'].includes(e.kind) ? e.kind : 'error')
      setSyncMsg(e.message)
    } finally {
      run.running = false
      if (run.again) { run.again = false; setTimeout(runSync, 300) }
    }
  }, [])
  const scheduleSync = useCallback(() => {
    clearTimeout(syncRun.current.timer)
    syncRun.current.timer = setTimeout(runSync, 1200)
  }, [runSync])

  // sync on start, when the app comes back to the foreground, when back online, and every 30s while open
  useEffect(() => {
    if (!syncCfg.token) return
    runSync()
    const onVisible = () => { if (document.visibilityState === 'visible') runSync() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', runSync)
    const id = setInterval(() => { if (document.visibilityState === 'visible') runSync() }, 30000)
    return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', runSync); clearInterval(id) }
  }, [syncCfg.token, runSync])

  const T = useMemo(() => makeLang(lang), [lang])
  const { L, money } = T

  useEffect(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(transactions)) } catch {} }, [transactions])
  useEffect(() => {
    try { localStorage.setItem(LANG_KEY, lang) } catch {}
    document.documentElement.lang = lang
  }, [lang])
  useEffect(() => { window.scrollTo(0, 0) }, [page])
  useEffect(() => { document.body.style.overflow = modal || syncOpen ? 'hidden' : '' }, [modal, syncOpen])

  const nowMonth = monthKey(today())
  const sorted = useMemo(() => [...transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt), [transactions])
  const stats = useMemo(() => {
    const current = transactions.filter(t => monthKey(t.date) === nowMonth)
    return {
      totalBalance: transactions.reduce((s, t) => s + cashEffect(t), 0),
      income: sum(current, 'income'),
      expense: sum(current, 'expense'),
      todayExpense: sum(transactions.filter(t => t.date === today()), 'expense'),
      receivable: sum(transactions, 'lent') - sum(transactions, 'lent_return'),
      payable: sum(transactions, 'borrowed') - sum(transactions, 'borrowed_return')
    }
  }, [transactions, nowMonth])

  const chartData = useMemo(() => {
    const n = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
    return Array.from({ length: n }, (_, i) => {
      const date = `${nowMonth}-${String(i + 1).padStart(2, '0')}`
      const day = transactions.filter(t => t.date === date)
      return { day: i + 1, income: sum(day, 'income'), expense: sum(day, 'expense') }
    })
  }, [transactions, nowMonth])

  const openAdd = (type, previous = false) => {
    if (page === 'shared' && !previous) { setSharedAdd(n => n + 1); return }
    setEditing(null)
    setForm({ type: type || 'expense', amount: '', date: today(), title: '', category: type === 'income' ? 'Salary' : 'Food', person: '', note: '', previous })
    setModal(true)
  }
  const openEdit = item => { setEditing(item.id); setForm({ previous: false, ...item }); setModal(true) }
  const setType = type => setForm(f => ({ ...f, type, category: type === 'income' ? 'Salary' : type === 'expense' ? 'Food' : f.category, previous: OLD_OK.includes(type) ? f.previous : false }))
  const save = e => {
    e.preventDefault()
    const addAnother = e.nativeEvent?.submitter?.name === 'more'
    if (!form.amount || Number(form.amount) <= 0) return
    if (form.type === 'opening' && transactions.some(t => t.type === 'opening' && t.id !== editing)) {
      alert(L('Opening balance already exists. Edit the existing one instead.', 'শুরুর ব্যালেন্স আগেই যোগ করা আছে। সেটি এডিট করুন।'))
      return
    }
    const now = Date.now()
    const item = { ...form, previous: OLD_OK.includes(form.type) && !!form.previous, amount: Number(form.amount), id: editing || uid(), createdAt: editing ? (transactions.find(t => t.id === editing)?.createdAt || now) : now, updatedAt: now }
    setTransactions(prev => editing ? prev.map(t => t.id === editing ? item : t) : [...prev, item])
    scheduleSync()
    if (addAnother) {
      // keep type, date and the "old loan" switch so many entries can be added quickly
      setForm(f => ({ ...f, amount: '', title: '', person: '', note: '' }))
      setToast(L('Saved. Add the next one.', 'সংরক্ষিত হয়েছে। পরেরটা লিখুন।'))
    } else {
      setModal(false)
      setToast(L('Saved', 'সংরক্ষিত হয়েছে'))
    }
  }
  const remove = id => {
    if (!confirm(L('Delete this entry?', 'এন্ট্রিটি মুছে ফেলবেন?'))) return
    setTransactions(prev => prev.filter(t => t.id !== id))
    setDeleted(prev => ({ ...prev, [id]: Date.now() }))
    setModal(false)
    scheduleSync()
  }

  const connectSync = async form => {
    const cfg = { owner: form.owner.trim(), repo: form.repo.trim(), path: SYNC_DEFAULTS.path, token: form.token.trim() }
    if (!cfg.owner || !cfg.repo || !cfg.token) return L('Fill in all fields.', 'সব ঘর পূরণ করুন।')
    try { await checkRepo(cfg) } catch (e) { return syncErrorText(e.kind, L) }
    setSyncCfg(cfg)
    setToast(L('Connected. Syncing…', 'সংযুক্ত হয়েছে। সিঙ্ক হচ্ছে…'))
    return ''
  }
  const disconnectSync = () => {
    if (!confirm(L('Stop syncing on this device? Your data stays here and on GitHub.', 'এই ডিভাইসে সিঙ্ক বন্ধ করবেন? ডেটা এখানে এবং GitHub-এ থেকে যাবে।'))) return
    setSyncCfg(c => ({ ...c, token: '' }))
    setSyncStatus('off'); setSyncMsg('')
  }

  const filtered = sorted.filter(t => {
    const hay = `${t.title} ${t.person} ${t.category} ${CAT_BN[t.category] || ''} ${t.note}`.toLowerCase()
    return hay.includes(query.toLowerCase()) && (filter === 'all' || t.type === filter)
  })

  // PDF stays in English: jsPDF's built-in fonts cannot render Bangla script.
  // jsPDF is loaded on demand so it doesn't slow down the first page load on mobile.
  const exportPdf = async () => {
    let jsPDF
    try { ({ jsPDF } = await import('jspdf')) } catch {
      alert(L('Could not load the PDF tool. Check your internet connection and try again.', 'পিডিএফ টুল লোড হয়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।'))
      return
    }
    const doc = new jsPDF()
    doc.setFillColor(0, 0, 0); doc.rect(0, 0, 210, 34, 'F')
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text('MY MONEY', 14, 16)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(`Personal money report  |  Generated ${today()}`, 14, 25)
    doc.setTextColor(0, 0, 0); doc.setFontSize(11)
    ;[['Current balance', stats.totalBalance], ["This month's income", stats.income], ["This month's expenses", stats.expense], ['People owe me', stats.receivable], ['I owe others', stats.payable]]
      .forEach(([k, v], i) => { doc.text(k, 14, 48 + i * 9); doc.setFont('helvetica', 'bold'); doc.text(pdfMoney(v), 196, 48 + i * 9, { align: 'right' }); doc.setFont('helvetica', 'normal') })
    let y = 104
    doc.setFillColor(240, 240, 240); doc.rect(12, y - 6, 186, 9, 'F')
    doc.setFontSize(8); doc.setFont('helvetica', 'bold')
    doc.text('DATE', 14, y); doc.text('TYPE / DETAILS', 40, y); doc.text('PERSON / CATEGORY', 122, y); doc.text('AMOUNT', 196, y, { align: 'right' })
    doc.setFont('helvetica', 'normal'); y += 9
    sorted.forEach(t => {
      if (y > 285) { doc.addPage(); y = 18 }
      doc.setTextColor(60, 60, 60)
      doc.text(t.date || '', 14, y)
      doc.text(`${typeOf(t.type).en}${isOld(t) ? ' (old)' : ''}${t.title ? ' - ' + t.title : ''}`.slice(0, 44), 40, y)
      doc.text((t.person || t.category || '-').slice(0, 22), 122, y)
      doc.setTextColor(0, 0, 0)
      doc.text(isOld(t) ? pdfMoney(t.amount) : `${POSITIVE.includes(t.type) ? '+' : '-'} ${pdfMoney(t.amount)}`, 196, y, { align: 'right' })
      y += 7.5
    })
    doc.save(`my-money-report-${today()}.pdf`)
  }

  const current = NAV.find(n => n.id === page)
  const isDebt = DEBT.includes(form.type)
  const cats = CATS[form.type === 'income' ? 'income' : 'expense']
  const toggle = <LangToggle lang={lang} setLang={setLang} />

  return <div className={`app-shell lang-${lang}`}>
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><Wallet size={20} /></div><div><b>{L('My Money', 'আমার হিসাব')}</b><small>{L('Personal finance', 'ব্যক্তিগত হিসাব')}</small></div></div>
      <div className="side-label">{L('Menu', 'মেনু')}</div>
      {NAV.map(n => <button key={n.id} className={`nav-item ${page === n.id ? 'active' : ''}`} onClick={() => setPage(n.id)}><n.icon size={18} />{T.pick(n)}</button>)}
      <div className="sidebar-bottom"><span className="privacy-dot" />{syncCfg.token
        ? L('Synced with your private GitHub repo', 'আপনার প্রাইভেট GitHub রিপোতে সিঙ্ক হয়')
        : L('Data stays on this device', 'ডেটা শুধু এই ডিভাইসে থাকে')}</div>
    </aside>

    <main className="main">
      <header className="topbar">
        <div><div className="eyebrow">{L('My Money', 'আমার হিসাব')}</div><h1>{T.pick(current)}</h1></div>
        <div className="top-actions">
          <span className="today-label"><CalendarDays size={15} />{T.date(null, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <SyncButton status={syncStatus} onClick={() => setSyncOpen(true)} L={L} />
          {toggle}
          <button className="primary-btn" onClick={() => openAdd('expense')}><Plus size={17} /> {L('Add entry', 'নতুন এন্ট্রি')}</button>
        </div>
      </header>

      {page === 'home' && <section className="content">
        <div className="balance-card">
          <div className="balance-top"><span>{L('Available balance', 'বর্তমান ব্যালেন্স')}</span><Wallet size={18} /></div>
          <div className="balance-value">{money(stats.totalBalance)}</div>
          <div className="balance-foot"><span>{T.date(null, { day: 'numeric', month: 'long', year: 'numeric' })}</span><span className="balance-note"><span className="live-dot" />{L('Live', 'লাইভ')}</span></div>
        </div>
        <div className="stats-grid">
          <Stat icon={TrendingUp} label={L("This month's income", 'এই মাসের আয়')} value={money(stats.income)} />
          <Stat icon={TrendingDown} label={L("This month's expenses", 'এই মাসের খরচ')} value={money(stats.expense)} />
          <Stat icon={CalendarDays} label={L("Today's expense", 'আজকের খরচ')} value={money(stats.todayExpense)} />
          <Stat icon={CircleDollarSign} label={L('Saved this month', 'এই মাসের সঞ্চয়')} value={money(stats.income - stats.expense)} />
        </div>
        {transactions.length === 0 && <div className="empty-hint">
          <div><b>{L('Start with your current money', 'বর্তমান টাকা দিয়ে শুরু করুন')}</b><span>{L('Add your opening balance, then record income, expenses and lending.', 'প্রথমে শুরুর ব্যালেন্স দিন, তারপর আয়, খরচ ও ধার-দেনা যোগ করুন।')}</span></div>
          <button className="primary-btn" onClick={() => openAdd('opening')}><Plus size={16} /> {L('Opening balance', 'শুরুর ব্যালেন্স')}</button>
        </div>}
        <div className="two-col">
          <div className="panel">
            <div className="panel-heading"><div><h3>{L('Cash activity', 'মাসিক লেনদেন')}</h3><p>{L('Daily income & expenses', 'প্রতিদিনের আয় ও খরচ')}</p></div><span className="month-pill">{T.date(null, { month: 'short', year: 'numeric' })}</span></div>
            <div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ left: 0, right: 4, top: 6, bottom: 0 }}>
              <defs><linearGradient id="inc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#000" stopOpacity={.14} /><stop offset="100%" stopColor="#000" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="day" tickFormatter={T.num} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12} tick={{ fontSize: 11, fill: '#a3a3a3' }} />
              <YAxis hide />
              <Tooltip formatter={v => money(v)} labelFormatter={l => `${L('Day', 'তারিখ')} ${T.num(l)}`} contentStyle={{ borderRadius: 12, border: '1px solid #e5e5e5', fontSize: 12, boxShadow: '0 6px 20px #0000001a' }} />
              <Area type="monotone" dataKey="income" name={L('Income', 'আয়')} stroke="#000" strokeWidth={2.2} fill="url(#inc)" />
              <Area type="monotone" dataKey="expense" name={L('Expense', 'খরচ')} stroke="#a3a3a3" strokeWidth={2} strokeDasharray="5 4" fill="transparent" />
            </AreaChart></ResponsiveContainer></div>
            <div className="legend"><span><i className="lg-solid" />{L('Income', 'আয়')}</span><span><i className="lg-dash" />{L('Expense', 'খরচ')}</span></div>
          </div>
          <div className="panel">
            <div className="panel-heading"><div><h3>{L('Lending', 'ধার-দেনা')}</h3><p>{L('Who owes whom', 'কে কার কাছে পাবে')}</p></div></div>
            <DebtLines stats={stats} T={T} />
            <button className="outline-btn full" onClick={() => setPage('debts')}>{L('View all', 'সব দেখুন')} <ChevronRight size={16} /></button>
          </div>
        </div>
        <div className="panel recent-panel">
          <div className="panel-heading"><div><h3>{L('Recent activity', 'সাম্প্রতিক লেনদেন')}</h3><p>{L('Your latest entries', 'সর্বশেষ এন্ট্রিগুলো')}</p></div><button className="text-btn" onClick={() => setPage('transactions')}>{L('See all', 'সব দেখুন')}</button></div>
          <TransactionList items={sorted.slice(0, 6)} onEdit={openEdit} onDelete={remove} T={T} />
        </div>
      </section>}

      {page === 'transactions' && <section className="content">
        <div className="welcome-row"><div><h2>{L('All transactions', 'সব লেনদেন')}</h2><p>{L(`${filtered.length} entries`, `${T.num(filtered.length)}টি এন্ট্রি`)}</p></div><button className="primary-btn" onClick={() => openAdd('expense')}><Plus size={17} /> {L('Add entry', 'নতুন এন্ট্রি')}</button></div>
        <div className="panel">
          <div className="filter-row">
            <div className="search-box"><Search size={18} /><input placeholder={L('Search title, person or category', 'শিরোনাম, নাম বা ক্যাটাগরি খুঁজুন')} value={query} onChange={e => setQuery(e.target.value)} /></div>
            <select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">{L('All types', 'সব ধরন')}</option>{TYPES.map(t => <option value={t.id} key={t.id}>{T.pick(t)}</option>)}</select>
          </div>
          <TransactionList items={filtered} onEdit={openEdit} onDelete={remove} T={T} />
        </div>
      </section>}

      {page === 'debts' && <section className="content">
        <div className="welcome-row"><div><h2>{L('Lending & borrowing', 'ধার-দেনা')}</h2><p>{L('Who owes you, and whom you owe', 'কে আপনার কাছে পাবে, আপনি কার কাছে পাবেন')}</p></div></div>
        <div className="debt-actions">
          <button className="primary-btn" onClick={() => openAdd('lent')}><ArrowUpRight size={17} /> {L('Lend money', 'ধার দিলাম')}</button>
          <button className="outline-btn" onClick={() => openAdd('lent', true)}><History size={17} /> {L('Add old loans', 'আগের ধার যোগ')}</button>
        </div>
        <div className="stats-grid debt-stats">
          <Stat icon={ArrowUpRight} label={L('People owe me', 'আমি পাবো')} value={money(stats.receivable)} />
          <Stat icon={ArrowDownLeft} label={L('I owe others', 'আমি দেবো')} value={money(stats.payable)} />
        </div>
        <div className="panel">
          <div className="panel-heading"><div><h3>{L('History', 'ইতিহাস')}</h3><p>{L('Loans and repayments', 'ধার ও পরিশোধ')}</p></div></div>
          <TransactionList items={sorted.filter(t => DEBT.includes(t.type))} onEdit={openEdit} onDelete={remove} T={T} />
        </div>
      </section>}

      {page === 'shared' && <Shared cfg={syncCfg} addSignal={sharedAdd} />}

      {page === 'reports' && <section className="content">
        <div className="welcome-row"><div><h2>{L('Money report', 'আর্থিক রিপোর্ট')}</h2><p>{L('A snapshot of your finances', 'আপনার আর্থিক সারাংশ')}</p></div><button className="primary-btn" onClick={exportPdf}><Download size={17} /> {L('Download PDF', 'পিডিএফ ডাউনলোড')}</button></div>
        <div className="stats-grid">
          <Stat icon={Wallet} label={L('Current balance', 'বর্তমান ব্যালেন্স')} value={money(stats.totalBalance)} />
          <Stat icon={TrendingUp} label={L("This month's income", 'এই মাসের আয়')} value={money(stats.income)} />
          <Stat icon={TrendingDown} label={L("This month's expenses", 'এই মাসের খরচ')} value={money(stats.expense)} />
          <Stat icon={HandCoins} label={L('Net lending', 'নিট ধার-দেনা')} value={money(stats.receivable - stats.payable)} />
        </div>
        <div className="panel report-note">
          <div className="stat-icon" style={{ margin: 0 }}><FileText size={18} /></div>
          <div><b>{L('PDF report', 'পিডিএফ রিপোর্ট')}</b><p>{L("Balance, this month's totals, outstanding loans and full transaction history.", 'ব্যালেন্স, এই মাসের হিসাব, বাকি ধার-দেনা এবং সব লেনদেন। (রিপোর্টটি ইংরেজিতে তৈরি হবে)')}</p></div>
          <button className="outline-btn" onClick={exportPdf}><Download size={16} /> {L('Export PDF', 'পিডিএফ নিন')}</button>
        </div>
      </section>}
    </main>

    <nav className="mobile-nav">
      {NAV.slice(0, 2).map(n => <NavBtn key={n.id} n={n} page={page} setPage={setPage} T={T} />)}
      <button className="fab" aria-label={L('Add entry', 'নতুন এন্ট্রি')} onClick={() => openAdd('expense')}><Plus size={26} strokeWidth={2.4} /></button>
      {NAV.slice(2).map(n => <NavBtn key={n.id} n={n} page={page} setPage={setPage} T={T} />)}
    </nav>

    {modal && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setModal(false)}>
      <form className="entry-modal" onSubmit={save}>
        <div className="grabber" />
        <div className="modal-head">
          <div><span className="eyebrow">{editing ? L('Edit entry', 'এন্ট্রি এডিট') : L('New entry', 'নতুন এন্ট্রি')}</span><h2>{T.pick(typeOf(form.type))}</h2></div>
          <button type="button" className="icon-btn" onClick={() => setModal(false)} aria-label={L('Close', 'বন্ধ')}><X size={20} /></button>
        </div>
        <div className="chips">{TYPES.map(t => <button type="button" key={t.id} className={`chip ${form.type === t.id ? 'on' : ''}`} onClick={() => setType(t.id)}>{T.pick(t)}</button>)}</div>
        <label>{L('Amount', 'পরিমাণ')}
          <div className="amount-field"><span>৳</span><input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required /></div>
        </label>
        <div className="form-two">
          <label>{L('Date', 'তারিখ')}<input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required /></label>
          {isDebt
            ? <label>{L('Person', 'ব্যক্তি')}<input placeholder={L('Name', 'নাম')} value={form.person} onChange={e => setForm({ ...form, person: e.target.value })} /></label>
            : <label>{L('Category', 'ক্যাটাগরি')}<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{cats.map(([c, b]) => <option key={c} value={c}>{L(c, b)}</option>)}</select></label>}
        </div>
        {OLD_OK.includes(form.type) && <label className="switch-row">
          <span className="switch-copy">
            <b>{form.type === 'lent' ? L('Old loan (given before today)', 'আগের ধার (আজকের আগে দেওয়া)') : L('Old loan (taken before today)', 'আগের ধার (আজকের আগে নেওয়া)')}</b>
            <small>{form.previous
              ? (form.type === 'lent' ? L("Won't change your balance. Adds to “People owe me”.", 'ব্যালেন্স কমবে না। শুধু “আমি পাবো”-তে যোগ হবে।') : L("Won't change your balance. Adds to “I owe others”.", 'ব্যালেন্স বাড়বে না। শুধু “আমি দেবো”-তে যোগ হবে।'))
              : (form.type === 'lent' ? L('Off: amount is subtracted from your balance.', 'বন্ধ: টাকা ব্যালেন্স থেকে কমবে।') : L('Off: amount is added to your balance.', 'বন্ধ: টাকা ব্যালেন্সে যোগ হবে।'))}</small>
          </span>
          <input type="checkbox" className="switch" checked={!!form.previous} onChange={e => setForm({ ...form, previous: e.target.checked })} />
        </label>}
        <label>{isDebt ? L('Purpose', 'উদ্দেশ্য') : L('Title', 'শিরোনাম')}<input placeholder={isDebt ? L('e.g. Emergency loan', 'যেমন: জরুরি ধার') : L('e.g. Lunch, salary', 'যেমন: দুপুরের খাবার, বেতন')} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
        <label>{L('Note (optional)', 'নোট (ঐচ্ছিক)')}<textarea rows="2" placeholder={L('Add a note', 'নোট লিখুন')} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></label>
        {editing
          ? <div className="modal-actions">
            <button type="button" className="outline-btn" onClick={() => remove(editing)} aria-label={L('Delete', 'মুছুন')}><Trash2 size={17} /></button>
            <button className="primary-btn" type="submit"><Check size={17} />{L('Save changes', 'পরিবর্তন সংরক্ষণ')}</button>
          </div>
          : <div className="modal-actions three">
            <button className="primary-btn" type="submit" name="done"><Check size={17} />{L('Save', 'সংরক্ষণ')}</button>
            <button type="button" className="outline-btn" onClick={() => setModal(false)}>{L('Close', 'বন্ধ')}</button>
            <button className="outline-btn" type="submit" name="more"><Plus size={17} />{L('Save & add more', 'সেভ করে আরেকটা')}</button>
          </div>}
      </form>
    </div>}

    {syncOpen && <SyncSheet cfg={syncCfg} status={syncStatus} msg={syncMsg} lastSync={lastSync} T={T}
      onClose={() => setSyncOpen(false)} onConnect={connectSync} onDisconnect={disconnectSync} onSyncNow={runSync} />}

    {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
  </div>
}

function syncErrorText(kind, L) {
  return {
    auth: L('Token is wrong, expired, or has no write access. Create a new token.', 'টোকেন ভুল, মেয়াদ শেষ, বা লেখার অনুমতি নেই। নতুন টোকেন দিন।'),
    notfound: L('Repository not found. Check the username and repo name, and that the token has access to it.', 'রিপোজিটরি পাওয়া যায়নি। ইউজারনেম, রিপো নাম এবং টোকেনের অনুমতি দেখুন।'),
    public: L('This repository is public. Make it private first: your money data must not be public.', 'রিপোজিটরিটি পাবলিক। আগে প্রাইভেট করুন, টাকার হিসাব পাবলিক রাখা যাবে না।'),
    offline: L('No internet. Your entries are saved on this device and will sync later.', 'ইন্টারনেট নেই। এন্ট্রি এই ডিভাইসে সংরক্ষিত আছে, পরে সিঙ্ক হবে।')
  }[kind] || L('Sync failed. Try again.', 'সিঙ্ক হয়নি। আবার চেষ্টা করুন।')
}

function SyncButton({ status, onClick, L }) {
  const map = {
    off: [CloudOff, L('Sync off', 'সিঙ্ক বন্ধ')],
    syncing: [RefreshCw, L('Syncing…', 'সিঙ্ক হচ্ছে…')],
    ok: [Cloud, L('Synced', 'সিঙ্ক হয়েছে')],
    offline: [CloudOff, L('Offline', 'অফলাইন')]
  }
  const [Icon, label] = map[status] || [AlertTriangle, L('Sync problem', 'সিঙ্ক সমস্যা')]
  return <button type="button" className={`sync-btn s-${status}`} onClick={onClick} title={label} aria-label={label}>
    <Icon size={17} className={status === 'syncing' ? 'spin' : ''} /><span>{label}</span>
  </button>
}

function SyncSheet({ cfg, status, msg, lastSync, T, onClose, onConnect, onDisconnect, onSyncNow }) {
  const { L } = T
  const [f, setF] = useState({ owner: cfg.owner, repo: cfg.repo, token: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const connected = !!cfg.token
  const submit = async e => {
    e.preventDefault()
    setBusy(true); setErr('')
    const problem = await onConnect(f)
    setBusy(false)
    if (problem) setErr(problem); else onClose()
  }
  const statusText = {
    ok: L('Up to date', 'সব আপডেটেড'),
    syncing: L('Syncing…', 'সিঙ্ক হচ্ছে…'),
    offline: syncErrorText('offline', L)
  }[status] || syncErrorText(status, L)

  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div className="entry-modal">
      <div className="grabber" />
      <div className="modal-head">
        <div><span className="eyebrow">{L('Settings', 'সেটিংস')}</span><h2>{L('Sync across devices', 'সব ডিভাইসে সিঙ্ক')}</h2></div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={L('Close', 'বন্ধ')}><X size={20} /></button>
      </div>

      {connected ? <>
        <div className={`sync-status s-${status}`}>
          {status === 'ok' ? <Cloud size={20} /> : status === 'syncing' ? <RefreshCw size={20} className="spin" /> : <AlertTriangle size={20} />}
          <div><b>{statusText}</b>
            <small>{lastSync ? `${L('Last synced', 'শেষ সিঙ্ক')}: ${new Date(lastSync).toLocaleTimeString(T.lang === 'bn' ? 'bn-BD' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}</small>
            {status !== 'ok' && status !== 'syncing' && msg && <small className="mono">{msg}</small>}
          </div>
        </div>
        <div className="kv"><span>{L('Data saved in', 'ডেটা সংরক্ষিত')}</span><b className="mono">{cfg.owner}/{cfg.repo}/{cfg.path}</b></div>
        <p className="help">{L('Entries sync when you save, when you open the app, and every 30 seconds while it is open. Without internet, entries are kept on this device and sync later.',
          'এন্ট্রি সেভ করলে, অ্যাপ খুললে এবং অ্যাপ খোলা থাকলে প্রতি ৩০ সেকেন্ডে সিঙ্ক হয়। ইন্টারনেট না থাকলে এন্ট্রি এই ডিভাইসে থাকে, পরে সিঙ্ক হয়।')}</p>
        {(status === 'auth' || status === 'notfound' || status === 'public') && <form className="sync-form" onSubmit={submit}>
          <label>{L('New token', 'নতুন টোকেন')}<input type="password" autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="github_pat_…" value={f.token} onChange={e => setF({ ...f, token: e.target.value })} required /></label>
          {err && <div className="form-error">{err}</div>}
          <button className="primary-btn" type="submit" disabled={busy}>{busy ? L('Checking…', 'যাচাই হচ্ছে…') : L('Save token', 'টোকেন সংরক্ষণ')}</button>
        </form>}
        <div className="modal-actions">
          <button type="button" className="outline-btn" onClick={onDisconnect}>{L('Disconnect', 'সংযোগ বন্ধ')}</button>
          <button type="button" className="primary-btn" onClick={onSyncNow} disabled={status === 'syncing'}><RefreshCw size={17} />{L('Sync now', 'এখনই সিঙ্ক')}</button>
        </div>
      </> : <form className="sync-form" onSubmit={submit}>
        <p className="help">{L('Your data is saved in your own private GitHub repository, so the same entries appear on your phone, PC and any browser. Do this once on each device.',
          'আপনার ডেটা আপনার নিজের প্রাইভেট GitHub রিপোজিটরিতে থাকবে, তাই ফোন, পিসি বা যেকোনো ব্রাউজারে একই এন্ট্রি দেখাবে। প্রতিটি ডিভাইসে একবার করতে হবে।')}</p>
        <div className="form-two">
          <label>{L('GitHub username', 'GitHub ইউজারনেম')}<input autoCapitalize="off" spellCheck={false} value={f.owner} onChange={e => setF({ ...f, owner: e.target.value })} required /></label>
          <label>{L('Private data repo', 'প্রাইভেট ডেটা রিপো')}<input autoCapitalize="off" spellCheck={false} value={f.repo} onChange={e => setF({ ...f, repo: e.target.value })} required /></label>
        </div>
        <label>{L('Access token', 'অ্যাক্সেস টোকেন')}<input type="password" autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="github_pat_…" value={f.token} onChange={e => setF({ ...f, token: e.target.value })} required /></label>
        <p className="help small">{L('Entries already on this device are merged with the ones on GitHub. Nothing is deleted.', 'এই ডিভাইসে থাকা এন্ট্রি GitHub-এর এন্ট্রির সাথে যোগ হবে। কিছু মুছবে না।')}</p>
        {err && <div className="form-error">{err}</div>}
        <button className="primary-btn" type="submit" disabled={busy}><Cloud size={17} />{busy ? L('Checking…', 'যাচাই হচ্ছে…') : L('Connect', 'সংযুক্ত করুন')}</button>
      </form>}
    </div>
  </div>
}

function LangToggle({ lang, setLang }) {
  return <div className="lang-toggle" role="group" aria-label="Language">
    <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
    <button type="button" className={lang === 'bn' ? 'on' : ''} onClick={() => setLang('bn')}>বাং</button>
  </div>
}
function NavBtn({ n, page, setPage, T }) {
  return <button className={page === n.id ? 'selected' : ''} onClick={() => setPage(n.id)}><n.icon size={21} /><span>{n.short || T.pick(n)}</span></button>
}
function Stat({ icon: Icon, label, value }) {
  return <div className="stat-card"><div className="stat-icon"><Icon size={17} /></div><span className="stat-label">{label}</span><strong>{value}</strong></div>
}
function DebtLines({ stats, T }) {
  const { L, money } = T
  return <>
    <div className="debt-line"><div className="debt-icon lent"><ArrowUpRight size={17} /></div><div className="debt-copy"><b>{L('People owe me', 'আমি পাবো')}</b><small>{L('Money you have lent', 'যাদের ধার দিয়েছেন')}</small></div><strong>{money(stats.receivable)}</strong></div>
    <div className="debt-line"><div className="debt-icon borrowed"><ArrowDownLeft size={17} /></div><div className="debt-copy"><b>{L('I owe others', 'আমি দেবো')}</b><small>{L('Money you have borrowed', 'যাদের কাছ থেকে ধার নিয়েছেন')}</small></div><strong>{money(stats.payable)}</strong></div>
  </>
}
function TransactionList({ items, onEdit, onDelete, T }) {
  const { L, money } = T
  if (!items.length) return <div className="empty-state"><div className="empty-icon"><ArrowLeftRight size={20} /></div><b>{L('No entries yet', 'এখনো কোনো এন্ট্রি নেই')}</b><span>{L('Your transactions will appear here.', 'আপনার লেনদেন এখানে দেখাবে।')}</span></div>
  return <div>{items.map(t => {
    const positive = POSITIVE.includes(t.type)
    const old = isOld(t)
    const type = typeOf(t.type)
    const sub = [t.person, !DEBT.includes(t.type) && t.category && T.cat(t.category), T.pick(type)].filter(Boolean).join(' · ')
    return <div className="transaction" key={t.id} onClick={() => onEdit(t)} role="button">
      <div className={`transaction-icon ${old ? 'old' : positive ? 'positive' : 'negative'}`}>{old ? <History size={18} /> : positive ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</div>
      <div className="transaction-info"><b>{t.title || T.pick(type)}{old && <em className="tag">{L('Old', 'আগের')}</em>}</b><span>{sub}</span></div>
      <div className="transaction-meta"><strong className={old ? 'amount-old' : positive ? '' : 'amount-negative'}>{old ? '' : positive ? '+' : '−'}{money(t.amount)}</strong><small>{old ? L('No balance effect', 'ব্যালেন্সে প্রভাব নেই') : T.date(t.date, { day: 'numeric', month: 'short' })}</small></div>
      <div className="row-actions" onClick={e => e.stopPropagation()}><button title={L('Edit', 'এডিট')} onClick={() => onEdit(t)}><Pencil size={15} /></button><button title={L('Delete', 'মুছুন')} onClick={() => onDelete(t.id)}><Trash2 size={15} /></button></div>
    </div>
  })}</div>
}

export default App
