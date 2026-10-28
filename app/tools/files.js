// File manager's page (Alex, 28 Oct: "file management", and "media info: every piece of information of a file, in
// depth"). Two panes (one on a narrow window), places and pinned folders above them, the media info of the chosen file
// beside them; copy and move between the panes, a production folder tree in one click, compare the two panes.
// The Mac/Windows side is electron/tools/files.js; in a browser `demo` stands in with a made-up disk.

const DEFAULT_TPL = ['01_Footage', '02_Audio', '03_Graphics', '04_Music', '05_Project Files', '06_Exports', '07_Documents']
const newPane = () => ({ path: '', parent: '', items: [], sort: { k: 'name', d: 1 }, q: '', sel: new Set(), anchor: '', err: '' })
const F = { ready: false, places: [], panes: [newPane(), newPane()], active: 0, info: true, infos: {}, loading: '', sizes: {}, thumbs: {}, asked: new Set(), job: null, favs: [], tpl: DEFAULT_TPL, which: 0 }
let C = null // the page's ctx, for what answers later
const call = (name, args) => C.call(name, args)
const single = () => window.innerWidth < 1180

const SVG = {
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="11.5" height="11.5" rx="2"/><path d="M15.5 8V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2"/></svg>',
  move: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h14M13 6.5 18.5 12 13 17.5"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.01"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m12 4 2.5 5.1 5.6.8-4 4 .9 5.6L12 16.9l-5 2.6.9-5.6-4-4 5.6-.8z"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4.5h5.5V10M19.5 4.5 11 13M18 14v4a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 18V8a1.5 1.5 0 0 1 1.5-1.5h4"/></svg>',
}
const KIND = { folder: 'Folder', package: 'Package', video: 'Video', image: 'Image', audio: 'Audio', project: 'Project', doc: 'Document', archive: 'Archive', link: 'Link', other: 'File' }
const iconOf = (it, I) => ({ folder: I.folder, package: I.box, video: I.play, image: SVG.image, audio: I.sound, project: I.box, doc: I.file, archive: I.zip, link: SVG.link })[it.kind] || I.file
const media = (it) => it.kind === 'video' || it.kind === 'image'

/* ---------- opening folders ---------- */
async function openIn(i, p, keep) {
  const pane = F.panes[i]
  try {
    const r = await call('files-open', { path: p })
    const was = keep ? new Set([...pane.sel].map((x) => x.split(/[\\/]/).pop())) : null
    Object.assign(pane, { path: r.path, parent: r.parent, items: r.items, err: '' })
    if (!keep) { pane.q = ''; pane.sel = new Set(); pane.anchor = '' } else pane.sel = new Set(r.items.filter((x) => was.has(x.name)).map((x) => x.path))
    C.save('files', i ? 'right' : 'left', r.path)
  } catch (e) { pane.err = C.err(e) }
  C.draw()
}
const refresh = (i) => (F.panes[i].path ? openIn(i, F.panes[i].path, true) : null)
async function start() {
  F.ready = true
  F.favs = C.load('files', 'favs', [])
  F.tpl = C.load('files', 'tpl', DEFAULT_TPL)
  F.info = C.load('files', 'info', true)
  try { F.places = await call('files-places') } catch { F.places = [] }
  const home = F.places[0]?.path || ''
  const second = F.places.find((x) => /^(Movies|Videos)$/.test(x.name))?.path || F.places[1]?.path || home
  await openIn(0, C.load('files', 'left', home))
  if (F.panes[0].err && home) await openIn(0, home)
  await openIn(1, C.load('files', 'right', second))
  if (F.panes[1].err && second) await openIn(1, second)
}

/* ---------- the list ---------- */
function shown(pane) {
  const q = pane.q.trim().toLowerCase()
  const hide = C.S.opts?.skipHidden !== false
  const { k, d } = pane.sort
  const val = (x) => (k === 'size' ? (x.dir ? F.sizes[x.path] ?? -1 : x.size) : k === 'date' ? x.mtime : k === 'kind' ? KIND[x.kind] || '' : x.name.toLowerCase())
  return pane.items.filter((x) => (!hide || !x.hidden) && (!q || x.name.toLowerCase().includes(q)))
    .sort((a, b) => (b.dir - a.dir) || (val(a) < val(b) ? -d : val(a) > val(b) ? d : a.name.localeCompare(b.name)))
}
const selected = (i = F.active) => { const p = F.panes[i]; return p.items.filter((x) => p.sel.has(x.path)) }
function pick(i, it, e) {
  const pane = F.panes[i]
  F.active = i
  if (e?.metaKey || e?.ctrlKey) { pane.sel.has(it.path) ? pane.sel.delete(it.path) : pane.sel.add(it.path); pane.anchor = it.path } else if (e?.shiftKey && pane.anchor) {
    const list = shown(pane).map((x) => x.path), a = list.indexOf(pane.anchor), b = list.indexOf(it.path)
    pane.sel = new Set(list.slice(Math.min(a, b), Math.max(a, b) + 1))
  } else { pane.sel = new Set([it.path]); pane.anchor = it.path }
  C.draw()
}
function go(i, it) {
  if (it.dir) return openIn(i, it.path)
  C.open(it.path)
}

/* lazy pictures: asked when a row comes into view, three at a time */
const queue = []
let running = 0
function wantThumb(p) {
  if (F.thumbs[p] !== undefined || F.asked.has(p)) return
  F.asked.add(p); queue.push(p); pump()
}
function pump() {
  while (running < 3 && queue.length) {
    const p = queue.shift()
    running++
    call('files-thumb', { path: p }).then((u) => {
      F.thumbs[p] = u || ''
      if (u) document.querySelectorAll('.fm-th[data-thumb]').forEach((el) => { if (el.dataset.thumb === p) { el.style.backgroundImage = `url("${u}")`; el.classList.add('has') } })
    }).catch(() => { F.thumbs[p] = '' }).finally(() => { running--; pump() })
  }
}

async function folderSize(it) {
  F.sizes[it.path] = null
  C.draw()
  try { F.sizes[it.path] = await call('files-size', { path: it.path }) } catch { delete F.sizes[it.path] }
  C.draw()
}

function paneEl(ctx, i) {
  const { h, t, bytes, dateOf, ico, I } = ctx
  const pane = F.panes[i]
  const list = shown(pane)
  const sep = pane.path.includes('\\') ? '\\' : '/'
  const segs = pane.path.split(/[\\/]/).filter(Boolean)
  let acc = pane.path.startsWith('/') ? '/' : ''
  const crumbs = segs.map((s, k) => { acc = k === 0 && !acc ? s + sep : acc + (acc.endsWith(sep) ? '' : sep) + s; const p = acc; return h('button', { class: 'fm-crumb', title: p, onclick: () => openIn(i, p) }, s) })
  const head = h('div', { class: 'fm-head' },
    h('button', { class: 'ib sm', title: t('Up a folder'), 'aria-label': t('Up a folder'), html: SVG.up, disabled: !pane.parent, onclick: () => openIn(i, pane.parent) }),
    h('div', { class: 'fm-crumbs' }, ...crumbs),
    h('label', { class: 'fm-search' }, ico('search'), h('input', { type: 'search', placeholder: t('Search'), value: pane.q, 'aria-label': t('Search in this folder'),
      oninput: (e) => { pane.q = e.target.value; const box = document.querySelector(`.fm-list[data-i="${i}"]`); if (box) box.replaceWith(listEl(ctx, i)) } })))
  const col = (k, label) => h('button', { class: 'fm-col' + (pane.sort.k === k ? ' on' : ''), onclick: () => { pane.sort = { k, d: pane.sort.k === k ? -pane.sort.d : 1 }; C.draw() } }, t(label), pane.sort.k === k ? (pane.sort.d > 0 ? ' ↑' : ' ↓') : '')
  const onDrop = (e) => {
    const raw = e.dataTransfer.getData('text/x-roar-files')
    if (!raw) return
    e.preventDefault()
    const { from, paths } = JSON.parse(raw)
    if (from === i || !pane.path) return
    transferAsk(paths, pane.path)
  }
  return h('section', { class: 'fm-pane' + (F.active === i ? ' act' : ''), onmousedown: () => { if (F.active !== i) { F.active = i; document.querySelectorAll('.fm-pane').forEach((el) => el.classList.toggle('act', el.dataset.i === String(i))) } }, 'data-i': String(i),
    ondragover: (e) => { if ([...e.dataTransfer.types].includes('text/x-roar-files')) e.preventDefault() }, ondrop: onDrop },
    head,
    pane.err ? h('p', { class: 'fm-err' }, ico('warn'), pane.err) : null,
    h('div', { class: 'fm-cols' }, h('span'), col('name', 'Name'), col('size', 'Size'), col('kind', 'Kind'), col('date', 'Modified')),
    listEl(ctx, i),
    h('div', { class: 'fm-foot' }, t('{n} items', { n: ctx.num(list.length) }) + (pane.sel.size ? ' · ' + t('{n} chosen', { n: ctx.num(pane.sel.size) }) : '')))
  function listEl() { return rows(ctx, i) }
}
function rows(ctx, i) {
  const { h, t, bytes, dateOf, I } = ctx
  const pane = F.panes[i]
  const list = shown(pane)
  const box = h('div', { class: 'fm-list', 'data-i': String(i), tabindex: '-1' })
  if (!list.length) box.append(h('p', { class: 'fm-empty' }, pane.q ? t('Nothing by that name here.') : t('An empty folder.')))
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { wantThumb(e.target.dataset.thumb); io.unobserve(e.target) } }), { root: box, rootMargin: '200px' }) : null
  for (const it of list.slice(0, 3000)) {
    const th = h('div', { class: 'fm-th' + (F.thumbs[it.path] ? ' has' : ''), html: iconOf(it, I), style: F.thumbs[it.path] ? { backgroundImage: `url("${F.thumbs[it.path]}")` } : null })
    if (media(it) && F.thumbs[it.path] === undefined) { th.dataset.thumb = it.path; io ? io.observe(th) : wantThumb(it.path) } else if (media(it)) th.dataset.thumb = it.path
    const sz = it.dir ? (F.sizes[it.path] != null ? bytes(F.sizes[it.path]) : it.path in F.sizes ? '…' : h('button', { class: 'fm-sz', title: t('Work out the size of this folder'), onclick: (e) => { e.stopPropagation(); folderSize(it) } }, t('Size'))) : bytes(it.size || 0)
    box.append(h('div', { class: 'fm-row' + (pane.sel.has(it.path) ? ' sel' : '') + (it.hidden ? ' hid' : ''), 'data-path': it.path, draggable: 'true', title: it.name,
      onclick: (e) => pick(i, it, e), ondblclick: () => go(i, it),
      ondragstart: (e) => { if (!pane.sel.has(it.path)) { pane.sel = new Set([it.path]); pane.anchor = it.path } e.dataTransfer.setData('text/x-roar-files', JSON.stringify({ from: i, paths: [...pane.sel] })); e.dataTransfer.effectAllowed = 'copyMove' } },
      th, h('span', { class: 'nm' }, it.name), h('span', { class: 'mu' }, sz), h('span', { class: 'mu' }, t(KIND[it.kind] || 'File')), h('span', { class: 'mu' }, it.mtime ? dateOf(it.mtime) : '')))
  }
  if (list.length > 3000) box.append(h('p', { class: 'fm-empty' }, t('Showing the first {n}. Search to find the rest.', { n: ctx.num(3000) })))
  return box
}

/* ---------- media info, beside the panes ---------- */
const LABELS = new Set(['File', 'Container', 'Chapters', 'Metadata', 'Photo', 'Spotlight', 'Name', 'Folder', 'Size', 'Modified', 'Created', 'Format', 'Duration', 'Start', 'Overall bitrate', 'Timecode', 'Streams', 'Codec', 'Codec tag', 'Language', 'Resolution', 'Pixel aspect (SAR)', 'Display aspect (DAR)', 'Frame rate', 'Scan', 'Pixel format', 'Bit depth', 'Colour range', 'Colour primaries', 'Transfer', 'Matrix', 'HDR', 'Channels', 'Sample rate', 'Sample format', 'Bitrate', 'Flags', 'Side data', 'Camera', 'Lens', 'ISO', 'Shutter', 'Aperture', 'Focal length', 'Exposure program', 'White balance', 'Flash', 'Pixels', 'Colour profile', 'Colour space', 'Bits per sample', 'Taken', 'Latitude', 'Longitude', 'Altitude'])
const label = (t, k) => (LABELS.has(k) ? t(k) : k)
const secTitle = (t, s) => { const m = s.match(/^(Video|Audio|Data|Subtitle|Attachment|Picture) #(\d+)$/); return m ? `${t(m[1])} #${m[2]}` : t(s) }
function sectionsEl(ctx, sections) {
  const { h, t } = ctx
  return sections.map((s) => h('div', { class: 'fm-sec' }, h('h4', {}, secTitle(t, s.title)), h('div', { class: 'fm-kv' }, ...s.rows.flatMap(([k, v]) => [h('span', {}, label(t, k)), h('b', {}, v)]))))
}
function loadInfo(p) {
  if (F.infos[p] || F.loading === p) return
  F.loading = p
  call('files-info', { path: p }).then((r) => { F.infos[p] = r }).catch((e) => { F.infos[p] = { sections: [], text: '', err: C.err(e) } })
    .finally(() => { if (F.loading === p) F.loading = ''; const el = document.querySelector('.fm-info'); if (el && C) el.replaceWith(infoEl(C)) })
}
function infoEl(ctx) {
  const { h, t, ico, I, bytes, num } = ctx
  const sel = selected()
  const box = h('aside', { class: 'fm-info' })
  if (sel.length !== 1) {
    box.append(h('div', { class: 'fm-info-empty' }, h('div', { class: 'dz-i', html: SVG.info }), h('b', {}, t('Media info')),
      h('small', {}, sel.length ? t('{n} chosen', { n: num(sel.length) }) + ' · ' + bytes(sel.reduce((n, x) => n + (x.dir ? F.sizes[x.path] || 0 : x.size || 0), 0)) : t('Choose a file to see everything about it: every stream, its colour, timecode, camera and more.'))))
    return box
  }
  const it = sel[0]
  if (it.dir) {
    box.append(h('div', { class: 'fm-info-head' }, h('div', { class: 'fm-th big', html: I.folder }), h('div', {}, h('b', {}, it.name), h('small', {}, t('Folder')))),
      h('div', { class: 'fm-kv' }, h('span', {}, t('Size')), h('b', {}, F.sizes[it.path] != null ? bytes(F.sizes[it.path]) : h('button', { class: 'fm-sz', onclick: () => folderSize(it) }, t('Work it out'))), h('span', {}, t('Modified')), h('b', {}, ctx.dateOf(it.mtime))))
    return box
  }
  const got = F.infos[it.path]
  if (!got) loadInfo(it.path)
  box.append(h('div', { class: 'fm-info-head' },
    h('div', { class: 'fm-th big' + (F.thumbs[it.path] ? ' has' : ''), html: iconOf(it, I), style: F.thumbs[it.path] ? { backgroundImage: `url("${F.thumbs[it.path]}")` } : null }),
    h('div', {}, h('b', { title: it.name }, it.name), h('small', {}, t(KIND[it.kind] || 'File') + ' · ' + bytes(it.size || 0))),
    got?.text ? h('button', { class: 'ib sm', title: t('Copy all'), 'aria-label': t('Copy all'), html: SVG.copy, onclick: () => navigator.clipboard?.writeText(got.text).then(() => ctx.toast(t('Copied'))).catch(() => {}) }) : null))
  if (!got) box.append(h('p', { class: 'fm-empty' }, t('Reading…')))
  else if (got.err) box.append(h('p', { class: 'fm-err' }, got.err))
  else box.append(...sectionsEl(ctx, got.sections))
  return box
}

/* ---------- windows: a name, the preview, the template, the compare ---------- */
function veil(cls, kids, onClose) {
  const close = () => { v.remove(); document.removeEventListener('keydown', key, true); onClose?.() }
  const key = (e) => { if (e.key === 'Escape' || (e.key === ' ' && cls.includes('fm-prev') && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName))) { e.preventDefault(); e.stopPropagation(); close() } }
  const v = C.h('div', { class: 'veil fm-veil', onclick: (e) => { if (e.target === v) close() } }, C.h('div', { class: 'sheet ' + cls, role: 'dialog', 'aria-modal': 'true' }, ...kids(close)))
  document.addEventListener('keydown', key, true)
  document.body.append(v)
  return close
}
function ask(title, value, okLabel) {
  const { h, t } = C
  return new Promise((done) => {
    let input
    veil('fm-ask', (close) => {
      const finish = (v) => { close(); done(v) }
      input = h('input', { class: 'fm-input', value, onkeydown: (e) => { if (e.key === 'Enter') finish(input.value.trim() || null) } })
      return [h('h3', {}, title), input, h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => finish(null) }, t('Cancel')), h('button', { class: 'btn main', onclick: () => finish(input.value.trim() || null) }, okLabel))]
    }, () => done(null))
    requestAnimationFrame(() => { input.focus(); const dot = value.lastIndexOf('.'); input.setSelectionRange(0, dot > 0 ? dot : value.length) })
  })
}
async function preview() {
  const { h, t, I } = C
  const it = selected()[0]
  if (!it || it.dir) return
  const strip = h('div', { class: 'fm-frames' })
  const infoBox = h('div', { class: 'fm-prev-info' }, h('p', { class: 'fm-empty' }, t('Reading…')))
  veil('fm-prev', (close) => [h('div', { class: 'fm-prev-head' }, h('h3', { title: it.name }, it.name), h('button', { class: 'ib sm', title: t('Open'), 'aria-label': t('Open'), html: SVG.open, onclick: () => C.open(it.path) }), h('button', { class: 'ib sm', 'aria-label': t('Close'), html: I.x, onclick: close })), strip, infoBox])
  if (it.kind === 'video') {
    strip.append(h('p', { class: 'fm-empty' }, t('Reading the pictures…')))
    call('files-frames', { path: it.path }).then((fr) => strip.replaceChildren(...(fr.length ? fr.map((f) => h('figure', {}, h('img', { src: f.url, alt: '' }), h('figcaption', {}, C.dur(f.at)))) : [h('p', { class: 'fm-empty' }, t('No picture to show.'))]))).catch(() => strip.replaceChildren())
  } else if (it.kind === 'image') {
    call('files-thumb', { path: it.path }).then((u) => strip.replaceChildren(u ? h('img', { class: 'fm-still', src: u, alt: '' }) : h('p', { class: 'fm-empty' }, t('No picture to show.'))))
  } else strip.remove()
  const got = F.infos[it.path] || await call('files-info', { path: it.path }).catch((e) => ({ sections: [], err: C.err(e) }))
  F.infos[it.path] = got
  infoBox.replaceChildren(...(got.err ? [h('p', { class: 'fm-err' }, got.err)] : sectionsEl(C, got.sections)))
}
function template() {
  const { h, t } = C
  const pane = F.panes[F.active]
  if (!pane.path) return
  const area = h('textarea', { class: 'fm-area', rows: '9', spellcheck: 'false' })
  area.value = F.tpl.join('\n')
  const names = () => area.value.split('\n').map((x) => x.trim()).filter(Boolean)
  veil('fm-tpl', (close) => [h('h3', {}, t('Project folders')), h('p', {}, t('One folder a line; a/b makes a folder inside another. Made in {f}; what is there already stays.', { f: pane.path.split(/[\\/]/).filter(Boolean).pop() || pane.path })), area,
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: () => { area.value = DEFAULT_TPL.join('\n') } }, t('Reset')),
      h('button', { class: 'btn', onclick: () => { F.tpl = names(); C.save('files', 'tpl', F.tpl); C.toast(t('Kept for next time')) } }, t('Keep as mine')),
      h('button', { class: 'btn main', onclick: async () => { close(); try { const n = await call('files-template', { path: pane.path, names: names() }); C.toast(t('{n} folders made', { n: C.num(n) })); refresh(F.active) } catch (e) { C.toast(C.err(e)) } } }, t('Make them here')))])
}
async function compare() {
  const { h, t, bytes, num, ico } = C
  const [a, b] = F.panes
  if (!a.path || !b.path) return
  F.job = { kind: 'compare' }; C.busy(true)
  let r
  try { r = await call('files-compare', { left: a.path, right: b.path }) } catch (e) { C.toast(C.err(e)) } finally { F.job = null; C.busy(false) }
  if (!r || r.stopped) return
  const name = (p) => p.split(/[\\/]/).filter(Boolean).pop() || p
  const group = (title, c, list, fmt) => h('div', { class: 'fm-cmp-g' }, h('div', { class: 'fm-cmp-t' }, h('span', { class: 'chip tint', style: { '--c': c } }, h('i'), title), h('b', {}, num(list.length))),
    list.length ? h('div', { class: 'fm-cmp-list' }, ...list.slice(0, 400).map((x) => h('div', { class: 'fm-cmp-r' }, h('span', { title: x.rel }, x.rel), h('small', {}, fmt(x)))), list.length > 400 ? h('small', { class: 'fm-empty' }, t('and {n} more', { n: num(list.length - 400) })) : null) : null)
  const sz = (n) => (n < 0 ? t('Folder') : bytes(n))
  veil('fm-cmp', (close) => [h('div', { class: 'fm-prev-head' }, h('h3', {}, t('{a} and {b}', { a: name(r.left), b: name(r.right) })), h('button', { class: 'ib sm', 'aria-label': t('Close'), html: C.I.x, onclick: close })),
    h('div', { class: 'sum' }, h('span', { class: 'chip tint', style: { '--c': 'var(--ok)' } }, h('i'), t('{n} the same on both', { n: num(r.same) }))),
    group(t('Only in {f}', { f: name(r.left) }), 'var(--acc)', r.onlyLeft, (x) => sz(x.size)),
    group(t('Only in {f}', { f: name(r.right) }), '#64d2ff', r.onlyRight, (x) => sz(x.size)),
    group(t('Same name, another size'), 'var(--warn)', r.differ, (x) => `${sz(x.left)} · ${sz(x.right)}`)])
}

/* ---------- copy, move, trash, new, rename ---------- */
async function transfer(paths, to, move) {
  const { t } = C
  F.job = { kind: move ? 'move' : 'copy', done: 0, total: 0 }
  C.busy(true)
  const off = C.on('files-progress', (x) => { if (!F.job) return; F.job.done = x.done; F.job.total = x.total; const el = document.querySelector('.fm-prog b'); if (el) el.textContent = x.total ? Math.floor((x.done / x.total) * 100) + '%' : '…' })
  try {
    const r = await call('files-transfer', { paths, to, move })
    if (r?.stopped) C.toast(t('Stopped. What was half copied was taken away.'))
    else if (r.failed.length) C.toast(t('{n} could not go: {e}', { n: C.num(r.failed.length), e: t(r.failed[0].error) }))
    else C.toast(move ? t('{n} moved', { n: C.num(r.ok.length) }) : t('{n} copied', { n: C.num(r.ok.length) }))
  } catch (e) { C.toast(C.err(e)) } finally { off?.(); F.job = null; C.busy(false); refresh(0); refresh(1) }
}
async function transferAsk(paths, to) {
  const { t } = C
  const what = paths.length === 1 ? paths[0].split(/[\\/]/).pop() : C.num(paths.length) + ' ' + t('items')
  const v = await C.sheet(t('Copy or move {n}?', { n: what }), t('Into {f}. Nothing already there is written over: a name that is taken gets a number.', { f: to.split(/[\\/]/).filter(Boolean).pop() || to }), [[t('Cancel'), null], [t('Move'), 'move'], [t('Copy'), 'copy', true]])
  if (v) transfer(paths, to, v === 'move')
}
const other = () => (F.active ? 0 : 1)
function toOther(move) {
  const sel = selected().map((x) => x.path), to = F.panes[other()].path
  if (sel.length && to) transfer(sel, to, move)
}
async function trash() {
  const { t } = C
  const sel = selected()
  if (!sel.length) return
  const ok = await C.sheet(t('Move {n} to the Trash?', { n: sel.length === 1 ? sel[0].name : C.num(sel.length) + ' ' + t('items') }), t('You can take them back out of the Trash until you empty it.'), [[t('Cancel'), false], [t('Move to Trash'), true, true]])
  if (!ok) return
  const r = await call('files-trash', { paths: sel.map((x) => x.path) })
  if (r.failed.length) C.toast(t('{n} could not go: {e}', { n: C.num(r.failed.length), e: t(r.failed[0].error) }))
  else C.toast(t('{n} moved to the Trash', { n: C.num(r.ok.length) }))
  refresh(F.active)
}
async function newFolder() {
  const pane = F.panes[F.active]
  if (!pane.path) return
  const n = await ask(C.t('New folder'), C.t('untitled folder'), C.t('Make it'))
  if (!n) return
  try { const p = await call('files-mkdir', { path: pane.path, name: n }); pane.sel = new Set([p]); pane.anchor = p; await openIn(F.active, pane.path, true); pane.sel = new Set([p]); C.draw() } catch (e) { C.toast(C.err(e)) }
}
async function renameIt() {
  const [it] = selected()
  if (!it || selected().length !== 1) return
  const n = await ask(C.t('Rename'), it.name, C.t('Rename'))
  if (!n || n === it.name) return
  try { const p = await call('files-rename', { path: it.path, name: n }); const pane = F.panes[F.active]; await openIn(F.active, pane.path, true); pane.sel = new Set([p]); pane.anchor = p; C.draw() } catch (e) { C.toast(C.err(e)) }
}
function pin() {
  const p = F.panes[F.active].path
  if (!p) return
  F.favs = F.favs.includes(p) ? F.favs.filter((x) => x !== p) : [...F.favs, p]
  C.save('files', 'favs', F.favs); C.draw()
}

/* ---------- keys: arrows, Enter, Space for the preview, Tab for the other pane, ⌘⌫ to the Trash ---------- */
let keysOn = false
function keys() {
  if (keysOn) return
  keysOn = true
  document.addEventListener('keydown', (e) => {
    if (!C || C.S.mode !== 'files' || C.S.view !== 'home' || F.job) return
    if (document.querySelector('.veil') || /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName)) return
    const pane = F.panes[F.active], list = shown(pane)
    const at = list.findIndex((x) => x.path === pane.anchor)
    const move = (d) => {
      const it = list[Math.max(0, Math.min(list.length - 1, at < 0 ? 0 : at + d))]
      if (!it) return
      if (e.shiftKey && pane.anchor) pane.sel.add(it.path); else pane.sel = new Set([it.path])
      pane.anchor = it.path; C.draw()
      requestAnimationFrame(() => document.querySelector(`.fm-list[data-i="${F.active}"] .fm-row.sel:is([data-path="${CSS.escape(it.path)}"])`)?.scrollIntoView({ block: 'nearest' }))
    }
    const mod = e.metaKey || e.ctrlKey
    if (e.key === 'ArrowDown' && mod) { const it = list[at]; if (it) { e.preventDefault(); go(F.active, it) } } else if (e.key === 'ArrowUp' && mod) { if (pane.parent) { e.preventDefault(); openIn(F.active, pane.parent) } } else if (e.key === 'ArrowDown') { e.preventDefault(); move(1) } else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) } else if (e.key === 'Enter') { const it = list[at]; if (it) { e.preventDefault(); go(F.active, it) } } else if (e.key === ' ') { e.preventDefault(); preview() } else if (e.key === 'Tab' && !single()) { e.preventDefault(); F.active = other(); C.draw() } else if ((e.key === 'Backspace' && mod) || e.key === 'Delete') { e.preventDefault(); trash() } else if (e.key === 'F2') { e.preventDefault(); renameIt() } else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); pane.sel = new Set(list.map((x) => x.path)); C.draw() }
  })
  let was = single()
  window.addEventListener('resize', () => { if (C?.S.mode === 'files' && single() !== was) { was = single(); C.draw() } })
}

/* ---------- the page ---------- */
function view(ctx) {
  C = ctx
  keys()
  if (!F.ready) { start(); return ctx.h('main', { class: 'fm-main' }, ctx.h('p', { class: 'fm-empty' }, ctx.t('Reading…'))) }
  const { h, t, ico, I } = ctx
  // the lists keep their place when the page is drawn again
  const scroll = [0, 1].map((i) => document.querySelector(`.fm-list[data-i="${i}"]`)?.scrollTop || 0)
  const one = single()
  if (one) F.which = F.active
  const place = (p, icon, label, fav) => h('button', { class: 'chip fm-place' + (F.panes[F.active].path === p ? ' on' : ''), title: p, onclick: () => openIn(F.active, p) }, h('span', { html: icon }), label)
  const bar = h('div', { class: 'fm-bar' },
    one ? ctx.seg([[0, t('Left')], [1, t('Right')]], F.active, (v) => { F.active = v; C.draw() }) : null,
    ...F.places.map((x) => place(x.path, x.kind === 'drive' ? I.drive : I.folder, x.kind === 'home' ? t('Home') : t(x.name))),
    ...F.favs.map((p) => place(p, SVG.star, p.split(/[\\/]/).filter(Boolean).pop() || p, true)),
    h('button', { class: 'chip fm-place', onclick: async () => { const r = await call('files-pick').catch(() => null); if (r) openIn(F.active, r.path) } }, ico('plus'), t('Open…')))
  const panes = one ? [paneEl(ctx, F.active)] : [paneEl(ctx, 0), paneEl(ctx, 1)]
  const grid = h('div', { class: 'fm' + (one ? ' one' : '') + (F.info ? ' with-info' : '') }, ...panes, F.info ? infoEl(ctx) : null)
  requestAnimationFrame(() => {
    ;[0, 1].forEach((i) => { const el = document.querySelector(`.fm-list[data-i="${i}"]`); if (el) el.scrollTop = scroll[i] })
    document.querySelectorAll('.fm-crumbs').forEach((c) => { c.scrollLeft = c.scrollWidth })
  })
  return h('main', { class: 'fm-main' }, bar, grid)
}
function top(ctx) {
  C = ctx
  const { h, t, I } = ctx
  const sel = F.ready ? selected() : []
  const pane = F.panes[F.active]
  const to = F.panes[other()]
  const name = (p) => p.split(/[\\/]/).filter(Boolean).pop() || p
  const ib = (icon, title, on, fn, cls = '') => h('button', { class: 'ib ' + cls, title, 'aria-label': title, html: icon, disabled: !on || !!F.job, onclick: fn })
  if (F.job) {
    return [h('div', { class: 'title' }, t('File manager')), h('div', { class: 'spacer' }),
      h('span', { class: 'chip tint fm-prog' }, h('i'), F.job.kind === 'compare' ? t('Comparing…') : F.job.kind === 'move' ? t('Moving') : t('Copying'), ' ', h('b', {}, F.job.total ? Math.floor((F.job.done / F.job.total) * 100) + '%' : '…')),
      h('button', { class: 'btn', onclick: () => C.stop() }, ctx.ico('stop'), t('Stop'))]
  }
  return [h('div', { class: 'title' }, t('File manager')), h('div', { class: 'spacer' }),
    ib(I.plus, t('New folder'), !!pane.path, newFolder),
    ib(I.rename, t('Rename'), sel.length === 1, renameIt),
    h('button', { class: 'btn', disabled: !sel.length || !to.path, title: to.path ? t('Copy to {f}', { f: name(to.path) }) : '', onclick: () => toOther(false) }, h('span', { html: SVG.copy }), h('span', { class: 'lbl' }, t('Copy'))),
    h('button', { class: 'btn', disabled: !sel.length || !to.path, title: to.path ? t('Move to {f}', { f: name(to.path) }) : '', onclick: () => toOther(true) }, h('span', { html: SVG.move }), h('span', { class: 'lbl' }, t('Move'))),
    ib(I.trash, t('Move to the Trash'), sel.length > 0, trash),
    ib(I.reveal, C.revealLabel(), sel.length === 1, () => C.reveal(sel[0].path)),
    ib(I.twins, t('Compare the two panes'), !!(F.panes[0].path && F.panes[1].path), compare),
    ib(I.box, t('Project folders'), !!pane.path, template),
    ib(SVG.star, F.favs.includes(pane.path) ? t('Unpin this folder') : t('Pin this folder'), !!pane.path, pin, F.favs.includes(pane.path) ? 'on' : ''),
    ib(SVG.info, t('Media info'), true, () => { F.info = !F.info; C.save('files', 'info', F.info); C.draw() }, F.info ? 'on' : '')]
}

/* ---------- in a browser: a made-up disk ---------- */
const NOW = Date.UTC(2026, 9, 28, 10)
const day = (n) => NOW - n * 86400000
const EXT = { mov: 'video', mp4: 'video', mxf: 'video', braw: 'video', wav: 'audio', mp3: 'audio', jpg: 'image', heic: 'image', cr3: 'image', png: 'image', drp: 'project', prproj: 'project', aep: 'project', pdf: 'doc', docx: 'doc', zip: 'archive', dmg: 'archive' }
const kindOf = (n) => EXT[n.split('.').pop().toLowerCase()] || 'other'
const TREE = {}
const add = (dir, name, size, d, isDir) => { (TREE[dir] ||= []).push({ name, path: dir + '/' + name, dir: !!isDir, link: false, size: isDir ? null : size, mtime: day(d), kind: isDir ? 'folder' : kindOf(name), hidden: name.startsWith('.') }); if (isDir) TREE[dir + '/' + name] ||= [] }
;(() => {
  const H = '/Users/alex', M = H + '/Movies', P = M + '/Ilie mou - Music Video'
  for (const n of ['Desktop', 'Documents', 'Downloads', 'Movies', 'Music', 'Pictures']) add(H, n, 0, 3, true)
  add(M, 'Ilie mou - Music Video', 0, 1, true); add(M, 'Spring campaign', 0, 9, true); add(M, 'CacheClip', 0, 2, true)
  add(M, 'Showreel 2026.mov', 4.2e9, 12); add(M, 'BTS_day2.mp4', 812e6, 4)
  DEFAULT_TPL.forEach((n, i) => add(P, n, 0, 1 + i, true)); add(P, 'Ilie mou_v7.drp', 2.1e6, 0)
  add(P + '/01_Footage', 'Day01', 0, 2, true); add(P + '/01_Footage', 'Day02', 0, 1, true)
  for (let i = 1; i <= 8; i++) add(P + '/01_Footage/Day01', `A001_C00${i}.mov`, (8 + i * 1.7) * 1e9, 2)
  add(P + '/01_Footage/Day01', 'T01_Boom.wav', 612e6, 2); add(P + '/01_Footage/Day01', 'still_set.jpg', 6.1e6, 2)
  add(H + '/Downloads', 'DaVinci_Resolve_19.dmg', 4.8e9, 20); add(H + '/Downloads', 'Contract_Ilie mou.pdf', 412e3, 6); add(H + '/Downloads', 'IMG_0412.HEIC', 3.2e6, 1); add(H + '/Downloads', 'stems.zip', 1.1e9, 5)
  add('/Volumes/SHOOT_01', 'CARD_A', 0, 2, true); add('/Volumes/SHOOT_01', 'CARD_B', 0, 2, true)
})()
const hue = (s) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 360, 7)
const pic = (s, w = 160, h = 90) => { const a = hue(s), b = (a + 40) % 360; return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${a},45%,22%)"/><stop offset="1" stop-color="hsl(${b},55%,8%)"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${w * 0.68}" cy="${h * 0.34}" r="${h * 0.3}" fill="hsl(${a},90%,78%)" opacity=".35"/><path d="M0 ${h * 0.74}h${w}v${h}H0z" fill="#000" opacity=".4"/></svg>`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const find = (p) => Object.values(TREE).flat().find((x) => x.path === p)
const free = (dir, name) => { const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '', base = ext ? name.slice(0, -ext.length) : name; for (let i = 1; ; i++) { const n = i === 1 ? name : `${base} ${i}${ext}`; if (!(TREE[dir] || []).some((x) => x.name === n)) return n } }
const parentOf = (p) => p.slice(0, p.lastIndexOf('/')) || '/'
const demo = {
  'files-places': async () => [{ name: 'Home', path: '/Users/alex', kind: 'home' }, ...['Desktop', 'Documents', 'Downloads', 'Movies', 'Pictures'].map((n) => ({ name: n, path: '/Users/alex/' + n, kind: 'folder' })), { name: 'SHOOT_01', path: '/Volumes/SHOOT_01', kind: 'drive' }],
  'files-pick': async () => ({ path: '/Volumes/SHOOT_01', parent: '/Volumes', items: TREE['/Volumes/SHOOT_01'] }),
  'files-open': async ({ path: p }) => { if (!TREE[p] && !find(p)?.dir) throw new Error('That folder is not there.'); return { path: p, parent: p === '/' ? '' : parentOf(p), items: (TREE[p] || []).map((x) => ({ ...x })) } },
  'files-size': async ({ path: p }) => { await wait(300); const sum = (d) => (TREE[d] || []).reduce((n, x) => n + (x.dir ? sum(x.path) : x.size), 0); return sum(p) || 128e9 * ((hue(p) % 9) + 1) / 10 },
  'files-thumb': async ({ path: p }) => { await wait(80); return pic(p) },
  'files-frames': async ({ path: p }) => { await wait(400); return Array.from({ length: 6 }, (_, i) => ({ at: 12.4 + i * 26, url: pic(p + i, 320, 180) })) },
  'files-info': async ({ path: p }) => {
    await wait(150)
    const it = find(p) || { name: p.split('/').pop(), size: 1e6, mtime: NOW, kind: 'other' }
    const S = [{ title: 'File', rows: [['Name', it.name], ['Folder', parentOf(p)], ['Size', `${(it.size / 1e9).toFixed(2)} GB (${Math.round(it.size).toLocaleString('en-US')} bytes)`], ['Modified', new Date(it.mtime).toISOString().replace('T', ' ').slice(0, 19)]] }]
    if (it.kind === 'video') {
      S.push({ title: 'Container', rows: [['Format', 'mov,mp4,m4a,3gp,3g2,mj2'], ['Duration', '00:02:41.20'], ['Overall bitrate', '737 Mb/s'], ['Timecode', '14:22:05:11'], ['Streams', '3']] },
        { title: 'Video #1', rows: [['Codec', 'prores (HQ)'], ['Codec tag', 'apch'], ['Resolution', '3840 × 2160'], ['Pixel aspect (SAR)', '1:1'], ['Display aspect (DAR)', '16:9'], ['Frame rate', '25 fps'], ['Scan', 'Progressive'], ['Pixel format', 'yuv422p10le'], ['Bit depth', '10 bit'], ['Colour range', 'Limited (tv)'], ['Colour primaries', 'bt709'], ['Transfer', 'bt709'], ['Matrix', 'bt709'], ['Bitrate', '733 Mb/s'], ['Flags', 'default'], ['handler_name', 'Core Media Video'], ['vendor_id', 'appl']] },
        { title: 'Audio #1', rows: [['Codec', 'pcm_s24le'], ['Codec tag', 'in24'], ['Channels', '4'], ['Sample rate', '48 kHz'], ['Bit depth', '24 bit'], ['Sample format', 's32'], ['Bitrate', '4.6 Mb/s']] },
        { title: 'Data #1', rows: [['Codec', 'none'], ['Codec tag', 'tmcd'], ['timecode', '14:22:05:11']] },
        { title: 'Metadata', rows: [['creation_time', '2026-10-26T14:22:05.000000Z'], ['com.apple.quicktime.make', 'Blackmagic Design'], ['com.apple.quicktime.model', 'Blackmagic Pocket Cinema Camera 6K Pro'], ['reel_name', 'A001'], ['encoder', 'Blackmagic Design']] })
    } else if (it.kind === 'audio') {
      S.push({ title: 'Container', rows: [['Format', 'wav'], ['Duration', '00:14:12.08'], ['Overall bitrate', '2.3 Mb/s'], ['Timecode', '14:20:00:00']] }, { title: 'Audio #1', rows: [['Codec', 'pcm_s24le'], ['Channels', '2 (stereo)'], ['Sample rate', '48 kHz'], ['Bit depth', '24 bit'], ['Bitrate', '2.3 Mb/s']] }, { title: 'Metadata', rows: [['originator', 'ZOOM F6'], ['date', '2026-10-26'], ['time_reference', '2484000000']] })
    } else if (it.kind === 'image') {
      S.push({ title: 'Picture #1', rows: [['Codec', 'mjpeg (Baseline)'], ['Resolution', '6000 × 4000'], ['Pixel format', 'yuvj422p'], ['Bit depth', '8 bit']] }, { title: 'Photo', rows: [['Camera', 'Canon EOS R5'], ['Lens', 'RF24-70mm F2.8 L IS USM'], ['ISO', '800'], ['Shutter', '1/250 s'], ['Aperture', 'ƒ/2.8'], ['Focal length', '35 mm'], ['White balance', 'Auto'], ['Colour profile', 'sRGB IEC61966-2.1'], ['Taken', '2026-10-26 14:31:12 +0000'], ['Latitude', '37.9838'], ['Longitude', '23.7275']] })
    }
    return { sections: S, text: S.map((s) => [s.title, ...s.rows.map(([k, v]) => `  ${k}: ${v}`)].join('\n')).join('\n\n') }
  },
  'files-mkdir': async ({ path: p, name }) => { const n = free(p, name); add(p, n, 0, 0, true); return p + '/' + n },
  'files-rename': async ({ path: p, name }) => { const it = find(p), dir = parentOf(p); if ((TREE[dir] || []).some((x) => x.name === name && x !== it)) throw new Error('That name is taken.'); it.name = name; it.path = dir + '/' + name; return it.path },
  'files-transfer': async ({ paths, to, move }, emit) => {
    const ok = []
    for (let i = 0; i <= 10; i++) { emit('files-progress', { done: i * 1e9, total: 10e9 }); await wait(70) }
    for (const p of paths) { const it = find(p); if (!it) continue; const n = free(to, it.name); add(to, n, it.size, 0, it.dir); if (move) TREE[parentOf(p)] = TREE[parentOf(p)].filter((x) => x !== it); ok.push(to + '/' + n) }
    return { ok, failed: [] }
  },
  'files-trash': async ({ paths }) => { for (const p of paths) TREE[parentOf(p)] = (TREE[parentOf(p)] || []).filter((x) => x.path !== p); return { ok: paths, failed: [] } },
  'files-template': async ({ path: p, names }) => { let n = 0; for (const x of names) { const f = x.split('/')[0]; if (!(TREE[p] || []).some((y) => y.name === f)) { add(p, f, 0, 0, true); n++ } } return n },
  'files-compare': async ({ left, right }) => { await wait(500); return { left, right, same: 412, onlyLeft: [{ rel: 'Day01/A001_C007.mov', size: 19.9e9 }, { rel: 'Day01/A001_C008.mov', size: 21.6e9 }], onlyRight: [{ rel: 'Showreel 2026.mov', size: 4.2e9 }], differ: [{ rel: 'Ilie mou_v7.drp', left: 2.1e6, right: 1.9e6 }] } },
}

const el = {
  'Up a folder': 'Έναν φάκελο πάνω', Search: 'Αναζήτηση', 'Search in this folder': 'Αναζήτηση σε αυτόν τον φάκελο', Name: 'Όνομα', Size: 'Μέγεθος', Kind: 'Είδος', Modified: 'Τροποποίηση', Created: 'Δημιουργία',
  '{n} items': '{n} στοιχεία', '{n} chosen': '{n} επιλεγμένα', 'Nothing by that name here.': 'Δεν υπάρχει τίποτα με αυτό το όνομα εδώ.', 'An empty folder.': 'Άδειος φάκελος.',
  'Showing the first {n}. Search to find the rest.': 'Φαίνονται τα πρώτα {n}. Ψάξε για να βρεις τα υπόλοιπα.', 'Work out the size of this folder': 'Υπολόγισε το μέγεθος του φακέλου', 'Work it out': 'Υπολόγισέ το',
  Folder: 'Φάκελος', Package: 'Πακέτο', Video: 'Βίντεο', Image: 'Εικόνα', Audio: 'Ήχος', Project: 'Project', Document: 'Έγγραφο', Archive: 'Αρχείο συμπίεσης', Link: 'Σύνδεσμος', File: 'Αρχείο',
  'Media info': 'Πληροφορίες media', 'Choose a file to see everything about it: every stream, its colour, timecode, camera and more.': 'Διάλεξε ένα αρχείο για να δεις τα πάντα γι’ αυτό: κάθε stream, το χρώμα του, το timecode, την κάμερα και άλλα.',
  'Copy all': 'Αντιγραφή όλων', Copied: 'Αντιγράφηκε', 'Reading…': 'Διαβάζει…', 'Reading the pictures…': 'Διαβάζει την εικόνα…', 'No picture to show.': 'Δεν υπάρχει εικόνα.', Close: 'Κλείσιμο', Open: 'Άνοιγμα',
  Container: 'Container', Chapters: 'Κεφάλαια', Metadata: 'Metadata', Photo: 'Φωτογραφία', Spotlight: 'Spotlight', Picture: 'Εικόνα', Data: 'Δεδομένα', Subtitle: 'Υπότιτλοι', Attachment: 'Συνημμένο',
  Format: 'Format', Duration: 'Διάρκεια', Start: 'Αρχή', 'Overall bitrate': 'Συνολικό bitrate', Timecode: 'Timecode', Streams: 'Streams', Codec: 'Codec', 'Codec tag': 'Tag codec', Language: 'Γλώσσα',
  Resolution: 'Ανάλυση', 'Pixel aspect (SAR)': 'Αναλογία pixel (SAR)', 'Display aspect (DAR)': 'Αναλογία εικόνας (DAR)', 'Frame rate': 'Καρέ/δευτ.', Scan: 'Σάρωση', 'Pixel format': 'Pixel format', 'Bit depth': 'Bit depth',
  'Colour range': 'Εύρος χρώματος', 'Colour primaries': 'Primaries', Transfer: 'Transfer', Matrix: 'Matrix', HDR: 'HDR', Channels: 'Κανάλια', 'Sample rate': 'Sample rate', 'Sample format': 'Sample format', Bitrate: 'Bitrate', Flags: 'Σημάνσεις', 'Side data': 'Side data',
  Camera: 'Κάμερα', Lens: 'Φακός', ISO: 'ISO', Shutter: 'Κλείστρο', Aperture: 'Διάφραγμα', 'Focal length': 'Εστιακή', 'Exposure program': 'Πρόγραμμα έκθεσης', 'White balance': 'Ισορροπία λευκού', Flash: 'Φλας', Pixels: 'Pixels',
  'Colour profile': 'Προφίλ χρώματος', 'Colour space': 'Χρωματικός χώρος', 'Bits per sample': 'Bits ανά δείγμα', Taken: 'Λήψη', Latitude: 'Γεωγρ. πλάτος', Longitude: 'Γεωγρ. μήκος', Altitude: 'Υψόμετρο',
  Cancel: 'Άκυρο', Rename: 'Μετονομασία', 'New folder': 'Νέος φάκελος', 'untitled folder': 'νέος φάκελος', 'Make it': 'Φτιάξ’ τον',
  'Project folders': 'Φάκελοι project', 'One folder a line; a/b makes a folder inside another. Made in {f}; what is there already stays.': 'Ένας φάκελος ανά γραμμή· το α/β φτιάχνει φάκελο μέσα σε άλλον. Φτιάχνονται στο {f}· ό,τι υπάρχει ήδη μένει.',
  Reset: 'Επαναφορά', 'Keep as mine': 'Κράτα τα δικά μου', 'Kept for next time': 'Κρατήθηκαν για την επόμενη φορά', 'Make them here': 'Φτιάξ’ τους εδώ', '{n} folders made': 'Φτιάχτηκαν {n} φάκελοι',
  '{a} and {b}': '{a} και {b}', '{n} the same on both': '{n} ίδια και στα δύο', 'Only in {f}': 'Μόνο στο {f}', 'Same name, another size': 'Ίδιο όνομα, άλλο μέγεθος', 'and {n} more': 'και {n} ακόμα',
  'Stopped. What was half copied was taken away.': 'Σταμάτησε. Ό,τι είχε αντιγραφεί μισό αφαιρέθηκε.', '{n} could not go: {e}': '{n} δεν μπόρεσαν να πάνε: {e}', '{n} moved': 'Μετακινήθηκαν {n}', '{n} copied': 'Αντιγράφηκαν {n}',
  'Copy or move {n}?': 'Αντιγραφή ή μετακίνηση {n};', 'Into {f}. Nothing already there is written over: a name that is taken gets a number.': 'Στο {f}. Τίποτα από όσα υπάρχουν δεν γράφεται από πάνω: ένα όνομα που υπάρχει παίρνει αριθμό.',
  item: 'στοιχείο', items: 'στοιχεία', Move: 'Μετακίνηση', Copy: 'Αντιγραφή', 'Move {n} to the Trash?': 'Στον Κάδο {n};', 'You can take them back out of the Trash until you empty it.': 'Μπορείς να τα βγάλεις από τον Κάδο μέχρι να τον αδειάσεις.',
  'Move to Trash': 'Στον Κάδο', 'Move to the Trash': 'Στον Κάδο', '{n} moved to the Trash': '{n} πήγαν στον Κάδο', Left: 'Αριστερά', Right: 'Δεξιά', Home: 'Αρχικός φάκελος',
  Desktop: 'Γραφείο', Documents: 'Έγγραφα', Downloads: 'Λήψεις', Movies: 'Ταινίες', Videos: 'Βίντεο', Pictures: 'Εικόνες', Music: 'Μουσική', 'Open…': 'Άνοιγμα…',
  'Comparing…': 'Σύγκριση…', Moving: 'Μετακίνηση', Copying: 'Αντιγραφή', Stop: 'Διακοπή', 'File manager': 'Διαχείριση αρχείων', 'Copy to {f}': 'Αντιγραφή στο {f}', 'Move to {f}': 'Μετακίνηση στο {f}',
  'Compare the two panes': 'Σύγκρινε τα δύο παράθυρα', 'Pin this folder': 'Καρφίτσωσε τον φάκελο', 'Unpin this folder': 'Ξεκαρφίτσωσε τον φάκελο',
  'That is not in a folder opened here.': 'Αυτό δεν είναι σε φάκελο ανοιχτό εδώ.', 'That folder is not there.': 'Αυτός ο φάκελος δεν υπάρχει.', 'That name is taken.': 'Το όνομα υπάρχει ήδη.', 'Give it a name.': 'Δώσε του όνομα.',
  'A folder cannot go inside itself.': 'Ένας φάκελος δεν μπαίνει μέσα στον εαυτό του.', 'A file with that name appeared meanwhile.': 'Εμφανίστηκε στο μεταξύ αρχείο με αυτό το όνομα.',
}

export default { id: 'files', el, view, top, demo }
