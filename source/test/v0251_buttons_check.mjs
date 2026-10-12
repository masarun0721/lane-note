// v0.25.1：マニュアル（src/buttons.json）のボタンが、実際の画面のソースに同じ文言・同じ見た目（class）で本当にあるかを確かめる。
// 画面のボタンの文言を変えたら、このテストが落ちるので buttons.json も直す（古くならないように）。
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), S = path.join(here, '..'), R = path.join(here, '../..');
let pass = 0, fail = 0; const check = (n, f) => { try { f(); pass++; console.log('  ok', n); } catch (e) { fail++; console.log('  NG', n, '\n    ', e.message); } };
const data = JSON.parse(fs.readFileSync(path.join(S, 'src/buttons.json'), 'utf8')), rx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
console.log('[v0.25.1 マニュアル]');
for (const sc of data.screens) for (const it of sc.items) check(`${sc.id} ${it.t}（${it.f}）`, () => {
  const src = fs.readFileSync(path.join(S, it.f), 'utf8');
  const re = new RegExp('<(button|a|label|span)\\b[^<>]*class="' + rx(it.c) + '"[^<>]*>' + rx(it.t) + '<');
  assert.ok(re.test(src), '画面のソースに class="' + it.c + '" の「' + it.t + '」がない');
  assert.ok(it.does && it.needs, '説明と必要なもの');
});
check('「こんなときに」の手順のボタンは、すべて画面ごとの一覧にある', () => { const ids = Object.fromEntries(data.screens.map(s => [s.id, s.items.map(i => i.t)])); data.purposes.forEach(u => { assert.ok(u.q && u.get && u.steps.length); u.steps.forEach(([sid, t]) => assert.ok((ids[sid] || []).includes(t), sid + ' ' + t)); }); });
check('guide.html にマニュアル・目次・全部のボタン・絵が入っている', () => {
  const g = fs.readFileSync(path.join(R, 'guide.html'), 'utf8');
  assert.match(g, /id="manual"/); assert.match(g, /こんなときに使えます/); assert.match(g, /📘 はじめての人はこちら（使い方ガイド）/);
  data.screens.forEach(s => { assert.ok(g.includes('id="' + s.id + '"')); s.items.forEach(i => assert.ok(g.includes('>' + i.t.replace(/&/g, '&amp;') + '<'), i.t)); });
  data.purposes.forEach((u, i) => assert.ok(g.includes('id="u' + (i + 1) + '"')));
  assert.ok((g.match(/data:image\/webp;base64/g) || []).length >= 6, '絵');
  assert.match(g, /<nav class="pagenav"[^>]*>.*class="on" aria-current="page">🔰 はじめての人<\/a><a href="guide.html#manual">📖 マニュアル<\/a>/);
});
check('各ページから「📖 マニュアル」へ行ける・「はじめての人はこちら」は選択中に見せない', () => {
  for (const f of ['index.html', 'records.html', 'check.html']) { const h = fs.readFileSync(path.join(R, f), 'utf8'); assert.match(h, /href="guide\.html#manual" class="tb-btn tb-guide tb-manual">📖 マニュアル</, f); assert.doesNotMatch(h, /class="[^"]*tb-guide[^"]*\bon\b/, f); assert.doesNotMatch(h, /pagenav[^\n]*guide\.html[^"]*" class="on"/, f); }
});
console.log(pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1);
