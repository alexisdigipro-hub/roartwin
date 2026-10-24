# RoarTwin · instructions for Claude Code

RoarTwin finds duplicate files on folders and drives, and the same video in another file. The Mad Lions Lab
(Alex Konstantinidis, film director, Athens; not a developer). Talk to him in Greek, friendly and concrete, no em
dashes; the app's own text is English.

- Electron app (Mac and Windows): `app/` is the page (plain HTML, CSS, ES modules, no build step, no dependencies);
  `electron/` the shell. ffmpeg comes with the app through the npm package ffmpeg-static (asarUnpack; main.js
  ffmpegPath). The Mac build makes arm64 then x64, each with its own ffmpeg (package.json ffmpeg:arm64 / ffmpeg:x64).
- The engine is `electron/engine.js`, plain Node, tested by `npm test` on real files made with ffmpeg
  (FFMPEG=/usr/bin/ffmpeg node test/engine.test.js where npm cannot install). Change it only with the test passing.
- Never delete a file: shell.trashItem only, and one file of each group always stays (checked in app.js and main.js).
- Look: RoarMe's dark glass (graphite, round glass buttons, pill fields, soft tiles, the chosen option as glass with
  the sliding lens), accent #ff453a.
- Releases: bump `version` in package.json, tag `vX.Y.Z`, push the tag (.github/workflows/desktop.yml); the release's
  files are the download links and what electron/updater.js looks at.
- Work on a branch, open a PR, wait for the green check (.github/workflows/check.yml), merge it yourself.
