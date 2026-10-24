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
