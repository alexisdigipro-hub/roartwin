// The Vault's sealed file and its helpers, without Electron: node test/vault.test.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { seal, sealWith, open, readHead, writeAtomic, parseCsv, generate, cleanEntry, shown, PARAMS, LOOKALIKE } = require('../electron/tools/vault')

;(async () => {
  const data = { v: 1, entries: [cleanEntry({ title: 'Studio Wi-Fi', username: 'tml', password: 'σ3cr3t-Λ' })], created: 1, updated: 1 }

  // round trip, with the parameters it says
  const s = await seal(data, 'correct horse battery')
  const h = readHead(s.buf)
  assert.deepStrictEqual(h.params, PARAMS)
  assert.strictEqual(h.salt.length, 16)
  const back = await open(s.buf, 'correct horse battery')
  assert.deepStrictEqual(back.data, data)
  assert.ok(!s.buf.includes(Buffer.from('σ3cr3t-Λ')), 'the password is not in the file as text')

  // a wrong password says only that
  await assert.rejects(open(s.buf, 'correct horse batterY'), /Wrong password/)

  // a changed file is refused, in the body, the tag or the header
  for (const at of [s.buf.length - 1, h.head.length + 12 + 3, 10]) {
    const bad = Buffer.from(s.buf); bad[at] ^= 1
    await assert.rejects(open(bad, 'correct horse battery'), /Wrong password|Not a vault/)
  }
  await assert.rejects(open(Buffer.from('hello'), 'x'), /Not a vault/)

  // each save has its own IV; the same key opens it
  const again = sealWith(data, back.key, back.salt, back.params)
  assert.ok(!again.subarray(h.head.length, h.head.length + 12).equals(h.iv))
  assert.deepStrictEqual((await open(again, 'correct horse battery')).data, data)

  // a new master password: new salt, the old one no longer opens it
  const changed = await seal(data, 'a new master pass')
  assert.ok(!readHead(changed.buf).salt.equals(h.salt))
  await assert.rejects(open(changed.buf, 'correct horse battery'), /Wrong password/)
  assert.deepStrictEqual((await open(changed.buf, 'a new master pass')).data, data)

  // written whole, the one before kept
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'))
  const file = path.join(dir, 'vault.bin')
  writeAtomic(file, s.buf)
  assert.ok(!fs.existsSync(file + '.bak'))
  writeAtomic(file, changed.buf)
  assert.ok(fs.readFileSync(file).equals(changed.buf))
  assert.ok(fs.readFileSync(file + '.bak').equals(s.buf), 'the copy before is kept')
  assert.deepStrictEqual(fs.readdirSync(dir).sort(), ['vault.bin', 'vault.bin.bak'], 'no temp file left')
  fs.rmSync(dir, { recursive: true, force: true })

  // the page's list never has a password
  assert.ok(!('password' in shown(data.entries[0])))
  assert.strictEqual(shown(data.entries[0]).hasPassword, true)

  // CSV of Chrome and of 1Password (quoted cells, commas and new lines inside)
  const chrome = 'name,url,username,password,note\r\nGmail,https://accounts.google.com,alex@x.com,"p,a""ss",\r\nVimeo,https://vimeo.com,tml,"line1\nline2","a note"\r\n'
  const c = parseCsv(chrome)
  assert.strictEqual(c.length, 2)
  assert.deepStrictEqual(c[0], { title: 'Gmail', website: 'https://accounts.google.com', username: 'alex@x.com', password: 'p,a"ss', notes: '', tag: '' })
  assert.strictEqual(c[1].password, 'line1\nline2')
  const op = parseCsv('﻿Title,Website,Username,Password,Notes\nRED,https://red.com,cam,xyz,ok\n')
  assert.deepStrictEqual(op[0], { title: 'RED', website: 'https://red.com', username: 'cam', password: 'xyz', notes: 'ok', tag: '' })
  assert.deepStrictEqual(parseCsv('a,b\n1,2\n'), [], 'no password column, nothing taken')

  // the generator
  for (let i = 0; i < 200; i++) {
    const p = generate({ length: 24 })
    assert.strictEqual(p.length, 24)
    assert.ok(/[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p) && /[^a-zA-Z0-9]/.test(p), 'one of each kind')
    assert.ok(!LOOKALIKE.test(p)); LOOKALIKE.lastIndex = 0
  }
  assert.strictEqual(generate({ length: 4 }).length, 12, 'at least 12')
  assert.strictEqual(generate({ length: 500 }).length, 64, 'at most 64')
  assert.ok(/^\d+$/.test(generate({ length: 16, lower: false, upper: false, symbols: false })))
  const words = generate({ words: 5 })
  assert.strictEqual(words.split('-').length, 6)
  assert.notStrictEqual(generate(), generate())

  console.log('vault: all good')
})().catch((e) => { console.error(e); process.exit(1) })
