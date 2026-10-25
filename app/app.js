// RoarTwin's page: where to look, the scan, the twins. Everything on the disk goes through window.twin
// (electron/preload.js); opened in a browser, a sample stands in for it (demo.js), so the page can be seen and tested.
import { demoTwin } from './demo.js'

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
const dateOf = (ms) => new Date(ms).toLocaleDateString(S.lang === 'el' ? 'el-GR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
/* Ελληνικά (Alex, 25 Oct): English unless Greek is chosen under Language; each English text is its own key */
const EL = {"Privacy & Terms": "Απόρρητο & Όροι", "A WAV and its MP3 or M4A: RoarTwin listens to the sound itself.": "Ένα WAV και το MP3 ή M4A του: το RoarTwin ακούει τον ίδιο τον ήχο.", "A card or a shoot copied twice shows as one folder, not file by file.": "Μια κάρτα ή ένα γύρισμα αντιγραμμένο δύο φορές φαίνεται ως ένας φάκελος, όχι αρχείο αρχείο.", "A card, a shoot, a drive.": "Μια κάρτα, ένα γύρισμα, ένας δίσκος.", "A proxy is never taken for a twin of its original. Proxies whose original is not in these folders are listed apart.": "Ένα proxy δεν θεωρείται ποτέ διπλό του original του. Τα proxies που δεν έχουν original σε αυτούς τους φακέλους φαίνονται χωριστά.", "A shoot, an archive, a whole disk. Nothing is changed until you choose. The lock marks a folder as Masters.": "Ένα γύρισμα, ένα αρχείο, ολόκληρος δίσκος. Τίποτα δεν αλλάζει μέχρι να διαλέξεις εσύ. Το λουκέτο κάνει έναν φάκελο Masters.", "A trim or a teaser cut out of a longer video, and where it starts. Slower: every video is read through.": "Ένα κομμάτι ή ένα teaser κομμένο από μεγαλύτερο βίντεο, και πού ξεκινάει. Πιο αργό: διαβάζει κάθε βίντεο ολόκληρο.", "All <b>tidy</b>.": "Όλα <b>τακτοποιημένα</b>.", "All": "Όλα", "Also when it was exported again, in another size, codec or format. RoarTwin compares the pictures.": "Και όταν έχει γίνει ξανά export, σε άλλο μέγεθος, codec ή format. Το RoarTwin συγκρίνει την εικόνα.", "Any": "Όλα", "At the same place on the backup": "Στην ίδια θέση στο backup", "Audio only: WAV, AIFF, MP3, M4A, FLAC and more.": "Μόνο ήχος: WAV, AIFF, MP3, M4A, FLAC και άλλα.", "Audio": "Ήχος", "Back": "Πίσω", "Backup check": "Έλεγχος backup", "Cancel": "Άκυρο", "Check a backup": "Έλεγχος backup", "Check stopped.": "Ο έλεγχος σταμάτησε.", "Check the backup": "Έλεγξε το backup", "Choose a folder or a drive.": "Διάλεξε φάκελο ή δίσκο.", "Choose another…": "Διάλεξε άλλον…", "Choose folders…": "Διάλεξε φακέλους…", "Choose…": "Διάλεξε…", "Chosen": "Επιλεγμένο", "Clear": "Καθαρισμός", "Codec": "Codec", "Comparing sizes and samples": "Σύγκριση μεγεθών και δειγμάτων", "Comparing": "Σύγκριση", "Different on the backup": "Διαφορετικό στο backup", "Drop a folder or a drive here": "Ρίξε εδώ έναν φάκελο ή δίσκο", "Drop folders or drives, not single files.": "Ρίξε φακέλους ή δίσκους, όχι μεμονωμένα αρχεία.", "Drop more folders or drives": "Ρίξε κι άλλους φακέλους ή δίσκους", "Every file": "Όλα τα αρχεία", "Every kind of file: videos, photos, sound, projects.": "Κάθε είδος αρχείου: βίντεο, φωτογραφίες, ήχος, projects.", "Everything is on the <b>backup</b>.": "Όλα είναι στο <b>backup</b>.", "Exact copies": "Ίδια αντίγραφα", "Exact copy": "Ίδιο αντίγραφο", "Export the list (CSV)": "Εξαγωγή λίστας (CSV)", "Export": "Εξαγωγή", "Find the <b>twins</b>.": "Βρες τα <b>διπλά</b>.", "Find twins": "Βρες τα διπλά", "Folder": "Φάκελος", "Folders": "Φάκελοι", "Found files go to the Trash only when you say so, and one of each always stays.": "Τα αρχεία πάνε στον Κάδο μόνο όταν το πεις εσύ, και ένα από κάθε ομάδα μένει πάντα.", "Group": "Ομάδα", "Images only: JPG, PNG, HEIC, TIFF, PSD and camera RAW (CR3, NEF, ARW, DNG…).": "Μόνο εικόνες: JPG, PNG, HEIC, TIFF, PSD και RAW κάμερας (CR3, NEF, ARW, DNG…).", "Images": "Εικόνες", "In a Masters folder: it stays": "Σε φάκελο Masters: μένει", "Is it all on the <b>backup</b>?": "Είναι όλα στο <b>backup</b>;", "Keep all": "Κράτα όλα", "Keep it": "Κράτα το", "Keep the suggested one": "Κράτα το προτεινόμενο", "Keep · Masters": "Μένει · Masters", "Keep": "Μένει", "Kind": "Είδος", "Language": "Γλώσσα", "The words of the app.": "Η γλώσσα της εφαρμογής.", "Leave editing proxies alone": "Άφησε ήσυχα τα proxies του μοντάζ", "Length": "Διάρκεια", "List saved": "Η λίστα αποθηκεύτηκε", "Listening": "Ακρόαση", "Listing the files": "Καταγραφή αρχείων", "Listing": "Καταγραφή", "Look for": "Ψάξε για", "Looking at the photos": "Κοιτάζει τις φωτογραφίες", "Looking at the pictures": "Κοιτάζει την εικόνα", "Looking for whole folders twice": "Ψάχνει ολόκληρους φακέλους δύο φορές", "Making the previews": "Φτιάχνει τις προεπισκοπήσεις", "Mark as Masters: nothing here is ever offered for the Trash": "Κάνε τον Masters: τίποτα από εδώ δεν προτείνεται ποτέ για τον Κάδο", "Masters: nothing here goes to the Trash. Click to unmark.": "Masters: τίποτα από εδώ δεν πάει στον Κάδο. Πάτα για να το βγάλεις.", "Masters": "Masters", "Modified": "Τροποποίηση", "Move to Trash": "Στον Κάδο", "Move to the Trash": "Στον Κάδο", "Name": "Όνομα", "New check": "Νέος έλεγχος", "New scan": "Νέο ψάξιμο", "No <b>twins</b> here.": "Δεν υπάρχουν <b>διπλά</b> εδώ.", "Not on the backup": "Δεν είναι στο backup", "Nothing is changed: RoarTwin only reads both sides.": "Τίποτα δεν αλλάζει: το RoarTwin μόνο διαβάζει και τις δύο πλευρές.", "One of each stays": "Ένα από κάθε ομάδα μένει", "Open": "Άνοιγμα", "Part of a longer video": "Κομμάτι μεγαλύτερου βίντεο", "Parts of longer videos": "Κομμάτια μεγαλύτερων βίντεο", "Parts": "Κομμάτια", "Photos": "Φωτογραφίες", "Picture": "Εικόνα", "Pictures": "Εικόνα", "Previews": "Προεπισκοπήσεις", "Problem": "Πρόβλημα", "Proxies": "Proxies", "Proxy with no original here": "Proxy χωρίς original εδώ", "Proxy": "Proxy", "Reading both sides, byte for byte": "Διαβάζει και τις δύο πλευρές, byte προς byte", "Reading the possible copies": "Διαβάζει τα πιθανά αντίγραφα", "Reading the sound files": "Διαβάζει τα αρχεία ήχου", "Reading the videos through": "Διαβάζει τα βίντεο ολόκληρα", "Reading the videos": "Διαβάζει τα βίντεο", "Reading": "Ανάγνωση", "Restart to update": "Επανεκκίνηση για ενημέρωση", "RoarTwin finds the same file twice, whatever its name, and the same video in another size or format, so you keep one and free the space.": "Το RoarTwin βρίσκει το ίδιο αρχείο δύο φορές, όποιο όνομα κι αν έχει, και το ίδιο βίντεο σε άλλο μέγεθος ή format, για να κρατήσεις ένα και να ελευθερώσεις χώρο.", "RoarTwin looks for every file of the originals on the backup by what it holds, byte for byte, wherever it sits and whatever it is called, and lists what is missing or different.": "Το RoarTwin ψάχνει κάθε αρχείο των originals στο backup με βάση το περιεχόμενό του, byte προς byte, όπου κι αν βρίσκεται και όπως κι αν λέγεται, και δείχνει τι λείπει ή τι διαφέρει.", "Same folder twice": "Ίδιος φάκελος δύο φορές", "Same sound, other files": "Ίδιος ήχος, άλλα αρχεία", "Same video": "Ίδιο βίντεο", "Same video, other files": "Ίδιο βίντεο, άλλα αρχεία", "Scan stopped.": "Το ψάξιμο σταμάτησε.", "Show in Explorer": "Εμφάνιση στον Explorer", "Show in Finder": "Εμφάνιση στο Finder", "Show the one on the backup": "Δείξε αυτό που είναι στο backup", "Similar photos": "Παρόμοιες φωτογραφίες", "Size (bytes)": "Μέγεθος (bytes)", "Skip cloud drives": "Παράλειψη cloud", "Skip hidden and system folders": "Παράλειψη κρυφών φακέλων και φακέλων συστήματος", "Smaller files are left out.": "Τα μικρότερα αρχεία παραλείπονται.", "Smallest file": "Μικρότερο αρχείο", "Sound": "Ήχος", "Starting": "Ξεκινάει", "Stop": "Διακοπή", "Stopping…": "Σταματάει…", "Suggested": "Πρόταση", "The backup": "Το backup", "The originals": "Τα originals", "The same photo saved again or resized, and shots of a burst that are nearly alike.": "Η ίδια φωτογραφία σωσμένη ξανά ή σε άλλο μέγεθος, και λήψεις από burst που είναι σχεδόν ίδιες.", "The same sound in another file": "Ο ίδιος ήχος σε άλλο αρχείο", "The same video in another file": "Το ίδιο βίντεο σε άλλο αρχείο", "The system, the apps, the Trash, and libraries like Photos or Final Cut.": "Το σύστημα, οι εφαρμογές, ο Κάδος, και βιβλιοθήκες όπως το Photos ή το Final Cut.", "Trash": "Κάδος", "Twins": "Διπλά", "Videos only: MOV, MP4, MXF, MKV, AVI and more.": "Μόνο βίντεο: MOV, MP4, MXF, MKV, AVI και άλλα.", "Videos": "Βίντεο", "Where they should all be.": "Εκεί που πρέπει να είναι όλα.", "Whole folders twice": "Ολόκληροι φάκελοι δύο φορές", "pCloud, iCloud, Dropbox, Google Drive, OneDrive: their files live online, and reading them downloads them. A cloud folder you choose yourself is still looked in.": "pCloud, iCloud, Dropbox, Google Drive, OneDrive: τα αρχεία τους είναι online, και για να διαβαστούν κατεβαίνουν. Έναν φάκελο cloud που διαλέγεις μόνος σου τον ψάχνει κανονικά.", "the oldest": "το παλιότερο", "the best picture": "η καλύτερη εικόνα", "the full video": "το πλήρες βίντεο", "the most pixels": "τα περισσότερα pixels", "the best quality": "η καλύτερη ποιότητα", "{n} each": "{n} το καθένα", "{a} of {b}": "{a} από {b}", "{size} will be freed when you empty the Trash. One file of each group stays where it is.": "{size} θα ελευθερωθούν όταν αδειάσεις τον Κάδο. Ένα αρχείο από κάθε ομάδα μένει εκεί που είναι.", "{n} missing": "{n} λείπουν", "{a} of {b} safe · {c}": "{a} από {b} ασφαλή · {c}", "{n} different on the backup": "{n} διαφορετικά στο backup", "{a} of {b} files with a twin in size": "{a} από {b} αρχεία με ίδιο μέγεθος", "{a} of {b}: length, format": "{a} από {b}: διάρκεια, format", "{a} of {b} of about the same length": "{a} από {b} με περίπου ίδια διάρκεια", "{a} of {b}: length, size, codec": "{a} από {b}: διάρκεια, μέγεθος, codec", "{a} of {b}, one frame a second": "{a} από {b}, ένα καρέ το δευτερόλεπτο", "{n} is <b>not</b> on the backup.": "{n} <b>δεν</b> είναι στο backup.", "{n} are <b>not</b> on the backup.": "{n} <b>δεν</b> είναι στο backup.", "{n} of twins": "{n} με διπλά", "{n} so far": "{n} ως τώρα", "{n} could not be moved: {e}": "{n} δεν μετακινήθηκαν: {e}", "{n} looked at in {t}": "{n} ελέγχθηκαν σε {t}", "{n} looked at": "{n} ελέγχθηκαν", ", {n} in the Trash": ", {n} στον Κάδο", "{n} moved to the Trash": "{n} πήγαν στον Κάδο", "Cloud left out: {n}": "Cloud που παραλείφθηκε: {n}", "Keep · {w}": "Μένει · {w}", "Masters kept safe: {n}": "Masters, ασφαλή: {n}", "Move {n} to the Trash?": "Στον Κάδο {n};", "Part · from {t}": "Κομμάτι · από {t}", "Show {n} more": "Δείξε {n} ακόμα", "checked byte for byte in {t}": "ελέγχθηκαν byte προς byte σε {t}", "starts at {t} in {n}": "ξεκινάει στο {t} του {n}", "the longer one": "μεγαλύτερου", "up to {n} to free": "έως {n} για ελευθέρωση", "its original is not in these folders": "το original του δεν είναι σε αυτούς τους φακέλους", "Make a twin": "Φτιάξε δίδυμο", "A <b>twin</b> of the card.": "Ένα <b>δίδυμο</b> της κάρτας.", "RoarTwin copies a card to one or more drives at once, then reads every copy back and checks it against the card, byte for byte, so nothing arrives corrupted.": "Το RoarTwin αντιγράφει μια κάρτα σε έναν ή περισσότερους δίσκους μαζί, μετά ξαναδιαβάζει κάθε αντίγραφο και το ελέγχει με την κάρτα, byte προς byte, για να μη φτάσει τίποτα χαλασμένο.", "The card": "Η κάρτα", "The folder or card to copy.": "Ο φάκελος ή η κάρτα που αντιγράφεται.", "Copy to": "Αντιγραφή σε", "One drive, or two at once.": "Ένας δίσκος, ή δύο μαζί.", "Add a drive…": "Πρόσθεσε δίσκο…", "Copy and check": "Αντιγραφή και έλεγχος", "Nothing is written over or deleted. The card keeps its folder name, the clips keep their dates, and each copy gets a report.": "Τίποτα δεν γράφεται από πάνω και τίποτα δεν σβήνεται. Η κάρτα κρατάει το όνομα του φακέλου της, τα clips τις ημερομηνίες τους, και κάθε αντίγραφο παίρνει ένα report.", "Copying": "Αντιγραφή", "Checking": "Έλεγχος", "Copying to every drive at once": "Αντιγράφει σε όλους τους δίσκους μαζί", "Reading every copy back": "Ξαναδιαβάζει κάθε αντίγραφο", "Copy stopped. What was half copied was taken away.": "Η αντιγραφή σταμάτησε. Ό,τι είχε αντιγραφεί μισό αφαιρέθηκε.", "New copy": "Νέα αντιγραφή", "Copied and <b>checked</b>.": "Αντιγράφηκε και <b>ελέγχθηκε</b>.", "{n} did <b>not</b> copy right.": "{n} <b>δεν</b> αντιγράφηκαν σωστά.", "{a} of {b} checked on every drive · {c}": "{a} από {b} ελεγμένα σε κάθε δίσκο · {c}", "{n} were already there": "{n} υπήρχαν ήδη", "in {t}": "σε {t}", "Show report": "Δείξε το report", "Choose a drive or a folder.": "Διάλεξε δίσκο ή φάκελο.", "Remove": "Αφαίρεση", "1 file did <b>not</b> copy right.": "1 αρχείο <b>δεν</b> αντιγράφηκε σωστά.", "1 file was already there": "1 αρχείο υπήρχε ήδη", "{n} missing (one)": "{n} λείπει", "{n} different on the backup (one)": "{n} διαφορετικό στο backup", "The copy is not the same as the card (corrupted on the way). Copy it again.": "Το αντίγραφο δεν είναι ίδιο με την κάρτα (χάλασε στη διαδρομή). Αντίγραψέ το ξανά.", "A different file with this name is already there; it was left alone.": "Υπάρχει ήδη άλλο αρχείο με αυτό το όνομα· δεν το πείραξε.", "At least one file of each group stays.": "Ένα αρχείο από κάθε ομάδα μένει πάντα.", "It is in a Masters folder.": "Είναι σε φάκελο Masters.", "Copy a card as soon as it is in": "Αντιγραφή κάρτας μόλις μπει", "When a camera card is put in, RoarTwin offers to copy it to these drives. Several cards wait their turn.": "Όταν μπαίνει κάρτα κάμερας, το RoarTwin προτείνει να την αντιγράψει σε αυτούς τους δίσκους. Πολλές κάρτες περιμένουν τη σειρά τους.", "Name the folders": "Ονόματα φακέλων", "Date_Project / Day / Camera_Card on every drive; the card number goes up by itself, the day too on a new date.": "Ημερομηνία_Project / Day / Κάμερα_Κάρτα σε κάθε δίσκο· ο αριθμός κάρτας ανεβαίνει μόνος του, και η μέρα σε νέα ημερομηνία.", "Project": "Project", "Day": "Day", "Camera": "Κάμερα", "Card": "Κάρτα", "A card is in: {n}": "Μπήκε κάρτα: {n}", "Copy it to {d} and check every copy?": "Να αντιγραφεί στο {d} και να ελεγχθεί κάθε αντίγραφο;", "Not now": "Όχι τώρα", "A card is in: {n}. Choose where it is copied.": "Μπήκε κάρτα: {n}. Διάλεξε πού θα αντιγραφεί.", "{n} waits its turn.": "Η {n} περιμένει τη σειρά της.", "Waiting: {n}": "Περιμένουν: {n}", "Against the originals": "Με τα originals", "Against its copy report": "Με το report της αντιγραφής", "The copy": "Το αντίγραφο", "A folder a twin was made in: its report says what every file held on the day.": "Ένας φάκελος όπου έγινε δίδυμο: το report του λέει τι είχε κάθε αρχείο εκείνη τη μέρα.", "Check against the report": "Έλεγχος με το report", "Has the <b>drive</b> kept it all?": "Τα κράτησε όλα ο <b>δίσκος</b>;", "Drives go bad on the shelf without a sound. RoarTwin reads the copy again and compares every file with the report written the day it was copied.": "Οι δίσκοι χαλάνε στο ράφι χωρίς να το καταλάβεις. Το RoarTwin ξαναδιαβάζει το αντίγραφο και συγκρίνει κάθε αρχείο με το report της μέρας που αντιγράφηκε.", "Nothing has changed since {w}.": "Τίποτα δεν άλλαξε από {w}.", "Nothing has changed since it was copied.": "Τίποτα δεν άλλαξε από την αντιγραφή.", "{n} have changed or gone since {w}.": "{n} άλλαξαν ή χάθηκαν από {w}.", "{n} changed": "{n} άλλαξαν", "{n} gone": "{n} χάθηκαν", "Changed since it was copied": "Άλλαξε από την αντιγραφή", "No longer there": "Δεν υπάρχει πια", "Report": "Report", "There is no RoarTwin copy report in this folder. Choose the folder a twin was made in.": "Δεν υπάρχει report του RoarTwin σε αυτόν τον φάκελο. Διάλεξε τον φάκελο όπου έγινε το δίδυμο."}
const t = (text, vars) => { let o = (S.lang === 'el' && EL[text]) || text; if (vars) o = o.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? ''); return o }
const EL_WORDS = { file: ['αρχείο', 'αρχεία'], folder: ['φάκελος', 'φάκελοι'], video: ['βίντεο', 'βίντεο'], photo: ['φωτογραφία', 'φωτογραφίες'], group: ['ομάδα', 'ομάδες'] }

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
  opts: { autoCard: true, naming: false, videosOnly: false, similar: true, minSize: 0, skipHidden: true, skipCloud: true, folders: true, parts: false, photos: true, sounds: true, proxies: true, ...store.get('opts', {}) },
  // Alex, 25 Oct: folders marked Masters (never offered for the Trash), and the backup check's two folders
  protect: store.get('protect', []),
  lang: store.get('lang', 'en'),
  mode: store.get('mode', 'twins'), source: store.get('source', ''), backup: store.get('backup', ''), bres: null,
  card: store.get('card', ''), targets: store.get('targets', []), cres: null, copies: [], queue: [],
  // the naming rule's fields (Alex, 25 Oct): Date_Project/Day01/CamA_Card03
  naming: { project: '', day: 1, cam: 'A', card: 1, lastDate: '', ...store.get('naming', {}) },
  bmode: store.get('bmode', 'source'), copyDir: store.get('copyDir', ''),
  progress: null, stages: new Set(),
  result: null, filter: 'all', shown: 40, sel: new Set(), gone: new Set(),
  version: '', update: null,
}
const saveOpts = () => { store.set('roots', S.roots); store.set('opts', S.opts); store.set('protect', S.protect); store.set('mode', S.mode); store.set('source', S.source); store.set('backup', S.backup); store.set('lang', S.lang); store.set('card', S.card); store.set('targets', S.targets); store.set('naming', S.naming); store.set('bmode', S.bmode); store.set('copyDir', S.copyDir) }
/* what each kind of group is called, its colour, what the kept one is, and whether its copies come chosen */
const KINDS = {
  exact: { label: 'Exact copy', tab: 'Exact copies', c: 'var(--acc)', keep: 'the oldest', pre: true },
  folder: { label: 'Same folder twice', tab: 'Folders', c: '#64d2ff', keep: 'the oldest', pre: true },
  similar: { label: 'Same video, other files', tab: 'Same video', c: 'var(--warn)', keep: 'the best picture' },
  part: { label: 'Part of a longer video', tab: 'Parts', c: '#bf5af2', keep: 'the full video' },
  photo: { label: 'Similar photos', tab: 'Photos', c: '#ffd60a', keep: 'the most pixels' },
  sound: { label: 'Same sound, other files', tab: 'Sound', c: '#5e9bff', keep: 'the best quality' },
  orphan: { label: 'Proxy with no original here', tab: 'Proxies', c: 'var(--dim)', keep: '' },
}
// the copies chosen for the Trash at first: exact copies and twin folders, never what is in a Masters folder
const preselect = (groups) => new Set(groups.filter((g) => KINDS[g.kind]?.pre).flatMap((g) => g.files.filter((f) => !f.keep && !f.protected).map((f) => f.path)))
const app = document.getElementById('app')
T.version?.().then((v) => { S.version = v; if (S.view !== 'scan') draw() })
T.update?.state?.().then((s) => { S.update = s; drawTop() })
T.update?.on?.((s) => { S.update = s; drawTop() })

/* ---------- the top row ---------- */
let topEl = null
function drawTop() {
  if (!topEl) return
  const r = S.result
  const upd = S.update?.status === 'ready'
    ? h('button', { class: 'btn upd', onclick: () => T.update.install() }, h('span', { class: 'chip tint upd', style: { height: '20px', padding: '0 8px', border: 0 } }, h('i')), t('Restart to update'))
    : null
  const kids = [h('div', { class: 'wm' }, h('span', {}, 'ROAR'), h('b', {}, 'TWIN'))]
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
      h('button', { class: 'btn', onclick: exportList, title: t('Export the list (CSV)') }, ico('out'), h('span', { class: 'lbl' }, t('Export'))),
      h('button', { class: 'btn', onclick: () => { S.view = 'home'; draw() } }, ico('search'), h('span', { class: 'lbl' }, t('New scan'))))
  } else {
    // Privacy Policy and Terms (Alex, 25 Oct): on the company site, opens in the browser
    kids.push(h('div', { class: 'spacer' }), upd, h('a', { class: 'chip', href: 'https://themadlions.com/legal/roartwin/' + (S.lang === 'el' ? '?lang=el' : ''), target: '_blank', rel: 'noopener' }, t('Privacy & Terms')),
      S.version ? h('span', { class: 'chip' }, 'v' + S.version + ' beta') : null)
  }
  topEl.replaceChildren(...kids.filter(Boolean))
}

function draw() {
  topEl = h('header', { class: 'top' })
  const body = S.view === 'scan' ? viewScan() : S.view === 'results' ? viewResults() : S.view === 'backup' ? viewBackup() : S.view === 'copied' ? viewCopied() : viewHome()
  app.replaceChildren(topEl, body)
  drawTop()
  drawFoot()
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
  const mode = h('div', { class: 'modes' }, seg([['twins', t('Find twins')], ['backup', t('Check a backup')], ['copy', t('Make a twin')]], S.mode, (v) => { S.mode = v; saveOpts(); draw() }))
  const quiet = [
    opt(t('Language'), t('The words of the app.'), seg([['en', 'English'], ['el', 'Ελληνικά']], S.lang, (v) => { S.lang = v; document.documentElement.lang = v; saveOpts(); draw() })),
    opt(t('Skip hidden and system folders'), t('The system, the apps, the Trash, and libraries like Photos or Final Cut.'),
      switchEl(o.skipHidden, (v) => set('skipHidden', v), t('Skip hidden and system folders'))),
    // Alex, 24 Oct: a cloud drive shows the whole cloud as if it were here, and reading it downloads it
    opt(t('Skip cloud drives'), t('pCloud, iCloud, Dropbox, Google Drive, OneDrive: their files live online, and reading them downloads them. A cloud folder you choose yourself is still looked in.'),
      switchEl(o.skipCloud, (v) => set('skipCloud', v), t('Skip cloud drives'))),
  ]
  if (S.mode === 'copy') {
    // Make a twin (Alex, 25 Oct): a card to one or more drives, every copy checked
    const one = async (paths) => { const p = paths?.[0]; if (!p) return; if (!(await T.isFolder(p))) return toast(t('Choose a drive or a folder.')); S.card = p; saveOpts(); draw() }
    const more = async (paths) => { const add = []; for (const p of paths || []) if (p && p !== S.card && !S.targets.includes(p) && (await T.isFolder(p))) add.push(p); if (add.length) { S.targets = [...S.targets, ...add]; saveOpts(); draw() } }
    const chip = (p, onX) => h('span', { class: 'root', title: p }, ico('folder'), h('span', {}, p), h('button', { 'aria-label': t('Remove'), html: I.x, onclick: onX }))
    return h('main', {}, h('div', { class: 'home' }, h('div', { class: 'card' },
      h('div', { class: 'hero' }, h('h1', { html: t('A <b>twin</b> of the card.') }),
        h('p', {}, t('RoarTwin copies a card to one or more drives at once, then reads every copy back and checks it against the card, byte for byte, so nothing arrives corrupted.'))),
      mode,
      h('div', { class: 'sides' },
        dropOn(h('div', { class: 'drop side' + (S.card ? ' set' : '') }, h('div', { class: 'dz-i', html: I.folder }), h('b', {}, t('The card')), h('small', {}, t('The folder or card to copy.')),
          S.card ? chip(S.card, () => { S.card = ''; saveOpts(); draw() }) : null,
          h('button', { class: 'btn', onclick: async () => one(await T.pick()) }, ico('plus'), S.card ? t('Choose another…') : t('Choose…'))), one),
        dropOn(h('div', { class: 'drop side' + (S.targets.length ? ' set' : '') }, h('div', { class: 'dz-i', html: I.shield }), h('b', {}, t('Copy to')), h('small', {}, t('One drive, or two at once.')),
          S.targets.length ? h('div', { class: 'roots' }, ...S.targets.map((p) => chip(p, () => { S.targets = S.targets.filter((x) => x !== p); saveOpts(); draw() }))) : null,
          h('button', { class: 'btn', onclick: async () => more(await T.pick()) }, ico('plus'), S.targets.length ? t('Add a drive…') : t('Choose…'))), more)),
      h('div', { class: 'opts' },
        opt(t('Copy a card as soon as it is in'), t('When a camera card is put in, RoarTwin offers to copy it to these drives. Several cards wait their turn.'),
          switchEl(o.autoCard, (v) => set('autoCard', v), t('Copy a card as soon as it is in'))),
        opt(t('Name the folders'), t('Date_Project / Day / Camera_Card on every drive; the card number goes up by itself, the day too on a new date.'),
          switchEl(o.naming, (v) => set('naming', v), t('Name the folders'))),
        o.naming ? namingEl() : null,
        quiet[0], quiet[1]),
      h('div', { class: 'go' }, h('button', { class: 'btn main big', disabled: !S.card || !S.targets.length, onclick: startCopy }, ico('shield'), t('Copy and check'))),
      h('p', { class: 'note' }, t('Nothing is written over or deleted. The card keeps its folder name, the clips keep their dates, and each copy gets a report.')))))
  }
  if (S.mode === 'backup' && S.bmode === 'report') {
    // a drive against the report its twin left (Alex, 25 Oct)
    const pick = async (paths) => { const p = paths?.[0]; if (!p) return; if (!(await T.isFolder(p))) return toast(t('Choose a folder or a drive.')); S.copyDir = p; saveOpts(); draw() }
    return h('main', {}, h('div', { class: 'home' }, h('div', { class: 'card' },
      h('div', { class: 'hero' }, h('h1', { html: t('Has the <b>drive</b> kept it all?') }),
        h('p', {}, t('Drives go bad on the shelf without a sound. RoarTwin reads the copy again and compares every file with the report written the day it was copied.'))),
      mode, bsub(),
      dropOn(h('div', { class: 'drop' + (S.copyDir ? ' set' : '') }, h('div', { class: 'dz-i', html: I.shield }), h('b', {}, t('The copy')), h('small', {}, t('A folder a twin was made in: its report says what every file held on the day.')),
        S.copyDir ? h('span', { class: 'root', title: S.copyDir }, ico('folder'), h('span', {}, S.copyDir), h('button', { 'aria-label': t('Remove'), html: I.x, onclick: () => { S.copyDir = ''; saveOpts(); draw() } })) : null,
        h('button', { class: 'btn', onclick: async () => pick(await T.pick()) }, ico('plus'), S.copyDir ? t('Choose another…') : t('Choose…'))), pick),
      h('div', { class: 'opts' }, quiet[0]),
      h('div', { class: 'go' }, h('button', { class: 'btn main big', disabled: !S.copyDir, onclick: startRecheck }, ico('shield'), t('Check against the report'))),
      h('p', { class: 'note' }, t('Nothing is changed: RoarTwin only reads both sides.')))))
  }
  if (S.mode === 'backup') {
    // the originals (a card, a shoot) on one side, the backup on the other (Alex, 25 Oct)
    const side = (key, title, sub) => {
      const pick = async (paths) => { const p = paths?.[0]; if (!p) return; if (!(await T.isFolder(p))) return toast(t('Choose a folder or a drive.')); S[key] = p; saveOpts(); draw() }
      return dropOn(h('div', { class: 'drop side' + (S[key] ? ' set' : '') },
        h('div', { class: 'dz-i', html: key === 'source' ? I.folder : I.shield }),
        h('b', {}, title), h('small', {}, sub),
        S[key] ? h('span', { class: 'root', title: S[key] }, ico('folder'), h('span', {}, S[key]),
          h('button', { 'aria-label': 'Remove ' + S[key], html: I.x, onclick: () => { S[key] = ''; saveOpts(); draw() } })) : null,
        h('button', { class: 'btn', onclick: async () => pick(await T.pick()) }, ico('plus'), S[key] ? t('Choose another…') : t('Choose…'))), pick)
    }
    return h('main', {}, h('div', { class: 'home' }, h('div', { class: 'card' },
      h('div', { class: 'hero' }, h('h1', { html: t('Is it all on the <b>backup</b>?') }),
        h('p', {}, t('RoarTwin looks for every file of the originals on the backup by what it holds, byte for byte, wherever it sits and whatever it is called, and lists what is missing or different.'))),
      mode, bsub(),
      h('div', { class: 'sides' },
        side('source', t('The originals'), t('A card, a shoot, a drive.')),
        side('backup', t('The backup'), t('Where they should all be.'))),
      h('div', { class: 'opts' }, ...quiet),
      h('div', { class: 'go' }, h('button', { class: 'btn main big', disabled: !S.source || !S.backup, onclick: startBackup }, ico('shield'), t('Check the backup'))),
      h('p', { class: 'note' }, t('Nothing is changed: RoarTwin only reads both sides.')))))
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
      h('span', {}, r),
      h('button', { 'aria-label': 'Remove ' + r, html: I.x, onclick: () => { S.roots = S.roots.filter((x) => x !== r); S.protect = S.protect.filter((x) => x !== r); saveOpts(); draw() } })))) : null), addRoots)
  const videos = k === 'all' || k === 'video', images = k === 'all' || k === 'image', audio = k === 'all' || k === 'audio'
  return h('main', {}, h('div', { class: 'home' }, h('div', { class: 'card' },
    h('div', { class: 'hero' }, h('h1', { html: t('Find the <b>twins</b>.') }),
      h('p', {}, t('RoarTwin finds the same file twice, whatever its name, and the same video in another size or format, so you keep one and free the space.'))),
    mode,
    drop,
    h('div', { class: 'opts' },
      // Images and Audio too (Alex, 24 Oct)
      opt(t('Look for'), t(LOOK_FOR[k]),
        seg([['all', t('Every file')], ['video', t('Videos')], ['image', t('Images')], ['audio', t('Audio')]], k, (v) => { o.videosOnly = false; set('kind', v) })),
      opt(t('Whole folders twice'), t('A card or a shoot copied twice shows as one folder, not file by file.'),
        switchEl(o.folders, (v) => set('folders', v), t('Whole folders twice'))),
      videos ? opt(t('The same video in another file'), t('Also when it was exported again, in another size, codec or format. RoarTwin compares the pictures.'),
        switchEl(o.similar, (v) => set('similar', v), t('The same video in another file'))) : null,
      videos ? opt(t('Parts of longer videos'), t('A trim or a teaser cut out of a longer video, and where it starts. Slower: every video is read through.'),
        switchEl(o.parts, (v) => set('parts', v), t('Parts of longer videos'))) : null,
      videos ? opt(t('Leave editing proxies alone'), t('A proxy is never taken for a twin of its original. Proxies whose original is not in these folders are listed apart.'),
        switchEl(o.proxies, (v) => set('proxies', v), t('Leave editing proxies alone'))) : null,
      images ? opt(t('Similar photos'), t('The same photo saved again or resized, and shots of a burst that are nearly alike.'),
        switchEl(o.photos, (v) => set('photos', v), t('Similar photos'))) : null,
      audio ? opt(t('The same sound in another file'), t('A WAV and its MP3 or M4A: RoarTwin listens to the sound itself.'),
        switchEl(o.sounds, (v) => set('sounds', v), t('The same sound in another file'))) : null,
      opt(t('Smallest file'), t('Smaller files are left out.'),
        seg([[0, t('Any')], [1e6, '1 MB'], [1e8, '100 MB'], [1e9, '1 GB']], o.minSize, (v) => set('minSize', v))),
      ...quiet),
    h('div', { class: 'go' }, h('button', { class: 'btn main big', disabled: !S.roots.length, onclick: start }, ico('search'), t('Find twins'))),
    h('p', { class: 'note' }, t('Found files go to the Trash only when you say so, and one of each always stays.')))))
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
    S.view = 'home'; draw(); toast(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
  } finally { off?.() }
}
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const pad2 = (n) => String(Math.max(0, Number(n) || 0)).padStart(2, '0')
// the folder a card goes into on every drive, from the naming rule; empty means the card's own name
const folderName = (date = today()) => {
  if (!S.opts.naming) return ''
  const n = S.naming
  return [[date, n.project.trim()].filter(Boolean).join('_'), `Day${pad2(n.day)}`, [n.cam.trim() && `Cam${n.cam.trim()}`, `Card${pad2(n.card)}`].filter(Boolean).join('_')].join('/')
}
async function startCopy() {
  if (!S.card || !S.targets.length) return
  // a new date is a new shooting day, and its cards start from 1 again
  if (S.opts.naming && S.naming.lastDate && S.naming.lastDate !== today()) { S.naming.day = (Number(S.naming.day) || 0) + 1; S.naming.card = 1 }
  const folder = folderName()
  S.running = 'copy'
  S.view = 'scan'; S.progress = { stage: 'list', files: 0 }; S.stages = new Set(['list']); draw()
  const off = T.onProgress((p) => { S.progress = p; S.stages.add(p.stage); drawProgress() })
  try {
    const r = await T.copy({ source: S.card, targets: S.targets, folder, skipHidden: S.opts.skipHidden })
    if (r?.stopped) { S.queue = []; S.view = 'home'; toast(t('Copy stopped. What was half copied was taken away.')); return draw() }
    if (S.opts.naming) { S.naming.lastDate = today(); if (!r.failed.length) S.naming.card = (Number(S.naming.card) || 0) + 1 }
    S.cres = r; S.copies = [r, ...S.copies]; saveOpts()
    // the next card waiting goes straight on
    if (S.queue.length) { S.card = S.queue.shift(); saveOpts(); off?.(); return startCopy() }
    S.view = 'copied'; draw()
  } catch (e) {
    S.view = 'home'; draw(); toast(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
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
    S.view = 'home'; draw(); toast(t(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
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
    S.view = 'home'; draw(); toast(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
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
      g.kind !== 'orphan' ? h('button', { class: 'btn', style: small, onclick: () => { g.files.forEach((f) => (f.keep || f.protected ? S.sel.delete(f.path) : S.sel.add(f.path))); draw() } }, t('Keep the suggested one')) : null,
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
    a ? h('span', { class: 'chip' }, dur(a.dur)) : null,
    a ? h('span', { class: 'chip' }, a.codec.replace(/^pcm_.*/, 'PCM').toUpperCase() + (a.kbps ? ` · ${a.kbps} kb/s` : '') + ` · ${Math.round(a.rate / 100) / 10} kHz`) : null,
    f.partAt != null && !f.keep ? h('span', { class: 'chip tint', style: { '--c': '#bf5af2' } }, h('i'), t('Part · from {t}', { t: dur(f.partAt) })) : null,
    f.proxy ? h('span', { class: 'chip' }, t('Proxy')) : null,
    h('span', { class: 'chip' }, dateOf(f.mtime)),
    f.protected ? h('span', { class: 'chip tint keep' }, h('i'), t('Masters')) : null,
    f.keep && !f.protected ? h('span', { class: 'chip tint keep' }, h('i'), keepWhy) : null,
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
        c.reports[i] ? h('button', { class: 'btn', style: { height: '28px', padding: '0 10px', fontSize: '12px' }, onclick: () => T.reveal(c.reports[i]) }, ico('reveal'), t('Show report')) : null)))))
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
  footEl.replaceChildren(h('span', {}, h('b', {}, plural(files.length, 'file')), ' chosen · ', h('b', {}, bytes(size))),
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
  if (!S.targets.length) { S.mode = 'copy'; S.card = p; S.view = 'home'; saveOpts(); draw(); return toast(t('A card is in: {n}. Choose where it is copied.', { n: name })) }
  const go = await sheet(t('A card is in: {n}', { n: name }), t('Copy it to {d} and check every copy?', { d: S.targets.map((x) => x.split(/[\\/]/).filter(Boolean).pop()).join(', ') }) + (S.opts.naming ? ` → ${folderName()}` : ''), [[t('Not now'), false], [t('Copy and check'), true, true]])
  if (!go) return
  S.mode = 'copy'; S.card = p; saveOpts(); startCopy()
})
T.onMenu?.((cmd) => {
  if (cmd === 'add' && S.view === 'home') T.pick().then(addRoots)
  if (cmd === 'new' && S.view !== 'scan') { S.view = 'home'; draw() }
  if (cmd === 'export' && S.view === 'backup') exportBackup()
  if (cmd === 'export' && S.view === 'results') exportList()
})
// a folder dropped anywhere on the home screen counts
document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('drop', (e) => { e.preventDefault(); if (S.view === 'home' && S.mode === 'twins' && !e.target.closest('.drop')) addRoots([...e.dataTransfer.files].map((f) => T.pathOf(f))) })
window.addEventListener('resize', () => document.querySelectorAll('.seg').forEach((s) => { const on = s.querySelector('button.on'), l = s.querySelector('.lens'); if (on && l) { l.style.left = on.offsetLeft + 'px'; l.style.width = on.offsetWidth + 'px' } }))
draw()
