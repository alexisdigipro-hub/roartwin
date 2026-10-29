// A Mac app has to carry at least an ad-hoc signature or an Apple Silicon Mac calls it "damaged".
// There is no paid Apple certificate (Alex, 15 Oct: a few people of his own), so the app is signed
// ad hoc after packing; the first open then needs Open Anyway once, nothing more.
//
// The old name inside the new app (29 Oct): RoarTwin 0.1.x and 0.2.x update themselves with a script that takes the new
// app only if it holds Contents/MacOS/RoarTwin (their own program's name). RoarKit.app's program is Contents/MacOS/RoarKit,
// so those installs would download every update and never take it. A link RoarTwin -> RoarKit beside it, signed with
// the app, lets them take it (as RoarTwin.app, which then runs RoarKit); 0.3.0 and later look at the app's own
// CFBundleExecutable and rename it RoarKit.app on the next update.
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return
  const name = context.packager.appInfo.productFilename
  const app = path.join(context.appOutDir, `${name}.app`)
  const old = path.join(app, 'Contents', 'MacOS', 'RoarTwin')
  if (name !== 'RoarTwin' && !fs.existsSync(old)) fs.symlinkSync(name, old)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
}
