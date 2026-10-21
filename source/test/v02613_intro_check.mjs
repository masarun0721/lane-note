// v0.26.13 導入説明（intro.html・A4 1枚）
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {fileURLToPath} from 'node:url'; import {execSync} from 'node:child_process';
const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(here, '../..'), dist = f => fs.readFileSync(path.join(here, '../dist', f), 'utf8');
let pass = 0, fail = 0; function check(n, f) { try { f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e && e.message); } }
console.log('[v0.26.13] 導入説明1枚');
const h = dist('intro.html');
check('楽になること・無料と広告なし・だれが見られるか・消す/引き継ぐ・問い合わせ', () => { for (const s of ['楽になること', '無料', '広告なし', 'だれがデータを見られるか', '消す・引き継ぐ・やめる', '問い合わせ・不具合', '引き継ぎ', '不具合・要望を送る']) assert(h.includes(s), s); });
check('公開アドレスとQR・版・印刷用（A4）', () => { assert.match(h, /https:\/\/lane-note\.web\.app\//); assert.deepEqual(h.split('\n').filter(l => /masarun/.test(l) && !/OLD = 'masarun0721\.github\.io'/.test(l)), []); assert.match(h, /qrcode\(0, 'M'\)/); assert.match(h, /v0\.\d+\.\d+/); assert.match(h, /@page\{size:A4/); assert(!/__[A-Z_]+__/.test(h), '置きかえ忘れ'); });
check('画面にある名前と同じボタン名で案内している', () => { const rec = dist('records.html'); for (const s of ['🗑 記録を全部消す', '☁ クラウドのデータをすべて消す', '💾 ファイルに書き出す', '📊 Excelに書き出す']) { assert(h.includes(s), s); assert(rec.includes(s), 'records: ' + s); } assert(dist('team.html').includes('見える人とリンク')); });
check('はじめての人はこちら から開ける', () => assert.match(dist('guide.html'), /href="intro\.html"/));
check('PDF（docs/lane_note_intro.pdf）は1ページ', () => { const f = path.join(ROOT, 'docs/lane_note_intro.pdf'); assert(fs.existsSync(f)); let n = null; try { n = execSync('pdfinfo "' + f + '"').toString().match(/Pages:\s+(\d+)/)[1]; } catch (e) { return; } assert.equal(n, '1'); });
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
