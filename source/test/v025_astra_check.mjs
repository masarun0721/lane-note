// v0.25：Astra 第3回監査の再現テスト（astra3/*_repro.mjs・そのまま取り込み）を今のソースで動かし、
// 「脆弱性が再現しない（FAIL）」こと・安全側の対照（CONFIRMED）が通ることを確かめる。
// （talks_repro は Q251 により使わない。下のコメント参照）
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
let pass = 0, fail = 0;
function run(f) { const r = spawnSync(process.execPath, [path.join(here, 'astra3', f)], { env: { ...process.env, LANE_NOTE_SOURCE: root }, encoding: 'utf8' }); return (r.stdout || '') + (r.stderr || ''); }
function expect(out, id, want) { const got = new RegExp('^(CONFIRMED|PASS) ' + id + ':', 'm').test(out) ? 'CONFIRMED' : new RegExp('^FAIL ' + id + ':', 'm').test(out) ? 'FAIL' : 'なし';
  if (got === want) { pass++; console.log('  ok', id, want === 'FAIL' ? '（再現しない＝直った）' : '（安全側の対照が通る）'); } else { fail++; console.log('  NG', id, '期待', want, '実際', got); } }
console.log('[v0.25 Astra 第3回の再現テスト]');
const ui = run('ui_repro.mjs');
// v0.26.2（Q251）：U01・U06 は ui_safe.mjs で安全な状態を直接 assert（PASS が必要。FAIL を合格にしない）
const safe = run('ui_safe.mjs'); expect(safe, 'U01', 'CONFIRMED'); expect(safe, 'U06', 'CONFIRMED'); ['U02', 'U03', 'U04', 'U05'].forEach(u => expect(ui, u, 'CONFIRMED'));
const wk = run('worker_repro.mjs');
if (/^CONFIRMED W01:/m.test(wk) || !/403 !== 200/.test(wk)) { fail++; console.log('  NG W01 が再現する（Origin なしで任意のサイトにつながる）'); } else { pass++; console.log('  ok W01（再現しない。W02〜W09 は v025_worker_check.mjs で個別に確認）'); }
// v0.25.2（Astra 再確認 Q251）：talks_repro（T系）は v0.24 形式の準備が v0.25 のルールで先に拒否されるため、
// 「失敗＝直った」とは判定できない。ここでは使わず、同じ項目は rules_check.mjs（C301〜C304・R251・R252）と
// v024_talk_check.mjs（R251・R253・R254）で、準備の成功を確かめてから目的の結果を直接確かめる。
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1);
