// Startup items (Alex, 29 Oct): what starts by itself with the computer, with a switch to turn each off and on again.
// Mac: login items, launch agents (yours and every user's) and launch daemons; Windows: the Run keys and the Startup
// folders. A switch off never deletes: RoarKit keeps what it took away (electron/tools/startup.js) and puts it back
// when it is switched on. What is set for every user is shown with a note, not changed. Doors: startup-list,
// startup-switch.
const st = { res: null, busy: false, show: null, working: new Set() }
const KIND = { login: '#34c759', agent: '#5e9bff', daemon: '#bf5af2', run: '#5e9bff', folder: '#ff9f0a' }
const keptDemo = () => { try { return JSON.parse(sessionStorage.getItem('roarkit:startup-off') || '[]') } catch { return [] } }
const POWER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v8"/><path d="M7.2 6.5a7 7 0 1 0 9.6 0"/></svg>'

function init(ctx) { if (st.show == null) st.show = ctx.load('startup', 'show', 'all') }
async function load(ctx) {
  st.busy = true; ctx.draw()
  try { st.res = await ctx.call('startup-list') } catch (e) { st.res ||= { items: [], platform: ctx.platform, loginError: '' }; ctx.toast(ctx.err(e)) } finally { st.busy = false; ctx.draw() }
}
async function flip(ctx, item, on) {
  const { t } = ctx
  st.working.add(item.id); ctx.draw()
  try {
    await ctx.call('startup-switch', { id: item.id, on })
    ctx.toast(on ? t('{a} starts with the computer again.', { a: item.name }) : t('{a} no longer starts by itself. RoarKit keeps it, to turn it on again.', { a: item.name }))
    st.res = await ctx.call('startup-list')
  } catch (e) { ctx.toast(ctx.err(e)) } finally { st.working.delete(item.id); ctx.draw() }
}
/* the sections, in the order a person meets them */
function sections(items, platform) {
  const mac = platform !== 'win32'
  const S = mac ? [
    ['login', 'Login items', 'Opened by macOS when you log in.', (i) => i.kind === 'login'],
    ['mine', 'Your launch agents', '~/Library/LaunchAgents: helpers and updaters your apps put there.', (i) => i.kind === 'agent' && i.scope === 'user'],
    ['all', 'For every user', '/Library/LaunchAgents: set up by an installer, for everyone on this Mac.', (i) => i.kind === 'agent' && i.scope === 'system'],
    ['daemon', 'Background services', '/Library/LaunchDaemons: run by the system itself, before anyone logs in.', (i) => i.kind === 'daemon'],
  ] : [
    ['run', 'Run at sign-in (you)', 'The Run key of your account in the registry.', (i) => i.kind === 'run' && i.scope === 'user'],
    ['folder', 'Startup folder', 'Shortcuts in your Startup folder.', (i) => i.kind === 'folder' && i.scope === 'user'],
    ['runall', 'For every user', 'The computer\'s Run keys and the common Startup folder.', (i) => i.scope === 'system'],
  ]
  return S.map(([id, title, sub, f]) => ({ id, title, sub, items: items.filter(f) })).filter((s) => s.items.length)
}
function row(ctx, i) {
  const { h, t, I } = ctx
  const busy = st.working.has(i.id)
  const sw = ctx.switchEl(i.on, (v) => flip(ctx, i, v), i.name)
  sw.disabled = !i.canSwitch || busy
  if (!i.canSwitch) sw.title = t(i.note || 'Set for every user of the computer. Turn it off in its own program, or with an administrator.')
  return h('div', { class: 'sp-file su-row' + (i.on ? '' : ' off') },
    h('span', { class: 'su-ic', style: { '--c': KIND[i.kind] || 'var(--acc)' }, html: POWER }),
    h('span', { class: 'sp-name' }, h('b', { title: i.name }, i.name), h('small', { class: 'sp-path', title: i.program }, '‎' + (i.program || i.path || ''))),
    h('span', { class: 'sp-meta' },
      i.kept ? h('span', { class: 'chip tint', style: { '--c': 'var(--dim)' }, title: t('Turned off by RoarKit; kept to turn on again') }, h('i'), t('Turned off')) : null,
      i.runAtLoad ? h('span', { class: 'chip' }, t('At login')) : null,
      i.keepAlive ? h('span', { class: 'chip', title: t('Started again whenever it stops') }, t('Keeps running')) : null,
      i.kind !== 'login' && i.kind !== 'run' && i.kind !== 'folder' && !i.kept ? h('span', { class: 'chip tint', style: { '--c': i.loaded ? 'var(--ok)' : 'var(--dim)' } }, h('i'), i.loaded ? (i.pid ? t('Running now') : t('Loaded')) : t('Not loaded')) : null,
      i.apple ? h('span', { class: 'chip' }, 'Apple') : null,
      !i.canSwitch ? h('span', { class: 'chip', title: t(i.note || '') }, ctx.ico('lock', 'su-lock'), t('Read only')) : null),
    i.path && !i.kept && i.kind !== 'run' ? h('button', { class: 'ib sm', title: ctx.revealLabel(), 'aria-label': ctx.revealLabel(), html: I.reveal, onclick: () => ctx.reveal(i.path) }) : h('span'),
    sw)
}
function viewList(ctx) {
  const { h, t, plural } = ctx
  const items = st.res.items || []
  const list = st.show === 'off' ? items.filter((i) => !i.on) : st.show === 'mine' ? items.filter((i) => i.canSwitch) : items
  const secs = sections(list, st.res.platform)
  const on = items.filter((i) => i.on).length, off = items.filter((i) => !i.on).length
  return h('main', {}, h('div', { class: 'res sp su' },
    h('div', { class: 'sum' },
      h('span', { class: 'chip tint' }, h('i'), t('{n} start by themselves', { n: plural(on, 'item') })),
      off ? h('span', { class: 'chip' }, t('{n} turned off by RoarKit', { n: num(ctx, off) })) : null),
    st.res.loginError ? h('div', { class: 'un-no' }, ctx.ico('warn'), h('span', {}, h('b', {}, t('The login items could not be read.')), h('small', {}, t('macOS asks once to let RoarKit see them: System Settings > Privacy & Security > Automation > RoarKit > System Events.')))) : null,
    secs.length ? secs.map((s) => h('section', { class: 'group sp-list' }, h('div', { class: 'sp-head' }, h('b', {}, t(s.title)), h('small', {}, t(s.sub))), ...s.items.map((i) => row(ctx, i))))
      : h('p', { class: 'note' }, st.show === 'off' ? t('Nothing is turned off.') : t('Nothing starts by itself here.')),
    h('p', { class: 'note' }, t('Turned off is not deleted: RoarKit keeps it in its own folder and puts it back when you turn it on.'))))
}
const num = (ctx, n) => ctx.num(n)

export default {
  nav: { get: () => ({ res: st.res, show: st.show }), set: (s) => { st.res = s.res; st.show = s.show } },
  id: 'startup',
  el: {
    'Startup items': 'Εκκίνηση',
    'What starts by itself with the computer.': 'Τι ξεκινάει μόνο του με τον υπολογιστή.',
    'Login items': 'Στοιχεία σύνδεσης', 'Opened by macOS when you log in.': 'Ανοίγουν από το macOS όταν συνδέεσαι.',
    'Your launch agents': 'Τα δικά σου launch agents', '~/Library/LaunchAgents: helpers and updaters your apps put there.': '~/Library/LaunchAgents: βοηθητικά και updaters που έβαλαν εκεί οι εφαρμογές σου.',
    'For every user': 'Για κάθε χρήστη', '/Library/LaunchAgents: set up by an installer, for everyone on this Mac.': '/Library/LaunchAgents: τα έβαλε ένα πρόγραμμα εγκατάστασης, για όλους σε αυτόν τον Mac.',
    'Background services': 'Υπηρεσίες στο παρασκήνιο', '/Library/LaunchDaemons: run by the system itself, before anyone logs in.': '/Library/LaunchDaemons: τα τρέχει το ίδιο το σύστημα, πριν συνδεθεί κανείς.',
    'Run at sign-in (you)': 'Εκτέλεση στη σύνδεση (εσύ)', 'The Run key of your account in the registry.': 'Το κλειδί Run του λογαριασμού σου στο registry.',
    'Startup folder': 'Φάκελος εκκίνησης', 'Shortcuts in your Startup folder.': 'Συντομεύσεις στον φάκελο εκκίνησης.',
    'The computer\'s Run keys and the common Startup folder.': 'Τα κλειδιά Run του υπολογιστή και ο κοινός φάκελος εκκίνησης.',
    'Turned off': 'Κλειστό', 'Turned off by RoarKit; kept to turn on again': 'Το έκλεισε το RoarKit· το κρατάει για να ανοίξει ξανά',
    'At login': 'Στη σύνδεση', 'Keeps running': 'Μένει ανοιχτό', 'Started again whenever it stops': 'Ξεκινάει ξανά όποτε σταματήσει',
    'Running now': 'Τρέχει τώρα', 'Loaded': 'Φορτωμένο', 'Not loaded': 'Δεν είναι φορτωμένο', 'Read only': 'Μόνο προβολή',
    'Set for every user of the computer. Turn it off in its own program, or with an administrator.': 'Ισχύει για κάθε χρήστη του υπολογιστή. Κλείσ\' το από το δικό του πρόγραμμα, ή με διαχειριστή.',
    'This one is set for every user of the computer; RoarKit only shows it.': 'Αυτό ισχύει για κάθε χρήστη του υπολογιστή· το RoarKit μόνο το δείχνει.',
    '{n} start by themselves': '{n} ξεκινούν μόνα τους', '{n} turned off by RoarKit': '{n} έκλεισε το RoarKit',
    'The login items could not be read.': 'Τα στοιχεία σύνδεσης δεν διαβάστηκαν.',
    'macOS asks once to let RoarKit see them: System Settings > Privacy & Security > Automation > RoarKit > System Events.': 'Το macOS ζητάει μία φορά να αφήσει το RoarKit να τα δει: Ρυθμίσεις συστήματος > Απόρρητο και ασφάλεια > Αυτοματισμός > RoarKit > System Events.',
    'Nothing is turned off.': 'Τίποτα δεν είναι κλειστό.', 'Nothing starts by itself here.': 'Τίποτα δεν ξεκινάει μόνο του εδώ.',
    'Turned off is not deleted: RoarKit keeps it in its own folder and puts it back when you turn it on.': 'Κλειστό δεν σημαίνει σβησμένο: το RoarKit το κρατάει στον δικό του φάκελο και το επαναφέρει όταν το ανοίξεις.',
    '{a} starts with the computer again.': 'Το {a} ξεκινάει ξανά με τον υπολογιστή.', '{a} no longer starts by itself. RoarKit keeps it, to turn it on again.': 'Το {a} δεν ξεκινάει πια μόνο του. Το RoarKit το κρατάει, για να ανοίξει ξανά.',
    'All': 'Όλα', 'Yours': 'Δικά σου', 'Refresh': 'Ανανέωση', 'Looking…': 'Ψάχνει…',
    'List the startup items again.': 'Δείξε ξανά τα στοιχεία εκκίνησης.', 'RoarKit has nothing kept for this one.': 'Το RoarKit δεν έχει κρατήσει τίποτα για αυτό.',
    'Something of that name is back in its place already.': 'Υπάρχει ήδη κάτι με αυτό το όνομα στη θέση του.',
    'macOS did not let RoarKit change the login items': 'Το macOS δεν άφησε το RoarKit να αλλάξει τα στοιχεία σύνδεσης', 'Windows did not let RoarKit change it': 'Τα Windows δεν άφησαν το RoarKit να το αλλάξει',
  },
  top(ctx) {
    const { h, t, ico, seg } = ctx
    init(ctx)
    return [h('div', { class: 'title' }, t('Startup items')),
      st.res ? seg([['all', t('All')], ['mine', t('Yours')], ['off', t('Turned off')]], st.show, (v) => { st.show = v; ctx.save('startup', 'show', v); ctx.draw() }) : null,
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn', disabled: st.busy, onclick: () => load(ctx) }, ico('search'), h('span', { class: 'lbl' }, st.busy ? t('Looking…') : t('Refresh')))]
  },
  view(ctx) {
    const { h, t } = ctx
    init(ctx)
    if (!st.res && !st.busy) queueMicrotask(() => load(ctx))
    if (!st.res) return h('main', {}, h('div', { class: 'empty' }, h('div', {}, h('div', { class: 'ring spin', html: '<svg viewBox="0 0 100 100"><circle class="t" cx="50" cy="50" r="44"/><circle class="p" cx="50" cy="50" r="44" stroke-dasharray="276.5" stroke-dashoffset="207"/></svg><b></b>' }), h('p', {}, t('What starts by itself with the computer.')))))
    return viewList(ctx)
  },
  demo: {
    'startup-list': async () => {
      const kept = keptDemo()
      const items = [
        { id: 'login:Dropbox', kind: 'login', scope: 'user', name: 'Dropbox', program: '/Applications/Dropbox.app', path: '/Applications/Dropbox.app', on: true, canSwitch: true },
        { id: 'login:Spotify', kind: 'login', scope: 'user', name: 'Spotify', program: '/Applications/Spotify.app', path: '/Applications/Spotify.app', on: true, canSwitch: true },
        { id: 'login:Frame.io Transfer', kind: 'login', scope: 'user', name: 'Frame.io Transfer', program: '/Applications/Frame.io Transfer.app', path: '/Applications/Frame.io Transfer.app', on: true, canSwitch: true },
        { id: 'agent:a', kind: 'agent', scope: 'user', name: 'com.google.keystone.agent', program: '/Users/alex/Library/Application Support/Google/GoogleUpdater/Current/GoogleUpdater.app/Contents/MacOS/GoogleUpdater', path: '/Users/alex/Library/LaunchAgents/com.google.keystone.agent.plist', runAtLoad: true, loaded: true, pid: null, on: true, canSwitch: true },
        { id: 'agent:b', kind: 'agent', scope: 'user', name: 'com.adobe.ccxprocess', program: '/Applications/Utilities/Adobe Creative Cloud Experience/CCXProcess/CCXProcess.app/Contents/MacOS/Creative Cloud Content Manager.node', path: '/Users/alex/Library/LaunchAgents/com.adobe.ccxprocess.plist', runAtLoad: true, keepAlive: false, loaded: true, pid: 812, on: true, canSwitch: true },
        { id: 'agent:c', kind: 'agent', scope: 'user', name: 'com.spotify.webhelper', program: '/Applications/Spotify.app/Contents/MacOS/SpotifyWebHelper', path: '/Users/alex/Library/LaunchAgents/com.spotify.webhelper.plist', runAtLoad: true, keepAlive: true, loaded: true, pid: 1204, on: true, canSwitch: true },
        { id: 'agent:d', kind: 'agent', scope: 'system', name: 'com.adobe.AdobeCreativeCloud', program: '/Applications/Utilities/Adobe Creative Cloud/ACC/Creative Cloud.app/Contents/MacOS/Creative Cloud', path: '/Library/LaunchAgents/com.adobe.AdobeCreativeCloud.plist', runAtLoad: true, loaded: true, pid: 640, on: true, canSwitch: false, note: 'Set for every user of the computer. Turn it off in its own program, or with an administrator.' },
        { id: 'agent:e', kind: 'agent', scope: 'system', name: 'com.blackmagic-design.DesktopVideoUpdater', program: '/Applications/Blackmagic Desktop Video/Desktop Video Updater.app', path: '/Library/LaunchAgents/com.blackmagic-design.DesktopVideoUpdater.plist', runAtLoad: true, loaded: false, on: true, canSwitch: false, note: 'Set for every user of the computer. Turn it off in its own program, or with an administrator.' },
        { id: 'daemon:f', kind: 'daemon', scope: 'system', name: 'com.blackmagic-design.DesktopVideoHelper', program: '/Library/Application Support/Blackmagic Design/Desktop Video/DesktopVideoHelper', path: '/Library/LaunchDaemons/com.blackmagic-design.DesktopVideoHelper.plist', runAtLoad: true, keepAlive: true, loaded: true, pid: 301, on: true, canSwitch: false, note: 'Set for every user of the computer. Turn it off in its own program, or with an administrator.' },
        { id: 'daemon:g', kind: 'daemon', scope: 'system', name: 'com.paragon-software.ntfs.loader', program: '/Library/PrivilegedHelperTools/ntfs-loader', path: '/Library/LaunchDaemons/com.paragon-software.ntfs.loader.plist', runAtLoad: true, loaded: true, pid: 288, on: true, canSwitch: false, note: 'Set for every user of the computer. Turn it off in its own program, or with an administrator.' },
      ]
      return { platform: 'web', loginError: '', at: Date.now(), items: items.map((i) => (kept.includes(i.id) ? { ...i, on: false, kept: true, loaded: false } : i)) }
    },
    'startup-switch': async ({ id, on }) => {
      const kept = new Set(keptDemo())
      on ? kept.delete(id) : kept.add(id)
      try { sessionStorage.setItem('roarkit:startup-off', JSON.stringify([...kept])) } catch { /* private */ }
      return { ok: true }
    },
  },
}
