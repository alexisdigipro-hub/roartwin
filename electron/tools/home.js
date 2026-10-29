// Overview (Alex, 29 Oct: "a first page that sees what the computer needs"). The page reads what the other tools
// already tell (stats-now, drives-list); this side adds a quick look at the caches Clean up would free, within a few
// seconds and without the job lock, so the Overview never waits on a long walk or blocks another tool. Reads only.
const path = require('path')

const BUDGET = 6000 // ms for the whole look at the caches

/* the caches, measured with a time budget: each place's size, and whether the walk was cut short */
async function caches(clean, home, platform = process.platform, budget = BUDGET) {
  const items = clean.catalogue({ home, platform })
  const until = Date.now() + budget
  const stop = () => Date.now() > until
  const out = []
  let partial = false
  for (const item of items) {
    if (item.kind === 'match') continue // installers are the person's own files: not counted as junk here
    let size = 0
    for (const dir of item.paths) {
      try { size += (await clean.sizeOf(dir, stop)).size } catch { partial = true; break }
      if (stop()) { partial = true; break }
    }
    out.push({ id: item.id, name: item.name, size })
    if (stop()) { partial = true; break }
  }
  out.sort((a, b) => b.size - a.size)
  return { total: out.reduce((n, x) => n + x.size, 0), top: out.filter((x) => x.size > 0).slice(0, 3), partial }
}

function register(ctx) {
  let last = null
  ctx.handle('home-caches', async () => {
    // one look every two minutes is plenty: the Overview is opened often
    if (last && Date.now() - last.at < 120e3) return last
    last = { at: Date.now(), ...(await caches(ctx.clean, ctx.app.getPath('home'))) }
    return last
  })
}

module.exports = { register, caches, path }
