// Cross-device sync using a file in the user's own PRIVATE GitHub repository.
// Free, no extra service: the app talks to the GitHub REST API with a
// fine-grained personal access token that only has access to that one repo.
//
// Data file shape: { version, updatedAt, transactions: [...], deleted: { id: timestamp } }
// Every transaction carries updatedAt; deletions are kept as "tombstones" so a
// delete on one device also removes the entry on the others.

const API = 'https://api.github.com'

export class SyncError extends Error {
  constructor(kind, message) { super(message || kind); this.kind = kind }
}

// UTF-8 safe base64 (Bangla text in titles/notes must survive the round trip)
const toB64 = str => {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
const fromB64 = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)))

async function gh(cfg, path, opts = {}) {
  let res
  try {
    res = await fetch(`${API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}${path}`, {
      cache: 'no-store',
      ...opts,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${cfg.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.headers || {})
      }
    })
  } catch {
    throw new SyncError('offline', 'No internet connection')
  }
  if (res.status === 401) throw new SyncError('auth', 'Token is wrong or expired')
  if (res.status === 403) {
    const remaining = res.headers.get('x-ratelimit-remaining')
    if (remaining === '0') throw new SyncError('error', 'GitHub rate limit reached, try again later')
    throw new SyncError('auth', 'Token does not have write access to this repository')
  }
  return res
}

// Checks the repo exists, the token can see it, and it is private.
export async function checkRepo(cfg) {
  const res = await gh(cfg, '')
  if (res.status === 404) throw new SyncError('notfound', 'Repository not found, or the token has no access to it')
  if (!res.ok) throw new SyncError('error', `GitHub error ${res.status}`)
  const repo = await res.json()
  if (!repo.private) throw new SyncError('public', 'This repository is public. Make it private first.')
  return repo
}

const filePath = cfg => `/contents/${cfg.path.split('/').map(encodeURIComponent).join('/')}`

async function pull(cfg) {
  const res = await gh(cfg, filePath(cfg))
  if (res.status === 404) return { data: null, sha: null }
  if (!res.ok) throw new SyncError('error', `GitHub error ${res.status}`)
  const meta = await res.json()
  let text
  if (meta.content) text = fromB64(meta.content)
  else {
    // files over 1 MB come back without inline content: fetch the raw file
    const raw = await gh(cfg, filePath(cfg), { headers: { Accept: 'application/vnd.github.raw+json' } })
    if (!raw.ok) throw new SyncError('error', `GitHub error ${raw.status}`)
    text = await raw.text()
  }
  let data
  try { data = JSON.parse(text) } catch { throw new SyncError('error', 'The data file on GitHub is not valid JSON') }
  return { data, sha: meta.sha }
}

async function push(cfg, data, sha) {
  const body = {
    message: `Update money data ${new Date().toISOString()}`,
    content: toB64(JSON.stringify(data, null, 1)),
    ...(sha ? { sha } : {})
  }
  const res = await gh(cfg, filePath(cfg), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  // 409/422 = the file changed since we read it (another device saved): retry
  if (res.status === 409 || res.status === 422) throw new SyncError('conflict', 'Changed on another device')
  if (!res.ok) throw new SyncError('error', `GitHub error ${res.status}`)
}

export const stamp = t => t.updatedAt || t.createdAt || 0

export function normalize(data) {
  if (!data) return { transactions: [], deleted: {} }
  if (Array.isArray(data)) return { transactions: data, deleted: {} }
  return { transactions: Array.isArray(data.transactions) ? data.transactions : [], deleted: data.deleted || {} }
}

// Union of both sides: newest version of each entry wins, deletions win over older versions.
export function merge(a, b) {
  const deleted = { ...(a.deleted || {}) }
  for (const [id, ts] of Object.entries(b.deleted || {})) deleted[id] = Math.max(deleted[id] || 0, ts)
  const byId = new Map()
  for (const t of [...(a.transactions || []), ...(b.transactions || [])]) {
    const cur = byId.get(t.id)
    if (!cur || stamp(t) > stamp(cur)) byId.set(t.id, t)
  }
  const transactions = [...byId.values()].filter(t => !(deleted[t.id] >= stamp(t)))
  return { transactions, deleted }
}

const sortKeys = v => Array.isArray(v) ? v.map(sortKeys)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v
export const canon = d => JSON.stringify(sortKeys({
  t: [...(d.transactions || [])].sort((x, y) => String(x.id).localeCompare(String(y.id))),
  d: d.deleted || {}
}))

// Pull remote, merge with local, push if anything new. Returns the merged data.
export async function syncOnce(cfg, local) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, sha } = await pull(cfg)
    const remote = normalize(data)
    const merged = merge(remote, local)
    if (data && canon(merged) === canon(remote)) return merged
    try {
      await push(cfg, { version: 1, updatedAt: new Date().toISOString(), ...merged }, sha)
      return merged
    } catch (e) {
      if (e.kind !== 'conflict') throw e
    }
  }
  throw new SyncError('error', 'Could not save after several tries, please try again')
}
