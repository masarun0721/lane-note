// v0.26.35.1 「記録を全部消す」：チームでも止めずに消す・進み具合・エラーの出し方（ソースの確認）
import fs from 'node:fs';
const s = fs.readFileSync(new URL('../src/records_app.js', import.meta.url), 'utf8');
let ok = 0; const t = (n, c) => { if (!c) { console.log('NG', n); process.exit(1); } ok++; console.log('ok', n); };
t('チームで「まとめて全部は消せません」と止めない', !/まとめて全部は消せません/.test(s));
t('チームは delAll で消す', /LT\(sc\)\.delAll\(/.test(s));
t('進み具合 N / 全部件', /消しています… ' \+ d \+ ' \/ ' \+ n \+ '件/.test(s));
t('押したらボタンを止め、終わったら戻す', /btn\.disabled = true/.test(s) && /btn\.disabled = false/.test(s));
t('残りがあればエラー', /件残っています/.test(s));
t('権限エラーの説明', /権限がありません（チームから外された/.test(s));
t('途中まで進んだ数を出す', /件まで進みました/.test(s));
t('顧問以外は理由を出す', /全部消せるのは顧問だけ/.test(s));
t('index/records のスクリプトが読める', (() => { for (const f of ['../../records.html']) { const h = fs.readFileSync(new URL(f, import.meta.url), 'utf8'); for (const m of h.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(m[1]); } return true; })());
console.log(ok + ' ok');
