// Clip check (Alex, 28 Oct): every clip of a card or a folder decoded from its first frame to its last, before the card
// is formatted; a clip cut short or with damaged frames is listed with what is wrong in plain words. Reads only.
// Through electron/tools/media.js (clipcheck-scan).
import { EL_SHARED, folderBox, progressEl, runJob, demoRun } from './report.js'

const st = { root: '', res: null, busy: false, p: null }
let loaded = false
const load = (ctx) => { if (!loaded) { loaded = true; st.root = ctx.load('clipcheck', 'root', '') } }

async function start(ctx) {
  if (!st.root) return
  const r = await runJob(ctx, st, 'clipcheck-scan', { root: st.root, skipHidden: ctx.S.opts.skipHidden }, 'clipcheck-progress')
  if (r) st.res = r
  ctx.draw()
}

export default {
  // back and forward (app.js): what makes this tool's screen
  nav: { get: () => ({ res: st.res }), set: (s) => { st.res = s.res } },
  id: 'clipcheck',
  el: {
    ...EL_SHARED,
    'Clip check': 'Έλεγχος clips', 'Does every clip <b>play</b>?': 'Παίζει κάθε <b>clip</b>;',
    'RoarKit plays every clip of a card or a folder through, frame by frame and with its sound, and lists any that is cut short or damaged. Check before the card is formatted.': 'Το RoarKit παίζει κάθε clip μιας κάρτας ή ενός φακέλου από την αρχή ως το τέλος, καρέ καρέ και με τον ήχο του, και δείχνει όποιο είναι κομμένο ή χαλασμένο. Έλεγξέ το πριν γίνει format η κάρτα.',
    'Check the clips': 'Έλεγξε τα clips', 'Playing every clip through': 'Παίζει κάθε clip ολόκληρο', 'Slow on purpose: every frame is read. Nothing is changed.': 'Αργό σκόπιμα: διαβάζεται κάθε καρέ. Τίποτα δεν αλλάζει.',
    'Every clip <b>plays</b>.': 'Όλα τα clips <b>παίζουν</b>.', '{n} clips have a <b>problem</b>.': '{n} clips έχουν <b>πρόβλημα</b>.', '1 clip has a <b>problem</b>.': '1 clip έχει <b>πρόβλημα</b>.',
    '{a} of {b} play right': '{a} από {b} παίζουν σωστά', 'checked in {t}': 'ελέγχθηκαν σε {t}', 'New check': 'Νέος έλεγχος',
    'Cut short: the camera or the copy stopped before the file was closed.': 'Κομμένο: η κάμερα ή η αντιγραφή σταμάτησε πριν κλείσει το αρχείο.',
    'Not a playable file, or damaged from its start.': 'Δεν είναι αρχείο που παίζει, ή είναι χαλασμένο από την αρχή.',
    'It ends too soon: the end of the file is missing.': 'Τελειώνει νωρίς: λείπει το τέλος του αρχείου.',
    'Damaged frames inside: some pictures or sound will not play right.': 'Χαλασμένα καρέ μέσα: κάποιες εικόνες ή ο ήχος δεν θα παίξουν σωστά.',
    'ffmpeg could not read it.': 'Το ffmpeg δεν μπόρεσε να το διαβάσει.', 'Errors while reading it.': 'Σφάλματα στην ανάγνωση.',
  },
  top(ctx) {
    const { h, t, ico } = ctx
    load(ctx)
    return [h('div', { class: 'title' }, t('Clip check')), h('div', { class: 'spacer' }),
      st.res && !st.busy ? h('button', { class: 'btn', onclick: () => { st.res = null; ctx.draw() } }, ico('search'), h('span', { class: 'lbl' }, t('New check'))) : null]
  },
  view(ctx) {
    const { h, t, ico, I, bytes, dur, num } = ctx
    load(ctx)
    if (st.busy) return progressEl(ctx, st, t('Playing every clip through'))
    if (st.res) {
      const r = st.res, ok = !r.broken.length
      const head = h('section', { class: 'group verdict' + (ok ? ' ok' : ' bad') },
        h('div', { class: 'big-i', html: ok ? I.shield : I.warn }),
        h('div', {},
          h('h2', { html: ok ? t('Every clip <b>plays</b>.') : r.broken.length === 1 ? t('1 clip has a <b>problem</b>.') : t('{n} clips have a <b>problem</b>.', { n: num(r.broken.length) }) }),
          h('div', { class: 'sum' },
            h('span', { class: 'chip tint', style: { '--c': 'var(--ok)' } }, h('i'), t('{a} of {b} play right', { a: num(r.ok), b: num(r.total) })),
            h('span', { class: 'chip' }, t('checked in {t}', { t: dur(r.took / 1000) }))),
          h('p', { class: 'paths' }, h('span', { title: r.root }, r.root))))
      return h('main', {}, h('div', { class: 'res' }, head,
        r.broken.length ? h('section', { class: 'group' }, h('div', { class: 'files', style: { paddingTop: '8px' } }, ...r.broken.map((b) => h('div', { class: 'file nocheck' },
          h('div', { class: 'thumb' }, ico('warn')),
          h('div', { class: 'f-main' }, h('div', { class: 'f-name', title: b.name }, b.name), h('div', { class: 'f-dir', title: b.dir }, '‎' + b.dir),
            h('div', { class: 'f-meta' }, h('span', { class: 'chip tint' }, h('i'), t(b.why)), h('span', { class: 'chip' }, bytes(b.size))),
            b.lines?.length ? h('pre', { class: 'cc-log' }, b.lines.slice(0, 3).join('\n')) : null),
          h('div', { class: 'f-act' }, h('button', { class: 'ib sm', title: ctx.revealLabel(), 'aria-label': ctx.revealLabel(), html: I.reveal, onclick: () => ctx.reveal(b.path) })))))) : null))
    }
    return h('main', {}, h('div', { class: 'home' }, h('div', { class: 'card' },
      h('div', { class: 'hero' }, h('h1', { html: t('Does every clip <b>play</b>?') }),
        h('p', {}, t('RoarKit plays every clip of a card or a folder through, frame by frame and with its sound, and lists any that is cut short or damaged. Check before the card is formatted.'))),
      folderBox(ctx, st, 'clipcheck'),
      h('div', { class: 'go' }, h('button', { class: 'btn main big', disabled: !st.root, onclick: () => start(ctx) }, ico('pulse'), t('Check the clips'))),
      h('p', { class: 'note' }, t('Slow on purpose: every frame is read. Nothing is changed.')))))
  },
  demo: {
    'clipcheck-scan': async ({ root }, emit) => {
      await demoRun('clipcheck-progress', 12, emit)
      return {
        root, total: 12, ok: 10, took: 1260e3, broken: [
          { path: '/Volumes/CARD_A/CLIP/A001_C014.mov', name: 'A001_C014.mov', dir: '/Volumes/CARD_A/CLIP', size: 2.3e9, why: 'Cut short: the camera or the copy stopped before the file was closed.', lines: ['[mov,mp4,m4a,3gp,3g2,mj2 @ 0x7f8] moov atom not found', '/Volumes/CARD_A/CLIP/A001_C014.mov: Invalid data found when processing input'] },
          { path: '/Volumes/CARD_A/CLIP/A001_C009.mov', name: 'A001_C009.mov', dir: '/Volumes/CARD_A/CLIP', size: 4.1e9, why: 'Damaged frames inside: some pictures or sound will not play right.', lines: ['[prores @ 0x7f9] invalid data size', '[prores @ 0x7f9] error while decoding frame 2841'] },
        ],
      }
    },
  },
}
