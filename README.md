# RoarTwin

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
- **Similar photos:** each picture as a 9x8 fingerprint; the same photo saved again or resized, and burst shots that
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
- **A card put in** (Make a twin, a switch, on by default): RoarTwin looks at the drives every few seconds; a new one
  that holds camera clips (DCIM, PRIVATE/M4ROOT, XDROOT, CLIP, CONTENTS, AVCHD, a RED .RDM, clips at its top) brings a
  question: copy it to the chosen drives and check every copy? Cards put in during a copy wait their turn and go on by
  themselves.
- **Naming the folders** (a switch): Date_Project/DayNN/CamX_CardNN on every drive. The card number goes up after
  each copy that checked out, and on a new date the day goes up and the cards start from 1.
- **A drive against its copy report** (Check a backup → Against its copy report): months later, the folder a twin was
  made in is read again and every file compared with the SHA-256 its newest report holds: still the same, changed
  (bit rot) or gone.
- **Language:** English by default; Ελληνικά under Language (every text of the page, kept per computer).
- **The one to keep:** for exact copies the oldest; for the same video the biggest picture, then the most data.

## Safe by design
Nothing is deleted: chosen files go to the computer's Trash, and one file of each group always stays (the page and
the app both check). Exact copies come chosen (all but the one to keep); the same video in other files is for you
to choose. The list can be saved as CSV.

## Layout
- `electron/engine.js`: the scan (plain Node). `test/engine.test.js` runs it on real videos made with ffmpeg.
- `electron/main.js`, `preload.js`: the window, folders, Trash, Finder/Explorer. `updater.js`: updates from the releases.
- `app/`: the page (no build step). Opened in a browser, `app/demo.js` stands in for the disk.

## Releases
Bump `version` in package.json, tag `vX.Y.Z`, push the tag: `.github/workflows/desktop.yml` builds the Mac (Apple
Silicon and Intel) and Windows installers onto a GitHub release; the app updates itself from there.
On a Mac it can replace itself only from Applications: started from the .dmg or Downloads, it offers to move itself
there first (Move to Applications), and from then on every update comes by itself (Restart to update, or on quit).
