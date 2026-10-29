// Find twins: which copy of each group stays, by a rule (Alex, 28 Oct: "the best of all": one click for every group).
// Pure, no DOM: test/rules.test.js runs it. Nothing in a Masters folder is ever chosen, and one of each group stays.
export const RULES = ['suggested', 'oldest', 'newest', 'biggest', 'shortest', 'folder']
const inside = (p, dir) => { const d = String(dir || '').replace(/[\\/]+$/, ''); return !!d && (p === d || p.startsWith(d + '/') || p.startsWith(d + '\\')) }
/* the one copy of these files that stays */
export function keeperOf(files, rule = 'suggested', folder = '') {
  if (!files.length) return null
  const best = (score) => files.reduce((a, f) => (score(f) > score(a) ? f : a))
  if (rule === 'oldest') return best((f) => -(f.mtime || 0))
  if (rule === 'newest') return best((f) => f.mtime || 0)
  if (rule === 'biggest') return best((f) => f.size || 0)
  if (rule === 'shortest') return best((f) => -f.path.length)
  if (rule === 'folder') { const there = files.filter((f) => inside(f.path, folder)); if (there.length) return keeperOf(there) }
  // the suggested one, else one in Masters, else the first
  return files.find((f) => f.keep) || files.find((f) => f.protected) || files[0]
}
/* the paths to choose for the Trash in these groups: every copy but the one that stays and those in Masters.
   A proxy with no original (a group of one) is left to the person. */
export function chooseByRule(groups, rule, folder) {
  const out = new Set()
  for (const g of groups) {
    if (g.kind === 'orphan' || g.files.length < 2) continue
    const k = keeperOf(g.files, rule, folder)
    for (const f of g.files) if (f !== k && !f.protected) out.add(f.path)
  }
  return out
}
