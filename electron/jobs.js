// Do by itself (Alex, 29 Oct): jobs RoarKit runs on its own while it (or its menu bar icon) is running. Each is off at
// first. A weekly Clean up of the safe caches only (the places Clean up chooses at first, never the installers, a
// program's cache left alone while it is open, to the Trash), and a monthly check of backups against their copy reports
// (Check a backup > Against its copy report) for the folders the person adds. A job whose time passed while RoarKit was
// not running runs at the next start (once, however many were missed). Each run is written in a short log (Settings)
// and told in a notification. The schedule maths are plain functions, tested by test/jobs.test.js.
const fs = require('fs')

const DAY = 864e5
const hm = (time) => { const m = String(time || '').match(/^(\d{1,2}):(\d{2})$/); const h = m ? Math.min(23, +m[1]) : 10, mi = m ? Math.min(59, +m[2]) : 0; return [h, mi] }
/* the latest moment at or before `now` the job is set for (local time: 10:00 stays 10:00 across summer time) */
function prevRun(job, now = Date.now()) {
  const [h, m] = hm(job.time)
  const d = new Date(now)
  if (job.every === 'month') {
    const day = Math.min(28, Math.max(1, Number(job.day) || 1))
    let c = new Date(d.getFullYear(), d.getMonth(), day, h, m, 0, 0)
    if (c.getTime() > now) c = new Date(d.getFullYear(), d.getMonth() - 1, day, h, m, 0, 0)
    return c.getTime()
  }
  // every week, on a day 0 (Sunday) to 6 (Saturday)
  const wd = ((Number(job.day) || 0) % 7 + 7) % 7
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0)
  c.setDate(c.getDate() - ((d.getDay() - wd + 7) % 7))
  if (c.getTime() > now) c.setDate(c.getDate() - 7)
  return c.getTime()
}
/* the next moment after `now` */
function nextRun(job, now = Date.now()) {
  const p = new Date(prevRun(job, now))
  if (job.every === 'month') return new Date(p.getFullYear(), p.getMonth() + 1, p.getDate(), p.getHours(), p.getMinutes(), 0, 0).getTime()
  p.setDate(p.getDate() + 7)
  return p.getTime()
}
/* is it time: on, and its latest set moment came after its last run and after it was switched on (a job switched on
   today does not run at once for last week) */
function due(job, lastRun, now = Date.now()) {
  if (!job?.on) return false
  const p = prevRun(job, now)
  return p > Math.max(Number(lastRun) || 0, Number(job.since) || 0)
}
/* a run missed: due, and its set moment is more than a few minutes old (RoarKit was not running then) */
const missed = (job, lastRun, now = Date.now()) => due(job, lastRun, now) && now - prevRun(job, now) > 5 * 60e3

const DEFAULTS = {
  clean: { on: false, every: 'week', day: 0, time: '10:00', since: 0 },
  backup: { on: false, every: 'month', day: 1, time: '11:00', since: 0, folders: [] },
}
const LOG_SIZE = 20

/* the runner: what the jobs are set to and did, kept in a file; run(id) does the work given by main.js */
function create({ file, run, notify = () => {}, busy = () => false, now = () => Date.now() }) {
  let state = { config: structuredClone(DEFAULTS), last: {}, log: [] }
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'))
    state = { config: { clean: { ...DEFAULTS.clean, ...v.config?.clean }, backup: { ...DEFAULTS.backup, ...v.config?.backup } }, last: v.last || {}, log: Array.isArray(v.log) ? v.log : [] }
  } catch { /* first start */ }
  const save = () => { try { fs.writeFileSync(file, JSON.stringify(state, null, 2)) } catch { /* read-only: kept in memory */ } }
  let running = null
  const view = () => ({
    config: structuredClone(state.config), log: [...state.log], running,
    next: Object.fromEntries(Object.entries(state.config).map(([id, j]) => [id, j.on ? nextRun(j, now()) : 0])),
    last: { ...state.last },
  })
  async function runJob(id, why = 'time') {
    if (running) return null
    running = id
    const at = now()
    let entry
    try {
      const r = await run(id, state.config[id])
      entry = { job: id, at, ok: !r?.problem, why, ...r }
    } catch (e) {
      entry = { job: id, at, ok: false, why, problem: true, text: String(e?.message || e) }
    } finally { running = null }
    state.last[id] = at
    state.log = [entry, ...state.log].slice(0, LOG_SIZE)
    save()
    try { notify(entry) } catch { /* no notifications here */ }
    return entry
  }
  return {
    get: view,
    /* the page's choices; a job switched on starts counting from now */
    set(cfg) {
      for (const id of Object.keys(DEFAULTS)) {
        const was = state.config[id], v = { ...was, ...(cfg?.[id] || {}) }
        v.on = !!v.on
        v.every = DEFAULTS[id].every
        v.day = Number(v.day) || 0
        v.time = /^\d{1,2}:\d{2}$/.test(v.time) ? v.time : DEFAULTS[id].time
        if (id === 'backup') v.folders = [...new Set((Array.isArray(v.folders) ? v.folders : []).map(String).filter(Boolean))]
        if (v.on && !was.on) v.since = now()
        state.config[id] = v
      }
      save()
      return view()
    },
    /* every minute and at the start: run what is due (one at a time, not while another job of the app runs) */
    async tick() {
      const out = []
      for (const id of Object.keys(DEFAULTS)) {
        if (running || busy()) break
        const j = state.config[id]
        if (due(j, state.last[id], now())) out.push(await runJob(id, missed(j, state.last[id], now()) ? 'missed' : 'time'))
      }
      return out.filter(Boolean)
    },
    runNow: (id) => (DEFAULTS[id] ? runJob(id, 'now') : null),
  }
}

module.exports = { prevRun, nextRun, due, missed, create, DEFAULTS, DAY }
