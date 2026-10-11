# LANE NOTE（レーンノート）試作版

陸上競技の指導者向けの、ブラウザだけで動く試作ツールです。大会のスタートリスト（またはプログラム）とタイムテーブルの PDF から、自校の出場を時間順・選手別に整理し、招集時刻、参加料の目安、記録用紙、ナンバーカード（Word）の作成までをその場で行えます。

公開 URL: https://masarun0721.github.io/lane-note/

## 記録（records.html・試作 v0.6.0）

大会の結果（PDF・保存したWebページのHTML・ページを貼り付けた文章・Excel/CSV）から自校の選手の記録を読み取り、ためていく別ページです（https://masarun0721.github.io/lane-note/records.html ）。選手別・種目別・大会別に一覧でき、自己ベスト（追い風2.0m超・風が読めない記録は公認ベストにしない）と自己ベスト更新の記録がわかります。読み取りで漏れた記録や資料のない記録は「1件ずつ入力」で手で入れられ、記録ごとに「直す」「消す」ができます（v0.6）。JSONファイルへの書き出し・読み込み、Excel（SheetJS）への書き出し、大会ごとの削除、読み込み直後の「今読み込んだ分を取り消す」、全消去ができます。URLからの読み込みは、今はまだ対応していません（後日実装予定）。

## データの取り扱い

- **結果資料・PDFの中身**：読み取りはすべてブラウザの中で行い、PDFやWebページのファイルそのものはどこにも送りません。
- **大会準備のページ（index.html）**：読み込んだ内容は画面を閉じると消えます。「この端末に保存」した大会だけが、そのブラウザに残ります（削除ボタンで消せます）。
- **短いリンク（共有・選手用リンク）**：Googleでログインしているときだけ、選んだ学校の結果（大会名・日付・時刻・選手名など）や選手1人分の出場を LANE NOTE の Firebase（Google の Firestore）の `shares/{id}` に保存します。リンク（`?s=` ＋英数字10文字）を知っている人なら、ログインなしで誰でも見られます（一覧で探すことはできません）。見られるのは作ってから119日までで、サーバーのルールでも最長120日に制限しています。期限を過ぎると開けなくなりますが、データの自動削除（TTL）はまだしていません。作った人は「作った短いリンク」の一覧からいつでも共有を止められ、止めると中身も消えます。共有データには作った人を区別するID（ownerUid）も入っています。
- **長いリンク**：ログインしていないときは、結果をリンクの「#」より後ろに圧縮して入れます。この部分はサーバーへ送られませんが、リンクを渡した相手は中身を見られます。
- **選手のページ**：開いたリンクの中身と、選手が自分で足した予定は、その選手の端末のブラウザにだけ保存します。「この予定を端末から削除」で消せます。期限切れ・止めたリンクを開くと、端末の控えも消します。
- **記録（records.html）**：Googleでログインすると、記録・大会ごとの天気・中学/高校の選択を Firebase の `users/{uid}/` に保存し、本人だけが読み書きできます。ログイン中も、電波がないときのためにこのブラウザ（IndexedDB）に控えを置き、ログアウトすると控えを消します（大会準備のページでログアウトしても消します）。ログインしないときは、このブラウザの IndexedDB にだけ保存します。ログインしていないときにためた記録は、ログインしても自動ではクラウドへ移さず、件数と移し先を見せて「移す（端末からは消す）」「移さずに端末に残す」「端末から消す」を選んでもらいます。
- **不具合・要望を送る**：Googleでログインしたときだけ送れます。送った内容（種類・内容・連絡先（書いたときだけ）・ページ名・版・ブラウザの種類・画面の大きさ・開いていたタブとURLのパス・アカウントID）を `feedback/{id}` に保存し、作成者だけが Firebase の管理画面で読みます。記録・選手名・PDFの中身は自動では送りません。
- **まだ入れていない対策**：送信回数の制限（App Check・受付サーバー）、Firebase の予算アラートの確認、共有データの自動削除。

## 外部の部品

- pdf.js 4.10.38・JSZip 3.10.1・SheetJS 0.20.3 は外部 CDN（jsDelivr・SheetJS）から読み込み、決まった版のハッシュ（SRI）と一致したときだけ使います。ハッシュを確かめられないブラウザでは読み込みを中止します。pdf.js が必要に応じて取りに行く文字の対応表（CMap）と標準フォントのデータは、ハッシュ確認の対象外です（プログラムではなくデータです）。
- **Firebase JS SDK 10.14.1 は Google の配信元（www.gstatic.com）から版を固定して読み込みますが、ハッシュ（SRI）の確認はしていません**（ES モジュールの動的 import では SRI を付けられないため）。ログイン・記録のクラウド保存・短いリンク・不具合の送信で使います。今後、ビルドに取り込んで同じサイトから配る形に変える予定です。
- `firebase-config.js` の値は「どのプロジェクトか」を示す公開の識別子で、秘密の鍵ではありません。読み書きできる範囲は `firestore.rules` で決めています。

Presented by Sakata

## 第三者ライセンス

- [pdf.js](https://github.com/mozilla/pdf.js)（Mozilla）— Apache License 2.0
- [JSZip](https://github.com/Stuk/jszip) — MIT License
- [SheetJS Community Edition](https://git.sheetjs.com/sheetjs/sheetjs) — Apache License 2.0
- [Firebase JS SDK](https://github.com/firebase/firebase-js-sdk)（Google）— Apache License 2.0
- QR Code Generator for JavaScript（Copyright (c) 2009 Kazuhiko Arase, <http://www.d-project.com/>）— MIT License（`source/vendor/qrcode.js` に同梱。「QR Code」は株式会社デンソーウェーブの登録商標です）

## ビルドと公開

ソースは `source/` にあります（`src/` のJS・HTML、`templates/` のWordひな形、`logo/` のロゴ、`vendor/` のQR部品）。

```
python3 source/build.py --out .     # リポジトリ直下の index.html・sw.js・records.html・firebase-config.js を作り直す
python3 source/build.py --check .   # 直下の4つのファイルがソースからのビルド結果と一致するか確かめる
cd source/test && npm ci && npm test   # 架空データの回帰テスト（本番の Firebase・ネットワークは使わない）
```

版は `source/build.py` の `VERSION` で決めます（画面右上と「このツールについて」に出ます）。`main` に push すると GitHub Actions がソースからビルドし、直下の `index.html`・`sw.js` と一致することを確かめてから公開します（一致しなければ公開しません）。公開されるのは `index.html`、`records.html`、`sw.js`、`firebase-config.js`、`.nojekyll` だけです。更新情報は `source/src/changelog.json` に1件ずつ足すと、大会準備のページの「更新情報」に新しい順で出ます。ログイン・ログアウトの共通処理は `source/src/auth_common.js` です。Service Worker のキャッシュ名は、build.py が版とページの中身から作ります。LANE LOGのソースは `source/src/records_template.html`・`records_app.js`・`results.js`（結果の読み取り）で、見た目は `template.html` の CSS をそのまま使います。LANE LOGの版は `build.py` の `REC_VERSION` です。

`source/test/` には架空の大会PDFを作るスクリプト（`make_fixtures.py`、要 reportlab）と、解析結果を確かめるスクリプト（`fixtures_check.mjs`、要 pdfjs-dist）があります。`records_check.mjs` はLANE LOGの読み取り・自己ベストを架空データで確かめます（手元の結果PDFを引数に渡すと件数と警告も出します）。`app_check.mjs`（jsdom・fake-indexeddb・模擬の Firebase）はログイン・ログアウト・アカウント切り替え・1件ずつ入力・共有リンクの回帰テスト、`quality_check.mjs` は重複判定とID、`rules_static_check.mjs` は firestore.rules の形を確かめます。`residual_regress.mjs` は2回目の外部監査の再現ケース R01〜R08 を「起きない」期待値にした回帰テスト（R08 は実際の Firebase SDK 10.14.1 をネットワーク停止で使用）、`chart_check.mjs` は選手グラフの DNS・失格の表示を確かめます。`rules_check.mjs` は Firestore エミュレーター（demo プロジェクト・要 Java 17 以上）でルールを確かめます。リポジトリ直下で `npx -y firebase-tools@14.12.0 emulators:exec --only firestore --project demo-lane-note --config firebase.json "node source/test/rules_check.mjs"`（または `source/test` で `npm run test:rules`）。CI でも公開の前に実行します。

ログインは popup だけを使います（v0.15）。公開先 github.io と authDomain の firebaseapp.com が別ドメインのため、redirect は第三者ストレージを制限するブラウザで失敗しうるからです（https://firebase.google.com/docs/auth/web/redirect-best-practices ）。popup がブロックされたときは画面を移動せず、入力を残したまま案内を出します。実在の選手データやPDFはリポジトリに入れません。
