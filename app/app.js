// RoarKit's page: where to look, the scan, the twins. Everything on the disk goes through window.twin
// (electron/preload.js); opened in a browser, a sample stands in for it (demo.js), so the page can be seen and tested.
import { demoTwin } from './demo.js'
import TOOLS from './tools/index.js'
import { chooseByRule, keeperOf } from './rules.js'

const T = window.twin || demoTwin()
document.documentElement.classList.add(T.platform === 'darwin' ? 'mac' : T.platform === 'win32' ? 'win' : 'web')

/* ---------- small helpers ---------- */
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v)
    else if (k === 'html') e.innerHTML = v
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) sk.startsWith('--') ? e.style.setProperty(sk, sv) : (e.style[sk] = sv)
    else e.setAttribute(k, v === true ? '' : v)
  }
  for (const c of kids.flat(9)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)))
  return e
}
const I = {
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.2 4.2L19 7"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12.5A2 2 0 0 0 8 21h8a2 2 0 0 0 2-1.5L19 7M9 7V4h6v3"/></svg>',
  reveal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="m10 13 2 2 2-2M12 10v5"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="m10 9 5 3-5 3z"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z"/><path d="M14 3.5V8h4"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14"/></svg>',
  done: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.2 4.2L19 7"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 5 6v5.5c0 4.3 3 7.7 7 9 4-1.3 7-4.7 7-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 3 20h18z"/><path d="M12 10v4.5M12 17.5v.01"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/></svg>',
  // the side menu (Alex, 28 Oct)
  pie: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12z"/><path d="M15 3.9A8.5 8.5 0 0 1 20.1 9H15z"/></svg>',
  broom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 3.5 10 11M6 12.5h9l1.5 8h-12z"/><path d="M9 20.5v-3M12.5 20.5v-3"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7.5 12 4l8 3.5v9L12 20l-8-3.5z"/><path d="M4 7.5 12 11l8-3.5M12 11v9"/></svg>',
  twins: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="6" width="11" height="13" rx="2"/><path d="M9.5 3.5h9a2 2 0 0 1 2 2v11"/></svg>',
  card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3.5h7.5L18 7v12.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z"/><path d="M9.5 3.5v3M12 3.5v3M14.5 3.5v3"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r="1"/><circle cx="4.8" cy="12" r="1"/><circle cx="4.8" cy="17.5" r="1"/></svg>',
  pulse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2.5-6 5 12 2.5-6h4"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="7" height="6" rx="1.5"/><rect x="13.5" y="4.5" width="7" height="6" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="6" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="6" rx="1.5"/></svg>',
  rename: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h9M4 12h6M4 17h5"/><path d="m14 18.5 1-3.5 5-5a1.4 1.4 0 0 1 2 2l-5 5z"/></svg>',
  drive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="13" width="17" height="6.5" rx="2"/><path d="M5.5 13 8 5.5h8l2.5 7.5"/><path d="M16.5 16.3h.01"/></svg>',
  zip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M12 3.5v2M12 7.5v2M12 11.5v2"/><rect x="10.3" y="14.5" width="3.4" height="3.5" rx=".8"/></svg>',
  chip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9.5 9.5h5v5h-5zM9 3.5v2.5M15 3.5v2.5M9 18v2.5M15 18v2.5M3.5 9H6M3.5 15H6M18 9h2.5M18 15h2.5"/></svg>',
  gauge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 17.5a8.5 8.5 0 1 1 15 0"/><path d="m12 14 4-5"/><circle cx="12" cy="14" r="1.2"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.2 12 4.5l8 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-3.8v-5.3H9.3v5.3H5.5A1.5 1.5 0 0 1 4 19z"/></svg>',
  // Uninstall apps and Startup items (Alex, 29 Oct)
  apps: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="4.5"/><path d="M9 12h6"/></svg>',
  power: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v8"/><path d="M7.2 6.5a7 7 0 1 0 9.6 0"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/></svg>',
}
const ico = (name, cls) => h('span', { class: cls, html: I[name], 'aria-hidden': 'true' })
const bytes = (n) => {
  if (n < 1000) return n + ' B'
  const u = ['KB', 'MB', 'GB', 'TB']; let i = -1
  do { n /= 1000; i++ } while (n >= 1000 && i < u.length - 1)
  return (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + ' ' + u[i]
}
const dur = (s) => { s = Math.round(s); const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60; return (hh ? hh + ':' + String(mm).padStart(2, '0') : mm) + ':' + String(ss).padStart(2, '0') }
const num = (n) => n.toLocaleString('en-US')
const plural = (n, one, many = one + 's') => { const w = S.lang === 'el' && EL_WORDS[one]; return `${num(n)} ${n === 1 ? (w ? w[0] : one) : (w ? w[1] : many)}` }
// a path in a box that is cut from the left (direction: rtl): marked left to right, so its slashes stay put
const ltr = (p) => '\u200e' + p + '\u200e'
const dateOf = (ms) => new Date(ms).toLocaleDateString(S.lang === 'el' ? 'el-GR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
/* Ελληνικά (Alex, 25 Oct): English unless Greek is chosen under Language; each English text is its own key */
const EL = {"Privacy & Terms": "Απόρρητο & Όροι", "A WAV and its MP3 or M4A: RoarKit listens to the sound itself.": "Ένα WAV και το MP3 ή M4A του: το RoarKit ακούει τον ίδιο τον ήχο.", "A card or a shoot copied twice shows as one folder, not file by file.": "Μια κάρτα ή ένα γύρισμα αντιγραμμένο δύο φορές φαίνεται ως ένας φάκελος, όχι αρχείο αρχείο.", "A card, a shoot, a drive.": "Μια κάρτα, ένα γύρισμα, ένας δίσκος.", "A proxy is never taken for a twin of its original. Proxies whose original is not in these folders are listed apart.": "Ένα proxy δεν θεωρείται ποτέ διπλό του original του. Τα proxies που δεν έχουν original σε αυτούς τους φακέλους φαίνονται χωριστά.", "A shoot, an archive, a whole disk. Nothing is changed until you choose. The lock marks a folder as Masters.": "Ένα γύρισμα, ένα αρχείο, ολόκληρος δίσκος. Τίποτα δεν αλλάζει μέχρι να διαλέξεις εσύ. Το λουκέτο κάνει έναν φάκελο Masters.", "A trim or a teaser cut out of a longer video, and where it starts. Slower: every video is read through.": "Ένα κομμάτι ή ένα teaser κομμένο από μεγαλύτερο βίντεο, και πού ξεκινάει. Πιο αργό: διαβάζει κάθε βίντεο ολόκληρο.", "All <b>tidy</b>.": "Όλα <b>τακτοποιημένα</b>.", "All": "Όλα", "Also when it was exported again, in another size, codec or format. RoarKit compares the pictures.": "Και όταν έχει γίνει ξανά export, σε άλλο μέγεθος, codec ή format. Το RoarKit συγκρίνει την εικόνα.", "Any": "Όλα", "At the same place on the backup": "Στην ίδια θέση στο backup", "Audio only: WAV, AIFF, MP3, M4A, FLAC and more.": "Μόνο ήχος: WAV, AIFF, MP3, M4A, FLAC και άλλα.", "Audio": "Ήχος", "Back": "Πίσω", "Backup check": "Έλεγχος backup", "Cancel": "Άκυρο", "Check a backup": "Έλεγχος backup", "Check stopped.": "Ο έλεγχος σταμάτησε.", "Check the backup": "Έλεγξε το backup", "Choose a folder or a drive.": "Διάλεξε φάκελο ή δίσκο.", "Choose another…": "Διάλεξε άλλον…", "Choose folders…": "Διάλεξε φακέλους…", "Choose…": "Διάλεξε…", "Chosen": "Επιλεγμένο", "Clear": "Καθαρισμός", "Codec": "Codec", "Comparing sizes and samples": "Σύγκριση μεγεθών και δειγμάτων", "Comparing": "Σύγκριση", "Different on the backup": "Διαφορετικό στο backup", "Drop a folder or a drive here": "Ρίξε εδώ έναν φάκελο ή δίσκο", "Drop folders or drives, not single files.": "Ρίξε φακέλους ή δίσκους, όχι μεμονωμένα αρχεία.", "Drop more folders or drives": "Ρίξε κι άλλους φακέλους ή δίσκους", "Every file": "Όλα τα αρχεία", "Every kind of file: videos, photos, sound, projects.": "Κάθε είδος αρχείου: βίντεο, φωτογραφίες, ήχος, projects.", "Everything is on the <b>backup</b>.": "Όλα είναι στο <b>backup</b>.", "Exact copies": "Ίδια αντίγραφα", "Exact copy": "Ίδιο αντίγραφο", "Export the list (CSV)": "Εξαγωγή λίστας (CSV)", "Export": "Εξαγωγή", "Find the <b>twins</b>.": "Βρες τα <b>διπλά</b>.", "Find twins": "Βρες τα διπλά", "Folder": "Φάκελος", "Folders": "Φάκελοι", "Found files go to the Trash only when you say so, and one of each always stays.": "Τα αρχεία πάνε στον Κάδο μόνο όταν το πεις εσύ, και ένα από κάθε ομάδα μένει πάντα.", "Group": "Ομάδα", "Images only: JPG, PNG, HEIC, TIFF, PSD and camera RAW (CR3, NEF, ARW, DNG…).": "Μόνο εικόνες: JPG, PNG, HEIC, TIFF, PSD και RAW κάμερας (CR3, NEF, ARW, DNG…).", "Images": "Εικόνες", "In a Masters folder: it stays": "Σε φάκελο Masters: μένει", "Is it all on the <b>backup</b>?": "Είναι όλα στο <b>backup</b>;", "Keep all": "Κράτα όλα", "Keep it": "Κράτα το", "Keep the suggested one": "Κράτα το προτεινόμενο", "Keep · Masters": "Μένει · Masters", "Keep": "Μένει", "Kind": "Είδος", "Language": "Γλώσσα", "The words of the app.": "Η γλώσσα της εφαρμογής.", "Leave editing proxies alone": "Άφησε ήσυχα τα proxies του μοντάζ", "Length": "Διάρκεια", "List saved": "Η λίστα αποθηκεύτηκε", "Listening": "Ακρόαση", "Listing the files": "Καταγραφή αρχείων", "Listing": "Καταγραφή", "Look for": "Ψάξε για", "Looking at the photos": "Κοιτάζει τις φωτογραφίες", "Looking at the pictures": "Κοιτάζει την εικόνα", "Looking for whole folders twice": "Ψάχνει ολόκληρους φακέλους δύο φορές", "Making the previews": "Φτιάχνει τις προεπισκοπήσεις", "Mark as Masters: nothing here is ever offered for the Trash": "Κάνε τον Masters: τίποτα από εδώ δεν προτείνεται ποτέ για τον Κάδο", "Masters: nothing here goes to the Trash. Click to unmark.": "Masters: τίποτα από εδώ δεν πάει στον Κάδο. Πάτα για να το βγάλεις.", "Masters": "Masters", "Modified": "Τροποποίηση", "Move to Trash": "Στον Κάδο", "Move to the Trash": "Στον Κάδο", "Name": "Όνομα", "New check": "Νέος έλεγχος", "New scan": "Νέο ψάξιμο", "No <b>twins</b> here.": "Δεν υπάρχουν <b>διπλά</b> εδώ.", "Not on the backup": "Δεν είναι στο backup", "Nothing is changed: RoarKit only reads both sides.": "Τίποτα δεν αλλάζει: το RoarKit μόνο διαβάζει και τις δύο πλευρές.", "One of each stays": "Ένα από κάθε ομάδα μένει", "Open": "Άνοιγμα", "Part of a longer video": "Κομμάτι μεγαλύτερου βίντεο", "Parts of longer videos": "Κομμάτια μεγαλύτερων βίντεο", "Parts": "Κομμάτια", "Photos": "Φωτογραφίες", "Picture": "Εικόνα", "Pictures": "Εικόνα", "Previews": "Προεπισκοπήσεις", "Problem": "Πρόβλημα", "Proxies": "Proxies", "Proxy with no original here": "Proxy χωρίς original εδώ", "Proxy": "Proxy", "Reading both sides, byte for byte": "Διαβάζει και τις δύο πλευρές, byte προς byte", "Reading the possible copies": "Διαβάζει τα πιθανά αντίγραφα", "Reading the sound files": "Διαβάζει τα αρχεία ήχου", "Reading the videos through": "Διαβάζει τα βίντεο ολόκληρα", "Reading the videos": "Διαβάζει τα βίντεο", "Reading": "Ανάγνωση", "Restart to update": "Επανεκκίνηση για ενημέρωση", "RoarKit finds the same file twice, whatever its name, and the same video in another size or format, so you keep one and free the space.": "Το RoarKit βρίσκει το ίδιο αρχείο δύο φορές, όποιο όνομα κι αν έχει, και το ίδιο βίντεο σε άλλο μέγεθος ή format, για να κρατήσεις ένα και να ελευθερώσεις χώρο.", "RoarKit looks for every file of the originals on the backup by what it holds, byte for byte, wherever it sits and whatever it is called, and lists what is missing or different.": "Το RoarKit ψάχνει κάθε αρχείο των originals στο backup με βάση το περιεχόμενό του, byte προς byte, όπου κι αν βρίσκεται και όπως κι αν λέγεται, και δείχνει τι λείπει ή τι διαφέρει.", "Same folder twice": "Ίδιος φάκελος δύο φορές", "Same sound, other files": "Ίδιος ήχος, άλλα αρχεία", "Same video": "Ίδιο βίντεο", "Same video, other files": "Ίδιο βίντεο, άλλα αρχεία", "Scan stopped.": "Το ψάξιμο σταμάτησε.", "Show in Explorer": "Εμφάνιση στον Explorer", "Show in Finder": "Εμφάνιση στο Finder", "Show the one on the backup": "Δείξε αυτό που είναι στο backup", "Similar photos": "Παρόμοιες φωτογραφίες", "Size (bytes)": "Μέγεθος (bytes)", "Skip cloud drives": "Παράλειψη cloud", "Skip hidden and system folders": "Παράλειψη κρυφών φακέλων και φακέλων συστήματος", "Smaller files are left out.": "Τα μικρότερα αρχεία παραλείπονται.", "Smallest file": "Μικρότερο αρχείο", "Sound": "Ήχος", "Starting": "Ξεκινάει", "Stop": "Διακοπή", "Stopping…": "Σταματάει…", "Suggested": "Πρόταση", "The backup": "Το backup", "The originals": "Τα originals", "The same photo saved again or resized, and shots of a burst that are nearly alike.": "Η ίδια φωτογραφία σωσμένη ξανά ή σε άλλο μέγεθος, και λήψεις από burst που είναι σχεδόν ίδιες.", "The same sound in another file": "Ο ίδιος ήχος σε άλλο αρχείο", "The same video in another file": "Το ίδιο βίντεο σε άλλο αρχείο", "The system, the apps, the Trash, and libraries like Photos or Final Cut.": "Το σύστημα, οι εφαρμογές, ο Κάδος, και βιβλιοθήκες όπως το Photos ή το Final Cut.", "Trash": "Κάδος", "Twins": "Διπλά", "Videos only: MOV, MP4, MXF, MKV, AVI and more.": "Μόνο βίντεο: MOV, MP4, MXF, MKV, AVI και άλλα.", "Videos": "Βίντεο", "Where they should all be.": "Εκεί που πρέπει να είναι όλα.", "Whole folders twice": "Ολόκληροι φάκελοι δύο φορές", "pCloud, iCloud, Dropbox, Google Drive, OneDrive: their files live online, and reading them downloads them. A cloud folder you choose yourself is still looked in.": "pCloud, iCloud, Dropbox, Google Drive, OneDrive: τα αρχεία τους είναι online, και για να διαβαστούν κατεβαίνουν. Έναν φάκελο cloud που διαλέγεις μόνος σου τον ψάχνει κανονικά.", "the oldest": "το παλιότερο", "the best picture": "η καλύτερη εικόνα", "the full video": "το πλήρες βίντεο", "the most pixels": "τα περισσότερα pixels", "the best quality": "η καλύτερη ποιότητα", "{n} each": "{n} το καθένα", "{a} of {b}": "{a} από {b}", "{size} will be freed when you empty the Trash. One file of each group stays where it is.": "{size} θα ελευθερωθούν όταν αδειάσεις τον Κάδο. Ένα αρχείο από κάθε ομάδα μένει εκεί που είναι.", "{n} missing": "{n} λείπουν", "{a} of {b} safe · {c}": "{a} από {b} ασφαλή · {c}", "{n} different on the backup": "{n} διαφορετικά στο backup", "{a} of {b} files with a twin in size": "{a} από {b} αρχεία με ίδιο μέγεθος", "{a} of {b}: length, format": "{a} από {b}: διάρκεια, format", "{a} of {b} of about the same length": "{a} από {b} με περίπου ίδια διάρκεια", "{a} of {b}: length, size, codec": "{a} από {b}: διάρκεια, μέγεθος, codec", "{a} of {b}, one frame a second": "{a} από {b}, ένα καρέ το δευτερόλεπτο", "{n} is <b>not</b> on the backup.": "{n} <b>δεν</b> είναι στο backup.", "{n} are <b>not</b> on the backup.": "{n} <b>δεν</b> είναι στο backup.", "{n} of twins": "{n} με διπλά", "{n} so far": "{n} ως τώρα", "{n} could not be moved: {e}": "{n} δεν μετακινήθηκαν: {e}", "{n} looked at in {t}": "{n} ελέγχθηκαν σε {t}", "{n} looked at": "{n} ελέγχθηκαν", ", {n} in the Trash": ", {n} στον Κάδο", "{n} moved to the Trash": "{n} πήγαν στον Κάδο", "Cloud left out: {n}": "Cloud που παραλείφθηκε: {n}", "Keep · {w}": "Μένει · {w}", "Masters kept safe: {n}": "Masters, ασφαλή: {n}", "Move {n} to the Trash?": "Στον Κάδο {n};", "Part · from {t}": "Κομμάτι · από {t}", "Show {n} more": "Δείξε {n} ακόμα", "checked byte for byte in {t}": "ελέγχθηκαν byte προς byte σε {t}", "starts at {t} in {n}": "ξεκινάει στο {t} του {n}", "the longer one": "μεγαλύτερου", "up to {n} to free": "έως {n} για ελευθέρωση", "its original is not in these folders": "το original του δεν είναι σε αυτούς τους φακέλους", "Make a twin": "Φτιάξε δίδυμο", "A <b>twin</b> of the card.": "Ένα <b>δίδυμο</b> της κάρτας.", "RoarKit copies a card to one or more drives at once, then reads every copy back and checks it against the card, byte for byte, so nothing arrives corrupted.": "Το RoarKit αντιγράφει μια κάρτα σε έναν ή περισσότερους δίσκους μαζί, μετά ξαναδιαβάζει κάθε αντίγραφο και το ελέγχει με την κάρτα, byte προς byte, για να μη φτάσει τίποτα χαλασμένο.", "The card": "Η κάρτα", "The folder or card to copy.": "Ο φάκελος ή η κάρτα που αντιγράφεται.", "Copy to": "Αντιγραφή σε", "One drive, or two at once.": "Ένας δίσκος, ή δύο μαζί.", "Add a drive…": "Πρόσθεσε δίσκο…", "Copy and check": "Αντιγραφή και έλεγχος", "Nothing is written over or deleted. The card keeps its folder name, the clips keep their dates, and each copy gets a report.": "Τίποτα δεν γράφεται από πάνω και τίποτα δεν σβήνεται. Η κάρτα κρατάει το όνομα του φακέλου της, τα clips τις ημερομηνίες τους, και κάθε αντίγραφο παίρνει ένα report.", "Copying": "Αντιγραφή", "Checking": "Έλεγχος", "Copying to every drive at once": "Αντιγράφει σε όλους τους δίσκους μαζί", "Reading every copy back": "Ξαναδιαβάζει κάθε αντίγραφο", "Copy stopped. What was half copied was taken away.": "Η αντιγραφή σταμάτησε. Ό,τι είχε αντιγραφεί μισό αφαιρέθηκε.", "New copy": "Νέα αντιγραφή", "Copied and <b>checked</b>.": "Αντιγράφηκε και <b>ελέγχθηκε</b>.", "{n} did <b>not</b> copy right.": "{n} <b>δεν</b> αντιγράφηκαν σωστά.", "{a} of {b} checked on every drive · {c}": "{a} από {b} ελεγμένα σε κάθε δίσκο · {c}", "{n} were already there": "{n} υπήρχαν ήδη", "in {t}": "σε {t}", "Show report": "Δείξε το report", "Show MHL": "Δείξε το MHL", "Forward": "Μπροστά", "Wait for the job that is running to finish.": "Περίμενε να τελειώσει η δουλειά που τρέχει.", "A card is in: {n}. It can be copied when the job that is running ends.": "Μπήκε κάρτα: {n}. Μπορεί να αντιγραφεί όταν τελειώσει η δουλειά που τρέχει.", "{n} can be taken out.": "Η {n} μπορεί να βγει.", "Eject the card when it is safe": "Βγάλε την κάρτα όταν είναι ασφαλές", "Only when every file is copied and checked on every drive; a card with a problem stays in.": "Μόνο όταν κάθε αρχείο έχει αντιγραφεί και ελεγχθεί σε κάθε δίσκο· μια κάρτα με πρόβλημα μένει μέσα.", "Choose by rule": "Επιλογή με κανόνα", "Which copy of each group stays, for every group at once": "Ποιο αντίγραφο κάθε ομάδας μένει, για όλες τις ομάδες μαζί", "Which copy stays?": "Ποιο αντίγραφο μένει;", "In every group shown, the one copy that stays; all the others are chosen for the Trash. Nothing in a Masters folder is ever chosen.": "Σε κάθε ομάδα που φαίνεται, το ένα αντίγραφο που μένει· όλα τα άλλα επιλέγονται για τον Κάδο. Τίποτα από φάκελο Masters δεν επιλέγεται ποτέ.", "Suggested": "Το προτεινόμενο", "The oldest": "Το παλιότερο", "The newest": "Το νεότερο", "The biggest": "Το μεγαλύτερο", "The shortest path": "Η πιο σύντομη διαδρομή", "The one in a folder…": "Αυτό σε έναν φάκελο…", "{n} chosen in {g}": "{n} επιλέχθηκαν σε {g}", "<b>{n}</b> chosen · <b>{s}</b>": "<b>{n}</b> επιλεγμένα · <b>{s}</b>", "Biggest inside: {l}": "Τα μεγαλύτερα μέσα: {l}", "Looking…": "Ψάχνει…", "The update server could not be reached. Try again later.": "Δεν ήταν δυνατή η σύνδεση με τον server των ενημερώσεων. Δοκίμασε ξανά αργότερα.", "A scan is already running.": "Τρέχει ήδη μια δουλειά.", "Choose a folder or a drive first.": "Διάλεξε πρώτα φάκελο ή δίσκο.", "Choose the card and where it is copied first.": "Διάλεξε πρώτα την κάρτα και πού θα αντιγραφεί.", "Choose the originals and the backup first.": "Διάλεξε πρώτα τα originals και το backup.", "Choose the folder a twin was made in.": "Διάλεξε τον φάκελο όπου έγινε το δίδυμο.", "Appearance": "Εμφάνιση", "Look": "Όψη", "Dark, light, or as the computer is set (it changes with it at sunset).": "Σκούρο, ανοιχτό, ή όπως είναι ο υπολογιστής (αλλάζει μαζί του όταν νυχτώνει).", "Dark": "Σκούρο", "Light": "Ανοιχτό", "Automatic": "Αυτόματο", "Accent colour": "Χρώμα έμφασης", "The mark on the chosen tool, the rings and the warnings.": "Το σημάδι στο επιλεγμένο εργαλείο, οι κύκλοι και οι προειδοποιήσεις.", "red": "Κόκκινο", "orange": "Πορτοκαλί", "pink": "Ροζ", "purple": "Μωβ", "blue": "Μπλε", "green": "Πράσινο", "Text size": "Μέγεθος γραμμάτων", "All the words of the app.": "Όλα τα κείμενα της εφαρμογής.", "Small": "Μικρά", "Medium": "Μεσαία", "Large": "Μεγάλα", "Less movement": "Λιγότερη κίνηση", "No sliding or popping: everything changes at once.": "Χωρίς κινήσεις και εφέ: όλα αλλάζουν αμέσως.", "General": "Γενικά", "Open where I left off": "Άνοιγμα εκεί που σταμάτησα", "The tool you used last opens when the app starts; off, it opens on the Overview.": "Ανοίγει το εργαλείο που χρησιμοποίησες τελευταίο· αν το κλείσεις, ανοίγει στην Επισκόπηση.", "When a job ends": "Όταν τελειώνει μια δουλειά", "Tell me": "Ειδοποίησέ με", "A notification when a scan, a copy, a check or a report finishes while you are in another app.": "Ειδοποίηση όταν τελειώνει ένα ψάξιμο, μια αντιγραφή, ένας έλεγχος ή μια αναφορά ενώ είσαι σε άλλη εφαρμογή.", "With a sound": "Με ήχο", "The notification plays the computer's sound.": "Η ειδοποίηση παίζει τον ήχο του υπολογιστή.", "Looking through folders": "Ψάξιμο στους φακέλους", "Reports": "Αναφορές", "Company": "Εταιρεία", "On the PDFs (Media report, Contact sheet).": "Στα PDF (Αναφορά media, Contact sheet).", "Second line": "Δεύτερη γραμμή", "Under the company on a PDF: a website, a phone, an email.": "Κάτω από την εταιρεία στο PDF: site, τηλέφωνο, email.", "Updates": "Ενημερώσεις", "Version": "Έκδοση", "A new version is ready.": "Μια νέα έκδοση είναι έτοιμη.", "A new version is coming down.": "Μια νέα έκδοση κατεβαίνει.", "The app looks for a new version by itself and updates when you restart it.": "Η εφαρμογή ψάχνει μόνη της για νέα έκδοση και ενημερώνεται όταν την ξανανοίξεις.", "Check for updates": "Έλεγχος για ενημερώσεις", "This is the newest version.": "Αυτή είναι η πιο νέα έκδοση.", "Choose a drive or a folder.": "Διάλεξε δίσκο ή φάκελο.", "Remove": "Αφαίρεση", "1 file did <b>not</b> copy right.": "1 αρχείο <b>δεν</b> αντιγράφηκε σωστά.", "1 file was already there": "1 αρχείο υπήρχε ήδη", "{n} missing (one)": "{n} λείπει", "{n} different on the backup (one)": "{n} διαφορετικό στο backup", "The copy is not the same as the card (corrupted on the way). Copy it again.": "Το αντίγραφο δεν είναι ίδιο με την κάρτα (χάλασε στη διαδρομή). Αντίγραψέ το ξανά.", "A different file with this name is already there; it was left alone.": "Υπάρχει ήδη άλλο αρχείο με αυτό το όνομα· δεν το πείραξε.", "At least one file of each group stays.": "Ένα αρχείο από κάθε ομάδα μένει πάντα.", "It is in a Masters folder.": "Είναι σε φάκελο Masters.", "Copy a card as soon as it is in": "Αντιγραφή κάρτας μόλις μπει", "When a camera card is put in, RoarKit offers to copy it to these drives. Several cards wait their turn.": "Όταν μπαίνει κάρτα κάμερας, το RoarKit προτείνει να την αντιγράψει σε αυτούς τους δίσκους. Πολλές κάρτες περιμένουν τη σειρά τους.", "Name the folders": "Ονόματα φακέλων", "Date_Project / Day / Camera_Card on every drive; the card number goes up by itself, the day too on a new date.": "Ημερομηνία_Project / Day / Κάμερα_Κάρτα σε κάθε δίσκο· ο αριθμός κάρτας ανεβαίνει μόνος του, και η μέρα σε νέα ημερομηνία.", "Project": "Project", "Day": "Day", "Camera": "Κάμερα", "Card": "Κάρτα", "A card is in: {n}": "Μπήκε κάρτα: {n}", "Copy it to {d} and check every copy?": "Να αντιγραφεί στο {d} και να ελεγχθεί κάθε αντίγραφο;", "Not now": "Όχι τώρα", "A card is in: {n}. Choose where it is copied.": "Μπήκε κάρτα: {n}. Διάλεξε πού θα αντιγραφεί.", "{n} waits its turn.": "Η {n} περιμένει τη σειρά της.", "Waiting: {n}": "Περιμένουν: {n}", "Against the originals": "Με τα originals", "Against its copy report": "Με το report της αντιγραφής", "The copy": "Το αντίγραφο", "A folder a twin was made in: its report says what every file held on the day.": "Ένας φάκελος όπου έγινε δίδυμο: το report του λέει τι είχε κάθε αρχείο εκείνη τη μέρα.", "Check against the report": "Έλεγχος με το report", "Has the <b>drive</b> kept it all?": "Τα κράτησε όλα ο <b>δίσκος</b>;", "Drives go bad on the shelf without a sound. RoarKit reads the copy again and compares every file with the report written the day it was copied.": "Οι δίσκοι χαλάνε στο ράφι χωρίς να το καταλάβεις. Το RoarKit ξαναδιαβάζει το αντίγραφο και συγκρίνει κάθε αρχείο με το report της μέρας που αντιγράφηκε.", "Nothing has changed since {w}.": "Τίποτα δεν άλλαξε από {w}.", "Nothing has changed since it was copied.": "Τίποτα δεν άλλαξε από την αντιγραφή.", "{n} have changed or gone since {w}.": "{n} άλλαξαν ή χάθηκαν από {w}.", "{n} changed": "{n} άλλαξαν", "{n} gone": "{n} χάθηκαν", "Changed since it was copied": "Άλλαξε από την αντιγραφή", "No longer there": "Δεν υπάρχει πια", "Report": "Report", "There is no RoarKit copy report in this folder. Choose the folder a twin was made in.": "Δεν υπάρχει report του RoarKit σε αυτόν τον φάκελο. Διάλεξε τον φάκελο όπου έγινε το δίδυμο.", "Clean up": "Καθάρισμα", "Make <b>room</b> on the computer.": "Κάνε <b>χώρο</b> στον υπολογιστή.", "RoarKit measures the caches of DaVinci Resolve, Premiere, After Effects and the other programs, and the junk the computer gathers. What you choose goes to the Trash; each program makes its cache again when it needs it.": "Το RoarKit μετράει τα cache του DaVinci Resolve, του Premiere, του After Effects και των άλλων προγραμμάτων, και τα άχρηστα που μαζεύει ο υπολογιστής. Ό,τι διαλέξεις πάει στον Κάδο· κάθε πρόγραμμα ξαναφτιάχνει το cache του όταν το χρειαστεί.", "Measure": "Μέτρησε", "Measuring…": "Μετράει…", "Measure again": "Μέτρησε ξανά", "Only the folders each program keeps its cache in. Your projects, media and renders are never touched.": "Μόνο οι φάκελοι όπου κάθε πρόγραμμα κρατάει το cache του. Τα projects, τα media και τα renders σου δεν αγγίζονται ποτέ.", "Close {a} first": "Κλείσε πρώτα το {a}", "Not on this computer": "Δεν υπάρχει σε αυτόν τον υπολογιστή", "Empty": "Άδειο", "{size} chosen": "Επιλεγμένα: {size}", "Move {size} to the Trash?": "Στον Κάδο {size};", "The programs make their cache again when they need it. Empty the Trash to free the space.": "Τα προγράμματα ξαναφτιάχνουν το cache τους όταν το χρειαστούν. Άδειασε τον Κάδο για να ελευθερωθεί ο χώρος.", "{size} moved to the Trash. Empty it to free the space.": "{size} πήγαν στον Κάδο. Άδειασέ τον για να ελευθερωθεί ο χώρος.", "{n} stayed: in use or kept by the system.": "{n} έμειναν: χρησιμοποιούνται ή τα κρατάει το σύστημα.", "Clean up is for a Mac or a Windows computer.": "Το Καθάρισμα είναι για Mac ή Windows.", "DaVinci Resolve render cache": "Render cache του DaVinci Resolve", "CacheClip: the frames Resolve renders to play smoothly. Made again when needed.": "CacheClip: τα καρέ που κάνει render το Resolve για να παίζει ομαλά. Ξαναφτιάχνονται όταν χρειαστούν.", "DaVinci Resolve logs": "Logs του DaVinci Resolve", "Old log files Resolve writes for its support team.": "Παλιά αρχεία log που γράφει το Resolve για την υποστήριξή του.", "Adobe media cache": "Media cache της Adobe", "Premiere Pro, After Effects, Media Encoder and Audition: the conformed audio and indexes of every clip ever imported. Made again when a project opens.": "Premiere Pro, After Effects, Media Encoder και Audition: ο ήχος και τα ευρετήρια κάθε clip που έχει μπει ποτέ. Ξαναφτιάχνονται όταν ανοίγει ένα project.", "Adobe Team Projects cache": "Cache των Team Projects της Adobe", "Local copies of Premiere and After Effects team projects.": "Τοπικά αντίγραφα των team projects του Premiere και του After Effects.", "After Effects disk cache": "Disk cache του After Effects", "The frames After Effects keeps to preview faster. Made again when needed.": "Τα καρέ που κρατάει το After Effects για να κάνει preview πιο γρήγορα. Ξαναφτιάχνονται όταν χρειαστούν.", "Cinema 4D and Redshift cache": "Cache του Cinema 4D και του Redshift", "Texture and shader caches of Cinema 4D and Redshift.": "Cache από textures και shaders του Cinema 4D και του Redshift.", "Apps cache": "Cache εφαρμογών", "What every other program keeps to start faster: browsers, Spotify, Slack, Final Cut and the rest. Each makes it again.": "Ό,τι κρατάει κάθε άλλο πρόγραμμα για να ανοίγει πιο γρήγορα: browsers, Spotify, Slack, Final Cut και τα υπόλοιπα. Το καθένα το ξαναφτιάχνει.", "Logs": "Logs", "Old diagnostic files programs and macOS write.": "Παλιά διαγνωστικά αρχεία που γράφουν τα προγράμματα και το macOS.", "iPhone and iPad updates": "Ενημερώσεις iPhone και iPad", "iOS installers the Mac downloaded once to update a phone or a tablet.": "Αρχεία εγκατάστασης iOS που κατέβασε κάποτε ο Mac για να ενημερώσει κινητό ή tablet.", "Xcode build files": "Αρχεία build του Xcode", "DerivedData: what Xcode builds, made again on the next build.": "DerivedData: ό,τι φτιάχνει το Xcode, ξαναφτιάχνεται στο επόμενο build.", "Installers in Downloads": "Αρχεία εγκατάστασης στα Downloads", ".dmg and .pkg files left in Downloads after a program was installed. Look before you choose them.": "Αρχεία .dmg και .pkg που έμειναν στα Downloads αφού εγκαταστάθηκε ένα πρόγραμμα. Κοίτα τα πριν τα διαλέξεις.", ".exe and .msi files left in Downloads after a program was installed. Look before you choose them.": "Αρχεία .exe και .msi που έμειναν στα Downloads αφού εγκαταστάθηκε ένα πρόγραμμα. Κοίτα τα πριν τα διαλέξεις.", "Temporary files": "Προσωρινά αρχεία", "What programs leave in the Temp folder. Files still in use stay.": "Ό,τι αφήνουν τα προγράμματα στον φάκελο Temp. Όσα χρησιμοποιούνται ακόμα μένουν.", "Clean up stopped.": "Το καθάρισμα σταμάτησε.", "Space": "Χώρος", "Shoot": "Γύρισμα", "Files": "Αρχεία", "Drives": "Δίσκοι", "Space map": "Χάρτης χώρου", "Project leftovers": "Υπόλοιπα projects", "Media report": "Αναφορά media", "Clip check": "Έλεγχος clips", "Contact sheet": "Contact sheet", "Rename clips": "Μετονομασία clips", "File manager": "Διαχείριση αρχείων", "Private": "Προσωπικά", "Overview": "Επισκόπηση", "Computer": "Υπολογιστής", "Computer stats": "Στατιστικά υπολογιστή", "Vault": "Vault", "Archives": "Συμπιεσμένα", "Drive health": "Υγεία δίσκων", "Disk speed test": "Ταχύτητα δίσκου", "Settings": "Ρυθμίσεις", "These count for every tool.": "Ισχύουν για όλα τα εργαλεία.", "Only in the app on a Mac or Windows.": "Μόνο στην εφαρμογή σε Mac ή Windows."}
/* 0.5.0 (Alex, 29 Oct): Uninstall apps, Startup items, the menu bar, Do by itself, Similar photos */
Object.assign(EL, {
  'Uninstall apps': 'Απεγκατάσταση', 'Startup items': 'Εκκίνηση',
  'the most pixels, then the sharpest': 'τα περισσότερα pixels, μετά η πιο καθαρή',
  'Burst shots and near-identical stills, JPG, HEIC, PNG, TIFF and camera RAW: the one with the most pixels, then the sharpest, is kept.': 'Λήψεις από burst και σχεδόν ίδιες φωτογραφίες, JPG, HEIC, PNG, TIFF και RAW κάμερας: μένει αυτή με τα περισσότερα pixels, μετά η πιο καθαρή.',
  'Menu bar': 'Γραμμή μενού', 'Notification area': 'Περιοχή ειδοποιήσεων', 'Show in the menu bar': 'Εμφάνιση στη γραμμή μενού', 'Show in the notification area': 'Εμφάνιση στην περιοχή ειδοποιήσεων',
  'Free space on the start-up disk, memory and heat at a glance, and a notification when the disk is nearly full, a drive is failing or the computer is hot. The jobs below go on while it is there.': 'Ο ελεύθερος χώρος του δίσκου εκκίνησης, η μνήμη και η θερμοκρασία με μια ματιά, και ειδοποίηση όταν ο δίσκος σχεδόν γεμίζει, ένας δίσκος χαλάει ή ο υπολογιστής ζεσταίνεται. Οι δουλειές παρακάτω συνεχίζουν όσο είναι εκεί.',
  'Do by itself': 'Μόνο του', 'Clean up every week': 'Καθάρισμα κάθε εβδομάδα',
  'The safe caches only, the ones Clean up chooses at first, to the Trash; a program that is open is left alone.': 'Μόνο τα ασφαλή cache, αυτά που διαλέγει από την αρχή το Καθάρισμα, στον Κάδο· ένα πρόγραμμα που είναι ανοιχτό το αφήνει ήσυχο.',
  'Check backups every month': 'Έλεγχος backup κάθε μήνα',
  'Each folder below against its copy report, as Check a backup does: still the same, changed or gone. Nothing is changed.': 'Κάθε φάκελος παρακάτω με το report της αντιγραφής του, όπως κάνει ο Έλεγχος backup: ίδιο, αλλαγμένο ή χαμένο. Τίποτα δεν αλλάζει.',
  'Sunday': 'Κυριακή', 'Monday': 'Δευτέρα', 'Tuesday': 'Τρίτη', 'Wednesday': 'Τετάρτη', 'Thursday': 'Πέμπτη', 'Friday': 'Παρασκευή', 'Saturday': 'Σάββατο',
  'Time': 'Ώρα', 'Next: {d}': 'Επόμενο: {d}', 'Run now': 'Τρέξε τώρα', 'Working…': 'Δουλεύει…', 'Day {n} of the month': '{n} του μήνα',
  'Add a folder…': 'Πρόσθεσε φάκελο…', 'Add a folder a twin was made in…': 'Πρόσθεσε φάκελο όπου έγινε δίδυμο…',
  'They run while RoarKit or its menu bar icon is running; one missed while it was closed runs at the next start. Each tells you with a notification.': 'Τρέχουν όσο είναι ανοιχτό το RoarKit ή το εικονίδιό του στη γραμμή μενού· όποια χάθηκε όσο ήταν κλειστό τρέχει στο επόμενο άνοιγμα. Η καθεμία σε ειδοποιεί.',
  'Last runs': 'Τελευταίες φορές', 'Its time passed while RoarKit was closed': 'Η ώρα της πέρασε όσο το RoarKit ήταν κλειστό', 'Caught up': 'Καθυστερημένα', 'By hand': 'Με το χέρι',
  '{a} moved to the Trash': '{a} πήγαν στον Κάδο', 'Nothing to clear': 'Τίποτα για καθάρισμα', 'Left alone while open: {a}': 'Έμειναν όσο είναι ανοιχτά: {a}',
  'No folder to check': 'Κανένας φάκελος για έλεγχο', '{f}: not connected': '{f}: δεν είναι συνδεδεμένος', '{f}: all {n} files as they were': '{f}: και τα {n} αρχεία όπως ήταν', '{f}: {c} changed, {g} gone': '{f}: {c} άλλαξαν, {g} χάθηκαν',
  'No such job.': 'Δεν υπάρχει τέτοια δουλειά.',
  'Softer': 'Λιγότερο καθαρή', 'Less sharp than the sharpest of these: out of focus or moved': 'Λιγότερο καθαρή από την πιο καθαρή εδώ: εκτός εστίασης ή κουνημένη',
})
const t = (text, vars) => { let o = (S.lang === 'el' && EL[text]) || text; if (vars) o = o.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? ''); return o }
// each tool brings its own Greek (app/tools/*.js, `el`)
for (const m of TOOLS) Object.assign(EL, m.el || {})
const EL_WORDS = { file: ['αρχείο', 'αρχεία'], folder: ['φάκελος', 'φάκελοι'], video: ['βίντεο', 'βίντεο'], photo: ['φωτογραφία', 'φωτογραφίες'], group: ['ομάδα', 'ομάδες'], app: ['εφαρμογή', 'εφαρμογές'], leftover: ['υπόλειμμα', 'υπολείμματα'], item: ['στοιχείο', 'στοιχεία'] }

const store = { get: (k, d) => { try { const v = JSON.parse(localStorage.getItem('twin:' + k)); return v ?? d } catch { return d } }, set: (k, v) => { try { localStorage.setItem('twin:' + k, JSON.stringify(v)) } catch { /* private */ } } }
function toast(t) { const e = h('div', { class: 'toast' }, t); document.body.append(e); setTimeout(() => e.remove(), 3200) }
function sheet(title, text, buttons) {
  return new Promise((done) => {
    const close = (v) => { veil.remove(); document.removeEventListener('keydown', key); done(v) }
    const key = (e) => { if (e.key === 'Escape') close(null) }
    const veil = h('div', { class: 'veil', onclick: (e) => { if (e.target === veil) close(null) } },
      h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, h('h3', {}, title), h('p', {}, text),
        h('div', { class: 'row' }, ...buttons.map(([label, v, main]) => h('button', { class: 'btn' + (main ? ' main' : ''), onclick: () => close(v) }, label)))))
    document.addEventListener('keydown', key)
    document.body.append(veil)
    veil.querySelector('.btn.main')?.focus()
  })
}
/* a segmented choice whose glass lens slides to the chosen option */
function seg(options, value, onPick) {
  const lens = h('span', { class: 'lens' })
  const box = h('div', { class: 'seg', role: 'radiogroup' }, lens, ...options.map(([v, label, extra]) => h('button', { type: 'button', class: v === value ? 'on' : '', 'data-v': v, role: 'radio', 'aria-checked': String(v === value), onclick: () => onPick(v) }, label, extra != null ? h('small', {}, extra) : null)))
  const place = () => { const on = box.querySelector('button.on'); if (on) { lens.style.left = on.offsetLeft + 'px'; lens.style.width = on.offsetWidth + 'px' } }
  requestAnimationFrame(place)
  return box
}
const switchEl = (on, onFlip, label) => h('button', { type: 'button', class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(on), 'aria-label': label, onclick: () => onFlip(!on) })

/* ---------- state ---------- */
const S = {
  view: 'home',
  roots: store.get('roots', []),
  opts: { autoCard: true, naming: false, videosOnly: false, similar: true, minSize: 0, skipHidden: true, skipCloud: true, folders: true, parts: false, photos: true, sounds: true, proxies: true,
    // Settings (Alex, 28 Oct): the look, what happens when a job ends, where the app opens, the company on reports
    theme: 'dark', accent: 'red', size: 'medium', motion: 'full', notify: true, sound: false, resume: false, company: '', companyLine: '',
    ...store.get('opts', {}) },
  // Alex, 25 Oct: folders marked Masters (never offered for the Trash), and the backup check's two folders
  protect: store.get('protect', []),
  lang: store.get('lang', 'en'),
  mode: store.get('mode', 'home'), source: store.get('source', ''), backup: store.get('backup', ''), bres: null,
  card: store.get('card', ''), targets: store.get('targets', []), cres: null, copies: [], queue: [],
  // the naming rule's fields (Alex, 25 Oct): Date_Project/Day01/CamA_Card03
  naming: { project: '', day: 1, cam: 'A', card: 1, lastDate: '', ...store.get('naming', {}) },
  bmode: store.get('bmode', 'source'), copyDir: store.get('copyDir', ''),
  // Clean up (Alex, 28 Oct): the places measured, their sizes while measuring, and which are chosen ({ id: true|false })
  clean: null, cleanBusy: false, cleanSizes: {}, cleanPick: store.get('cleanPick', {}),
  progress: null, stages: new Set(),
  result: null, filter: 'all', shown: 40, sel: new Set(), gone: new Set(),
  version: '', update: null,
}
const saveOpts = () => { store.set('roots', S.roots); store.set('opts', S.opts); store.set('protect', S.protect); store.set('mode', S.mode); store.set('source', S.source); store.set('backup', S.backup); store.set('lang', S.lang); store.set('card', S.card); store.set('targets', S.targets); store.set('naming', S.naming); store.set('bmode', S.bmode); store.set('copyDir', S.copyDir); store.set('cleanPick', S.cleanPick) }
/* what each kind of group is called, its colour, what the kept one is, and whether its copies come chosen */
const KINDS = {
  exact: { label: 'Exact copy', tab: 'Exact copies', c: 'var(--acc)', keep: 'the oldest', pre: true },
  folder: { label: 'Same folder twice', tab: 'Folders', c: '#64d2ff', keep: 'the oldest', pre: true },
  similar: { label: 'Same video, other files', tab: 'Same video', c: 'var(--warn)', keep: 'the best picture' },
  part: { label: 'Part of a longer video', tab: 'Parts', c: '#bf5af2', keep: 'the full video' },
  photo: { label: 'Similar photos', tab: 'Photos', c: '#ffd60a', keep: 'the most pixels, then the sharpest' },
  sound: { label: 'Same sound, other files', tab: 'Sound', c: '#5e9bff', keep: 'the best quality' },
  orphan: { label: 'Proxy with no original here', tab: 'Proxies', c: 'var(--dim)', keep: '' },
}
// the copies chosen for the Trash at first: exact copies and twin folders, never what is in a Masters folder
const preselect = (groups) => new Set(groups.filter((g) => KINDS[g.kind]?.pre).flatMap((g) => g.files.filter((f) => !f.keep && !f.protected).map((f) => f.path)))
const app = document.getElementById('app')
/* The app's name, in one place (Alex, 28 Oct: it may get a new one, now that it is a utility of many tools) */
const NAME = ['ROAR', 'KIT']
T.version?.().then((v) => { S.version = v; if (S.view !== 'scan') draw() })
T.update?.state?.().then((s) => { S.update = s; drawTop() })
T.update?.on?.((s) => { S.update = s; if (S.mode === 'settings' && S.view === 'home') draw(); else drawTop() })

/* ---------- the top row ---------- */
let topEl = null
function drawTop() {
  if (!topEl) return
  const r = S.result
  const upd = S.update?.status === 'ready'
    ? h('button', { class: 'btn upd', onclick: () => T.update.install() }, h('span', { class: 'chip tint upd', style: { height: '20px', padding: '0 8px', border: 0 } }, h('i')), t('Restart to update'))
    : null
  // back and forward (Alex, 28 Oct: "you go somewhere and it does not come back")
  const kids = [h('div', { class: 'navbtns' },
    h('button', { class: 'ib sm', title: t('Back') + (T.platform === 'darwin' ? ' (⌘[)' : ' (Alt+←)'), 'aria-label': t('Back'), html: I.back, disabled: !canGo(-1), onclick: () => travel(-1) }),
    h('button', { class: 'ib sm fwd', title: t('Forward') + (T.platform === 'darwin' ? ' (⌘])' : ' (Alt+→)'), 'aria-label': t('Forward'), html: I.back, disabled: !canGo(1), onclick: () => travel(1) }))]
  if (S.view === 'copied' && S.cres) {
    kids.push(h('div', { class: 'title' }, t('Make a twin')), h('div', { class: 'spacer' }), upd,
      h('button', { class: 'btn', onclick: () => { S.view = 'home'; draw() } }, ico('search'), h('span', { class: 'lbl' }, t('New copy'))))
  } else if (S.view === 'backup' && S.bres) {
    kids.push(
      h('div', { class: 'title' }, t('Backup check')),
      h('div', { class: 'spacer' }), upd,
      S.bres.missing.length ? h('button', { class: 'btn', onclick: exportBackup, title: t('Export the list (CSV)') }, ico('out'), h('span', { class: 'lbl' }, t('Export'))) : null,
      h('button', { class: 'btn', onclick: () => { S.view = 'home'; draw() } }, ico('search'), h('span', { class: 'lbl' }, t('New check'))))
  } else if (S.view === 'results' && r) {
    // one tab a kind that was found
    const tabs = [['all', t('All'), r.groups.length], ...Object.entries(KINDS).map(([k, m]) => [k, t(m.tab), r.groups.filter((g) => g.kind === k).length]).filter((t) => t[2])]
    kids.push(
      h('div', { class: 'title' }, t('Twins')),
      seg(tabs, S.filter, (v) => { S.filter = v; S.shown = 40; draw() }),
      h('div', { class: 'spacer' }), upd,
      h('button', { class: 'btn', onclick: pickByRule, title: t('Which copy of each group stays, for every group at once') }, ico('done'), h('span', { class: 'lbl' }, t('Choose by rule'))),
      h('button', { class: 'btn', onclick: exportList, title: t('Export the list (CSV)') }, ico('out'), h('span', { class: 'lbl' }, t('Export'))),
      h('button', { class: 'btn', onclick: () => { S.view = 'home'; draw() } }, ico('search'), h('span', { class: 'lbl' }, t('New scan'))))
  } else {
    // a tool's own top row (its title and controls); else its name
    const mod = TOOLS.find((m) => m.id === S.mode)
    const own = mod?.top?.(ctx)
    kids.push(...(own || [h('div', { class: 'title' }, t(navLabel(S.mode)))]), own ? null : h('div', { class: 'spacer' }), upd)
  }
  topEl.replaceChildren(...kids.filter(Boolean))
}

/* ---------- the side menu (Alex, 28 Oct: a utility of many tools) ---------- */
const NAV = [
  // the first page: what the computer needs (Alex, 29 Oct)
  ['', [['home', 'Overview', 'home']]],
  ['Space', [['space', 'Space map', 'pie'], ['clean', 'Clean up', 'broom'], ['leftovers', 'Project leftovers', 'box'], ['twins', 'Find twins', 'twins']]],
  ['Shoot', [['copy', 'Make a twin', 'shield'], ['backup', 'Check a backup', 'card'], ['report', 'Media report', 'list'], ['clipcheck', 'Clip check', 'pulse'], ['contact', 'Contact sheet', 'grid'], ['rename', 'Rename clips', 'rename']]],
  ['Files', [['files', 'File manager', 'folder'], ['archive', 'Archives', 'zip']]],
  ['Drives', [['drives', 'Drive health', 'drive'], ['speed', 'Disk speed test', 'gauge']]],
  ['Computer', [['stats', 'Computer stats', 'chip'], ['startup', 'Startup items', 'power'], ['uninstall', 'Uninstall apps', 'apps']]],
  ['Private', [['vault', 'Vault', 'lock']]],
]
const navLabel = (id) => (id === 'settings' ? 'Settings' : NAV.flatMap((g) => g[1]).find((x) => x[0] === id)?.[1] || '')
// the app opens on the Overview (Alex, 29 Oct); the last tool only when Settings > Open where I left off is on
if (!navLabel(S.mode) || S.opts.resume !== true) S.mode = 'home'

/* the look (Settings > Appearance): dark, light or the computer's own; the accent; the text size; less movement.
   The Mac/Windows side is told too, so its own windows, menus and scroll bars follow. */
const darkNow = window.matchMedia?.('(prefers-color-scheme: dark)')
function applyLook() {
  const o = S.opts, el = document.documentElement
  el.dataset.theme = o.theme === 'auto' ? (darkNow?.matches ? 'dark' : 'light') : o.theme === 'light' ? 'light' : 'dark'
  el.dataset.accent = o.accent || 'red'
  el.dataset.size = o.size || 'medium'
  el.dataset.motion = o.motion === 'less' ? 'less' : 'full'
  el.lang = S.lang
  T.prefs?.({ lang: S.lang, theme: o.theme || 'dark', notify: o.notify !== false, sound: !!o.sound, company: o.company || '', companyLine: o.companyLine || '', tray: typeof o.tray === 'boolean' ? o.tray : null })
}
darkNow?.addEventListener?.('change', () => { if (S.opts.theme === 'auto') applyLook() })
applyLook()
let busyTool = false // a tool's own long job: the menu waits for it
function sideEl() {
  const lock = S.view === 'scan' || S.cleanBusy || busyTool
  // each tool its own coloured tile (Alex, 29 Oct: "a fresher design"), the chosen one under a glass lens that glides
  const item = ([id, label, icon]) => h('button', { class: 'nav' + (S.mode === id ? ' on' : ''), 'data-tool': id, disabled: lock && S.mode !== id, 'aria-current': S.mode === id ? 'page' : null,
    onclick: () => { if (lock || (S.mode === id && S.view === 'home')) return; S.mode = id; S.view = 'home'; saveOpts(); draw() } }, h('span', { class: 'tile-ic', 'data-tool': id, html: I[icon] }), h('span', {}, t(label)))
  return h('nav', { class: 'side' },
    h('div', { class: 'wm' }, h('span', {}, NAME[0]), h('b', {}, NAME[1])),
    h('div', { class: 'side-list' }, h('i', { class: 'side-lens', 'aria-hidden': 'true' }), ...NAV.map(([g, items]) => h('div', { class: 'side-g' }, g ? h('small', {}, t(g)) : null, ...items.map(item)))),
    h('div', { class: 'side-foot' }, item(['settings', 'Settings', 'gear']),
      // Privacy Policy and Terms (Alex, 25 Oct): on the company site, opens in the browser
      h('div', { class: 'side-meta' }, h('a', { href: 'https://themadlions.com/legal/roarkit/' + (S.lang === 'el' ? '?lang=el' : ''), target: '_blank', rel: 'noopener' }, t('Privacy & Terms')),
        S.version ? h('span', {}, 'v' + S.version + ' beta') : null)))
}

/* ---------- what a tool's page is given (app/tools/*.js) ---------- */
const listeners = {}
const emitDemo = (ev, v) => (listeners[ev] || []).forEach((fn) => fn(v))
const ctx = {
  h, I, ico, t, bytes, dur, num, plural, dateOf, toast, sheet, seg, switchEl, store, S, T,
  platform: T.platform,
  draw: () => draw(),
  // a tool's long job: the side menu waits, and Stop in the job's row calls ctx.stop()
  busy: (on) => { busyTool = !!on; draw() },
  stop: () => T.stop(),
  // the Mac or Windows side's doors; opened in a browser, the tool's own sample stands in (its `demo`)
  call: (name, args) => {
    if (T.tool) return T.tool(name, args)
    const fn = TOOLS.find((m) => m.demo?.[name])?.demo[name]
    return fn ? fn(args, emitDemo) : Promise.reject(new Error('Only in the app on a Mac or Windows.'))
  },
  on: (name, fn) => {
    if (T.onTool) return T.onTool(name, fn)
    ;(listeners[name] ||= []).push(fn)
    return () => { listeners[name] = listeners[name].filter((x) => x !== fn) }
  },
  pick: () => T.pick(), pathOf: (f) => T.pathOf(f), isFolder: (p) => T.isFolder(p), reveal: (p) => T.reveal(p), open: (p) => T.open(p),
  revealLabel: () => (T.platform === 'win32' ? t('Show in Explorer') : t('Show in Finder')),
  // the error a person can read, without Electron's wrapping
  err: (e) => t(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')),
  // a drop area that takes folders (and files, when files is true)
  dropOn(box, take) {
    box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('over') })
    box.addEventListener('dragleave', () => box.classList.remove('over'))
    box.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); box.classList.remove('over'); take([...e.dataTransfer.files].map((f) => T.pathOf(f))) })
    return box
  },
  // a tool keeps its own choices on this computer
  load: (tool, k, d) => store.get(tool + ':' + k, d),
  save: (tool, k, v) => store.set(tool + ':' + k, v),
}

/* ---------- Settings: what every tool shares ---------- */
function viewSettings() {
  const o = S.opts
  const set = (k, v) => { o[k] = v; saveOpts(); applyLook(); draw() }
  const opt = (title, sub, control) => h('div', { class: 'opt' }, h('span', {}, h('b', {}, title), h('small', {}, sub)), control)
  const group = (title, ...rows) => h('section', { class: 'set-g' }, h('h3', {}, title), h('div', { class: 'opts' }, ...rows))
  const field = (k, ph) => h('input', { class: 'set-in', value: o[k] || '', placeholder: ph, oninput: (e) => { o[k] = e.target.value; saveOpts(); applyLook() } })
  const ACCENTS = [['red', '#ff453a'], ['orange', '#ff7a1a'], ['pink', '#ff375f'], ['purple', '#a25bff'], ['blue', '#0a84ff'], ['green', '#2fb551']]
  const swatches = h('div', { class: 'swatches', role: 'radiogroup' }, ...ACCENTS.map(([k, c]) => h('button', { class: 'swatch' + ((o.accent || 'red') === k ? ' on' : ''), style: { '--c': c }, role: 'radio', 'aria-checked': String((o.accent || 'red') === k), 'aria-label': t(k), title: t(k), onclick: () => set('accent', k) })))
  const upd = S.update?.status
  return h('main', {}, h('div', { class: 'home set' }, h('div', { class: 'card' },
    group(t('Appearance'),
      opt(t('Look'), t('Dark, light, or as the computer is set (it changes with it at sunset).'), seg([['dark', t('Dark')], ['light', t('Light')], ['auto', t('Automatic')]], o.theme || 'dark', (v) => set('theme', v))),
      opt(t('Accent colour'), t('The mark on the chosen tool, the rings and the warnings.'), swatches),
      opt(t('Text size'), t('All the words of the app.'), seg([['small', t('Small')], ['medium', t('Medium')], ['large', t('Large')]], o.size || 'medium', (v) => set('size', v))),
      opt(t('Less movement'), t('No sliding or popping: everything changes at once.'), switchEl(o.motion === 'less', (v) => set('motion', v ? 'less' : 'full'), t('Less movement')))),
    group(t('General'),
      opt(t('Language'), t('The words of the app.'), seg([['en', 'English'], ['el', 'Ελληνικά']], S.lang, (v) => { S.lang = v; saveOpts(); applyLook(); draw() })),
      opt(t('Open where I left off'), t('The tool you used last opens when the app starts; off, it opens on the Overview.'), switchEl(o.resume === true, (v) => set('resume', v), t('Open where I left off')))),
    group(t('When a job ends'),
      opt(t('Tell me'), t('A notification when a scan, a copy, a check or a report finishes while you are in another app.'), switchEl(o.notify !== false, (v) => set('notify', v), t('Tell me'))),
      opt(t('With a sound'), t('The notification plays the computer\'s sound.'), switchEl(!!o.sound, (v) => set('sound', v), t('With a sound')))),
    group(T.platform === 'win32' ? t('Notification area') : t('Menu bar'),
      opt(T.platform === 'win32' ? t('Show in the notification area') : t('Show in the menu bar'), t('Free space on the start-up disk, memory and heat at a glance, and a notification when the disk is nearly full, a drive is failing or the computer is hot. The jobs below go on while it is there.'),
        switchEl(trayIs(), (v) => set('tray', v), t('Show in the menu bar')))),
    jobsGroup(group, opt),
    group(t('Looking through folders'),
      opt(t('Skip hidden and system folders'), t('The system, the apps, the Trash, and libraries like Photos or Final Cut.'),
        switchEl(o.skipHidden, (v) => set('skipHidden', v), t('Skip hidden and system folders'))),
      // Alex, 24 Oct: a cloud drive shows the whole cloud as if it were here, and reading it downloads it
      opt(t('Skip cloud drives'), t('pCloud, iCloud, Dropbox, Google Drive, OneDrive: their files live online, and reading them downloads them. A cloud folder you choose yourself is still looked in.'),
        switchEl(o.skipCloud, (v) => set('skipCloud', v), t('Skip cloud drives')))),
    group(t('Reports'),
      opt(t('Company'), t('On the PDFs (Media report, Contact sheet).'), field('company', 'The Mad Lions')),
      opt(t('Second line'), t('Under the company on a PDF: a website, a phone, an email.'), field('companyLine', 'themadlions.com'))),
    group(t('Updates'),
      opt(t('Version') + (S.version ? ' ' + S.version : ''), upd === 'ready' ? t('A new version is ready.') : upd === 'downloading' ? t('A new version is coming down.') : t('The app looks for a new version by itself and updates when you restart it.'),
        upd === 'ready' ? h('button', { class: 'btn main', onclick: () => T.update.install() }, t('Restart to update'))
          : h('button', { class: 'btn', disabled: !T.update?.check || upd === 'checking' || upd === 'downloading', onclick: async (e) => {
            e.currentTarget.disabled = true; e.currentTarget.textContent = t('Looking…')
            const r = await T.update.check().catch(() => ({ status: 'error' }))
            toast(r?.status === 'ready' ? t('A new version is ready.') : r?.status === 'downloading' || r?.status === 'checking' ? t('A new version is coming down.') : r?.status === 'error' ? t('The update server could not be reached. Try again later.') : t('This is the newest version.'))
            draw()
          } }, upd === 'checking' || upd === 'downloading' ? t('A new version is coming down.') : t('Check for updates')))),
    h('p', { class: 'note' }, h('a', { href: 'https://themadlions.com/legal/roarkit/' + (S.lang === 'el' ? '?lang=el' : ''), target: '_blank', rel: 'noopener' }, t('Privacy & Terms')), ' · The Mad Lions Lab'))))
}

/* ---------- Do by itself (Alex, 29 Oct): the weekly Clean up and the monthly backup check (electron/jobs.js) ---------- */
// the menu bar icon is on at first on a Mac, off on Windows, until it is chosen
const trayIs = () => (typeof S.opts.tray === 'boolean' ? S.opts.tray : T.platform === 'darwin' || T.platform === 'web')
let jobsNow = null
if (T.jobs) { T.jobs.get().then((j) => { jobsNow = j; if (S.mode === 'settings') draw() }).catch(() => {}); T.jobs.on?.((j) => { jobsNow = j; if (S.mode === 'settings' && S.view === 'home') draw() }) }
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const whenOf = (ms) => new Date(ms).toLocaleString(S.lang === 'el' ? 'el-GR' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
/* what a run did, in the page's own words */
function jobText(e) {
  if (e.job === 'clean' && !e.problem) return (e.freed ? t('{a} moved to the Trash', { a: bytes(e.freed) }) : t('Nothing to clear')) + (e.skipped?.length ? ' · ' + t('Left alone while open: {a}', { a: e.skipped.join(', ') }) : '')
  if (e.job === 'backup' && Array.isArray(e.folders)) {
    if (!e.folders.length) return t('No folder to check')
    return e.folders.map((f) => {
      const name = f.folder.split(/[\\/]/).filter(Boolean).pop() || f.folder
      if (f.error === 'gone') return t('{f}: not connected', { f: name })
      if (f.error) return name + ': ' + t(f.error)
      return f.safe === f.total ? t('{f}: all {n} files as they were', { f: name, n: num(f.total) }) : t('{f}: {c} changed, {g} gone', { f: name, c: num(f.changed), g: num(f.gone) })
    }).join(' · ')
  }
  return t(e.text || '')
}
function jobsGroup(group, opt) {
  const j = jobsNow
  if (!j) return null
  const put = async (id, patch) => { jobsNow = await T.jobs.set({ [id]: { ...j.config[id], ...patch } }); draw() }
  const daySel = (id, list) => h('select', { class: 'set-in job-in', 'aria-label': t('Day'), onchange: (e) => put(id, { day: Number(e.target.value) }) }, ...list.map(([v, label]) => h('option', { value: v, selected: Number(j.config[id].day) === v }, label)))
  const timeIn = (id) => h('input', { class: 'set-in job-in', type: 'time', value: j.config[id].time, 'aria-label': t('Time'), onchange: (e) => { if (e.target.value) put(id, { time: e.target.value }) } })
  const next = (id) => (j.config[id].on && j.next[id] ? t('Next: {d}', { d: whenOf(j.next[id]) }) : '')
  const runNow = (id) => h('button', { class: 'btn', disabled: !!j.running, onclick: async (e) => { e.currentTarget.disabled = true; e.currentTarget.textContent = t('Working…'); jobsNow = await T.jobs.run(id); draw() } }, j.running === id ? t('Working…') : t('Run now'))
  const c = j.config.clean, b = j.config.backup
  const folders = b.folders || []
  const addFolder = async () => { const add = (await T.pick()).filter((p) => p && !folders.includes(p)); if (add.length) put('backup', { folders: [...folders, ...add] }) }
  const log = (j.log || []).slice(0, 6)
  return group(t('Do by itself'),
    opt(t('Clean up every week'), t('The safe caches only, the ones Clean up chooses at first, to the Trash; a program that is open is left alone.'), switchEl(!!c.on, (v) => put('clean', { on: v }), t('Clean up every week'))),
    c.on ? h('div', { class: 'job-when' }, ico('clock'), daySel('clean', DAYS.map((d, i) => [i, t(d)])), timeIn('clean'), h('small', {}, next('clean')), h('span', { class: 'spacer' }), runNow('clean')) : null,
    opt(t('Check backups every month'), t('Each folder below against its copy report, as Check a backup does: still the same, changed or gone. Nothing is changed.'), switchEl(!!b.on, (v) => put('backup', { on: v }), t('Check backups every month'))),
    b.on ? h('div', { class: 'job-when' }, ico('clock'), daySel('backup', Array.from({ length: 28 }, (_, i) => [i + 1, t('Day {n} of the month', { n: i + 1 })])), timeIn('backup'), h('small', {}, next('backup')), h('span', { class: 'spacer' }), runNow('backup')) : null,
    b.on ? h('div', { class: 'job-folders' }, ...folders.map((p) => h('span', { class: 'root', title: p }, ico('folder'), h('span', {}, ltr(p)), h('button', { 'aria-label': t('Remove'), html: I.x, onclick: () => put('backup', { folders: folders.filter((x) => x !== p) }) }))),
      h('button', { class: 'btn', onclick: addFolder }, ico('plus'), folders.length ? t('Add a folder…') : t('Add a folder a twin was made in…'))) : null,
    h('p', { class: 'job-note' }, t('They run while RoarKit or its menu bar icon is running; one missed while it was closed runs at the next start. Each tells you with a notification.')),
    log.length ? h('div', { class: 'job-log' }, h('b', {}, t('Last runs')), ...log.map((e) => h('div', { class: 'job-row' + (e.ok ? '' : ' bad') },
      h('span', { class: 'chip tint', style: { '--c': e.ok ? 'var(--ok)' : 'var(--warn)' } }, h('i'), e.job === 'clean' ? t('Clean up') : t('Backup check')),
      h('span', { class: 'job-t' }, jobText(e)),
      e.why === 'missed' ? h('span', { class: 'chip', title: t('Its time passed while RoarKit was closed') }, t('Caught up')) : e.why === 'now' ? h('span', { class: 'chip' }, t('By hand')) : null,
      h('small', {}, whenOf(e.at))))) : null)
}

/* ---------- back and forward (Alex, 28 Oct) ----------
   Every screen is remembered: the tool, its view, and what the tool says makes its screen (a tool's `nav`: get() and
   set(); its values compared by what they are, objects by identity). Back and forward put the screen back as it was. */
const H = { list: [], at: -1, quiet: false }
const ids = new WeakMap(); let nextId = 1
const sigOf = (v) => v == null ? '_' : Array.isArray(v) ? '[' + v.map(sigOf).join(',') + ']' : typeof v === 'object' ? '#' + (ids.get(v) || (ids.set(v, nextId), nextId++)) : String(v)
const navLocked = () => S.view === 'scan' || S.cleanBusy || busyTool
function snapNow() {
  const n = S.view === 'home' ? TOOLS.find((m) => m.id === S.mode)?.nav : null
  const tool = n ? n.get() : null
  return { mode: S.mode, view: S.view, tool, sig: S.mode + '|' + S.view + '|' + (tool ? Object.entries(tool).map(([k, v]) => k + '=' + sigOf(v)).join(';') : '') }
}
function remember() {
  if (H.quiet || S.view === 'scan') return
  const s = snapNow()
  if (H.list[H.at]?.sig === s.sig) { H.list[H.at] = s; return }
  H.list = H.list.slice(0, H.at + 1); H.list.push(s)
  if (H.list.length > 200) H.list.shift()
  H.at = H.list.length - 1
}
// a screen whose result is gone (a new scan was started since) cannot come back
const usable = (s) => s && !(s.view === 'results' && !S.result) && !(s.view === 'backup' && !S.bres) && !(s.view === 'copied' && !S.cres)
function canGo(d) { if (navLocked()) return false; for (let i = H.at + d; i >= 0 && i < H.list.length; i += d) if (usable(H.list[i])) return true; return false }
let lastTravel = 0
function travel(d) {
  if (navLocked() || Date.now() - lastTravel < 150) return
  lastTravel = Date.now()
  let i = H.at + d
  while (i >= 0 && i < H.list.length && !usable(H.list[i])) i += d
  const s = H.list[i]
  if (!s) return
  H.at = i; H.quiet = true
  S.mode = s.mode; S.view = s.view
  if (s.tool) TOOLS.find((m) => m.id === s.mode)?.nav?.set(s.tool)
  saveOpts(); draw()
  H.quiet = false
  // the screen as it is now replaces what was remembered for this step (a tool may have filled more in meanwhile)
  const now = snapNow(); if (now.sig === s.sig) H.list[H.at] = now
}
// the keys a Mac and Windows use for it, and the mouse's side buttons
document.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, select, [contenteditable]')) return
  const mac = T.platform === 'darwin'
  if ((mac && e.metaKey && e.key === '[') || (!mac && e.altKey && e.key === 'ArrowLeft')) { e.preventDefault(); travel(-1) }
  if ((mac && e.metaKey && e.key === ']') || (!mac && e.altKey && e.key === 'ArrowRight')) { e.preventDefault(); travel(1) }
})
document.addEventListener('mouseup', (e) => { if (e.button === 3) { e.preventDefault(); travel(-1) } if (e.button === 4) { e.preventDefault(); travel(1) } })

function draw() {
  remember()
  topEl = h('header', { class: 'top' })
  const mod = TOOLS.find((m) => m.id === S.mode)
  const body = S.view === 'scan' ? viewScan() : S.view === 'results' ? viewResults() : S.view === 'backup' ? viewBackup() : S.view === 'copied' ? viewCopied()
    : S.mode === 'settings' ? viewSettings() : mod ? mod.view(ctx) : viewHome()
  // a new page comes in (Alex, 29 Oct: "animation when you change tab"): from below when going down the menu, from
  // above when going up; the same page redrawn does not move
  const order = ['home', ...NAV.flatMap((g) => g[1].map((x) => x[0])), 'settings']
  const key = S.mode + '|' + S.view
  if (key !== lastKey) {
    body.classList.add('enter')
    body.dataset.dir = lastKey && order.indexOf(S.mode) < order.indexOf(lastKey.split('|')[0]) ? 'up' : 'down'
  }
  /* the same page drawn again keeps where it was scrolled to, and so do the lists inside it (Alex, 29 Oct: "it stays
     there, I cannot see what is further down": every redraw used to put the page back at its top) */
  const kept = key === lastKey ? scrollsOf(app.querySelector('.col > main')) : null
  lastKey = key
  const side = sideEl()
  app.replaceChildren(side, h('div', { class: 'col' }, topEl, body))
  if (kept) putScrolls(body, kept)
  drawTop()
  drawFoot()
  placeLens(side)
}
let lastKey = '', lensY = null
// where a page and each scrolling list in it stand: by the element's class and its place among those of that class
function scrollsOf(main) {
  if (!main) return null
  const out = [{ sel: null, i: 0, top: main.scrollTop, left: main.scrollLeft }]
  main.querySelectorAll('*').forEach((e) => {
    if (!(e.scrollTop || e.scrollLeft) || !e.className || typeof e.className !== 'string') return
    const sel = '.' + e.className.trim().split(/\s+/).join('.')
    out.push({ sel, i: [...main.querySelectorAll(sel)].indexOf(e), top: e.scrollTop, left: e.scrollLeft })
  })
  return out
}
function putScrolls(main, list) {
  for (const k of list) {
    const e = k.sel ? main.querySelectorAll(k.sel)[k.i] : main
    if (e) { e.scrollTop = k.top; e.scrollLeft = k.left }
  }
}
/* the glass under the chosen tool slides from where it was to where it is */
function placeLens(side) {
  const lens = side.querySelector('.side-lens'), on = side.querySelector('.nav.on'), list = side.querySelector('.side-list')
  if (!lens) return
  if (!on || !list.contains(on)) { lens.style.opacity = '0'; lensY = null; return }
  const y = on.offsetTop, hgt = on.offsetHeight
  lens.style.height = hgt + 'px'
  if (lensY == null || lensY === y) { lens.style.transition = 'none'; lens.style.transform = `translateY(${y}px)`; lens.style.opacity = '1' }
  else {
    lens.style.transition = 'none'; lens.style.transform = `translateY(${lensY}px)`; lens.style.opacity = '1'
    requestAnimationFrame(() => { lens.style.transition = ''; lens.style.transform = `translateY(${y}px)` })
  }
  lensY = y
}

/* ---------- home: where to look ---------- */
const LOOK_FOR = {
  all: 'Every kind of file: videos, photos, sound, projects.',
  video: 'Videos only: MOV, MP4, MXF, MKV, AVI and more.',
  image: 'Images only: JPG, PNG, HEIC, TIFF, PSD and camera RAW (CR3, NEF, ARW, DNG…).',
  audio: 'Audio only: WAV, AIFF, MP3, M4A, FLAC and more.',
}
// the choice as it is kept; "Videos only" from before reads as Videos
const lookFor = (o) => (LOOK_FOR[o.kind] ? o.kind : o.videosOnly ? 'video' : 'all')
async function addRoots(paths) {
  const add = []
  for (const p of paths) if (p && !S.roots.includes(p) && (await T.isFolder(p))) add.push(p)
  if (!add.length) { if (paths.length) toast(t('Drop folders or drives, not single files.')); return }
  S.roots = [...S.roots, ...add]; saveOpts(); draw()
}
// the naming rule's four fields and what the folder will be called
function namingEl() {
  const n = S.naming
  const field = (k, label, attrs = {}) => h('label', { class: 'nf' }, h('small', {}, label),
    h('input', { value: n[k], ...attrs, oninput: (e) => { n[k] = attrs.type === 'number' ? Math.max(1, parseInt(e.target.value, 10) || 1) : e.target.value; saveOpts(); prev.textContent = '→ ' + folderName() } }))
  const prev = h('div', { class: 'nf-prev' }, '→ ' + folderName())
  return h('div', { class: 'naming' },
    h('div', { class: 'nf-row' }, field('project', t('Project'), { placeholder: 'Fakinos', class: 'wide' }), field('day', t('Day'), { type: 'number', min: 1 }), field('cam', t('Camera'), { placeholder: 'A', maxlength: 4 }), field('card', t('Card'), { type: 'number', min: 1 })),
    prev)
}
function viewHome() {
  const o = S.opts
  const set = (k, v) => { o[k] = v; saveOpts(); draw() }
  const k = lookFor(o)
  const isMasters = (r) => S.protect.includes(r)
  const flipMasters = (r) => { S.protect = isMasters(r) ? S.protect.filter((x) => x !== r) : [...S.protect, r]; saveOpts(); draw() }
  const dropOn = (box, take) => {
    box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('over') })
    box.addEventListener('dragleave', () => box.classList.remove('over'))
    box.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); box.classList.remove('over'); take([...e.dataTransfer.files].map((f) => T.pathOf(f))) })
    return box
  }
  const opt = (title, sub, control) => h('div', { class: 'opt' }, h('span', {}, h('b', {}, title), h('small', {}, sub)), control)
  const bsub = () => h('div', { class: 'modes' }, seg([['source', t('Against the originals')], ['report', t('Against its copy report')]], S.bmode, (v) => { S.bmode = v; saveOpts(); draw() }))
  // the side menu chooses the tool now; Language and the two skips live in Settings
  const mode = null
  if (S.mode === 'clean') return viewClean()
  if (S.mode === 'copy') {
    // Make a twin (Alex, 25 Oct): a card to one or more drives, every copy checked
    const one = async (paths) => { const p = paths?.[0]; if (!p) return; if (!(await T.isFolder(p))) return toast(t('Choose a drive or a folder.')); S.card = p; saveOpts(); draw() }
    const more = async (paths) => { const add = []; for (const p of paths || []) if (p && p !== S.card && !S.targets.includes(p) && (await T.isFolder(p))) add.push(p); if (add.length) { S.targets = [...S.targets, ...add]; saveOpts(); draw() } }
    const chip = (p, onX) => h('span', { class: 'root', title: p }, ico('folder'), h('span', {}, ltr(p)), h('button', { 'aria-label': t('Remove'), html: I.x, onclick: onX }))
    return h('main', {}, h('div', { class: 'home' }, h('div', { class: 'card' },
      h('div', { class: 'hero' }, h('h1', { html: t('A <b>twin</b> of the card.') }),
        h('p', {}, t('RoarKit copies a card to one or more drives at once, then reads every copy back and checks it against the card, byte for byte, so nothing arrives corrupted.'))),
      mode,
      h('div', { class: 'sides' },
        dropOn(h('div', { class: 'drop side' + (S.card ? ' set' : '') }, h('div', { class: 'dz-i', html: I.folder }), h('b', {}, t('The card')), h('small', {}, t('The folder or card to copy.')),
          S.card ? chip(S.card, () => { S.card = ''; saveOpts(); draw() }) : null,
          h('button', { class: 'btn', onclick: async () => one(await T.pick()) }, ico('plus'), S.card ? t('Choose another…') : t('Choose…'))), one),
        dropOn(h('div', { class: 'drop side' + (S.targets.length ? ' set' : '') }, h('div', { class: 'dz-i', html: I.shield }), h('b', {}, t('Copy to')), h('small', {}, t('One drive, or two at once.')),
          S.targets.length ? h('div', { class: 'roots' }, ...S.targets.map((p) => chip(p, () => { S.targets = S.targets.filter((x) => x !== p); saveOpts(); draw() }))) : null,
          h('button', { class: 'btn', onclick: async () => more(await T.pick()) }, ico('plus'), S.targets.length ? t('Add a drive…') : t('Choose…'))), more)),
      h('div', { class: 'opts' },
        opt(t('Copy a card as soon as it is in'), t('When a camera card is put in, RoarKit offers to copy it to these drives. Several cards wait their turn.'),
          switchEl(o.autoCard, (v) => set('autoCard', v), t('Copy a card as soon as it is in'))),
        opt(t('Name the folders'), t('Date_Project / Day / Camera_Card on every drive; the card number goes up by itself, the day too on a new date.'),
          switchEl(o.naming, (v) => set('naming', v), t('Name the folders'))),
        o.naming ? namingEl() : null,
        // a DIT's last step (Alex, 28 Oct: "the best of all"): the card is ejected when every file is checked on every drive
        T.platform === 'darwin' || T.platform === 'web' ? opt(t('Eject the card when it is safe'), t('Only when every file is copied and checked on every drive; a card with a problem stays in.'),
          switchEl(!!o.eject, (v) => set('eject', v), t('Eject the card when it is safe'))) : null),
      h('div', { class: 'go' }, h('button', { class: 'btn main big', disabled: !S.card || !S.targets.length, onclick: () => startCopy() }, ico('shield'), t('Copy and check'))),
      h('p', { class: 'note' }, t('Nothing is written over or deleted. The card keeps its folder name, the clips keep their dates, and each copy gets a report.')))))
  }
  if (S.mode === 'backup' && S.bmode === 'report') {
    // a drive against the report its twin left (Alex, 25 Oct)
    const pick = async (paths) => { const p = paths?.[0]; if (!p) return; if (!(await T.isFolder(p))) return toast(t('Choose a folder or a drive.')); S.copyDir = p; saveOpts(); draw() }
    return h('main', {}, h('div', { class: 'home' }, h('div', { class: 'card' },
      h('div', { class: 'hero' }, h('h1', { html: t('Has the <b>drive</b> kept it all?') }),
        h('p', {}, t('Drives go bad on the shelf without a sound. RoarKit reads the copy again and compares every file with the report written the day it was copied.'))),
      mode, bsub(),
      dropOn(h('div', { class: 'drop' + (S.copyDir ? ' set' : '') }, h('div', { class: 'dz-i', html: I.shield }), h('b', {}, t('The copy')), h('small', {}, t('A folder a twin was made in: its report says what every file held on the day.')),
        S.copyDir ? h('span', { class: 'root', title: S.copyDir }, ico('folder'), h('span', {}, ltr(S.copyDir)), h('button', { 'aria-label': t('Remove'), html: I.x, onclick: () => { S.copyDir = ''; saveOpts(); draw() } })) : null,
        h('button', { class: 'btn', onclick: async () => pick(await T.pick()) }, ico('plus'), S.copyDir ? t('Choose another…') : t('Choose…'))), pick),
      h('div', { class: 'go' }, h('button', { class: 'btn main big', disabled: !S.copyDir, onclick: startRecheck }, ico('shield'), t('Check against the report'))),
      h('p', { class: 'note' }, t('Nothing is changed: RoarKit only reads both sides.')))))
  }
  if (S.mode === 'backup') {
    // the originals (a card, a shoot) on one side, the backup on the other (Alex, 25 Oct)
    const side = (key, title, sub) => {
      const pick = async (paths) => { const p = paths?.[0]; if (!p) return; if (!(await T.isFolder(p))) return toast(t('Choose a folder or a drive.')); S[key] = p; saveOpts(); draw() }
      return dropOn(h('div', { class: 'drop side' + (S[key] ? ' set' : '') },
        h('div', { class: 'dz-i', html: key === 'source' ? I.folder : I.shield }),
        h('b', {}, title), h('small', {}, sub),
        S[key] ? h('span', { class: 'root', title: S[key] }, ico('folder'), h('span', {}, ltr(S[key])),
          h('button', { 'aria-label': 'Remove ' + S[key], html: I.x, onclick: () => { S[key] = ''; saveOpts(); draw() } })) : null,
        h('button', { class: 'btn', onclick: async () => pick(await T.pick()) }, ico('plus'), S[key] ? t('Choose another…') : t('Choose…'))), pick)
    }
    return h('main', {}, h('div', { class: 'home' }, h('div', { class: 'card' },
      h('div', { class: 'hero' }, h('h1', { html: t('Is it all on the <b>backup</b>?') }),
        h('p', {}, t('RoarKit looks for every file of the originals on the backup by what it holds, byte for byte, wherever it sits and whatever it is called, and lists what is missing or different.'))),
      mode, bsub(),
      h('div', { class: 'sides' },
        side('source', t('The originals'), t('A card, a shoot, a drive.')),
        side('backup', t('The backup'), t('Where they should all be.'))),
      h('div', { class: 'go' }, h('button', { class: 'btn main big', disabled: !S.source || !S.backup, onclick: startBackup }, ico('shield'), t('Check the backup'))),
      h('p', { class: 'note' }, t('Nothing is changed: RoarKit only reads both sides.')))))
  }
  const drop = dropOn(h('div', { class: 'drop' },
    h('div', { class: 'dz-i', html: I.folder }),
    h('b', {}, S.roots.length ? t('Drop more folders or drives') : t('Drop a folder or a drive here')),
    h('small', {}, t('A shoot, an archive, a whole disk. Nothing is changed until you choose. The lock marks a folder as Masters.')),
    h('button', { class: 'btn', onclick: async () => addRoots(await T.pick()) }, ico('plus'), t('Choose folders…')),
    S.roots.length ? h('div', { class: 'roots' }, ...S.roots.map((r) => h('span', { class: 'root' + (isMasters(r) ? ' masters' : ''), title: r },
      // Masters (Alex, 25 Oct): nothing in it is ever offered for the Trash, and its copy is the one kept
      h('button', { class: 'lock', 'aria-pressed': String(isMasters(r)), 'aria-label': (isMasters(r) ? 'Unmark ' : 'Mark as Masters: ') + r,
        title: isMasters(r) ? t('Masters: nothing here goes to the Trash. Click to unmark.') : t('Mark as Masters: nothing here is ever offered for the Trash'), html: I.lock, onclick: () => flipMasters(r) }),
      isMasters(r) ? h('em', {}, t('Masters')) : null,
      h('span', {}, ltr(r)),
      h('button', { 'aria-label': 'Remove ' + r, html: I.x, onclick: () => { S.roots = S.roots.filter((x) => x !== r); S.protect = S.protect.filter((x) => x !== r); saveOpts(); draw() } })))) : null), addRoots)
  const videos = k === 'all' || k === 'video', images = k === 'all' || k === 'image', audio = k === 'all' || k === 'audio'
  return h('main', {}, h('div', { class: 'home' }, h('div', { class: 'card' },
    h('div', { class: 'hero' }, h('h1', { html: t('Find the <b>twins</b>.') }),
      h('p', {}, t('RoarKit finds the same file twice, whatever its name, and the same video in another size or format, so you keep one and free the space.'))),
    mode,
    drop,
    h('div', { class: 'opts' },
      // Images and Audio too (Alex, 24 Oct)
      opt(t('Look for'), t(LOOK_FOR[k]),
        seg([['all', t('Every file')], ['video', t('Videos')], ['image', t('Images')], ['audio', t('Audio')]], k, (v) => { o.videosOnly = false; set('kind', v) })),
      opt(t('Whole folders twice'), t('A card or a shoot copied twice shows as one folder, not file by file.'),
        switchEl(o.folders, (v) => set('folders', v), t('Whole folders twice'))),
      videos ? opt(t('The same video in another file'), t('Also when it was exported again, in another size, codec or format. RoarKit compares the pictures.'),
        switchEl(o.similar, (v) => set('similar', v), t('The same video in another file'))) : null,
      videos ? opt(t('Parts of longer videos'), t('A trim or a teaser cut out of a longer video, and where it starts. Slower: every video is read through.'),
        switchEl(o.parts, (v) => set('parts', v), t('Parts of longer videos'))) : null,
      videos ? opt(t('Leave editing proxies alone'), t('A proxy is never taken for a twin of its original. Proxies whose original is not in these folders are listed apart.'),
        switchEl(o.proxies, (v) => set('proxies', v), t('Leave editing proxies alone'))) : null,
      images ? opt(t('Similar photos'), t('Burst shots and near-identical stills, JPG, HEIC, PNG, TIFF and camera RAW: the one with the most pixels, then the sharpest, is kept.'),
        switchEl(o.photos, (v) => set('photos', v), t('Similar photos'))) : null,
      audio ? opt(t('The same sound in another file'), t('A WAV and its MP3 or M4A: RoarKit listens to the sound itself.'),
        switchEl(o.sounds, (v) => set('sounds', v), t('The same sound in another file'))) : null,
      opt(t('Smallest file'), t('Smaller files are left out.'),
        seg([[0, t('Any')], [1e6, '1 MB'], [1e8, '100 MB'], [1e9, '1 GB']], o.minSize, (v) => set('minSize', v)))),
    h('div', { class: 'go' }, h('button', { class: 'btn main big', disabled: !S.roots.length, onclick: start }, ico('search'), t('Find twins'))),
    h('p', { class: 'note' }, t('Found files go to the Trash only when you say so, and one of each always stays.')))))
}

/* ---------- Clean up (Alex, 28 Oct): the caches of Resolve, Adobe and the apps, and the computer's junk ---------- */
const picked = (c) => !c.open?.length && c.size > 0 && (S.cleanPick[c.id] ?? c.on)
function viewClean() {
  const list = S.clean || []
  const chosen = list.filter(picked)
  const total = chosen.reduce((n, c) => n + c.size, 0)
  const tile = (c) => {
    const size = S.cleanBusy ? S.cleanSizes[c.id] : c.size
    const there = (c.found || []).length > 0
    const busyApp = c.open?.length ? c.open.join(', ') : ''
    return h('div', { class: 'opt cl' + (picked(c) ? ' on' : '') + (!there || !size ? ' none' : '') },
      h('span', {}, h('b', {}, t(c.name)), h('small', {}, t(c.what)),
        // the biggest things inside (Alex, 28 Oct): seen before they go
        !S.cleanBusy && c.top?.length && size ? h('small', { class: 'cl-top', title: c.top.map((x) => x.path).join('\n') }, t('Biggest inside: {l}', { l: c.top.slice(0, 3).map((x) => `${x.name} ${bytes(x.size)}`).join(' · ') })) : null,
        busyApp ? h('span', { class: 'chip tint', style: { '--c': 'var(--warn)', marginTop: '6px' } }, h('i'), t('Close {a} first', { a: busyApp })) : null),
      h('span', { class: 'chip cl-size' }, size == null ? '…' : !there ? t('Not on this computer') : size ? bytes(size) : t('Empty')),
      there && !S.cleanBusy ? h('button', { class: 'ib sm', title: T.platform === 'win32' ? t('Show in Explorer') : t('Show in Finder'), 'aria-label': T.platform === 'win32' ? t('Show in Explorer') : t('Show in Finder'), html: I.reveal, onclick: () => T.reveal(c.found[0]) }) : null,
      Object.assign(switchEl(picked(c), (v) => { S.cleanPick[c.id] = v; saveOpts(); draw() }, t(c.name)), { disabled: !!busyApp || !size || S.cleanBusy }))
  }
  const go = S.clean && !S.cleanBusy
    ? h('div', { class: 'go cl-go' },
      h('button', { class: 'btn', onclick: lookClean }, ico('search'), t('Measure again')),
      h('button', { class: 'btn main big', disabled: !chosen.length, onclick: () => cleanNow(chosen, total) }, ico('trash'), total ? t('{size} chosen', { size: bytes(total) }) + ' · ' + t('Move to Trash') : t('Move to Trash')))
    : h('div', { class: 'go' }, h('button', { class: 'btn main big', disabled: S.cleanBusy || !T.cleanLook, onclick: lookClean }, ico('search'), S.cleanBusy ? t('Measuring…') : t('Measure')))
  return h('main', {}, h('div', { class: 'home' }, h('div', { class: 'card' },
    h('div', { class: 'hero' }, h('h1', { html: t('Make <b>room</b> on the computer.') }),
      h('p', {}, t('RoarKit measures the caches of DaVinci Resolve, Premiere, After Effects and the other programs, and the junk the computer gathers. What you choose goes to the Trash; each program makes its cache again when it needs it.'))),
    list.length ? h('div', { class: 'opts cl-list' }, ...list.map(tile)) : null,
    go,
    h('p', { class: 'note' }, T.cleanLook ? t('Only the folders each program keeps its cache in. Your projects, media and renders are never touched.') : t('Clean up is for a Mac or a Windows computer.')))))
}
async function lookClean() {
  S.cleanBusy = true; S.cleanSizes = {}; draw()
  const off = T.onCleanTick?.((r) => { S.cleanSizes[r.id] = r.size; if (S.view === 'home' && S.mode === 'clean') draw() })
  try {
    const r = await T.cleanLook()
    if (r?.stopped) toast(t('Clean up stopped.'))
    else S.clean = r
  } catch (e) { toast(String(e?.message || e)) } finally { off?.(); S.cleanBusy = false; draw() }
}
async function cleanNow(chosen, total) {
  const ok = await sheet(t('Move {size} to the Trash?', { size: bytes(total) }), t('The programs make their cache again when they need it. Empty the Trash to free the space.'), [[t('Cancel'), false], [t('Move to Trash'), true, true]])
  if (!ok) return
  S.cleanBusy = true; draw()
  let r = null
  try { r = await T.clean(chosen.map((c) => c.id)) } catch (e) { toast(String(e?.message || e)) }
  S.cleanBusy = false
  if (r) {
    // a program opened in the meantime says so; files macOS keeps for itself or that are in use just stay
    const app = r.failed.find((f) => !f.path)
    const left = r.failed.filter((f) => f.path).length
    if (app && !r.ok) toast(t('Close {a} first', { a: (app.apps || []).join(', ') }))
    else toast(t('{size} moved to the Trash. Empty it to free the space.', { size: bytes(r.freed) }) + (left ? ' ' + t('{n} stayed: in use or kept by the system.', { n: num(left) }) : ''))
  }
  await lookClean()
}

/* ---------- the scan ---------- */
const STAGES = [['copy', 'Copying'], ['verify', 'Checking'], ['list', 'Listing'], ['compare', 'Comparing'], ['hash', 'Reading'], ['folders', 'Folders'], ['video', 'Videos'], ['frames', 'Pictures'], ['parts', 'Parts'], ['photos', 'Photos'], ['sound', 'Sound'], ['listen', 'Listening'], ['thumbs', 'Previews']]
// the steps this scan will take, from its choices
function plannedStages() {
  if (S.running === 'backup') return ['list', 'compare', 'hash']
  if (S.running === 'copy') return ['list', 'copy', 'verify']
  const o = S.opts, k = lookFor(o)
  const v = k === 'all' || k === 'video', i = k === 'all' || k === 'image', a = k === 'all' || k === 'audio'
  return ['list', 'compare', 'hash', o.folders && 'folders', v && (o.similar || o.parts) && 'video', v && o.similar && 'frames', v && o.parts && 'parts', i && o.photos && 'photos', a && o.sounds && 'sound', a && o.sounds && 'listen', S.running !== 'backup' && 'thumbs'].filter(Boolean)
}
let scanEls = null
async function start() {
  if (!S.roots.length) return
  S.running = 'twins'
  S.view = 'scan'; S.progress = { stage: 'list', files: 0 }; S.stages = new Set(['list']); draw()
  const off = T.onProgress((p) => { S.progress = p; S.stages.add(p.stage); drawProgress() })
  try {
    const r = await T.scan({ roots: S.roots, protect: S.protect.filter((p) => S.roots.includes(p)), ...S.opts })
    if (r?.stopped) { S.view = 'home'; toast(t('Scan stopped.')); return draw() }
    S.result = r; S.filter = 'all'; S.shown = 40; S.gone = new Set()
    // exact copies and twin folders: everything but the one to keep is chosen; the rest is for you to decide
    S.sel = preselect(r.groups)
    S.view = 'results'; draw()
  } catch (e) {
    S.view = 'home'; draw(); toast(ctx.err(e))
  } finally { off?.() }
}
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const pad2 = (n) => String(Math.max(0, Number(n) || 0)).padStart(2, '0')
// the folder a card goes into on every drive, from the naming rule; empty means the card's own name
// the day and card the next copy gets: a new date is a new shooting day, and its cards start from 1 again
const nextNaming = (date = today()) => {
  const n = S.naming
  return n.lastDate && n.lastDate !== date ? { day: (Number(n.day) || 0) + 1, card: 1 } : { day: Number(n.day) || 1, card: Number(n.card) || 1 }
}
const folderName = (date = today()) => {
  if (!S.opts.naming) return ''
  const n = S.naming, x = nextNaming(date)
  return [[date, n.project.trim()].filter(Boolean).join('_'), `Day${pad2(x.day)}`, [n.cam.trim() && `Cam${n.cam.trim()}`, `Card${pad2(x.card)}`].filter(Boolean).join('_')].join('/')
}
async function startCopy(fromQueue = false) {
  if (!S.card || !S.targets.length) return
  if (busyTool || S.cleanBusy) return toast(t('Wait for the job that is running to finish.'))
  // the folder is settled now: the day and card are written down at once, so a stop or an error cannot move them again
  const folder = folderName()
  if (S.opts.naming) { const x = nextNaming(); S.naming.day = x.day; S.naming.card = x.card; S.naming.lastDate = today(); saveOpts() }
  // the result screen shows this batch of cards, not every card since the app opened
  if (!fromQueue) S.copies = []
  S.running = 'copy'
  S.view = 'scan'; S.progress = { stage: 'list', files: 0 }; S.stages = new Set(['list']); draw()
  const off = T.onProgress((p) => { S.progress = p; S.stages.add(p.stage); drawProgress() })
  try {
    const r = await T.copy({ source: S.card, targets: S.targets, folder, skipHidden: S.opts.skipHidden, eject: !!S.opts.eject })
    if (r?.stopped) { S.queue = []; S.view = 'home'; toast(t('Copy stopped. What was half copied was taken away.')); return draw() }
    // the next card gets the next number, also after a card with errors (its retry gets a folder of its own)
    if (S.opts.naming) S.naming.card = (Number(S.naming.card) || 0) + 1
    S.cres = r; S.copies = [r, ...S.copies]; saveOpts()
    if (r.ejected) toast(t('{n} can be taken out.', { n: S.card.split(/[\\/]/).filter(Boolean).pop() }))
    // the next card waiting goes straight on
    if (S.queue.length) { S.card = S.queue.shift(); saveOpts(); off?.(); return startCopy(true) }
    S.view = 'copied'; draw()
  } catch (e) {
    toast(ctx.err(e))
    // a card that failed does not hold up the ones waiting
    if (S.queue.length) { S.card = S.queue.shift(); saveOpts(); off?.(); return startCopy(true) }
    S.view = S.copies.length ? 'copied' : 'home'; if (S.copies.length) S.cres = S.copies[0]; draw()
  } finally { off?.() }
}
async function startRecheck() {
  if (!S.copyDir) return
  S.running = 'backup'
  S.view = 'scan'; S.progress = { stage: 'hash', bytesDone: 0, bytesTotal: 0 }; S.stages = new Set(['hash']); draw()
  const off = T.onProgress((p) => { S.progress = p; S.stages.add(p.stage); drawProgress() })
  try {
    const r = await T.recheck({ folder: S.copyDir })
    if (r?.stopped) { S.view = 'home'; toast(t('Check stopped.')); return draw() }
    S.bres = r; S.shown = 60; S.view = 'backup'; draw()
  } catch (e) {
    S.view = 'home'; draw(); toast(ctx.err(e))
  } finally { off?.() }
}
async function startBackup() {
  if (!S.source || !S.backup) return
  S.running = 'backup'
  S.view = 'scan'; S.progress = { stage: 'list', files: 0 }; S.stages = new Set(['list']); draw()
  const off = T.onProgress((p) => { S.progress = p; S.stages.add(p.stage); drawProgress() })
  try {
    const r = await T.backup({ source: S.source, backup: S.backup, skipHidden: S.opts.skipHidden, skipCloud: S.opts.skipCloud })
    if (r?.stopped) { S.view = 'home'; toast(t('Check stopped.')); return draw() }
    S.bres = r; S.shown = 60; S.view = 'backup'; draw()
  } catch (e) {
    S.view = 'home'; draw(); toast(ctx.err(e))
  } finally { off?.() }
}
function viewScan() {
  scanEls = { ring: h('div', { class: 'ring' }), t: h('div', { class: 'stage-t' }), s: h('div', { class: 'stage-s' }), steps: h('div', { class: 'steps' }) }
  scanEls.ring.innerHTML = '<svg viewBox="0 0 100 100"><circle class="t" cx="50" cy="50" r="44"/><circle class="p" cx="50" cy="50" r="44" stroke-dasharray="276.5" stroke-dashoffset="276.5"/></svg><b></b>'
  const m = h('main', {}, h('div', { class: 'scan' }, h('div', { class: 'card' }, scanEls.ring, scanEls.t, scanEls.s, scanEls.steps,
    h('button', { class: 'btn', onclick: () => { T.stop(); scanEls.t.textContent = t('Stopping…') } }, ico('stop'), t('Stop')))))
  requestAnimationFrame(drawProgress)
  return m
}
function drawProgress() {
  if (S.view !== 'scan' || !scanEls) return
  const p = S.progress || {}
  const text = {
    list: [t('Listing the files'), t('{n} so far', { n: plural(p.files || 0, 'file') })],
    compare: [t('Comparing sizes and samples'), t('{a} of {b} files with a twin in size', { a: num(p.done || 0), b: num(p.total || 0) })],
    hash: [S.running === 'backup' ? t('Reading both sides, byte for byte') : t('Reading the possible copies'), t('{a} of {b}', { a: bytes(p.bytesDone || 0), b: bytes(p.bytesTotal || 0) })],
    folders: [t('Looking for whole folders twice'), ''],
    copy: [t('Copying to every drive at once'), t('{a} of {b}', { a: bytes(p.bytesDone || 0), b: bytes(p.bytesTotal || 0) })],
    verify: [t('Reading every copy back'), t('{a} of {b}', { a: bytes(p.bytesDone || 0), b: bytes(p.bytesTotal || 0) })],
    parts: [t('Reading the videos through'), t('{a} of {b}, one frame a second', { a: num(p.done || 0), b: plural(p.total || 0, 'video') })],
    photos: [t('Looking at the photos'), t('{a} of {b}', { a: num(p.done || 0), b: plural(p.total || 0, 'photo') })],
    sound: [t('Reading the sound files'), t('{a} of {b}: length, format', { a: num(p.done || 0), b: plural(p.total || 0, 'file') })],
    listen: [t('Listening'), t('{a} of {b} of about the same length', { a: num(p.done || 0), b: plural(p.total || 0, 'file') })],
    video: [t('Reading the videos'), t('{a} of {b}: length, size, codec', { a: num(p.done || 0), b: plural(p.total || 0, 'video') })],
    frames: [t('Looking at the pictures'), t('{a} of {b} of about the same length', { a: num(p.done || 0), b: plural(p.total || 0, 'video') })],
    thumbs: [t('Making the previews'), t('{a} of {b}', { a: num(p.done || 0), b: plural(p.total || 0, 'file') })],
  }[p.stage] || [t('Starting'), '']
  const frac = ['hash', 'copy', 'verify'].includes(p.stage) ? (p.bytesTotal ? p.bytesDone / p.bytesTotal : 1) : p.total ? p.done / p.total : null
  scanEls.ring.classList.toggle('spin', frac == null)
  scanEls.ring.querySelector('.p').setAttribute('stroke-dashoffset', String(276.5 * (1 - (frac ?? 0))))
  scanEls.ring.querySelector('b').textContent = frac == null ? '' : Math.floor(frac * 100) + '%'
  scanEls.t.textContent = text[0]; scanEls.s.textContent = text[1] + (S.running === 'copy' && S.queue.length ? ' · ' + t('Waiting: {n}', { n: S.queue.map((q) => q.split(/[\\/]/).filter(Boolean).pop()).join(', ') }) : '')
  const at = STAGES.findIndex(([k]) => k === p.stage)
  const plan = plannedStages()
  scanEls.steps.replaceChildren(...STAGES.filter(([k]) => plan.includes(k) || S.stages.has(k)).map(([k, label]) => {
    const i = STAGES.findIndex(([x]) => x === k)
    return h('span', { class: 'chip' + (i === at ? ' on' : i < at ? ' done' : '') }, h('i'), t(label))
  }))
}

/* ---------- the twins ---------- */
// which cloud drives were left out, named, so a missing folder is never a mystery
const cloudChip = (r) => (r.cloud?.length ? h('span', { class: 'chip', title: r.cloud.join('\n') },
  t('Cloud left out: {n}', { n: [...new Set(r.cloud.map((p) => p.split(/[\\/]/).pop()))].slice(0, 3).join(', ') + (r.cloud.length > 3 ? '…' : '') })) : null)
const live = (g) => g.files.filter((f) => !S.gone.has(f.path))
function viewResults() {
  const r = S.result
  const groups = r.groups.map((g) => ({ ...g, files: live(g) })).filter((g) => g.files.length > (g.kind === 'orphan' ? 0 : 1))
  const list = groups.filter((g) => S.filter === 'all' || g.kind === S.filter)
  if (!groups.length) {
    return h('main', {}, h('div', { class: 'empty' }, h('div', {},
      h('div', { class: 'big-i', html: I.done }),
      h('h2', { html: S.gone.size ? t('All <b>tidy</b>.') : t('No <b>twins</b> here.') }),
      h('p', {}, t('{n} looked at', { n: plural(r.files, 'file') }) + (S.gone.size ? t(', {n} in the Trash', { n: plural(S.gone.size, 'file') }) : '') + '.'),
      cloudChip(r),
      h('button', { class: 'btn', onclick: () => { S.view = 'home'; draw() } }, ico('back'), t('Back')))))
  }
  const free = groups.reduce((a, g) => a + g.files.filter((f) => !f.keep && !f.protected).reduce((b, f) => b + f.size, 0), 0)
  const sum = h('div', { class: 'sum' },
    h('span', { class: 'chip tint' }, h('i'), t('{n} of twins', { n: plural(groups.length, 'group') })),
    h('span', { class: 'chip' }, t('up to {n} to free', { n: bytes(free) })),
    h('span', { class: 'chip' }, t('{n} looked at in {t}', { n: plural(r.files, 'file'), t: dur(r.took / 1000) })),
    r.protect?.length ? h('span', { class: 'chip tint', style: { '--c': 'var(--ok)' }, title: r.protect.join('\n') }, h('i'), t('Masters kept safe: {n}', { n: r.protect.map((p) => p.split(/[\\/]/).pop()).join(', ') })) : null,
    cloudChip(r))
  const shown = list.slice(0, S.shown)
  return h('main', {}, h('div', { class: 'res' }, sum, ...shown.map(groupEl),
    list.length > shown.length ? h('button', { class: 'btn more', onclick: () => { S.shown += 60; draw() } }, t('Show {n} more', { n: Math.min(60, list.length - shown.length) })) : null))
}
function groupEl(g) {
  const m = KINDS[g.kind] || KINDS.exact
  const chosen = g.files.filter((f) => S.sel.has(f.path))
  const v = g.files.find((f) => f.video)?.video
  const a = g.files.find((f) => f.audio)?.audio
  const part = g.files.find((f) => f.partAt != null && !f.keep)
  const info = g.kind === 'exact' ? t('{n} each', { n: bytes(g.files[0].size) }) + (v ? ' · ' + dur(v.dur) : '')
    : g.kind === 'folder' ? `${plural(g.files[0].count, 'file')} · ${t('{n} each', { n: bytes(g.files[0].size) })}`
    : g.kind === 'part' && part ? t('starts at {t} in {n}', { t: dur(part.partAt), n: g.files.find((f) => f !== part)?.name || t('the longer one') })
    : g.kind === 'sound' && a ? dur(a.dur)
    : g.kind === 'orphan' ? t('its original is not in these folders')
    : v ? dur(v.dur) : ''
  const small = { height: '30px', padding: '0 12px', fontSize: '12.5px' }
  return h('section', { class: 'group' },
    h('div', { class: 'g-head' },
      h('span', { class: 'chip tint', style: { '--c': m.c } }, h('i'), t(m.label)),
      h('span', { class: 'g-t' }, g.kind === 'folder' ? plural(g.files.length, 'folder') : plural(g.files.length, 'file')),
      h('span', { class: 'g-s' }, info),
      h('span', { class: 'spacer' }),
      // the one to keep, also when the suggested one has gone to the Trash already: one of each stays
      g.kind !== 'orphan' ? h('button', { class: 'btn', style: small, onclick: () => { const k = keeperOf(g.files); g.files.forEach((f) => (f === k || f.protected ? S.sel.delete(f.path) : S.sel.add(f.path))); draw() } }, t('Keep the suggested one')) : null,
      chosen.length ? h('button', { class: 'btn', style: small, onclick: () => { g.files.forEach((f) => S.sel.delete(f.path)); draw() } }, g.kind === 'orphan' ? t('Keep it') : t('Keep all')) : null),
    h('div', { class: 'files' }, ...g.files.map((f) => fileEl(f, g))))
}
function fileEl(f, g) {
  const on = S.sel.has(f.path)
  // the last one not chosen cannot be chosen too: one of each stays (a proxy with no original is a group of one)
  const lastOne = !on && g.kind !== 'orphan' && g.files.filter((x) => !S.sel.has(x.path)).length === 1
  const locked = f.protected
  const v = f.video, a = f.audio
  const keepWhy = f.protected ? t('Keep · Masters') : t('Keep · {w}', { w: t(KINDS[g.kind]?.keep || t('the oldest')) })
  const meta = [
    h('span', { class: 'chip' }, bytes(f.size)),
    f.folder ? h('span', { class: 'chip' }, plural(f.count, 'file')) : null,
    v ? h('span', { class: 'chip' }, `${v.w}×${v.h}`) : null,
    v ? h('span', { class: 'chip' }, dur(v.dur)) : null,
    v ? h('span', { class: 'chip' }, v.codec.toUpperCase() + (v.fps ? ` · ${Math.round(v.fps * 100) / 100} fps` : '')) : null,
    !v && f.dims ? h('span', { class: 'chip' }, `${f.dims.w}×${f.dims.h}`) : null,
    // Similar photos (Alex, 29 Oct): a shot clearly softer than the sharpest of its group says so
    g.kind === 'photo' && f.sharp != null && f.sharp < 0.6 * Math.max(...g.files.map((x) => x.sharp || 0)) ? h('span', { class: 'chip tint', style: { '--c': 'var(--dim)' }, title: t('Less sharp than the sharpest of these: out of focus or moved') }, h('i'), t('Softer')) : null,
    a ? h('span', { class: 'chip' }, dur(a.dur)) : null,
    a ? h('span', { class: 'chip' }, a.codec.replace(/^pcm_.*/, 'PCM').toUpperCase() + (a.kbps ? ` · ${a.kbps} kb/s` : '') + ` · ${Math.round(a.rate / 100) / 10} kHz`) : null,
    f.partAt != null && !f.keep ? h('span', { class: 'chip tint', style: { '--c': '#bf5af2' } }, h('i'), t('Part · from {t}', { t: dur(f.partAt) })) : null,
    f.proxy ? h('span', { class: 'chip' }, t('Proxy')) : null,
    h('span', { class: 'chip' }, dateOf(f.mtime)),
    f.protected ? h('span', { class: 'chip tint keep' }, h('i'), t('Masters')) : null,
    f.keep && !f.protected ? (on ? h('span', { class: 'chip' }, t('Suggested')) : h('span', { class: 'chip tint keep' }, h('i'), keepWhy)) : null,
  ]
  return h('div', { class: 'file' + (on ? ' sel' : '') },
    h('button', { class: 'check' + (on ? ' on' : ''), html: I.check, disabled: lastOne || locked, title: locked ? t('In a Masters folder: it stays') : lastOne ? t('One of each stays') : on ? t('Keep it') : t('Move to the Trash'), 'aria-label': (on ? 'Keep ' : 'Choose ') + f.name,
      onclick: () => { on ? S.sel.delete(f.path) : S.sel.add(f.path); draw() } }),
    h('div', { class: 'thumb', style: f.thumb ? { backgroundImage: `url("${f.thumb}")` } : null }, f.thumb ? null : ico(f.folder ? 'folder' : v ? 'play' : a ? 'sound' : 'file')),
    h('div', { class: 'f-main' }, h('div', { class: 'f-name', title: f.name }, f.name), h('div', { class: 'f-dir', title: f.dir }, '‎' + f.dir), h('div', { class: 'f-meta' }, ...meta)),
    h('div', { class: 'f-act' },
      h('button', { class: 'ib sm', title: T.platform === 'win32' ? t('Show in Explorer') : t('Show in Finder'), 'aria-label': 'Show ' + f.name, html: I.reveal, onclick: () => T.reveal(f.path) }),
      h('button', { class: 'ib sm', title: t('Open'), 'aria-label': 'Open ' + f.name, html: f.folder ? I.folder : v ? I.play : I.file, onclick: () => T.open(f.path) })))
}

/* ---------- the backup check ---------- */
function viewBackup() {
  const b = S.bres
  const differs = b.missing.filter((m) => m.why === 'differs').length
  const allThere = !b.missing.length
  if (b.mode === 'recheck') return viewRecheck(b)
  const head = h('section', { class: 'group verdict' + (allThere ? ' ok' : ' bad') },
    h('div', { class: 'big-i', html: allThere ? I.shield : I.warn }),
    h('div', {},
      h('h2', { html: allThere ? t('Everything is on the <b>backup</b>.') : t(b.missing.length === 1 ? '{n} is <b>not</b> on the backup.' : '{n} are <b>not</b> on the backup.', { n: plural(b.missing.length, 'file') }) }),
      h('div', { class: 'sum' },
        h('span', { class: 'chip tint', style: { '--c': 'var(--ok)' } }, h('i'), t('{a} of {b} safe · {c}', { a: num(b.safe), b: plural(b.total, 'file'), c: bytes(b.safeBytes) })),
        b.missing.length - differs ? h('span', { class: 'chip tint' }, h('i'), t(b.missing.length - differs === 1 ? '{n} missing (one)' : '{n} missing', { n: num(b.missing.length - differs) }).replace(' (one)', '')) : null,
        differs ? h('span', { class: 'chip tint', style: { '--c': 'var(--warn)' } }, h('i'), t(differs === 1 ? '{n} different on the backup (one)' : '{n} different on the backup', { n: num(differs) }).replace(' (one)', '')) : null,
        h('span', { class: 'chip' }, t('checked byte for byte in {t}', { t: dur(b.took / 1000) })),
        cloudChip(b)),
      h('p', { class: 'paths' }, h('span', { title: b.source }, b.source), ' → ', h('span', { title: b.backup }, b.backup))))
  const shown = b.missing.slice(0, S.shown)
  return h('main', {}, h('div', { class: 'res' }, head,
    shown.length ? h('section', { class: 'group' }, h('div', { class: 'files', style: { paddingTop: '8px' } }, ...shown.map((f) => h('div', { class: 'file nocheck' },
      h('div', { class: 'thumb' }, ico('file')),
      h('div', { class: 'f-main' }, h('div', { class: 'f-name', title: f.name }, f.name), h('div', { class: 'f-dir', title: f.dir }, '‎' + f.dir),
        h('div', { class: 'f-meta' },
          h('span', { class: 'chip tint', style: { '--c': f.why === 'differs' ? 'var(--warn)' : 'var(--acc)' } }, h('i'), f.why === 'differs' ? t('Different on the backup') : t('Not on the backup')),
          h('span', { class: 'chip' }, bytes(f.size)),
          h('span', { class: 'chip' }, dateOf(f.mtime)))),
      h('div', { class: 'f-act' },
        h('button', { class: 'ib sm', title: T.platform === 'win32' ? t('Show in Explorer') : t('Show in Finder'), 'aria-label': 'Show ' + f.name, html: I.reveal, onclick: () => T.reveal(f.path) }),
        f.other ? h('button', { class: 'ib sm', title: t('Show the one on the backup'), 'aria-label': 'Show the backup copy of ' + f.name, html: I.shield, onclick: () => T.reveal(f.other) }) : null))))) : null,
    b.missing.length > shown.length ? h('button', { class: 'btn more', onclick: () => { S.shown += 60; draw() } }, t('Show {n} more', { n: Math.min(60, b.missing.length - shown.length) })) : null))
}
function viewCopied() {
  return h('main', {}, h('div', { class: 'res' }, ...(S.copies.length ? S.copies : [S.cres]).flatMap(copiedEl)))
}
function copiedEl(c) {
  const ok = !c.failed.length
  const head = h('section', { class: 'group verdict' + (ok ? ' ok' : ' bad') },
    h('div', { class: 'big-i', html: ok ? I.shield : I.warn }),
    h('div', {},
      h('div', { class: 'card-name' }, c.source),
      h('h2', { html: ok ? t('Copied and <b>checked</b>.') : (new Set(c.failed.map((f) => f.path)).size === 1 ? t('1 file did <b>not</b> copy right.') : t('{n} did <b>not</b> copy right.', { n: plural(new Set(c.failed.map((f) => f.path)).size, 'file') })) }),
      h('div', { class: 'sum' },
        h('span', { class: 'chip tint', style: { '--c': 'var(--ok)' } }, h('i'), t('{a} of {b} checked on every drive · {c}', { a: num(c.verified), b: plural(c.total, 'file'), c: bytes(c.bytes) })),
        c.already ? h('span', { class: 'chip' }, (c.already === 1 ? t('1 file was already there') : t('{n} were already there', { n: plural(c.already, 'file') }))) : null,
        h('span', { class: 'chip' }, t('in {t}', { t: dur(c.took / 1000) }))),
      h('div', { class: 'paths' }, ...c.targets.map((d, i) => h('div', { class: 'dest' }, h('span', { title: d }, '→ ' + d),
        c.reports[i] ? h('button', { class: 'btn', style: { height: '28px', padding: '0 10px', fontSize: '12px' }, onclick: () => T.reveal(c.reports[i]) }, ico('reveal'), t('Show report')) : null,
        // the ASC MHL a post house asks for (Alex, 28 Oct), next to the report
        c.mhl?.[i] ? h('button', { class: 'btn', style: { height: '28px', padding: '0 10px', fontSize: '12px' }, onclick: () => T.reveal(c.mhl[i]) }, ico('reveal'), t('Show MHL')) : null)))))
  return [head,
    c.failed.length ? h('section', { class: 'group' }, h('div', { class: 'files', style: { paddingTop: '8px' } }, ...c.failed.map((f) => h('div', { class: 'file nocheck' },
      h('div', { class: 'thumb' }, ico('warn')),
      h('div', { class: 'f-main' }, h('div', { class: 'f-name', title: f.name }, f.name), h('div', { class: 'f-dir', title: f.target }, '‎' + f.target),
        h('div', { class: 'f-meta' }, h('span', { class: 'chip tint' }, h('i'), t(f.error)))),
      h('div', { class: 'f-act' }, h('button', { class: 'ib sm', title: T.platform === 'win32' ? t('Show in Explorer') : t('Show in Finder'), html: I.reveal, onclick: () => T.reveal(f.path) })))))) : null]
}
// the drive against its report: what has changed or gone since the day it was copied
function viewRecheck(b) {
  const changed = b.missing.filter((m) => m.why === 'changed').length, gone = b.missing.length - changed
  const ok = !b.missing.length
  const w = b.when ? b.when.slice(0, 10) : ''
  const head = h('section', { class: 'group verdict' + (ok ? ' ok' : ' bad') },
    h('div', { class: 'big-i', html: ok ? I.shield : I.warn }),
    h('div', {},
      h('h2', { html: ok ? (w ? t('Nothing has changed since {w}.', { w }) : t('Nothing has changed since it was copied.')) : t('{n} have changed or gone since {w}.', { n: plural(b.missing.length, 'file'), w }) }),
      h('div', { class: 'sum' },
        h('span', { class: 'chip tint', style: { '--c': 'var(--ok)' } }, h('i'), t('{a} of {b} safe · {c}', { a: num(b.safe), b: plural(b.total, 'file'), c: bytes(b.safeBytes) })),
        changed ? h('span', { class: 'chip tint' }, h('i'), t('{n} changed', { n: num(changed) })) : null,
        gone ? h('span', { class: 'chip tint', style: { '--c': 'var(--warn)' } }, h('i'), t('{n} gone', { n: num(gone) })) : null,
        h('span', { class: 'chip' }, t('checked byte for byte in {t}', { t: dur(b.took / 1000) }))),
      h('div', { class: 'paths' }, h('div', { class: 'dest' }, h('span', { title: b.backup }, b.backup),
        h('button', { class: 'btn', style: { height: '28px', padding: '0 10px', fontSize: '12px' }, onclick: () => T.reveal(b.source) }, ico('reveal'), t('Report'))))))
  const shown = b.missing.slice(0, S.shown)
  return h('main', {}, h('div', { class: 'res' }, head,
    shown.length ? h('section', { class: 'group' }, h('div', { class: 'files', style: { paddingTop: '8px' } }, ...shown.map((f) => h('div', { class: 'file nocheck' },
      h('div', { class: 'thumb' }, ico(f.why === 'gone' ? 'x' : 'warn')),
      h('div', { class: 'f-main' }, h('div', { class: 'f-name', title: f.name }, f.name), h('div', { class: 'f-dir', title: f.dir }, '‎' + f.dir),
        h('div', { class: 'f-meta' },
          h('span', { class: 'chip tint', style: { '--c': f.why === 'gone' ? 'var(--warn)' : 'var(--acc)' } }, h('i'), f.why === 'gone' ? t('No longer there') : t('Changed since it was copied')),
          h('span', { class: 'chip' }, bytes(f.size)))),
      h('div', { class: 'f-act' }, f.why !== 'gone' ? h('button', { class: 'ib sm', title: T.platform === 'win32' ? t('Show in Explorer') : t('Show in Finder'), html: I.reveal, onclick: () => T.reveal(f.path) }) : null))))) : null,
    b.missing.length > shown.length ? h('button', { class: 'btn more', onclick: () => { S.shown += 60; draw() } }, t('Show {n} more', { n: Math.min(60, b.missing.length - shown.length) })) : null))
}
async function exportBackup() {
  const q = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`
  const rows = [[t('Name'), t('Folder'), t('Size (bytes)'), t('Problem'), t('At the same place on the backup'), t('Modified')].map(q).join(',')]
  S.bres.missing.forEach((f) => rows.push([f.name, f.dir, f.size, ({ differs: t('Different on the backup'), changed: t('Changed since it was copied'), gone: t('No longer there') })[f.why] || t('Not on the backup'), f.other, new Date(f.mtime).toISOString().slice(0, 10)].map(q).join(',')))
  if (await T.exportCSV(rows.join('\r\n'))) toast(t('List saved'))
}

/* ---------- the Trash ---------- */
let footEl = null
function drawFoot() {
  if (!footEl) { footEl = h('div', { class: 'foot' }); document.body.append(footEl) }
  const files = S.view === 'results' && S.result ? S.result.groups.flatMap((g) => live(g)).filter((f) => S.sel.has(f.path)) : []
  footEl.classList.toggle('show', files.length > 0)
  if (!files.length) return
  const size = files.reduce((a, f) => a + f.size, 0)
  footEl.replaceChildren(h('span', { html: t('<b>{n}</b> chosen · <b>{s}</b>', { n: plural(files.length, 'file'), s: bytes(size) }) }),
    h('button', { class: 'btn', onclick: () => { S.sel.clear(); draw() } }, t('Clear')),
    h('button', { class: 'btn main', onclick: () => toTrash(files, size) }, ico('trash'), t('Move to Trash')))
}
async function toTrash(files, size) {
  const ok = await sheet(t('Move {n} to the Trash?', { n: plural(files.length, 'file') }), t('{size} will be freed when you empty the Trash. One file of each group stays where it is.', { size: bytes(size) }), [[t('Cancel'), false], [t('Move to Trash'), true, true]])
  if (!ok) return
  const r = await T.trash(files.map((f) => f.path))
  r.ok.forEach((p) => { S.gone.add(p); S.sel.delete(p) })
  draw()
  if (r.failed.length) toast(t('{n} could not be moved: {e}', { n: plural(r.failed.length, 'file'), e: t(r.failed[0].error) }))
  else toast(t('{n} moved to the Trash', { n: plural(r.ok.length, 'file') }))
}

/* ---------- Choose by rule (Alex, 28 Oct): which copy stays, in every group shown, in one go ---------- */
async function pickByRule() {
  const rule = await sheet(t('Which copy stays?'), t('In every group shown, the one copy that stays; all the others are chosen for the Trash. Nothing in a Masters folder is ever chosen.'),
    [[t('Cancel'), null], [t('Suggested'), 'suggested', true], [t('The oldest'), 'oldest'], [t('The newest'), 'newest'], [t('The biggest'), 'biggest'], [t('The shortest path'), 'shortest'], [t('The one in a folder…'), 'folder']])
  if (!rule) return
  let folder = ''
  if (rule === 'folder') { folder = (await T.pick())?.[0] || ''; if (!folder) return }
  const groups = S.result.groups.map((g) => ({ ...g, files: live(g) })).filter((g) => S.filter === 'all' || g.kind === S.filter)
  // the groups shown start again from nothing, then the rule chooses
  for (const g of groups) g.files.forEach((f) => S.sel.delete(f.path))
  const sel = chooseByRule(groups, rule, folder)
  sel.forEach((p) => S.sel.add(p))
  draw()
  toast(t('{n} chosen in {g}', { n: plural(sel.size, 'file'), g: plural(groups.filter((g) => g.kind !== 'orphan').length, 'group') }))
}

/* ---------- the list as CSV ---------- */
async function exportList() {
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`
  const rows = [[t('Group'), t('Kind'), t('Suggested'), t('Chosen'), t('Name'), t('Folder'), t('Size (bytes)'), t('Length'), t('Picture'), t('Codec'), t('Modified')].map(q).join(',')]
  S.result.groups.forEach((g, i) => live(g).forEach((f) => rows.push([i + 1, t(KINDS[g.kind]?.label || g.kind), f.keep ? t('Keep') : '', S.sel.has(f.path) ? t('Trash') : '', f.name, f.dir, f.size, f.video ? dur(f.video.dur) : '', f.video ? `${f.video.w}x${f.video.h}` : '', f.video?.codec || '', new Date(f.mtime).toISOString().slice(0, 10)].map(q).join(','))))
  if (await T.exportCSV(rows.join('\r\n'))) toast(t('List saved'))
}

// a card put in (Alex, 25 Oct; Copy a card as soon as it is in can be switched off)
T.onCard?.(async ({ path: p, name }) => {
  if (!S.opts.autoCard) return
  if (S.running === 'copy' && S.view === 'scan') { if (p !== S.card && !S.queue.includes(p)) { S.queue.push(p); toast(t('{n} waits its turn.', { n: name })); drawProgress() } return }
  if (S.view === 'scan') return
  if (busyTool || S.cleanBusy) return toast(t('A card is in: {n}. It can be copied when the job that is running ends.', { n: name }))
  if (!S.targets.length) { S.mode = 'copy'; S.card = p; S.view = 'home'; saveOpts(); draw(); return toast(t('A card is in: {n}. Choose where it is copied.', { n: name })) }
  const go = await sheet(t('A card is in: {n}', { n: name }), t('Copy it to {d} and check every copy?', { d: S.targets.map((x) => x.split(/[\\/]/).filter(Boolean).pop()).join(', ') }) + (S.opts.naming ? ` → ${folderName()}` : ''), [[t('Not now'), false], [t('Copy and check'), true, true]])
  if (!go) return
  S.mode = 'copy'; S.card = p; saveOpts(); startCopy()
})
T.onMenu?.((cmd) => {
  if (cmd === 'add' && S.view === 'home' && S.mode === 'twins') T.pick().then(addRoots)
  if (cmd === 'new' && S.view !== 'scan') { S.view = 'home'; draw() }
  // the menu bar's Overview and Clean up (Alex, 29 Oct)
  if (String(cmd).startsWith('go:') && !navLocked()) { const id = String(cmd).slice(3); if (id === 'settings' || navLabel(id)) { S.mode = id; S.view = 'home'; saveOpts(); draw() } }
  if (cmd === 'back') travel(-1)
  if (cmd === 'forward') travel(1)
  if (cmd === 'export' && S.view === 'backup') exportBackup()
  if (cmd === 'export' && S.view === 'results') exportList()
})
// a folder dropped anywhere on the home screen counts
document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('drop', (e) => { e.preventDefault(); if (S.view === 'home' && S.mode === 'twins' && !e.target.closest('.drop')) addRoots([...e.dataTransfer.files].map((f) => T.pathOf(f))) })
window.addEventListener('resize', () => document.querySelectorAll('.seg').forEach((s) => { const on = s.querySelector('button.on'), l = s.querySelector('.lens'); if (on && l) { l.style.left = on.offsetLeft + 'px'; l.style.width = on.offsetWidth + 'px' } }))
draw()
