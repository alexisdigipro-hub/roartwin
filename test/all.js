// npm test: every test file, one after the other (the tools' first, the engine's last: it needs ffmpeg)
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).sort((a, b) => (a === 'engine.test.js') - (b === 'engine.test.js') || a.localeCompare(b))
for (const f of files) { console.log('· ' + f); execFileSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' }) }
