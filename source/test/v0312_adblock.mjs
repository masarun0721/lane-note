// v0.31.2：広告ブロックの拡張機能（EasyList など）に隠されやすい id・class を admin.html などで使わない
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
function check(n, f) { try { f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } }
const BAD = /^(ad|ads|Ad|Ads|AD)([-_A-Z0-9]|$)|^(banner|sponsor|advert)|[-_](ad|ads|sponsor|advert)([-_]|$)|(Advert|Sponsor)/;
function names(html) { const out = []; for (const m of html.matchAll(/\b(id|class)\s*=\s*"([^"]*)"/g)) for (const t of m[2].split(/\s+/)) if (t) out.push(t); for (const m of html.matchAll(/[.#](-?[A-Za-z_][\w-]*)\s*[{,:.\[]/g)) out.push(m[1]); for (const m of html.matchAll(/(?:getElementById|\$)\('([^']+)'\)/g)) out.push(m[1]); return out; }
const PAGES = ['admin.html', 'index.html', 'records.html', 'team.html', 'schedule.html', 'check.html', 'guide.html', 'manual.html', 'jaaf.html', 'try.html', 'intro.html'];
for (const p of PAGES) check(p + '：広告に見える id・class が無い', () => { const bad = [...new Set(names(fs.readFileSync(path.join(ROOT, p), 'utf8')).filter(n => BAD.test(n) && n !== 'Adarkc'))]; assert.deepEqual(bad, []); });
check('admin.html：箱・表示先・ボタンは lnAdm* の名前', () => { const h = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8'); for (const id of ['lnAdmBox', 'lnAdmOut', 'lnAdmIn', 'lnAdmOut2']) assert.match(h, new RegExp('id="' + id + '"')); assert(!/id="ad(Box|Out|In)"/.test(h)); });
console.log(`\n${pass} ok / ${fail} NG`); if (fail) process.exit(1);
