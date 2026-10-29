/* Vault (Alex, 28 Oct: "a vault for passwords"): the page. It never holds the key, the file or the list's passwords:
   the Mac/Windows side (electron/tools/vault.js) seals them, and gives one password, by entry id, to show it for a
   moment or to copy it (the clipboard is cleared after 30 s). Locked again after a few idle minutes, when the computer
   sleeps or its screen locks, and when the window closes. In a browser, sample entries stand in (demo). */

const V = { phase: 'loading', demo: false, list: [], q: '', tag: 'all', shown: {}, codes: {}, idle: 5, busy: false, hooked: false, asked: false }
/* what is shown for a moment (a password, a two-factor code) goes when the person leaves the Vault, hides the window,
   or the vault locks; the back button never brings a password back on the screen (audit, 29 Oct) */
const hideAll = () => { for (const k of Object.keys(V.shown)) { clearTimeout(V.shown[k].timer); delete V.shown[k] } V.codes = {}; clearInterval(V.tick); V.tick = null }
const HEALTH = { weak: ['Weak', 'var(--acc)'], reused: ['Reused', 'var(--warn)'], old: ['Old', 'var(--dim)'] }
let C = null // the ctx of the last draw

const TAGS = ['Clients', 'Gear', 'Socials', 'Banks', 'Studio', 'Software']
const strength = (p) => {
  if (!p) return 0
  const pool = (/[a-z]/.test(p) ? 26 : 0) + (/[A-Z]/.test(p) ? 26 : 0) + (/\d/.test(p) ? 10 : 0) + (/[^a-zA-Z0-9]/.test(p) ? 20 : 0) || 26
  const bits = p.length * Math.log2(pool)
  return bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4
}
const STRENGTH = ['', 'Weak', 'Fair', 'Good', 'Strong']

async function refresh() {
  try {
    const s = await C.call('vault-state')
    V.demo = !!s.demo; V.idle = s.idle || V.idle
    V.phase = !s.exists ? 'new' : s.unlocked ? 'open' : 'locked'
    if (V.phase === 'open') V.list = await C.call('vault-list')
  } catch (e) { V.phase = 'locked'; C.toast(C.err(e)) }
  C.draw()
}
function hook(ctx) {
  if (V.hooked) return
  V.hooked = true
  ctx.on('vault-locked', () => { V.phase = 'locked'; V.list = []; hideAll(); if (ctx.S.mode === 'vault') ctx.draw() })
  document.addEventListener('visibilitychange', () => { if (document.hidden && (Object.keys(V.shown).length || Object.keys(V.codes).length)) { hideAll(); if (ctx.S.mode === 'vault') ctx.draw() } })
}
const lockNow = async () => { try { await C.call('vault-lock') } catch { /* it is locked */ } V.phase = 'locked'; V.list = []; hideAll(); C.draw() }

/* two-factor codes on the screen: refreshed every second from the Mac/Windows side while shown, gone after 2 minutes */
function codeTick() {
  if (V.tick) return
  V.tick = setInterval(async () => {
    const ids = Object.keys(V.codes)
    if (!ids.length || V.phase !== 'open' || C?.S.mode !== 'vault') { hideAll(); return }
    for (const id of ids) {
      const c = V.codes[id]
      if (Date.now() - c.since > 120e3) { delete V.codes[id]; continue }
      c.left -= 1
      if (c.left <= 0) { try { Object.assign(c, await C.call('vault-code', { id })) } catch { delete V.codes[id] } }
    }
    const el = document.querySelectorAll('.vt-code')
    if (el.length === Object.keys(V.codes).length) el.forEach((x) => { const c = V.codes[x.dataset.id]; if (c) { x.querySelector('b').textContent = c.code.replace(/^(\d{3})(\d+)$/, '$1 $2'); x.style.setProperty('--f', String(c.left / c.period)); x.querySelector('small').textContent = c.left + 's' } })
    else C.draw()
  }, 1000)
}

/* a window of fields in the shared glass card */
function win(ctx, title, kids, buttons) {
  const { h } = ctx
  return new Promise((done) => {
    const close = (v) => { veil.remove(); document.removeEventListener('keydown', key); done(v) }
    const key = (e) => { if (e.key === 'Escape') close(null) }
    const veil = h('div', { class: 'veil', onclick: (e) => { if (e.target === veil) close(null) } },
      h('div', { class: 'sheet vt-sheet', role: 'dialog', 'aria-modal': 'true' }, h('h3', {}, title), h('div', { class: 'vt-form' }, ...kids),
        h('div', { class: 'row' }, ...buttons.map(([label, v, main]) => h('button', { class: 'btn' + (main ? ' main' : ''), onclick: () => close(typeof v === 'function' ? v() : v) }, label)))))
    document.addEventListener('keydown', key)
    document.body.append(veil)
    veil.querySelector('input,textarea')?.focus()
  })
}
const field = (ctx, label, input) => ctx.h('label', { class: 'vt-f' }, ctx.h('small', {}, label), input)
const pill = (ctx, attrs) => ctx.h('input', { class: 'vt-in', autocomplete: 'off', spellcheck: 'false', ...attrs })
function meter(ctx, input) {
  const { h, t } = ctx
  const bar = h('div', { class: 'vt-meter' }, h('i'), h('span', {}))
  const up = () => { const s = strength(input.value); bar.dataset.s = s; bar.querySelector('span').textContent = s ? t(STRENGTH[s]) : '' }
  input.addEventListener('input', up); up()
  return bar
}

/* ---------- the three screens ---------- */
function viewNew(ctx) {
  const { h, t } = ctx
  const a = pill(ctx, { type: 'password', placeholder: t('Master password') })
  const b = pill(ctx, { type: 'password', placeholder: t('Once more') })
  const go = async () => {
    if (a.value.length < 8) return ctx.toast(t('At least 8 characters.'))
    if (a.value !== b.value) return ctx.toast(t('The two are not the same.'))
    V.busy = true; ctx.draw()
    try { await ctx.call('vault-create', { password: a.value }); await ctx.call('vault-idle', { minutes: V.idle }); ctx.toast(t('Your vault is ready.')) } catch (e) { ctx.toast(ctx.err(e)) }
    V.busy = false; refresh()
  }
  b.addEventListener('keydown', (e) => { if (e.key === 'Enter') go() })
  return h('main', {}, h('div', { class: 'home' }, h('div', { class: 'card' },
    h('div', { class: 'hero' }, h('h1', { html: t('Your passwords, <b>locked</b>.') }),
      h('p', {}, t('One master password opens them. They are sealed on this computer with AES-256 and never leave it.'))),
    h('div', { class: 'opts vt-lockcard' }, a, meter(ctx, a), b,
      h('div', { class: 'vt-warn' }, ctx.ico('warn'), h('span', {}, t('There is no way to get the passwords back if the master password is forgotten. Write it down somewhere safe.'))),
      h('div', { class: 'go' }, h('button', { class: 'btn main big', disabled: V.busy, onclick: go }, ctx.ico('lock'), V.busy ? t('Sealing…') : t('Create the vault')))),
    V.demo ? h('p', { class: 'note' }, t('Demo: sample entries, nothing is saved.')) : null)))
}
function viewLocked(ctx) {
  const { h, t } = ctx
  const a = pill(ctx, { type: 'password', placeholder: t('Master password') })
  const go = async () => {
    if (!a.value) return
    V.busy = true; ctx.draw()
    try { await ctx.call('vault-unlock', { password: a.value }); await ctx.call('vault-idle', { minutes: V.idle }) } catch (e) { ctx.toast(ctx.err(e)) }
    V.busy = false; refresh()
  }
  a.addEventListener('keydown', (e) => { if (e.key === 'Enter') go() })
  requestAnimationFrame(() => a.focus())
  return h('main', {}, h('div', { class: 'home' }, h('div', { class: 'card' },
    h('div', { class: 'hero' }, h('h1', { html: t('The vault is <b>locked</b>.') }), h('p', {}, t('Type the master password to open it.'))),
    h('div', { class: 'opts vt-lockcard' }, h('div', { class: 'vt-row' }, a,
      h('button', { class: 'btn main', disabled: V.busy, onclick: go }, ctx.ico('lock'), V.busy ? t('Opening…') : t('Unlock')))),
    V.demo ? h('p', { class: 'note' }, t('Demo: sample entries, nothing is saved. The master password is "demo-demo".')) : null)))
}

async function editEntry(ctx, e = {}) {
  const { h, t } = ctx
  const f = {
    title: pill(ctx, { value: e.title || '', placeholder: 'Vimeo' }),
    username: pill(ctx, { value: e.username || '', placeholder: 'studio@themadlions.com' }),
    password: pill(ctx, { type: 'password', value: '', placeholder: e.id ? t('Unchanged') : '' }),
    website: pill(ctx, { value: e.website || '', placeholder: 'https://vimeo.com' }),
    tag: pill(ctx, { value: e.tag || '', placeholder: t('Clients, Gear, Socials…'), list: 'vt-tags' }),
    // the key a site gives for two-factor codes (or its otpauth:// link); kept as it is when left empty
    totp: pill(ctx, { value: '', placeholder: e.hasTotp ? t('Kept as it is (type a new key to change it)') : t('The key the site shows next to its QR code') }),
    notes: h('textarea', { class: 'vt-in vt-notes', rows: '3' }, e.notes || ''),
  }
  const tags = h('datalist', { id: 'vt-tags' }, ...[...new Set([...TAGS, ...V.list.map((x) => x.tag).filter(Boolean)])].map((x) => h('option', { value: x })))
  const eye = h('button', { class: 'ib sm', type: 'button', title: t('Show'), html: EYE, onclick: () => { f.password.type = f.password.type === 'password' ? 'text' : 'password' } })
  const gen = h('button', { class: 'ib sm', type: 'button', title: t('Make one'), html: ctx.I.plus, onclick: async () => { f.password.value = await ctx.call('vault-generate', { length: 20 }); f.password.type = 'text'; f.password.dispatchEvent(new Event('input')) } })
  const pw = h('div', { class: 'vt-row' }, f.password, eye, gen)
  let dropTotp = false
  const totpRow = h('div', { class: 'vt-row' }, f.totp, e.hasTotp ? h('button', { class: 'ib sm', type: 'button', title: t('Remove the two-factor key'), 'aria-label': t('Remove the two-factor key'), html: ctx.I.x, onclick: (ev) => { dropTotp = true; f.totp.value = ''; f.totp.placeholder = t('Removed when you save'); ev.currentTarget.disabled = true } }) : null)
  const ok = await win(ctx, e.id ? t('Edit') : t('New entry'), [
    field(ctx, t('Name'), f.title), field(ctx, t('Username or email'), f.username), field(ctx, t('Password'), pw), meter(ctx, f.password),
    field(ctx, t('Website'), f.website), field(ctx, t('Two-factor key (optional)'), totpRow), field(ctx, t('Tag'), f.tag), tags, field(ctx, t('Notes'), f.notes)],
  [[t('Cancel'), false], [t('Save'), true, true]])
  if (!ok) return
  const entry = { id: e.id, title: f.title.value, username: f.username.value, website: f.website.value, tag: f.tag.value.trim(), notes: f.notes.value, fav: e.fav }
  if (f.password.value || !e.id) entry.password = f.password.value
  if (f.totp.value.trim()) entry.totp = f.totp.value.trim(); else if (dropTotp) entry.totp = ''
  try { await ctx.call('vault-save', { entry }); V.list = await ctx.call('vault-list'); ctx.toast(t('Saved')) } catch (er) { ctx.toast(ctx.err(er)) }
  ctx.draw()
}
async function generator(ctx) {
  const { h, t } = ctx
  const o = { length: 20, lower: true, upper: true, digits: true, symbols: true, plain: true, words: 0, ...ctx.load('vault', 'gen', {}) }
  const out = h('div', { class: 'vt-gen' })
  const make = async () => { out.textContent = await ctx.call('vault-generate', o) }
  const len = h('input', { type: 'range', min: '12', max: '64', value: String(o.length), class: 'vt-range', oninput: (e) => { o.length = +e.target.value; lenV.textContent = o.length; make() } })
  const lenV = h('b', {}, String(o.length))
  const sw = (k, label) => h('div', { class: 'opt' }, h('span', {}, h('b', {}, label)), ctx.switchEl(o[k], () => {}, label))
  const opts = h('div', { class: 'vt-gopts' })
  const drawOpts = () => {
    opts.replaceChildren(
      h('div', { class: 'opt' }, h('span', {}, h('b', {}, t('Kind'))), ctx.seg([[0, t('Characters')], [5, t('Words')]], o.words ? 5 : 0, (v) => { o.words = v; drawOpts(); make() })),
      ...(o.words ? [] : [h('div', { class: 'opt' }, h('span', {}, h('b', {}, t('Length'))), lenV, len),
        ...[['upper', t('Capitals')], ['digits', t('Numbers')], ['symbols', t('Symbols')], ['plain', t('No look-alikes (l 1 I O 0)')]].map(([k, label]) => {
          const el = sw(k, label); el.querySelector('.switch').onclick = () => { o[k] = !o[k]; drawOpts(); make() }; return el })]))
  }
  drawOpts(); await make()
  const r = await win(ctx, t('Password generator'), [out, opts], [[t('Close'), false], [t('Make another'), 'again'], [t('Copy'), 'copy', true]])
  ctx.save('vault', 'gen', o)
  if (r === 'again') return generator(ctx)
  // through the Mac/Windows side, so a generated password too leaves the clipboard after 30 s
  if (r === 'copy') { try { await ctx.call('vault-copy-text', { text: out.textContent }); ctx.toast(t('Password copied. It leaves the clipboard in 30 s.')) } catch { ctx.toast(t('Could not copy')) } }
}
async function changeMaster(ctx) {
  const { t } = ctx
  const a = pill(ctx, { type: 'password', placeholder: t('The master password now') })
  const b = pill(ctx, { type: 'password', placeholder: t('The new one') })
  const c = pill(ctx, { type: 'password', placeholder: t('The new one, once more') })
  const ok = await win(ctx, t('Change the master password'), [a, b, meter(ctx, b), c], [[t('Cancel'), false], [t('Change'), true, true]])
  if (!ok) return
  if (b.value.length < 8) return ctx.toast(t('At least 8 characters.'))
  if (b.value !== c.value) return ctx.toast(t('The two are not the same.'))
  try { await ctx.call('vault-change', { old: a.value, password: b.value }); ctx.toast(t('The master password is changed.')) } catch (e) { ctx.toast(ctx.err(e)) }
}

function viewOpen(ctx) {
  const { h, t } = ctx
  const q = V.q.trim().toLowerCase()
  const tags = [...new Set(V.list.map((e) => e.tag).filter(Boolean))].sort()
  const list = V.list
    .filter((e) => V.tag === 'all' || (V.tag === 'fav' ? e.fav : V.tag.startsWith('h:') ? (e.health || []).includes(V.tag.slice(2)) : e.tag === V.tag))
    .filter((e) => !q || [e.title, e.username, e.website, e.tag, e.notes].some((x) => String(x || '').toLowerCase().includes(q)))
    .sort((a, b) => (b.fav - a.fav) || a.title.localeCompare(b.title))
  const copy = async (e, field) => {
    try { const r = await ctx.call('vault-copy', { id: e.id, field }); ctx.toast(field === 'password' ? (r.clears ? t('Password copied. It leaves the clipboard in 30 s.') : t('Password copied.')) : field === 'totp' ? t('Code copied. It leaves the clipboard in 30 s.') : t('Copied')) } catch (er) { ctx.toast(ctx.err(er)) }
  }
  const reveal = async (e) => {
    if (V.shown[e.id]) { clearTimeout(V.shown[e.id].timer); delete V.shown[e.id]; return ctx.draw() }
    try {
      const pw = await ctx.call('vault-reveal', { id: e.id })
      // each shown password has its own 20 s, so hiding and showing again does not cut the new one short
      V.shown[e.id] = { pw, timer: setTimeout(() => { delete V.shown[e.id]; if (ctx.S.mode === 'vault') ctx.draw() }, 20e3) }
      ctx.draw()
    } catch (er) { ctx.toast(ctx.err(er)) }
  }
  const code = async (e) => {
    if (V.codes[e.id]) { delete V.codes[e.id]; return ctx.draw() }
    try { V.codes[e.id] = { ...(await ctx.call('vault-code', { id: e.id })), since: Date.now() }; codeTick(); ctx.draw() } catch (er) { ctx.toast(ctx.err(er)) }
  }
  const star = async (e) => { try { await ctx.call('vault-save', { entry: { id: e.id, fav: !e.fav } }); V.list = await ctx.call('vault-list'); ctx.draw() } catch (er) { ctx.toast(ctx.err(er)) } }
  const del = async (e) => {
    if (!(await ctx.sheet(t('Delete {n}?', { n: e.title }), t('It is taken out of the vault. This cannot be undone.'), [[t('Cancel'), false], [t('Delete'), true, true]]))) return
    try { await ctx.call('vault-delete', { id: e.id }); V.list = await ctx.call('vault-list'); ctx.draw() } catch (er) { ctx.toast(ctx.err(er)) }
  }
  const tile = (e) => h('div', { class: 'vt-item' },
    h('button', { class: 'vt-star' + (e.fav ? ' on' : ''), title: e.fav ? t('Favourite') : t('Make it a favourite'), 'aria-label': t('Favourite'), onclick: () => star(e) }, '★'),
    h('div', { class: 'vt-av' }, (e.title || '?').trim().slice(0, 1).toUpperCase()),
    h('div', { class: 'vt-main' },
      h('div', { class: 'vt-t' }, e.title),
      h('div', { class: 'vt-u' }, e.username || '—'),
      h('div', { class: 'f-meta' },
        e.tag ? h('span', { class: 'chip tint', style: { '--c': '#64d2ff' } }, h('i'), e.tag) : null,
        e.website ? h('span', { class: 'chip', title: e.website }, e.website.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 40)) : null,
        ...(e.health || []).map((k) => h('span', { class: 'chip tint', style: { '--c': HEALTH[k][1] }, title: t(HEALTH[k][0] + ' password') }, h('i'), t(HEALTH[k][0]))),
        V.shown[e.id] ? h('span', { class: 'chip vt-pw' }, V.shown[e.id].pw || t('(empty)')) : null,
        V.codes[e.id] ? h('button', { class: 'chip vt-code', 'data-id': e.id, style: { '--f': String(V.codes[e.id].left / V.codes[e.id].period) }, title: t('Copy the code'), onclick: () => copy(e, 'totp') },
          h('b', {}, V.codes[e.id].code.replace(/^(\d{3})(\d+)$/, '$1 $2')), h('small', {}, V.codes[e.id].left + 's')) : null)),
    h('div', { class: 'f-act' },
      e.username ? h('button', { class: 'btn vt-sm', onclick: () => copy(e, 'username') }, t('Username')) : null,
      e.hasPassword ? h('button', { class: 'btn vt-sm vt-pwbtn', onclick: () => copy(e, 'password') }, t('Password')) : null,
      e.hasPassword ? h('button', { class: 'ib sm', title: V.shown[e.id] ? t('Hide') : t('Show'), 'aria-label': V.shown[e.id] ? t('Hide') : t('Show'), html: V.shown[e.id] ? ctx.I.x : EYE, onclick: () => reveal(e) }) : null,
      e.hasTotp ? h('button', { class: 'btn vt-sm' + (V.codes[e.id] ? ' on' : ''), title: t('The two-factor code'), onclick: () => code(e) }, '2FA') : null,
      h('button', { class: 'ib sm', title: t('Edit'), 'aria-label': t('Edit'), html: ctx.I.rename, onclick: () => editEntry(ctx, e) }),
      h('button', { class: 'ib sm vt-del', title: t('Delete'), 'aria-label': t('Delete'), html: ctx.I.trash, onclick: () => del(e) })))
  const imp = async () => {
    try {
      const r = await ctx.call('vault-import')
      if (!r?.added && r?.file === undefined) return
      if (!r.added && r.already) return ctx.toast(t('Everything in {f} is in the vault already.', { f: r.file }))
      V.list = await ctx.call('vault-list'); ctx.draw()
      await ctx.sheet(t('{n} passwords brought in', { n: ctx.num(r.added || 0) }) + (r.already ? ' · ' + t('{n} were there already', { n: ctx.num(r.already) }) : ''), t('Now delete the CSV file ({f}) and empty the Trash: it holds every password as plain text.', { f: r.file || '' }), [[t('OK'), true, true]])
    } catch (e) { ctx.toast(ctx.err(e)) }
  }
  const exp = async () => { try { const p = await ctx.call('vault-export'); if (p) ctx.toast(t('Backup saved. It opens with the same master password.')) } catch (e) { ctx.toast(ctx.err(e)) } }
  return h('main', {}, h('div', { class: 'res vt' },
    h('div', { class: 'sum' }, ctx.seg([['all', t('All'), V.list.length], ['fav', '★', V.list.filter((e) => e.fav).length || null], ...tags.map((x) => [x, x, V.list.filter((e) => e.tag === x).length])], V.tag, (v) => { V.tag = v; ctx.draw() }),
      // password health (weak, reused, old): a chip each, a click shows only those
      ...Object.entries(HEALTH).map(([k, [label, c]]) => { const n = V.list.filter((e) => (e.health || []).includes(k)).length; return n ? h('button', { class: 'chip tint vt-hchip' + (V.tag === 'h:' + k ? ' on' : ''), style: { '--c': c }, title: t('Show only these'), onclick: () => { V.tag = V.tag === 'h:' + k ? 'all' : 'h:' + k; ctx.draw() } }, h('i'), t(label) + ' · ' + n) : null }),
      V.demo ? h('span', { class: 'chip tint', style: { '--c': 'var(--warn)' } }, h('i'), t('Demo: sample entries, nothing is saved.')) : null),
    list.length ? h('div', { class: 'vt-list' }, ...list.map(tile))
      : h('div', { class: 'empty vt-empty' }, h('div', {}, h('div', { class: 'big-i', html: ctx.I.lock }),
        h('h2', { html: V.list.length ? t('Nothing <b>found</b>.') : t('The vault is <b>empty</b>.') }),
        h('p', {}, V.list.length ? t('Try other words.') : t('Add your first password, or bring them in from a browser.')),
        h('button', { class: 'btn main', onclick: () => editEntry(ctx) }, ctx.ico('plus'), t('New entry')))),
    h('div', { class: 'opts vt-more' },
      h('div', { class: 'opt' }, h('span', {}, h('b', {}, t('Lock when idle')), h('small', {}, t('Also when the computer sleeps, the screen locks or the window closes.'))),
        ctx.seg([[1, '1 min'], [5, '5 min'], [15, '15 min']], V.idle, async (v) => { V.idle = v; ctx.save('vault', 'idle', v); try { await ctx.call('vault-idle', { minutes: v }) } catch { /* locked */ } ctx.draw() })),
      h('div', { class: 'opt' }, h('span', {}, h('b', {}, t('Bring in passwords')), h('small', {}, t('A CSV exported from Chrome, Safari, Firefox, 1Password or Bitwarden.'))),
        h('button', { class: 'btn', onclick: imp }, ctx.ico('plus'), t('Import CSV…'))),
      h('div', { class: 'opt' }, h('span', {}, h('b', {}, t('Backup')), h('small', {}, t('A sealed copy of the vault, for another drive. It opens with the same master password.'))),
        h('button', { class: 'btn', onclick: exp }, ctx.ico('out'), t('Save a backup…'))),
      h('div', { class: 'opt' }, h('span', {}, h('b', {}, t('Master password')), h('small', {}, t('Every password is sealed again with the new one.'))),
        h('button', { class: 'btn', onclick: () => changeMaster(ctx) }, ctx.ico('lock'), t('Change…'))))))
}
const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>'

/* ---------- the sample, in a browser ---------- */
const demoState = { exists: true, unlocked: false, master: 'demo-demo', entries: [
  { id: 'd1', title: 'Vimeo', username: 'studio@themadlions.com', password: 'Vx7-qK2m-Lp9w-Rz4t', website: 'https://vimeo.com', tag: 'Socials', notes: 'Pro plan, renews in March', fav: true, totp: 'JBSWY3DPEHPK3PXP' },
  { id: 'd2', title: 'Frame.io', username: 'alex@themadlions.com', password: 'fr4M3!review#2026', website: 'https://app.frame.io', tag: 'Clients', notes: '', fav: true },
  { id: 'd3', title: 'Panic Records FTP', username: 'tml_upload', password: 'P@nic-ftp-88', website: 'sftp://ftp.panicrecords.gr', tag: 'Clients', notes: 'Masters go to /incoming' },
  { id: 'd4', title: 'RED account', username: 'alex@themadlions.com', password: 'Komodo-6K-!x', website: 'https://www.red.com', tag: 'Gear', notes: '' },
  { id: 'd5', title: 'Instagram', username: '@themadlions', password: 'Ro@r-insta-55', website: 'https://instagram.com', tag: 'Socials', notes: '' },
  { id: 'd6', title: 'Studio Wi-Fi', username: 'TML-5G', password: 'lions-den-2026', website: '', tag: 'Studio', notes: 'Guest network: TML-Guest' },
  { id: 'd7', title: 'Office router', username: 'admin', password: 'lions-den-2026', website: 'http://192.168.1.1', tag: 'Studio', notes: '', old: true },
  { id: 'd8', title: 'Old Dropbox', username: 'alex@themadlions.com', password: 'dropbox1', website: 'https://dropbox.com', tag: 'Software', notes: '' },
] }
const words = 'amber anchor cedar comet copper crimson ember falcon garnet harbor indigo lantern meadow nova orbit pearl prism quartz raven saffron'.split(' ')
const rnd = (n) => Math.floor(Math.random() * n)
const genDemo = (o = {}) => {
  if (o.words) return Array.from({ length: 5 }, () => words[rnd(words.length)]).join('-') + '-' + (10 + rnd(90))
  const set = 'abcdefghijkmnpqrstuvwxyz' + (o.upper !== false ? 'ABCDEFGHJKLMNPQRSTUVWXYZ' : '') + (o.digits !== false ? '23456789' : '') + (o.symbols !== false ? '!@#$%^&*-_=+?' : '')
  return Array.from({ length: Math.max(12, Math.min(64, o.length || 20)) }, () => set[rnd(set.length)]).join('')
}
const pub = (e) => ({ id: e.id, title: e.title, username: e.username, website: e.website, notes: e.notes, tag: e.tag, fav: !!e.fav, hasPassword: !!e.password, hasTotp: !!e.totp,
  health: [e.password && e.password.length < 10 && 'weak', e.password && demoState.entries.filter((x) => x.password === e.password).length > 1 && 'reused', e.old && 'old'].filter(Boolean) })
const need = () => { if (!demoState.unlocked) throw new Error('The vault is locked.') }
const demo = {
  'vault-state': async () => ({ demo: true, exists: demoState.exists, unlocked: demoState.unlocked, idle: 5, count: demoState.entries.length }),
  'vault-create': async ({ password }) => { demoState.exists = true; demoState.master = password; demoState.unlocked = true; return { ok: true } },
  'vault-unlock': async ({ password }) => { await new Promise((r) => setTimeout(r, 300)); if (password !== demoState.master) throw new Error('Wrong password'); demoState.unlocked = true; return { ok: true } },
  'vault-lock': async () => { demoState.unlocked = false; return { ok: true } },
  'vault-idle': async ({ minutes }) => ({ idle: minutes }),
  'vault-list': async () => { need(); return demoState.entries.map(pub) },
  'vault-save': async ({ entry }) => {
    need()
    const i = demoState.entries.findIndex((x) => x.id === entry.id)
    const e = { ...(i >= 0 ? demoState.entries[i] : { id: 'n' + Date.now() }), ...Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined)) }
    if (i >= 0) demoState.entries[i] = e; else demoState.entries.push(e)
    return pub(e)
  },
  'vault-delete': async ({ id }) => { need(); demoState.entries = demoState.entries.filter((x) => x.id !== id); return { ok: true } },
  'vault-reveal': async ({ id }) => { need(); return demoState.entries.find((x) => x.id === id)?.password || '' },
  'vault-copy': async () => { need(); return { ok: true, clears: true } },
  'vault-generate': async (o) => genDemo(o),
  'vault-copy-text': async () => ({ ok: true, clears: true }),
  'vault-code': async () => { need(); const s = Math.floor(Date.now() / 1000); return { code: String((s / 30 | 0) * 7919 % 1e6).padStart(6, '0'), left: 30 - (s % 30), period: 30 } },
  'vault-totp-key': async ({ id }) => demoState.entries.find((x) => x.id === id)?.totp || '',
  'vault-change': async ({ old, password }) => { if (old !== demoState.master) throw new Error('Wrong password'); demoState.master = password; return { ok: true } },
  'vault-export': async () => '/Users/alex/Desktop/Vault backup.roarvault',
  'vault-import': async () => { need(); demoState.entries.push({ id: 'i' + Date.now(), title: 'Gmail', username: 'alex@gmail.com', password: 'imported-1', website: 'https://accounts.google.com', tag: '', notes: '' }); return { added: 1, already: 3, file: 'Chrome Passwords.csv' } },
}

export default {
  id: 'vault',
  view(ctx) {
    C = ctx
    hook(ctx)
    // the page that is still on the screen is another tool's: coming back hides what was shown before
    if (!document.querySelector('main.vt-page')) hideAll()
    if (!V.asked) { V.asked = true; V.idle = ctx.load('vault', 'idle', 5); refresh() }
    const m = V.phase === 'loading' ? ctx.h('main', {}, ctx.h('div', { class: 'home' })) : V.phase === 'new' ? viewNew(ctx) : V.phase === 'locked' ? viewLocked(ctx) : viewOpen(ctx)
    m.classList.add('vt-page')
    return m
  },
  top(ctx) {
    const { h, t } = ctx
    C = ctx
    const title = h('div', { class: 'title' }, t('Vault'))
    if (V.phase !== 'open') return [title, h('div', { class: 'spacer' })]
    const search = h('input', { class: 'vt-in vt-search', type: 'search', placeholder: t('Search'), value: V.q, oninput: (e) => { V.q = e.target.value; const at = e.target.selectionStart; ctx.draw(); const s = document.querySelector('.vt-search'); if (s) { s.focus(); s.setSelectionRange(at, at) } } })
    return [title, search, h('div', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: () => generator(ctx) }, ctx.ico('shield'), h('span', { class: 'lbl' }, t('Generator'))),
      h('button', { class: 'btn main', onclick: () => editEntry(ctx) }, ctx.ico('plus'), h('span', { class: 'lbl' }, t('New'))),
      h('button', { class: 'btn', onclick: lockNow }, ctx.ico('lock'), h('span', { class: 'lbl' }, t('Lock')))]
  },
  demo,
  el: {
    'Vault': 'Vault', 'Master password': 'Κύριος κωδικός', 'Once more': 'Άλλη μία φορά', 'At least 8 characters.': 'Τουλάχιστον 8 χαρακτήρες.',
    'The two are not the same.': 'Οι δύο δεν είναι ίδιοι.', 'Your vault is ready.': 'Το vault σου είναι έτοιμο.',
    'Your passwords, <b>locked</b>.': 'Οι κωδικοί σου, <b>κλειδωμένοι</b>.',
    'One master password opens them. They are sealed on this computer with AES-256 and never leave it.': 'Ένας κύριος κωδικός τους ανοίγει. Σφραγίζονται σε αυτόν τον υπολογιστή με AES-256 και δεν φεύγουν ποτέ από αυτόν.',
    'There is no way to get the passwords back if the master password is forgotten. Write it down somewhere safe.': 'Αν ξεχάσεις τον κύριο κωδικό, οι κωδικοί δεν ανακτώνται με κανέναν τρόπο. Γράψ\' τον κάπου ασφαλές.',
    'Sealing…': 'Σφράγισμα…', 'Create the vault': 'Φτιάξε το vault', 'Demo: sample entries, nothing is saved.': 'Δείγμα: παραδείγματα, τίποτα δεν αποθηκεύεται.',
    'The vault is <b>locked</b>.': 'Το vault είναι <b>κλειδωμένο</b>.', 'Type the master password to open it.': 'Γράψε τον κύριο κωδικό για να ανοίξει.',
    'Opening…': 'Ανοίγει…', 'Unlock': 'Ξεκλείδωμα', 'Demo: sample entries, nothing is saved. The master password is "demo-demo".': 'Δείγμα: παραδείγματα, τίποτα δεν αποθηκεύεται. Ο κύριος κωδικός είναι "demo-demo".',
    'Wrong password': 'Λάθος κωδικός', 'The vault is locked.': 'Το vault είναι κλειδωμένο.', 'There is no vault yet.': 'Δεν υπάρχει ακόμα vault.', 'There is a vault already.': 'Υπάρχει ήδη vault.', 'Not in the vault.': 'Δεν είναι στο vault.',
    'Unchanged': 'Ίδιος με πριν', 'Clients, Gear, Socials…': 'Πελάτες, Εξοπλισμός, Social…', 'Show': 'Εμφάνιση', 'Hide': 'Απόκρυψη', 'Make one': 'Φτιάξε έναν',
    'Edit': 'Επεξεργασία', 'New entry': 'Νέα καταχώρηση', 'Username or email': 'Όνομα χρήστη ή email', 'Password': 'Κωδικός', 'Website': 'Ιστοσελίδα', 'Tag': 'Ετικέτα', 'Notes': 'Σημειώσεις',
    'Save': 'Αποθήκευση', 'Saved': 'Αποθηκεύτηκε', 'Weak': 'Αδύναμος', 'Fair': 'Μέτριος', 'Good': 'Καλός', 'Strong': 'Δυνατός',
    'Characters': 'Χαρακτήρες', 'Words': 'Λέξεις', 'Capitals': 'Κεφαλαία', 'Numbers': 'Αριθμοί', 'Symbols': 'Σύμβολα', 'No look-alikes (l 1 I O 0)': 'Χωρίς όμοια (l 1 I O 0)',
    'Password generator': 'Γεννήτρια κωδικών', 'Close': 'Κλείσιμο', 'Make another': 'Άλλος ένας', 'Copy': 'Αντιγραφή', 'Copied': 'Αντιγράφηκε', 'Could not copy': 'Δεν αντιγράφηκε',
    'The master password now': 'Ο κύριος κωδικός τώρα', 'The new one': 'Ο καινούργιος', 'The new one, once more': 'Ο καινούργιος, άλλη μία φορά',
    'Change the master password': 'Αλλαγή κύριου κωδικού', 'Change': 'Αλλαγή', 'Change…': 'Αλλαγή…', 'The master password is changed.': 'Ο κύριος κωδικός άλλαξε.',
    'Password copied. It leaves the clipboard in 30 s.': 'Ο κωδικός αντιγράφηκε. Φεύγει από το clipboard σε 30 δευτ.', 'Password copied.': 'Ο κωδικός αντιγράφηκε.',
    'Delete {n}?': 'Διαγραφή: {n};', 'It is taken out of the vault. This cannot be undone.': 'Βγαίνει από το vault. Δεν γίνεται αναίρεση.', 'Delete': 'Διαγραφή',
    'Favourite': 'Αγαπημένο', 'Make it a favourite': 'Κάν\' το αγαπημένο', '(empty)': '(κενό)', 'Username': 'Όνομα χρήστη',
    '{n} passwords brought in': 'Ήρθαν {n} κωδικοί', 'Now delete the CSV file ({f}) and empty the Trash: it holds every password as plain text.': 'Τώρα σβήσε το αρχείο CSV ({f}) και άδειασε τον Κάδο: έχει όλους τους κωδικούς σε απλό κείμενο.',
    'OK': 'OK', 'Backup saved. It opens with the same master password.': 'Το backup αποθηκεύτηκε. Ανοίγει με τον ίδιο κύριο κωδικό.',
    'Nothing <b>found</b>.': 'Δεν <b>βρέθηκε</b> τίποτα.', 'The vault is <b>empty</b>.': 'Το vault είναι <b>άδειο</b>.', 'Try other words.': 'Δοκίμασε άλλες λέξεις.',
    'Add your first password, or bring them in from a browser.': 'Πρόσθεσε τον πρώτο σου κωδικό, ή φέρε τους από έναν browser.',
    'Lock when idle': 'Κλείδωμα όταν δεν το χρησιμοποιείς', 'Also when the computer sleeps, the screen locks or the window closes.': 'Και όταν ο υπολογιστής κοιμάται, κλειδώνει η οθόνη ή κλείνει το παράθυρο.',
    'Bring in passwords': 'Φέρε κωδικούς', 'A CSV exported from Chrome, Safari, Firefox, 1Password or Bitwarden.': 'Ένα CSV από Chrome, Safari, Firefox, 1Password ή Bitwarden.',
    'Import CSV…': 'Εισαγωγή CSV…', 'Backup': 'Backup', 'A sealed copy of the vault, for another drive. It opens with the same master password.': 'Ένα σφραγισμένο αντίγραφο του vault, για άλλον δίσκο. Ανοίγει με τον ίδιο κύριο κωδικό.',
    'Save a backup…': 'Αποθήκευση backup…', 'Every password is sealed again with the new one.': 'Όλοι οι κωδικοί σφραγίζονται ξανά με τον καινούργιο.',
    'Not a vault file.': 'Δεν είναι αρχείο vault.', 'This vault was made by a newer version.': 'Αυτό το vault φτιάχτηκε από νεότερη έκδοση.',
    'Two-factor key (optional)': 'Κλειδί δύο βημάτων (προαιρετικό)', 'The key the site shows next to its QR code': 'Το κλειδί που δείχνει το site δίπλα στο QR code',
    'Kept as it is (type a new key to change it)': 'Μένει όπως είναι (γράψε νέο κλειδί για να αλλάξει)', 'Remove the two-factor key': 'Αφαίρεση κλειδιού δύο βημάτων', 'Removed when you save': 'Αφαιρείται όταν αποθηκεύσεις',
    'That two-factor key is not a valid one.': 'Αυτό το κλειδί δύο βημάτων δεν είναι σωστό.', 'No two-factor key.': 'Δεν υπάρχει κλειδί δύο βημάτων.',
    'The two-factor code': 'Ο κωδικός δύο βημάτων', 'Copy the code': 'Αντιγραφή του κωδικού', 'Code copied. It leaves the clipboard in 30 s.': 'Ο κωδικός αντιγράφηκε. Φεύγει από το clipboard σε 30 δευτ.',
    'Reused': 'Ίδιος αλλού', 'Old': 'Παλιός', 'Weak password': 'Αδύναμος κωδικός', 'Reused password': 'Ο ίδιος κωδικός και σε άλλη καταχώρηση', 'Old password': 'Δεν έχει αλλάξει πάνω από χρόνο',
    'Show only these': 'Δείξε μόνο αυτά', 'Everything in {f} is in the vault already.': 'Όλα όσα έχει το {f} είναι ήδη στο vault.', '{n} were there already': '{n} υπήρχαν ήδη',
    'Search': 'Αναζήτηση', 'Generator': 'Γεννήτρια', 'New': 'Νέο', 'Lock': 'Κλείδωμα', 'Kind': 'Είδος', 'Length': 'Μήκος', 'All': 'Όλα', 'Cancel': 'Άκυρο', 'Name': 'Όνομα',
  },
}
