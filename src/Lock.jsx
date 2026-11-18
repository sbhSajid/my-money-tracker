import { useEffect, useRef, useState } from 'react'
import { Lock, X, Check, KeyRound } from 'lucide-react'

// App lock: a PIN asked every time the app opens and after it has been in the
// background for a while. Only a salted SHA-256 hash of the PIN is stored (in this
// browser's LocalStorage); the PIN itself is never saved or synced anywhere.
export const PIN_KEY = 'my-money-pin'
export const RELOCK_MS = 60 * 1000

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
export async function hashPin(pin, salt) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`)))
}
export async function makePinRecord(pin) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)))
  return { salt, hash: await hashPin(pin, salt) }
}
export const checkPin = async (rec, pin) => !!rec && (await hashPin(pin, rec.salt)) === rec.hash
const validPin = p => /^\d{4,8}$/.test(p)

export function LockScreen({ rec, L, onUnlock, onForgot, syncOn }) {
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [tries, setTries] = useState(0)
  const [waitUntil, setWaitUntil] = useState(0)
  const [, tick] = useState(0)
  const input = useRef(null)
  useEffect(() => { input.current?.focus() }, [])
  useEffect(() => { if (!waitUntil) return; const id = setInterval(() => tick(t => t + 1), 500); return () => clearInterval(id) }, [waitUntil])
  const wait = Math.max(0, Math.ceil((waitUntil - Date.now()) / 1000))

  const submit = async e => {
    e.preventDefault()
    if (wait) return
    if (await checkPin(rec, pin)) { onUnlock(); return }
    const n = tries + 1
    setTries(n); setPin('')
    // slow down guessing: 30 s pause after every 5 wrong tries
    if (n % 5 === 0) { setWaitUntil(Date.now() + 30000); setErr(L('Too many wrong tries. Wait 30 seconds.', 'অনেকবার ভুল হয়েছে। ৩০ সেকেন্ড অপেক্ষা করুন।')) }
    else setErr(L('Wrong PIN', 'ভুল PIN'))
  }
  const forgot = () => {
    const msg = syncOn
      ? L('Remove the PIN by clearing this device? All entries and the sync token on this device will be deleted. Your data stays safe in your private GitHub repo; connect sync again to get it back.',
        'ডিভাইস পরিষ্কার করে PIN সরাবেন? এই ডিভাইসের সব এন্ট্রি ও সিঙ্ক টোকেন মুছে যাবে। ডেটা আপনার প্রাইভেট GitHub রিপোতে নিরাপদ থাকবে, আবার সিঙ্ক চালু করলেই ফিরে আসবে।')
      : L('Sync is OFF on this device. Clearing it will PERMANENTLY delete all entries saved here. Continue?',
        'এই ডিভাইসে সিঙ্ক বন্ধ। পরিষ্কার করলে এখানে থাকা সব এন্ট্রি চিরতরে মুছে যাবে। তবুও করবেন?')
    if (confirm(msg)) onForgot()
  }

  return <div className="lock-screen">
    <form className="lock-card" onSubmit={submit}>
      <div className="lock-icon"><Lock size={26} /></div>
      <h2>{L('My Money is locked', 'আমার হিসাব লক করা')}</h2>
      <p>{L('Enter your PIN to continue', 'চালিয়ে যেতে PIN দিন')}</p>
      <input ref={input} className="pin-input" type="password" inputMode="numeric" autoComplete="off" maxLength={8}
        value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setErr('') }} aria-label="PIN" disabled={!!wait} />
      {err && <div className="lock-err">{wait ? `${err} (${wait})` : err}</div>}
      <button className="primary-btn" type="submit" disabled={pin.length < 4 || !!wait}>{L('Unlock', 'খুলুন')}</button>
      <button type="button" className="text-btn lock-forgot" onClick={forgot}>{L('Forgot PIN?', 'PIN ভুলে গেছেন?')}</button>
    </form>
  </div>
}

export function PinSheet({ rec, L, onSave, onRemove, onLockNow, onClose }) {
  const [cur, setCur] = useState('')
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const digits = set => e => { set(e.target.value.replace(/\D/g, '')); setErr('') }

  const save = async e => {
    e.preventDefault()
    if (rec && !(await checkPin(rec, cur))) return setErr(L('Current PIN is wrong', 'বর্তমান PIN ভুল'))
    if (!validPin(p1)) return setErr(L('PIN must be 4 to 8 digits', 'PIN ৪ থেকে ৮ অঙ্কের হতে হবে'))
    if (p1 !== p2) return setErr(L('The two PINs do not match', 'দুইবার দেওয়া PIN মেলেনি'))
    setBusy(true); onSave(await makePinRecord(p1)); setBusy(false)
  }
  const remove = async () => {
    if (!(await checkPin(rec, cur))) return setErr(L('Enter your current PIN first', 'আগে বর্তমান PIN দিন'))
    onRemove()
  }
  const pinField = (label, value, set, auto) => <label>{label}
    <input type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={value} onChange={digits(set)} autoFocus={auto} />
  </label>

  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <form className="entry-modal" onSubmit={save}>
      <div className="grabber" />
      <div className="modal-head">
        <div><span className="eyebrow">{L('Security', 'নিরাপত্তা')}</span><h2>{rec ? L('App lock is on', 'অ্যাপ লক চালু') : L('Set an app PIN', 'অ্যাপ PIN দিন')}</h2></div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={L('Close', 'বন্ধ')}><X size={20} /></button>
      </div>
      <p className="help">{L('The app asks for this PIN every time it opens, and after it has been in the background for 1 minute. The PIN is stored only on this device, so set it on each device.',
        'অ্যাপ খুললেই এবং ১ মিনিট ব্যাকগ্রাউন্ডে থাকার পর এই PIN চাইবে। PIN শুধু এই ডিভাইসে থাকে, তাই প্রতিটি ডিভাইসে আলাদা করে দিন।')}</p>
      {rec && <button type="button" className="outline-btn" onClick={onLockNow}><Lock size={16} />{L('Lock now', 'এখনই লক করুন')}</button>}
      {rec && pinField(L('Current PIN', 'বর্তমান PIN'), cur, setCur, true)}
      <div className="form-two">
        {pinField(rec ? L('New PIN', 'নতুন PIN') : L('PIN (4-8 digits)', 'PIN (৪-৮ অঙ্ক)'), p1, setP1, !rec)}
        {pinField(L('Repeat PIN', 'আবার PIN'), p2, setP2)}
      </div>
      {err && <div className="form-error">{err}</div>}
      <div className="modal-actions">
        {rec && <button type="button" className="outline-btn" onClick={remove}>{L('Turn off', 'বন্ধ করুন')}</button>}
        <button className="primary-btn" type="submit" disabled={busy}><Check size={17} />{rec ? L('Change PIN', 'PIN বদলান') : L('Turn on lock', 'লক চালু করুন')}</button>
      </div>
    </form>
  </div>
}

export function LockButton({ on, L, onClick }) {
  const label = on ? L('App lock on', 'অ্যাপ লক চালু') : L('Set app lock', 'অ্যাপ লক দিন')
  return <button type="button" className={`sync-btn lock-btn ${on ? 's-ok' : 's-off'}`} onClick={onClick} title={label} aria-label={label}>
    {on ? <Lock size={17} /> : <KeyRound size={17} />}
  </button>
}
