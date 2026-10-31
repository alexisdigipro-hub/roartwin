# RoarKit (RoarTwin until 28 Oct 2026) · instructions for Claude Code

RoarKit is a utility of many tools for film people (it began as RoarTwin, the duplicate finder). The Mad Lions Lab
(Alex Konstantinidis, film director, Athens; not a developer). Talk to him in Greek, friendly and concrete, no em
dashes; the app's own text is English by default, with Greek as a choice (app.js: `t()` and the `EL` table, English text as the key; every new text goes through `t()` and gets its Greek).

- Electron app (Mac and Windows): `app/` is the page (plain HTML, CSS, ES modules, no build step, no dependencies);
  `electron/` the shell. ffmpeg comes with the app through the npm package ffmpeg-static (asarUnpack; main.js
  ffmpegPath). The Mac build makes arm64 then x64, each with its own ffmpeg (package.json ffmpeg:arm64 / ffmpeg:x64).
- The engine is `electron/engine.js`, plain Node, tested by `npm test` on real files made with ffmpeg
  (FFMPEG=/usr/bin/ffmpeg node test/engine.test.js where npm cannot install). Change it only with the test passing.
- Clean up (28 Oct): electron/clean.js, a fixed list of cache places per system, only what is inside them, to the Trash; change it only with test/clean.test.js passing.
- Many tools (Alex, 28 Oct): a side menu (app.js NAV); each new tool is app/tools/<id>.js + electron/tools/<id>.js +
  test/<id>.test.js, its CSS in app/tools/tools-*.css; Language and the skips live in Settings. The name on screen is
  RoarKit (app.js NAME), the app file RoarKit.app since 0.4.2; bundle id, settings folder, repo and copy report names stay RoarTwin (see README, The name).
- 0.5.0 (Alex, 29 Oct): Uninstall apps and Startup items are tools (Computer group); the menu bar is electron/tray.js and
  Do by itself electron/jobs.js (both in package.json build.files, both tested: test/tray.test.js, test/jobs.test.js);
  Similar photos is in engine.js (RAW previews, HEIC via sips, dHash + pHash, sharpness). Turning a startup item off is
  never a delete (kept in userData/Disabled startup items). app/demo.js VERSION must equal package.json's version
  (test/version.test.js); the Mac build adds Contents/MacOS/RoarTwin -> RoarKit for the 0.1.x/0.2.x updaters (adhoc-sign.js).
- Look since 0.4.0 (Alex, 29 Oct): app/design.css on top of styles.css (tokens for light/dark, a tile colour per tool in [data-tool]); Overview is app/tools/home.js; a redraw keeps scroll positions. Keep both themes right in anything new.
- Never delete a file: shell.trashItem only, and one file of each group always stays (checked in app.js and main.js).
- Look since 0.7.0 (Alex, 30 Oct: "RoarWriter, RoarList, RoarMorph, RoarKit exactly alike, as RoarMail"): app/theme.css,
  loaded last, RoarMail's Simba (floating graphite glass columns, red accent that glows, the chosen thing lit from inside,
  12px corners, Jost wordmark from app/fonts). Keep it in step with RoarMail's styles.css and RoarMorph/RoarWriter's copy.
- Releases: bump `version` in package.json, tag `vX.Y.Z`, push the tag (.github/workflows/desktop.yml); the release's
  files are the download links and what electron/updater.js looks at.
- Work on a branch, open a PR, wait for the green check (.github/workflows/check.yml), merge it yourself.
- Three spaces since 0.8.0 (Alex, 31 Oct): app.js SPACES (Shoot / Clean up / Computer, each tool with a line on what it does) in the bar at the top (barEl), the side lists the space picked (sideEl), NEXT the tools that follow one, ⌘K Find a tool (openFind); NAV is derived from SPACES. A new tool goes into one space with its line and its Greek. Styles at the end of app/theme.css.
