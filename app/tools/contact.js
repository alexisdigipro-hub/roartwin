// Contact sheet (Alex, 28 Oct): a frame (or three) of every clip of a folder in a grid, with its name, length and
// timecode, saved as a PDF to send to a client or the editor. Through electron/tools/media.js (contact-scan, contact-pdf).
import { EL_SHARED, folderBox, progressEl, runJob, demoRun, SAMPLE_CLIPS } from './report.js'

const st = { root: '', res: null, busy: false, p: null, frames: 1, cols: 4, landscape: true }
let loaded = false
const load = (ctx) => {
  if (loaded) return
  loaded = true
  st.root = ctx.load('contact', 'root', ''); st.frames = ctx.load('contact', 'frames', 1); st.cols = ctx.load('contact', 'cols', 4); st.landscape = ctx.load('contact', 'landscape', true)
}
const setOpt = (ctx, k, v) => { st[k] = v; ctx.save('contact', k, v); ctx.draw() }

async function start(ctx) {
  if (!st.root) return
  const r = await runJob(ctx, st, 'contact-scan', { root: st.root, frames: st.frames, skipHidden: ctx.S.opts.skipHidden }, 'contact-progress')
  if (r) { st.res = r; if (!r.clips.length) ctx.toast(ctx.t('No clips in this folder.')) }
  ctx.draw()
}
async function savePDF(ctx) {
  const t = ctx.t
  try { if (await ctx.call('contact-pdf', { cols: st.cols, landscape: st.landscape, words: { title: t('Contact sheet'), clips: t('clips') } })) ctx.toast(t('Saved')) } catch (e) { ctx.toast(ctx.err(e)) }
}

export default {
  // back and forward (app.js): what makes this tool's screen
  nav: { get: () => ({ res: st.res }), set: (s) => { st.res = s.res } },
  id: 'contact',
  el: {
    ...EL_SHARED,
    'Contact sheet': 'Contact sheet', 'Every clip on <b>one page</b>.': 'Όλα τα clips σε <b>μία σελίδα</b>.',
    'A frame of every clip of a folder, in a grid, with its name, length and timecode. Save it as a PDF for a client or the editor.': 'Ένα καρέ από κάθε clip ενός φακέλου, σε πλέγμα, με όνομα, διάρκεια και timecode. Σώσ\' το ως PDF για πελάτη ή μοντέρ.',
    'Frames': 'Καρέ', 'One or three frames of each clip.': 'Ένα ή τρία καρέ από κάθε clip.', 'One': 'Ένα', 'Three': 'Τρία',
    'Columns': 'Στήλες', 'How many clips across the page.': 'Πόσα clips σε κάθε σειρά.', 'Page': 'Σελίδα', 'Landscape': 'Οριζόντια', 'Portrait': 'Κάθετη', 'How the PDF is turned.': 'Πώς γυρίζει το PDF.',
    'Make the sheet': 'Φτιάξε το sheet', 'Taking the frames': 'Παίρνει τα καρέ', 'Nothing is changed: RoarKit only reads the clips.': 'Τίποτα δεν αλλάζει: το RoarKit μόνο διαβάζει τα clips.',
    'Save PDF': 'Αποθήκευση PDF', 'New sheet': 'Νέο sheet', '{n} clips': '{n} clips',
  },
  top(ctx) {
    const { h, t, ico, seg } = ctx
    load(ctx)
    const kids = [h('div', { class: 'title' }, t('Contact sheet'))]
    if (st.res && !st.busy) kids.push(
      seg([[3, '3'], [4, '4'], [6, '6']], st.cols, (v) => setOpt(ctx, 'cols', v)),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: () => savePDF(ctx), disabled: !st.res.clips.length }, ico('file'), h('span', { class: 'lbl' }, t('Save PDF'))),
      h('button', { class: 'btn', onclick: () => { st.res = null; ctx.draw() } }, ico('search'), h('span', { class: 'lbl' }, t('New sheet'))))
    else kids.push(h('div', { class: 'spacer' }))
    return kids
  },
  view(ctx) {
    const { h, t, ico, dur, seg } = ctx
    load(ctx)
    if (st.busy) return progressEl(ctx, st, t('Taking the frames'))
    if (st.res) {
      return h('main', {}, h('div', { class: 'res' },
        h('div', { class: 'cs-grid', style: { '--cols': String(st.cols) } }, ...st.res.clips.map((c) => h('figure', { class: 'cs-t' },
          h('div', { class: 'cs-fr', style: { '--n': String(Math.max(1, c.frames.length)) } }, ...(c.frames.length ? c.frames : ['']).map((f) => h('div', { class: 'cs-img', style: f ? { backgroundImage: `url("${f}")` } : null }))),
          h('figcaption', {}, h('b', { title: c.name }, c.name), h('small', {}, [c.dur != null ? dur(c.dur) : '', c.tc ? 'TC ' + c.tc : ''].filter(Boolean).join(' · ')))))),
      ))
    }
    const opt = (title, sub, control) => h('div', { class: 'opt' }, h('span', {}, h('b', {}, title), h('small', {}, sub)), control)
    return h('main', {}, h('div', { class: 'home' }, h('div', { class: 'card' },
      h('div', { class: 'hero' }, h('h1', { html: t('Every clip on <b>one page</b>.') }),
        h('p', {}, t('A frame of every clip of a folder, in a grid, with its name, length and timecode. Save it as a PDF for a client or the editor.'))),
      folderBox(ctx, st, 'contact'),
      h('div', { class: 'opts' },
        opt(t('Frames'), t('One or three frames of each clip.'), seg([[1, t('One')], [3, t('Three')]], st.frames, (v) => setOpt(ctx, 'frames', v))),
        opt(t('Columns'), t('How many clips across the page.'), seg([[3, '3'], [4, '4'], [6, '6']], st.cols, (v) => setOpt(ctx, 'cols', v))),
        opt(t('Page'), t('How the PDF is turned.'), seg([[true, t('Landscape')], [false, t('Portrait')]], st.landscape, (v) => setOpt(ctx, 'landscape', v)))),
      h('div', { class: 'go' }, h('button', { class: 'btn main big', disabled: !st.root, onclick: () => start(ctx) }, ico('grid'), t('Make the sheet'))),
      h('p', { class: 'note' }, t('Nothing is changed: RoarKit only reads the clips.')))))
  },
  demo: {
    'contact-scan': async ({ root, frames }, emit) => {
      const clips = SAMPLE_CLIPS.filter((c) => c.video)
      await demoRun('contact-progress', clips.length, emit)
      return { root, took: 3100, clips: clips.map((c) => ({ ...c, frames: Array(Number(frames) === 3 ? 3 : 1).fill(c.thumb) })) }
    },
    'contact-pdf': async () => '/Users/alex/Desktop/Contact sheet CARD_A.pdf',
  },
}
