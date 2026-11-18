import { useCallback, useEffect, useRef, useState } from 'react'
import { syncOnce, merge, canon } from './sync.js'

const readJSON = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback } }

// A list of entries kept in this browser's LocalStorage and synced to ONE file in the
// private data repo (same token as the main app, different file). Same merge rules as
// the main data: newest version of each entry wins, deletes are kept as tombstones.
export function useSyncedList({ storeKey, deletedKey, cfg, path }) {
  const [items, setItems] = useState(() => readJSON(storeKey, []))
  const [deleted, setDeleted] = useState(() => readJSON(deletedKey, {}))
  const [status, setStatus] = useState(cfg.token ? 'syncing' : 'off')
  const dataRef = useRef({ transactions: items, deleted })
  const cfgRef = useRef({ ...cfg, path })
  const run = useRef({ running: false, again: false, timer: null })
  dataRef.current = { transactions: items, deleted }
  cfgRef.current = { ...cfg, path }

  useEffect(() => { try { localStorage.setItem(storeKey, JSON.stringify(items)) } catch {} }, [storeKey, items])
  useEffect(() => { try { localStorage.setItem(deletedKey, JSON.stringify(deleted)) } catch {} }, [deletedKey, deleted])

  const runSync = useCallback(async () => {
    const c = cfgRef.current
    if (!c.token) return
    const r = run.current
    if (r.running) { r.again = true; return }
    r.running = true
    setStatus('syncing')
    try {
      const merged = await syncOnce(c, dataRef.current)
      const combined = merge(merged, dataRef.current)
      if (canon(combined) !== canon(dataRef.current)) { setItems(combined.transactions); setDeleted(combined.deleted) }
      if (canon(combined) !== canon(merged)) r.again = true
      setStatus('ok')
    } catch (e) {
      setStatus(e.kind === 'offline' ? 'offline' : 'error')
    } finally {
      r.running = false
      if (r.again) { r.again = false; setTimeout(runSync, 300) }
    }
  }, [])
  const scheduleSync = useCallback(() => {
    clearTimeout(run.current.timer)
    run.current.timer = setTimeout(runSync, 1200)
  }, [runSync])

  useEffect(() => {
    if (!cfg.token) { setStatus('off'); return }
    runSync()
    const onVisible = () => { if (document.visibilityState === 'visible') runSync() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', runSync)
    const id = setInterval(() => { if (document.visibilityState === 'visible') runSync() }, 30000)
    return () => { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', runSync); clearInterval(id) }
  }, [cfg.token, runSync])

  return { items, setItems, deleted, setDeleted, status, scheduleSync, runSync }
}
