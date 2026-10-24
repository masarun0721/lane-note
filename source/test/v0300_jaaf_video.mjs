// v0.30.0 JAAF入力の手伝いの説明動画（ブックマークバーに入れるところ）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0; const check = (n, f) => { try { f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.stack || e); } };
console.log('[v0.30.0] JAAF入力の手伝いの説明動画');
const j = fs.readFileSync(path.join(ROOT, 'jaaf.html'), 'utf8');
check('jaaf.html に動画が1本・準備と手順1のあいだ・preload=none・poster は webp', () => {
  assert.equal((j.match(/<video /g) || []).length, 1);
  const a = j.indexOf('id="jfPre"'), v = j.indexOf('id="jfVideo"'), s1 = j.indexOf('id="jfS1"'); assert.ok(a > 0 && a < v && v < s1);
  assert.ok(/<video controls preload="none" playsinline[^>]*poster="img\/manual\/video\/jaaf_howto\.webp\?v=[0-9a-f]{8}"[^>]*><source src="img\/manual\/video\/jaaf_howto\.mp4\?v=[0-9a-f]{8}" type="video\/mp4">/.test(j));
  assert.ok(j.includes('約2分40秒・音が出ます')); assert.ok(j.includes('href="#jfVideo"')); assert.ok(!j.includes('__VIDEO_'));
});
check('ファイルがある・8MB未満・service worker は動画を保存しない', () => {
  for (const e of ['.mp4', '.webp']) { const f = path.join(ROOT, 'img/manual/video/jaaf_howto' + e); assert.ok(fs.existsSync(f), f); if (e === '.mp4') assert.ok(fs.statSync(f).size < 8e6); }
  assert.ok(!/mp4|video/.test(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8')));
});
check('manual.html の動画は13本のまま', () => { assert.equal((fs.readFileSync(path.join(ROOT, 'manual.html'), 'utf8').match(/<video /g) || []).length, 13); });
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
