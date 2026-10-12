// firestore.rules の形の確認（エミュレーターなしで動く簡易テスト。本当の判定は rules_check.mjs をエミュレーターで）
//   node rules_static_check.mjs
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(here, '../../firestore.rules'), 'utf8');
const app = fs.readFileSync(path.join(here, '../src/app.js'), 'utf8'), fb = fs.readFileSync(path.join(here, '../src/feedback.js'), 'utf8');
let pass = 0, fail = 0, skip = 0; const SKIP = Symbol('skip'); const ok = (n, f) => { try { if (f() === SKIP) { skip++; console.log('  SKIP', n); return; } pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e.message); } };
const body = rules.replace(/\/\/.*$/gm, '');
ok('日本語の見出しがある', () => assert.match(rules.split('\n').slice(0, 4).join('\n'), /LANE NOTE firestore\.rules/));
ok('どこにも「if true」がない（期限切れの共有も読めた F01）', () => assert.doesNotMatch(body, /if\s+true/));
ok('shares の get は期限内だけ（expiresAt と createdAt+120日）', () => { assert.match(body, /allow get: if validShareId\(shareId\) && shareReadable\(resource\.data\)/); assert.match(body, /request\.time < d\.createdAt \+ duration\.value\(120, 'd'\)/); });
ok('shares の list・update は不可、作成は Google ログイン本人', () => { assert.match(body, /allow list: if false/); assert.match(body, /allow update: if false/); assert.match(body, /allow create: if googleUser\(\) && validShareId/); });
ok('feedback は Google ログイン必須・読めない（F05）', () => { assert.match(body, /match \/feedback\/\{id\}[\s\S]*allow create: if googleUser\(\) && validFeedback/); assert.match(body, /allow read, update, delete: if false/); });
ok('v0.24 talks：一覧不可・作成は Google 本人・選手は from:p だけ・直すのは不可', () => { assert.match(body, /match \/talks\/\{tid\}[\s\S]*allow list: if false/); assert.match(body, /allow create: if googleUser\(\) && validTalkId/); assert.match(body, /request\.resource\.data\.from == 'p'/); assert.match(body, /match \/msgs\/\{mid\}[\s\S]*allow update: if false/); });
ok('v0.25.4 stats：読めるのは counter だけ・+1 だけ・削除と一覧は不可', () => { assert.match(body, /match \/stats\/\{sid\}[\s\S]*allow list: if false[\s\S]*request\.resource\.data\.n == resource\.data\.n \+ 1[\s\S]*allow delete: if false/); assert.match(app, /F\.increment\(1\)/); });
ok('最後に全部を断る', () => assert.match(body, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/));
ok('最終案（/workspace の firestore.rules.final）と本文が同じ（比較元が無ければ SKIP）', () => {
  const f = '/workspace/astra_audit/firestore.rules.final'; if (!fs.existsSync(f)) return SKIP;
  const strip = s => s.replace(/^\/\/.*$/gm, '').replace(/\s+/g, ' ').trim(); assert.equal(strip(rules.replace(/\/\/ v0\.24 talks ここから[\s\S]*?\/\/ v0\.24 talks ここまで\n/g, '').replace(/ *\/\/ v0\.25\.4 stats ここから[\s\S]*?\/\/ v0\.25\.4 stats ここまで\n/g, '')), strip(fs.readFileSync(f, 'utf8')));
});
ok('アプリ：短いリンクの期限はルールの120日より短い（119日）', () => assert.match(app, /SHARE_DAYS = 119/));
ok('アプリ：短いリンクの中身は 190000 文字まで・ID は10文字', () => { assert.match(app, /str\.length > 190000/); assert.match(app, /while \(out\.length < 10\)/); });
ok('アプリ：feedback はログインしていなければ送らない・uid は必ず文字列', () => { assert.match(fb, /if \(!u\) \{/); assert.match(fb, /uid: u\.uid/); assert.doesNotMatch(fb, /uid: null|uid = null/); });
console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`); process.exit(fail ? 1 : 0);
