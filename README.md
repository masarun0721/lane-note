# LANE NOTE（レーンノート）試作版

陸上競技の指導者向けの、ブラウザだけで動く試作ツールです。大会のスタートリスト（またはプログラム）とタイムテーブルの PDF から、自校の出場を時間順・選手別に整理し、招集時刻、参加料の目安、記録用紙、ナンバーカード（Word）の作成までをその場で行えます。

公開 URL: https://masarun0721.github.io/lane-note/

## 記録帳（records.html・試作 v0.1.1）

大会の結果（PDF・保存したWebページのHTML・ページを貼り付けた文章）から自校の選手の記録を読み取り、このブラウザの IndexedDB にためていく別ページです（https://masarun0721.github.io/lane-note/records.html ）。選手別・種目別・大会別に一覧でき、自己ベスト（追い風2.0m超・風が読めない記録は公認ベストにしない）と自己ベスト更新の記録がわかります。記録はどこにも送りません。JSONファイルへの書き出し・読み込み、Excel（SheetJS）への書き出し、大会ごとの削除（大会別の一覧の「この大会を消す」）、読み込み直後の「今読み込んだ分を取り消す」、全消去ができます。大会準備のページ（index.html）は今までどおり何も保存しない作りのままです。

## データの取り扱い

PDFはブラウザ内でのみ処理、選手情報をサーバーへ送信しない。

読み込んだ PDF 本文や選手情報は、このツールからサーバーへ送られません。画面を閉じると内容は消え、「この端末に保存」したものだけが、そのブラウザ内に残ります。

部品（pdf.js・JSZip・SheetJS）は外部 CDN から読み込み、決まった版のハッシュ（SRI）と一致したときだけ使います。ハッシュを確かめられないブラウザでは読み込みを中止します。pdf.js が必要に応じて取りに行く文字の対応表（CMap）と標準フォントのデータは、ハッシュ確認の対象外です（プログラムではなくデータです）。

Presented by Sakata

## 第三者ライセンス

- [pdf.js](https://github.com/mozilla/pdf.js)（Mozilla）— Apache License 2.0
- [JSZip](https://github.com/Stuk/jszip) — MIT License
- [SheetJS Community Edition](https://git.sheetjs.com/sheetjs/sheetjs) — Apache License 2.0
- QR Code Generator for JavaScript（Copyright (c) 2009 Kazuhiko Arase, <http://www.d-project.com/>）— MIT License（`source/vendor/qrcode.js` に同梱。「QR Code」は株式会社デンソーウェーブの登録商標です）

## ビルドと公開

ソースは `source/` にあります（`src/` のJS・HTML、`templates/` のWordひな形、`logo/` のロゴ、`vendor/` のQR部品）。

```
python3 source/build.py --out .     # リポジトリ直下の index.html・sw.js・records.html を作り直す
python3 source/build.py --check .   # 直下の3つのファイルがソースからのビルド結果と一致するか確かめる
```

版は `source/build.py` の `VERSION` で決めます（画面右上と「このツールについて」に出ます）。`main` に push すると GitHub Actions がソースからビルドし、直下の `index.html`・`sw.js` と一致することを確かめてから公開します（一致しなければ公開しません）。公開されるのは `index.html`、`records.html`、`sw.js`、`.nojekyll` だけです。記録帳のソースは `source/src/records_template.html`・`records_app.js`・`results.js`（結果の読み取り）で、見た目は `template.html` の CSS をそのまま使います。記録帳の版は `build.py` の `REC_VERSION` です。

`source/test/` には架空の大会PDFを作るスクリプト（`make_fixtures.py`、要 reportlab）と、解析結果を確かめるスクリプト（`fixtures_check.mjs`、要 pdfjs-dist）があります。`records_check.mjs` は記録帳の読み取り・自己ベストを架空データで確かめます（手元の結果PDFを引数に渡すと件数と警告も出します）。実在の選手データやPDFはリポジトリに入れません。
