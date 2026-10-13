// v0.26.24 招待カード・LINE／メールの文から「1人ずつ」「グループに貼らない」「転送しない」の注意を外した
import fs from 'node:fs'; import assert from 'node:assert/strict';
const app = fs.readFileSync(new URL('../src/records_app.js', import.meta.url), 'utf8'), team = fs.readFileSync(new URL('../../team.html', import.meta.url), 'utf8');
for (const [n, s] of [['records_app.js', app], ['team.html', team]]) {
  assert(!/入ってほしい人に<b>1人ずつ<\/b>送って|（ほかの人には転送しないでください）\\n/.test(s), n + ' に注意書きが残っている');   // 更新情報の文は対象外
}
assert(/招待リンクをコピー/.test(team) && /LINEで送る/.test(team) && /メールで送る/.test(team), '招待のボタンはそのまま');
assert(/「参加する」を押してください。\\n' \+ url;/.test(app), '招待の文はリンクで終わる');
console.log('v0.26.24 招待の文 OK');
