# LANE NOTE（レーンノート）試作版

陸上競技の指導者向けの、ブラウザだけで動く試作ツールです。大会のスタートリスト（またはプログラム）とタイムテーブルの PDF から、自校の出場を時間順・選手別に整理し、招集時刻、参加料の目安、記録用紙、ナンバーカード（Word）の作成までをその場で行えます。

公開 URL: https://masarun0721.github.io/lane-note/

## データの取り扱い

PDFはブラウザ内でのみ処理、選手情報をサーバーへ送信しない。

読み込んだ PDF 本文や選手情報は、このツールからサーバーへ送られません。画面を閉じると内容は消え、「この端末に保存」したものだけが、そのブラウザ内に残ります。

Presented by Sakata

## 第三者ライセンス

- [pdf.js](https://github.com/mozilla/pdf.js)（Mozilla）— Apache License 2.0
- [JSZip](https://github.com/Stuk/jszip) — MIT License
- [SheetJS Community Edition](https://git.sheetjs.com/sheetjs/sheetjs) — Apache License 2.0
- QR Code Generator for JavaScript（Copyright (c) 2009 Kazuhiko Arase, <http://www.d-project.com/>）— MIT License（`source/vendor/qrcode.js` に同梱。「QR Code」は株式会社デンソーウェーブの登録商標です）

再ビルド用のソースは `source/` にあります。GitHub Pages に公開されるのは `index.html`、`sw.js`、`.nojekyll` だけです。
