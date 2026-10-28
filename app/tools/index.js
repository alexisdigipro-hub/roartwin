/* The tools of the app, one file each (Alex, 28 Oct: "a utility of many tools"). The older ones (Find twins, Clean up,
   Make a twin, Check a backup) live in app.js; every new one is a module here:
     export default {
       id,                 // the side menu's id (app.js NAV)
       el: { English: 'Ελληνικά' },   // its Greek, merged into app.js EL
       view(ctx),          // its page: a <main> element
       top(ctx),           // optional: its top row (title and controls); else its name
       demo: { 'tool-name': async (args, emit) => result },   // in a browser, stands in for the Mac/Windows side
     }
   ctx (app.js): h, I, ico, t, bytes, dur, num, plural, dateOf, toast, sheet, seg, switchEl, store, S, draw, busy, stop,
   call(name, args), on(name, fn), pick, pathOf, isFolder, reveal, open, revealLabel, err, dropOn, load, save, platform. */
import space from './space.js'
import leftovers from './leftovers.js'
import report from './report.js'
import clipcheck from './clipcheck.js'
import contact from './contact.js'
import rename from './rename.js'
import files from './files.js'
import archive from './archive.js'
import drives from './drives.js'
import speed from './speed.js'
import vault from './vault.js'
import stats from './stats.js'

export default [space, leftovers, report, clipcheck, contact, rename, files, archive, drives, speed, stats, vault]
