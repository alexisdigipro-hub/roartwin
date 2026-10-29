// Do by itself: the schedule maths (the next run, the last set moment, a run missed while the app was closed) in
// Athens time across the change of the clocks, and the runner on a made-up file: it runs what is due once, catches up
// at the next start, keeps a short log and says so.
// node test/jobs.test.js
process.env.TZ = 'Europe/Athens'
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { prevRun, nextRun, due, missed, create } = require('../electron/jobs')

const at = (s) => new Date(s).getTime() // local (Athens) time
const local = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

;(async () => {
  // every Sunday at 10:00
  const weekly = { on: true, every: 'week', day: 0, time: '10:00', since: 0 }
  assert.strictEqual(local(prevRun(weekly, at('2026-10-29T15:00'))), '2026-10-25 10:00', 'Thursday: last Sunday')
  assert.strictEqual(local(nextRun(weekly, at('2026-10-29T15:00'))), '2026-11-01 10:00', 'Thursday: next Sunday')
  assert.strictEqual(local(prevRun(weekly, at('2026-10-25T09:59'))), '2026-10-18 10:00', 'Sunday before ten: the week before')
  assert.strictEqual(local(prevRun(weekly, at('2026-10-25T10:00'))), '2026-10-25 10:00', 'on the minute')
  assert.strictEqual(local(nextRun(weekly, at('2026-10-25T10:00'))), '2026-11-01 10:00')
  // the clocks went back on 25 Oct 2026 at 04:00: still ten in the morning, a week of 169 hours
  assert.strictEqual(local(nextRun(weekly, at('2026-10-20T12:00'))), '2026-10-25 10:00')
  assert.strictEqual(nextRun(weekly, at('2026-10-20T12:00')) - prevRun(weekly, at('2026-10-20T12:00')), 169 * 3600e3)
  // every month on the 1st at 11:00, into a new year
  const monthly = { on: true, every: 'month', day: 1, time: '11:00', since: 0 }
  assert.strictEqual(local(prevRun(monthly, at('2026-12-15T08:00'))), '2026-12-01 11:00')
  assert.strictEqual(local(nextRun(monthly, at('2026-12-15T08:00'))), '2027-01-01 11:00')
  assert.strictEqual(local(prevRun(monthly, at('2027-01-01T10:00'))), '2026-12-01 11:00')
  assert.strictEqual(local(nextRun({ ...monthly, day: 31 }, at('2027-02-10T08:00'))), '2027-02-28 11:00', 'never past the 28th')

  // due: after its set moment, once
  assert.ok(due(weekly, 0, at('2026-10-29T15:00')))
  assert.ok(!due(weekly, at('2026-10-25T10:00'), at('2026-10-29T15:00')), 'it ran on Sunday')
  assert.ok(due(weekly, at('2026-10-18T10:01'), at('2026-10-25T10:00')), 'a week later it is due again')
  assert.ok(!due({ ...weekly, on: false }, 0, at('2026-10-29T15:00')), 'off is off')
  assert.ok(!due({ ...weekly, since: at('2026-10-28T09:00') }, 0, at('2026-10-29T15:00')), 'switched on on Wednesday: not for last Sunday')
  assert.ok(due({ ...weekly, since: at('2026-10-28T09:00') }, 0, at('2026-11-01T10:00')), 'but on the next Sunday')
  // missed: the app was closed on Sunday morning and opened on Monday
  assert.ok(missed(weekly, at('2026-10-18T10:00'), at('2026-10-26T09:00')))
  assert.ok(!missed(weekly, at('2026-10-18T10:00'), at('2026-10-25T10:01')), 'on time, not missed')
  // three weeks closed: one run, not three
  assert.ok(due(weekly, at('2026-10-04T10:00'), at('2026-10-26T09:00')))

  // the runner
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roarkit-jobs-'))
  const file = path.join(dir, 'jobs.json')
  let now = at('2026-10-21T12:00'), runs = [], notes = [], busy = false
  const opts = () => ({ file, now: () => now, busy: () => busy, notify: (e) => notes.push(e), run: async (id, cfg) => { runs.push([id, cfg.folders || null]); return id === 'backup' ? { text: '2 folders, all safe', checked: 2 } : { text: '3 GB moved to the Trash', freed: 3e9 } } })
  let j = create(opts())
  assert.deepStrictEqual([j.get().config.clean.on, j.get().config.backup.on], [false, false], 'off at first')
  assert.deepStrictEqual(await j.tick(), [])
  j.set({ clean: { on: true, day: 0, time: '10:00' }, backup: { on: true, day: 1, time: '11:00', folders: ['/Volumes/A', '/Volumes/A', ''] } })
  assert.deepStrictEqual(j.get().config.backup.folders, ['/Volumes/A'])
  assert.strictEqual(local(j.get().next.clean), '2026-10-25 10:00')
  assert.deepStrictEqual(await j.tick(), [], 'switched on now: nothing at once')
  now = at('2026-10-25T10:00')
  busy = true
  assert.deepStrictEqual(await j.tick(), [], 'another job of the app is running: it waits')
  busy = false
  now = at('2026-10-25T10:01')
  const got = await j.tick()
  assert.deepStrictEqual(got.map((e) => [e.job, e.why, e.ok]), [['clean', 'time', true]])
  assert.deepStrictEqual(await j.tick(), [], 'once')
  // RoarKit closed from Saturday to Monday 2 Nov: at the next start both jobs catch up, once each
  now = at('2026-11-02T09:00')
  j = create(opts())
  const caught = await j.tick()
  assert.deepStrictEqual(caught.map((e) => [e.job, e.why]), [['clean', 'missed'], ['backup', 'missed']])
  assert.deepStrictEqual(runs, [['clean', null], ['clean', null], ['backup', ['/Volumes/A']]])
  assert.deepStrictEqual(await j.tick(), [])
  // the log, newest first, kept on the disk, each told
  assert.deepStrictEqual(j.get().log.map((e) => e.job), ['backup', 'clean', 'clean'])
  assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).log.length, 3)
  assert.strictEqual(notes.length, 3)
  assert.strictEqual(notes[2].text, '2 folders, all safe')
  // a job that fails is logged as a problem, and does not run again until its next time
  const bad = create({ ...opts(), run: async () => { throw new Error('The drive is not there.') } })
  now = at('2026-11-08T10:30')
  const e = await bad.tick()
  assert.ok(e[0].problem && /not there/.test(e[0].text))
  assert.deepStrictEqual(await bad.tick(), [])
  // run now, from Settings
  const r = await bad.runNow('clean')
  assert.strictEqual(r.why, 'now')
  assert.strictEqual(await bad.runNow('nope'), null)

  fs.rmSync(dir, { recursive: true, force: true })
  console.log('jobs: all good')
})().catch((e) => { console.error(e); process.exit(1) })
