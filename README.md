# RoarKit (RoarTwin until 28 Oct 2026)

A utility of many tools for film people, Mac and Windows (The Mad Lions Lab). A side menu, one tool a page, Settings
(language, skip hidden and cloud folders) for all of them. Nothing is ever deleted for good: what goes, goes to the Trash.

## The tools (29 Oct 2026)
- **Space:** Space map (every folder by size, the biggest files, space by kind, large and old files, a Mac's local
  snapshots), Clean up (below), Project leftovers (old Resolve optimized/proxy media, Premiere previews, After Effects
  cache, Final Cut render files, by project and age), Find twins (below).
- **Shoot:** Make a twin (now also an ASC MHL v1.1 with MD5 in every copy), Check a backup, Media report (every clip:
  length, codec and profile, size, fps, timecode, sound; CSV and PDF), Clip check (every clip decoded in full, the broken
  ones explained), Contact sheet (PDF), Rename clips (a rule of tokens: date, time, project, cam, card, counter, name,
  timecode, camera, reel; preview, clashes refused, Undo).
- **Files:** File manager (two panes, copy and move without overwriting, compare, project folder templates, favourites,
  Media info in depth from ffmpeg and, on a Mac, mdls), Archives (open zip, rar, 7z, tar.*, iso, cab, pkg into a new
  folder, password asked, zip-slip refused; make zip, 7z, tar.gz, tar.xz, Mac junk left out; through the system's tar).
- **Drives:** Drive health (SMART, free space, bus, last check against a copy report), Disk speed test (write and read,
  then which ProRes, BRAW and H.264/H.265 rates the drive can take).
- **Computer:** Computer stats (processor per core, memory and pressure, swap, drives, network now, heat level and
  battery, the heaviest programs, an internet speed test through Cloudflare), Startup items (below), Uninstall apps
  (below).
- **Private:** Vault (passwords, AES-256-GCM with a scrypt key from one master password, only on this computer, locks
  itself, copies clear the clipboard after 30 s, generator, encrypted backup, import from browsers' CSV).

The name: on screen RoarKit since 0.3.0; the app file is RoarKit.app since 0.4.2 (productName, artifactName and the
workflow's names; 0.3.0's updater takes any name and puts RoarKit.app in place of RoarTwin.app). Kept as RoarTwin on
purpose, so nothing installed or saved breaks: the bundle id com.themadlions.roartwin, the settings folder (main.js
setPath), the repository (updater REPO), the copy reports' file names (`_RoarTwin copy report …csv`, read back by
Check a backup and Drive health), the hidden work files (.roartwin-part and the like), and the RoarTwin-*.dmg/exe
copies on each release for old download links. Since 0.5.0 the Mac app also carries Contents/MacOS/RoarTwin, a link to
RoarKit (electron/adhoc-sign.js, before signing): the 0.1.x/0.2.x updater takes a new app only if it holds a program of
that name, so without it those installs would download every update and never take it (test/updater.test.js).

**Back and forward** (0.3.1): ← → at the start of the top row, Cmd+[ / Cmd+] (Alt+← / Alt+→ on Windows), a trackpad
swipe, the mouse's side buttons. Every screen is remembered, inside a tool too (a tool's `nav`: get/set of what makes its
screen, e.g. Space map's folder, File manager's two folders, a report's result).

**0.8.3 (31 Oct):** the spaces' names centred in their buttons (the class of the name was also Space map's, which pushed it down).

**0.8.2 (31 Oct):** the spaces in the order Alex asked: **Computer** first (it starts on Computer stats), then Clean up, then Shoot.

**0.8.1 (31 Oct):** File manager: every folder's size shows by itself (Alex: "why do I have to press Size to see them"), worked out three at a time for the folders open now, each figure in its row as it comes; a list sorted by size takes its order again once they are in.

**0.8.0 (31 Oct): three spaces.** Alex: "many tools, it confuses"; of three layouts he picked A. A bar across the top holds RoarKit (back to the Overview), the three spaces **Shoot · Clean up · Computer** in the middle and **Find a tool** (⌘K / Ctrl+K) on the right. The side lists only the tools of the space picked, each with a line on what it does, then **Next** (the tools that usually come after this one), then Overview and Settings. A space opens on the tool last used in it. Shoot: Make a twin, Check a backup, Clip check, Media report, Contact sheet, Rename clips. Clean up: Clean up, Space map, Find twins, Project leftovers, Uninstall apps. Computer: Computer stats, Drive health, Disk speed test, Startup items, File manager, Archives, Vault. Find a tool searches names and what each does, in English and Greek.

**0.7.2 (30 Oct):** the side back as in 0.7.0 (Alex: "leave the side as it was"), every tool fitting in it; the window buttons' strip and the big window stay.

**0.7.1 (30 Oct):** the Mac's three window buttons (and Windows' own) in a 40px strip above the floating columns, as in
RoarMail (main.js trafficLightPosition 20/13, overlay 40px); the side's words 50% bigger (Alex), the list scrolling
inside the side when the window is short; the window opens big (90% of the screen, up to 1600 x 1060).

**0.7.0 (30 Oct): RoarMail's look.** Alex: "RoarWriter, RoarList, RoarMorph, RoarKit exactly alike in design and UI, as
RoarMail". `app/theme.css`, loaded last, is RoarMail's Simba: graphite glass columns floating on a graphite backdrop with a
gap between them (the side and the tool's column), one red accent that glows, the chosen tool lit from inside, 12px
corners, the main button red and glowing, a choice as a pale glowing pill, the wordmark in Jost (app/fonts, OFL). Light
and dark. RoarMorph and RoarWriter carry the same file; RoarList already wears it.

**0.6.1 (30 Oct): the look of Roarverter / RoarMorph.** Alex, after 0.6.0's "instrument": "bigger icons in the side
menu, and make it as Roarverter is". `app/theme.css`, loaded last: Roarverter's graphite glass with the red light at the
top, pill buttons, round icon buttons, soft glass tiles, the red main button; the side menu has large line icons in one
colour (no coloured tiles), the chosen tool as lighter glass with its icon in the accent. The rows shorten with the
window's height so every tool still fits. Nothing a tool does changed.

**0.5.0 (29 Oct): Uninstall apps, Startup items, the menu bar, Do by itself, Similar photos.**
- **Uninstall apps** (Computer): every app with its version, size and the last time it was opened (Mac: /Applications,
  ~/Applications and one folder deeper, Info.plist, du, mdls kMDItemLastUsedDate; Windows: the Uninstall keys of HKLM,
  its WOW6432Node and HKCU, without system parts and updates). On a Mac, choosing an app finds what it left in ~/Library
  (Application Support, Caches, Preferences, Containers, Group Containers, Saved Application State, Logs, HTTPStorages,
  WebKit, LaunchAgents) by its bundle id, and by its name where a folder is named after it (never a name many share, never
  what is another installed app's, as com.foo.bar.pro for com.foo.bar), each with its size and a check box; the app and
  the chosen go to the Trash, a login agent stopped first. Refused: /System and Apple's own (com.apple.*), RoarKit itself,
  an app that is open. On Windows the program's own uninstaller runs after a confirm (an MSI's /I becomes /X).
  electron/tools/uninstall.js, test/uninstall.test.js on a made-up home folder.
- **Startup items** (Computer): Mac login items (System Events; macOS asks once for Automation), ~/Library/LaunchAgents,
  /Library/LaunchAgents and /Library/LaunchDaemons (label, program, at login, keeps running, loaded or running per
  launchctl list). Windows: the Run keys (HKCU, HKLM, WOW6432Node) and the Startup folders. A switch turns one off and on
  again, never a delete: a person's launch agent is stopped (launchctl bootout gui/<uid>) and its plist moved into
  userData/Disabled startup items (back with launchctl bootstrap); a login item is remembered, then removed (and made
  again from what was remembered); a Run value is saved there before it is taken out of the registry, and put back;
  a Startup folder shortcut is moved aside. What is set for every user (/Library, HKLM, the common Startup folder) is
  shown read only with a note. electron/tools/startup.js, test/startup.test.js.
- **The menu bar** (electron/tray.js, Settings > Menu bar, on at first on a Mac, off on Windows where it is the
  notification area and keeps RoarKit running when the window closes): a toolbox icon drawn at start (a template PNG
  made by hand), the start-up disk's free space beside it; its menu shows that, the memory pressure and the heat level,
  and opens RoarKit, the Overview or Clean up. A notification, once each time it begins: the start-up disk under 10%
  free, a drive failing (SMART, every 15 minutes), the computer seriously hot. test/tray.test.js.
- **Do by itself** (electron/jobs.js, Settings): each off at first. A weekly Clean up of the safe caches only (what Clean
  up chooses at first, never the installers; a program that is open left alone; to the Trash), on a day and time. A
  monthly check of the folders added against their copy reports (Check a backup > Against its copy report). They run
  while the app or the menu bar icon runs, one missed runs once at the next start, the last runs are listed in Settings
  (with Run now) and each sends a notification. userData/jobs.json; the schedule maths in test/jobs.test.js (Athens
  time, across the change of the clocks).
- **Similar photos** (Find twins): JPG, PNG, TIFF, HEIC (through the Mac's sips when ffmpeg cannot read it) and camera
  RAW (through the JPEG preview inside it, the biggest viewable one; lossless sensor data left out). Two 64-bit
  fingerprints from one 64x64 grey frame: a difference hash and a perceptual hash (DCT); near alike on both, or nearly
  the same difference hash. The one kept: the most pixels, then the sharpest (Laplacian variance over a 1024-pixel grey
  frame), then the newest; a clearly softer shot says Softer. The same safe Trash flow, one always kept, Masters kept.
- The privacy link is themadlions.com/legal/roarkit/; the version a browser shows is app/demo.js VERSION, checked
  against package.json by test/version.test.js.

**0.4.0 (29 Oct): Overview, Settings, the new look.**
- Overview, the first page: a score for the computer and what needs care first (start-up disk, failing or full drives,
  caches, memory, heat, battery, an update), each with the tool that sorts it out; the numbers at a glance; Jump to.
- Settings in groups: Dark / Light / Automatic, six accent colours, text size, less movement, Open where I left off,
  a notification (and a sound) when a long job ends while you are in another app, the company on PDFs, updates.
- The look (app/design.css, over styles.css): the Mac's own frosted side menu (vibrancy), a coloured tile for each
  tool, a glass lens that glides to the chosen tool, pages that come in from below or above, cards one after the
  other, buttons that lift and press, a shine on the main button, springy switches, thin scroll bars.
- A page drawn again keeps where it was scrolled (app.js scrollsOf / putScrolls).
- Every tool was audited (bugs fixed with tests) and grew: see the commit for the list.

## Layout of the tools
- `app/tools/<tool>.js`: a tool's page (`{ id, el, view(ctx), top(ctx), demo }`, see app/tools/index.js) and its
  `tools-<x>.css`; `electron/tools/<tool>.js`: its Mac/Windows side (`register(ctx)`, `ctx.handle('<tool>-<what>')`).
- `test/<tool>.test.js` for each; `npm test` runs them all (test/all.js), the engine's last.


Finds the twins on a folder or a drive: the same file twice, whatever its name, and the same video in another
file (exported again, in another size, codec or container). Mac and Windows. An experiment of The Mad Lions Lab.

## How it finds them
- **Exact copies, any file:** the same size, then the same bytes at the start, middle and end, then the same
  SHA-256 of the whole file. Names play no part: a renamed copy is found, and two files that only share a name
  (A001_C003.MOV from two shoots) are never taken for twins.
- **The same video in another file:** ffmpeg (inside the app) reads each video's length, picture size, codec and
  frame rate. Videos of about the same length (within 1% or a second) are compared by their pictures: nine frames
  from 10% to 90% through, each a 64-bit difference hash. Most frames nearly alike = the same video. Flat frames
  (black, one colour) are left out, so different black clips are not twins.
- **Cloud drives left out (a setting, on by default):** pCloud, iCloud, Dropbox, Google Drive, OneDrive and the like
  show the whole cloud as if it were on the computer, and reading a file downloads it. Folders by those names, and
  drives a cloud app mounts (FUSE or WebDAV on a Mac), are not walked into; the results name what was left out. A
  cloud folder chosen by hand is still looked in.
- **Look for:** Every file, Videos, Images (photos, HEIC, PSD and camera RAW: CR3, NEF, ARW, DNG…) or Audio (WAV,
  AIFF, MP3, M4A, FLAC…).
- **Whole folders twice:** a folder whose every file has an exact twin in another folder, file for file, is shown as
  one folder twice (a card copied whole), and its files are not listed one by one again.
- **A part of a longer video** (a choice, slower): every video one frame a second; a shorter one whose frames match a
  stretch of a longer one is a part of it, and where it starts is shown (a teaser cut out of the full clip).
- **Similar photos:** (0.5.0, above) RAW and HEIC too, a difference and a perceptual hash, the sharpest kept; the same photo saved again or resized, and burst shots that
  are nearly alike, of the same shape.
- **The same sound in another file:** a WAV and its MP3/M4A, compared by the sound itself (an audio fingerprint in the
  Haitsma-Kalker way: rising or falling energy across 33 bands, 40 seconds of it).
- **Editing proxies** (Proxy, Proxies, Proxy Media, CacheClip folders, or …_Proxy names) are never a twin of their
  original; a proxy whose original is not in the folders looked at is listed apart, nothing chosen.
- **Masters:** the lock on a folder marks it Masters: nothing in it is ever chosen or moved to the Trash (the app checks
  too), and its copy is always the one kept.
- **Check a backup:** the originals on one side, the backup on the other; every file is looked for on the backup by its
  bytes (size, samples, SHA-256), wherever it sits and whatever it is called. What is missing, or different at the same
  place, is listed and can be saved as CSV. Nothing is changed.
- **Make a twin** (for the cards of a shoot): a card copied to one or more drives at once (the card read once), each
  file written under a temporary name and named only when whole, with the card's dates, then read back from every
  drive and its SHA-256 checked against the card's. Nothing is written over (a file already there with the same bytes
  counts as copied; one with other bytes is reported and left alone), nothing is deleted, there must be room first,
  and each copy gets `_RoarTwin copy report <date>.csv` (every file, size, SHA-256, result).
- **A card put in** (Make a twin, a switch, on by default): RoarKit looks at the drives every few seconds; a new one
  that holds camera clips (DCIM, PRIVATE/M4ROOT, XDROOT, CLIP, CONTENTS, AVCHD, a RED .RDM, clips at its top) brings a
  question: copy it to the chosen drives and check every copy? Cards put in during a copy wait their turn and go on by
  themselves.
- **Naming the folders** (a switch): Date_Project/DayNN/CamX_CardNN on every drive. The card number goes up after
  each copy that checked out, and on a new date the day goes up and the cards start from 1.
- **A drive against its copy report** (Check a backup → Against its copy report): months later, the folder a twin was
  made in is read again and every file compared with the SHA-256 its newest report holds: still the same, changed
  (bit rot) or gone.
- **Light on the computer:** each ffmpeg decodes on one core at a low priority, as many side by side as half the cores
  (2 to 4); JPEGs are read at an eighth of their size for their fingerprint, video previews come from the nearest key
  frame. The same results with about half the processor of before.
- **Clean up** (Alex, 28 Oct): Measure shows how much each program's cache holds: DaVinci Resolve (CacheClip, logs),
  the Adobe media cache (Premiere Pro, After Effects, Media Encoder, Audition), Adobe Team Projects, the After Effects
  disk cache, Cinema 4D and Redshift, every other app's cache, logs, old iPhone/iPad updates, Xcode build files and
  installers left in Downloads (off at first). A switch per place; the chosen go to the Trash. Only those fixed places
  (`electron/clean.js`), only what is inside them (the folder stays), links never followed, and a place whose program
  is open is left alone (Close … first). Windows: Resolve, Adobe, After Effects, Temp, installers.
- **Language:** English by default; Ελληνικά under Language (every text of the page, kept per computer).
- **The one to keep:** for exact copies the oldest; for the same video the biggest picture, then the most data.

## Safe by design
Nothing is deleted: chosen files go to the computer's Trash, and one file of each group always stays (the page and
the app both check). Exact copies come chosen (all but the one to keep); the same video in other files is for you
to choose. The list can be saved as CSV.

## Layout
- `electron/engine.js`: the scan (plain Node). `test/engine.test.js` runs it on real videos made with ffmpeg.
- `electron/clean.js`: Clean up's places, measured and checked (plain Node). `test/clean.test.js` runs it on a made-up home folder.
- `electron/jobs.js`: Do by itself (the schedule, the runner, the log); `electron/tray.js`: the menu bar icon and its alerts.
- `electron/main.js`, `preload.js`: the window, folders, Trash, Finder/Explorer. `updater.js`: updates from the releases.
- `app/`: the page (no build step). Opened in a browser, `app/demo.js` stands in for the disk.

## Releases
Bump `version` in package.json, tag `vX.Y.Z`, push the tag: `.github/workflows/desktop.yml` builds the Mac (Apple
Silicon and Intel) and Windows installers onto a GitHub release; the app updates itself from there.
On a Mac it can replace itself only from Applications: started from the .dmg or Downloads, it offers to move itself
there first (Move to Applications), and from then on every update comes by itself (Restart to update, or on quit).
