import { useEffect, useMemo, useState } from 'react'
import {
  LayoutDashboard, ArrowLeftRight, HandCoins, FileText, Plus, X,
  TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownLeft,
  Search, Download, Trash2, Pencil, CalendarDays, CircleDollarSign, Check, ChevronRight
} from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts'

const STORE_KEY = 'my-money-tracker-v1'
const LANG_KEY = 'my-money-lang'
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
const typeOf = id => TYPES.find(t => t.id === id) || { en: id, bn: id }
const cashEffect = t => {
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
  const [form, setForm] = useState({ type: 'expense', amount: '', date: today(), title: '', category: 'Food', person: '', note: '' })
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')

  const T = useMemo(() => makeLang(lang), [lang])
  const { L, money } = T

  useEffect(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(transactions)) } catch {} }, [transactions])
  useEffect(() => {
    try { localStorage.setItem(LANG_KEY, lang) } catch {}
    document.documentElement.lang = lang
  }, [lang])
  useEffect(() => { window.scrollTo(0, 0) }, [page])
  useEffect(() => { document.body.style.overflow = modal ? 'hidden' : '' }, [modal])

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

  const openAdd = type => {
    setEditing(null)
    setForm({ type: type || 'expense', amount: '', date: today(), title: '', category: type === 'income' ? 'Salary' : 'Food', person: '', note: '' })
    setModal(true)
  }
  const openEdit = item => { setEditing(item.id); setForm({ ...item }); setModal(true) }
  const setType = type => setForm(f => ({ ...f, type, category: type === 'income' ? 'Salary' : type === 'expense' ? 'Food' : f.category }))
  const save = e => {
    e.preventDefault()
    if (!form.amount || Number(form.amount) <= 0) return
    if (form.type === 'opening' && transactions.some(t => t.type === 'opening' && t.id !== editing)) {
      alert(L('Opening balance already exists. Edit the existing one instead.', 'শুরুর ব্যালেন্স আগেই যোগ করা আছে। সেটি এডিট করুন।'))
      return
    }
    const item = { ...form, amount: Number(form.amount), id: editing || uid(), createdAt: editing ? (transactions.find(t => t.id === editing)?.createdAt || Date.now()) : Date.now() }
    setTransactions(prev => editing ? prev.map(t => t.id === editing ? item : t) : [...prev, item])
    setModal(false)
  }
  const remove = id => {
    if (confirm(L('Delete this entry?', 'এন্ট্রিটি মুছে ফেলবেন?'))) { setTransactions(prev => prev.filter(t => t.id !== id)); setModal(false) }
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
      doc.text(`${typeOf(t.type).en}${t.title ? ' - ' + t.title : ''}`.slice(0, 44), 40, y)
      doc.text((t.person || t.category || '-').slice(0, 22), 122, y)
      doc.setTextColor(0, 0, 0)
      doc.text(`${POSITIVE.includes(t.type) ? '+' : '-'} ${pdfMoney(t.amount)}`, 196, y, { align: 'right' })
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
      <div className="sidebar-bottom"><span className="privacy-dot" />{L('Data stays on this device', 'ডেটা শুধু এই ডিভাইসে থাকে')}</div>
    </aside>

    <main className="main">
      <header className="topbar">
        <div><div className="eyebrow">{L('My Money', 'আমার হিসাব')}</div><h1>{T.pick(current)}</h1></div>
        <div className="top-actions">
          <span className="today-label"><CalendarDays size={15} />{T.date(null, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
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
        <div className="welcome-row"><div><h2>{L('Lending & borrowing', 'ধার-দেনা')}</h2><p>{L('Who owes you, and whom you owe', 'কে আপনার কাছে পাবে, আপনি কার কাছে পাবেন')}</p></div><button className="primary-btn" onClick={() => openAdd('lent')}><Plus size={17} /> {L('Add entry', 'নতুন এন্ট্রি')}</button></div>
        <div className="stats-grid debt-stats">
          <Stat icon={ArrowUpRight} label={L('People owe me', 'আমি পাবো')} value={money(stats.receivable)} />
          <Stat icon={ArrowDownLeft} label={L('I owe others', 'আমি দেবো')} value={money(stats.payable)} />
        </div>
        <div className="panel">
          <div className="panel-heading"><div><h3>{L('History', 'ইতিহাস')}</h3><p>{L('Loans and repayments', 'ধার ও পরিশোধ')}</p></div></div>
          <TransactionList items={sorted.filter(t => DEBT.includes(t.type))} onEdit={openEdit} onDelete={remove} T={T} />
        </div>
      </section>}

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
        <label>{isDebt ? L('Purpose', 'উদ্দেশ্য') : L('Title', 'শিরোনাম')}<input placeholder={isDebt ? L('e.g. Emergency loan', 'যেমন: জরুরি ধার') : L('e.g. Lunch, salary', 'যেমন: দুপুরের খাবার, বেতন')} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
        <label>{L('Note (optional)', 'নোট (ঐচ্ছিক)')}<textarea rows="2" placeholder={L('Add a note', 'নোট লিখুন')} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></label>
        <div className="modal-actions">
          {editing
            ? <button type="button" className="outline-btn" onClick={() => remove(editing)} aria-label={L('Delete', 'মুছুন')}><Trash2 size={17} /></button>
            : <button type="button" className="outline-btn" onClick={() => setModal(false)}>{L('Cancel', 'বাতিল')}</button>}
          <button className="primary-btn" type="submit"><Check size={17} />{editing ? L('Save changes', 'পরিবর্তন সংরক্ষণ') : L('Save', 'সংরক্ষণ')}</button>
        </div>
      </form>
    </div>}
  </div>
}

function LangToggle({ lang, setLang }) {
  return <div className="lang-toggle" role="group" aria-label="Language">
    <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
    <button type="button" className={lang === 'bn' ? 'on' : ''} onClick={() => setLang('bn')}>বাং</button>
  </div>
}
function NavBtn({ n, page, setPage, T }) {
  return <button className={page === n.id ? 'selected' : ''} onClick={() => setPage(n.id)}><n.icon size={21} /><span>{T.pick(n)}</span></button>
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
    const type = typeOf(t.type)
    const sub = [t.person, !DEBT.includes(t.type) && t.category && T.cat(t.category), T.pick(type)].filter(Boolean).join(' · ')
    return <div className="transaction" key={t.id} onClick={() => onEdit(t)} role="button">
      <div className={`transaction-icon ${positive ? 'positive' : 'negative'}`}>{positive ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</div>
      <div className="transaction-info"><b>{t.title || T.pick(type)}</b><span>{sub}</span></div>
      <div className="transaction-meta"><strong className={positive ? '' : 'amount-negative'}>{positive ? '+' : '−'}{money(t.amount)}</strong><small>{T.date(t.date, { day: 'numeric', month: 'short' })}</small></div>
      <div className="row-actions" onClick={e => e.stopPropagation()}><button title={L('Edit', 'এডিট')} onClick={() => onEdit(t)}><Pencil size={15} /></button><button title={L('Delete', 'মুছুন')} onClick={() => onDelete(t.id)}><Trash2 size={15} /></button></div>
    </div>
  })}</div>
}

export default App
