# LANE NOTE（レーンノート）試作版

陸上競技の指導者向けの、ブラウザだけで動く試作ツールです。大会のスタートリスト（またはプログラム）とタイムテーブルの PDF から、自校の出場を時間順・選手別に整理し、招集時刻、参加料の目安、記録用紙、ナンバーカード（Word）の作成までをその場で行えます。

公開 URL: https://masarun0721.github.io/lane-note/

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
python3 source/build.py --out .     # リポジトリ直下の index.html・sw.js を作り直す
python3 source/build.py --check .   # 直下のファイルがソースからのビルド結果と一致するか確かめる
```

版は `source/build.py` の `VERSION` で決めます（画面右上と「このツールについて」に出ます）。`main` に push すると GitHub Actions がソースからビルドし、直下の `index.html`・`sw.js` と一致することを確かめてから公開します（一致しなければ公開しません）。公開されるのは `index.html`、`sw.js`、`.nojekyll` だけです。

`source/test/` には架空の大会PDFを作るスクリプト（`make_fixtures.py`、要 reportlab）と、解析結果を確かめるスクリプト（`fixtures_check.mjs`、要 pdfjs-dist）があります。実在の選手データやPDFはリポジトリに入れません。
