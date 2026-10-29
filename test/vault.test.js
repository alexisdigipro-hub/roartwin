// The Vault's sealed file and its helpers, without Electron: node test/vault.test.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { seal, sealWith, open, readHead, writeAtomic, parseCsv, csvText, newRows, generate, cleanEntry, shown, PARAMS, LOOKALIKE, base32, parseTotp, totpAt, healthOf } = require('../electron/tools/vault')

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

  // audit, 29 Oct: a made-up header asking scrypt for gigabytes is refused at once, before any key is made
  for (const [logN, r, p] of [[22, 8, 1], [17, 32, 1], [20, 16, 1], [17, 8, 9]]) {
    const bad = Buffer.from(s.buf); const at = 7 + 1 + 16
    bad[at] = logN; bad[at + 1] = r; bad[at + 2] = p
    const t0 = Date.now()
    await assert.rejects(open(bad, 'correct horse battery'), /Not a vault/)
    assert.ok(Date.now() - t0 < 200, 'refused without deriving a key')
  }

  // CSV: Excel's UTF-16 with Greek, and a second import brings in only what is new
  const greek = 'name,url,username,password\nΤράπεζα,https://bank.gr,αλέξης,"κωδικός,1"\n'
  const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(greek, 'utf16le')])
  assert.deepStrictEqual(parseCsv(csvText(le))[0], { title: 'Τράπεζα', website: 'https://bank.gr', username: 'αλέξης', password: 'κωδικός,1', notes: '', tag: '' })
  const be = Buffer.from(greek, 'utf16le'); be.swap16()
  assert.strictEqual(parseCsv(csvText(Buffer.concat([Buffer.from([0xfe, 0xff]), be])))[0].password, 'κωδικός,1')
  assert.strictEqual(parseCsv(csvText(Buffer.from('﻿' + greek, 'utf8')))[0].title, 'Τράπεζα')
  const have = parseCsv(chrome).map((r) => cleanEntry(r))
  assert.strictEqual(newRows(parseCsv(chrome), have).length, 0, 'the same CSV twice adds nothing')
  assert.strictEqual(newRows(parseCsv(chrome + 'Box,https://box.com,me,pw-1,\n'), have).length, 1)
  assert.strictEqual(newRows([...parseCsv(chrome), ...parseCsv(chrome)], []).length, 2, 'duplicates inside one file once')

  // two-factor codes: RFC 6238's own test vectors (SHA-1, 8 digits, the key "12345678901234567890")
  const rfc = { key: Buffer.from('12345678901234567890'), digits: 8, period: 30, algo: 'sha1' }
  for (const [sec, code] of [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']]) {
    assert.strictEqual(totpAt(rfc, sec * 1000).code, code, `TOTP at ${sec}`)
  }
  assert.strictEqual(totpAt(rfc, 59 * 1000).left, 1)
  // the same key as base32, the way a site shows it, and as an otpauth:// link
  assert.ok(base32('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ').equals(rfc.key))
  assert.ok(base32('gezd gnbv gy3t qojq gezd gnbv gy3t qojq').equals(rfc.key), 'spaces and small letters')
  assert.strictEqual(base32('not!base32'), null)
  const six = parseTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')
  assert.strictEqual(totpAt(six, 59 * 1000).code, '287082', 'six digits by default')
  const uri = parseTotp('otpauth://totp/Vimeo:studio?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Vimeo&digits=8&period=30')
  assert.strictEqual(totpAt(uri, 1111111109 * 1000).code, '07081804')
  assert.strictEqual(parseTotp('otpauth://hotp/x?secret=GEZDGNBV'), null, 'counter codes are not time codes')
  assert.strictEqual(parseTotp('hello world'), null)
  assert.throws(() => cleanEntry({ title: 'x', totp: 'not a key' }), /two-factor/)
  assert.strictEqual(shown(cleanEntry({ title: 'x', totp: 'GEZDGNBVGY3TQOJQ' })).hasTotp, true)
  assert.ok(!('totp' in shown(cleanEntry({ title: 'x', totp: 'GEZDGNBVGY3TQOJQ' }))), 'the key is never in the list')

  // password health: weak, reused, old
  const now = Date.now()
  const es = [
    { id: 'a', password: 'lions-den-2026' , created: now, changed: now },
    { id: 'b', password: 'lions-den-2026', created: now, changed: now },
    { id: 'c', password: '1234567890', created: now, changed: now },
    { id: 'd', password: 'Vx7-qK2m-Lp9w-Rz4t', created: now - 400 * 864e5, changed: now - 400 * 864e5 },
    { id: 'e', password: 'Vx7-qK2m-Lp9w-Rz4tX', created: now, changed: now },
    { id: 'f', password: '', created: now },
  ]
  const hl = healthOf(es, now)
  assert.deepStrictEqual(hl.a, ['reused']); assert.deepStrictEqual(hl.b, ['reused'])
  assert.deepStrictEqual(hl.c, ['weak']); assert.deepStrictEqual(hl.d, ['old']); assert.deepStrictEqual(hl.e, []); assert.deepStrictEqual(hl.f, [])
  assert.ok(healthOf([{ id: 'x', password: 'short' }]).x.includes('weak'))
  // a password changed is "changed" now; an edit of the name alone keeps the date
  const e0 = cleanEntry({ title: 'A', password: 'one-two-three-four' })
  const old = { ...e0, changed: now - 500 * 864e5 }
  assert.strictEqual(cleanEntry({ title: 'B' }, old).changed, old.changed)
  assert.ok(cleanEntry({ password: 'another-one-here' }, old).changed >= now)

  // every write is flushed and the vault never half written (the temp file is gone after)
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-'))
  writeAtomic(path.join(d2, 'vault.bin'), s.buf)
  assert.deepStrictEqual(fs.readdirSync(d2), ['vault.bin'])
  fs.rmSync(d2, { recursive: true, force: true })

  console.log('vault: all good')
})().catch((e) => { console.error(e); process.exit(1) })
