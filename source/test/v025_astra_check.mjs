// v0.25：Astra 第3回監査の再現テスト（astra3/*_repro.mjs・そのまま取り込み）を今のソースで動かし、
// 「脆弱性が再現しない（FAIL）」こと・安全側の対照（CONFIRMED）が通ることを確かめる。
// talks_repro はエミュレーター（127.0.0.1:8089）があるときだけ（npm run test:rules から）。
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
expect(ui, 'U01', 'FAIL'); expect(ui, 'U06', 'FAIL'); ['U02', 'U03', 'U04', 'U05'].forEach(u => expect(ui, u, 'CONFIRMED'));
const wk = run('worker_repro.mjs');
if (/^CONFIRMED W01:/m.test(wk) || !/403 !== 200/.test(wk)) { fail++; console.log('  NG W01 が再現する（Origin なしで任意のサイトにつながる）'); } else { pass++; console.log('  ok W01（再現しない。W02〜W09 は v025_worker_check.mjs で個別に確認）'); }
if (process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8089') {
  const tk = run('talks_repro.mjs');
  ['T01', 'T02', 'T03', 'T04', 'T05', 'T06'].forEach(t => expect(tk, t, 'FAIL')); expect(tk, 'T08', 'CONFIRMED');
} else console.log('  （talks_repro はエミュレーターがないので飛ばす：npm run test:rules で動かす）');
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1);
