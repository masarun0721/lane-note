#!/usr/bin/env python3
"""LANE NOTE を1つのHTMLにまとめる。

  python3 build.py              → dist/index.html, dist/sw.js（公開用）と LANE_NOTE.html（手元用）
  python3 build.py --out DIR    → DIR/index.html・DIR/sw.js・DIR/records.html（記録帳）を作る（GitHub Actions 用）
  python3 build.py --check DIR  → ビルドして DIR の3つのファイルと1バイトも違わないか確かめる

パスはこのファイルの場所からの相対で決める（どこに置いても・どこから実行しても同じ結果）。
外部ライブラリは使わない（Python 3 の標準ライブラリだけ）。
"""
import base64, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent
S = ROOT / 'src'
SHARE_BASE = 'https://masarun0721.github.io/lane-note/'   # 共有リンク・QRの公開アドレス（file:// で開いたとき用）
VERSION = 'v0.9'   # 画面右上と「このツールについて」の両方に出る版。公開のたびに上げる
# 作成日は版番号から取れないので固定（ビルドした日で変わると、公開時の一致検査ができないため）
BUILD_DATE = '2026年10月09日'
REC_VERSION = 'v0.2.2'   # 記録帳（records.html）だけの版
REC_BUILD_DATE = '2026年10月10日'


def b64(p):
    return base64.b64encode((ROOT / p).read_bytes()).decode()


def text(p):
    return (ROOT / p).read_text(encoding='utf-8')


def logo_inline(p):
    s = text(p)
    s = re.sub(r'<\?xml[^>]*>\s*', '', s)
    s = re.sub(r'<title>.*?</title>', '', s, flags=re.S)
    s = s.replace(' width="924" height="240"', '', 1).replace('role="img" aria-label="LANE NOTE"', 'aria-hidden="true" focusable="false"', 1)
    return s.strip()


def build():
    html = text('src/template.html')
    rep = {
        '__PARSER__': text('src/parser.js'), '__LOGIC__': text('src/logic.js'),
        '__ZEKKEN__': text('src/zekken.js'), '__APP__': text('src/app.js'),
        '__KOSHI_B64__': b64('templates/koshi_template.docx'), '__MUNE_B64__': b64('templates/mune_template.docx'),
        '__LOGO_DARK__': logo_inline('logo/option_A_dark.svg'),
        '__FAVICON__': 'data:image/svg+xml;base64,' + b64('logo/option_A_icon.svg'),
        '__APPLE_ICON__': 'data:image/png;base64,' + b64('logo/png/option_A_icon_180.png'),
        '__VERSION__': VERSION, '__SHARE_BASE__': SHARE_BASE, '__QRCODE__': text('vendor/qrcode.js'),
        '__BUILD_DATE__': BUILD_DATE,
        '__PRINT_ICON__': 'data:image/svg+xml;base64,' + b64('logo/option_A_icon_mono.svg'),
    }
    for k, v in rep.items():
        assert k in html, k
        html = html.replace(k, v)
    return html, text('src/sw.js'), build_records(html), text('src/firebase-config.js')


def build_records(index_html):
    """記録帳のページ。見た目は大会準備のページと同じCSSを使う（template.html の <style> をそのまま入れる）"""
    base = text('src/template.html')
    css = base[base.index('<style>') + 7:base.index('</style>')]
    rec = text('src/records_template.html')
    rep = {
        '__BASE_CSS__': css, '__RESULTS__': text('src/results.js'), '__RECAPP__': text('src/records_app.js'),
        '__LOGO_DARK__': logo_inline('logo/option_A_dark.svg'),
        '__FAVICON__': 'data:image/svg+xml;base64,' + b64('logo/option_A_icon.svg'),
        '__APPLE_ICON__': 'data:image/png;base64,' + b64('logo/png/option_A_icon_180.png'),
        '__VERSION__': VERSION, '__REC_VERSION__': REC_VERSION, '__BUILD_DATE__': REC_BUILD_DATE,
    }
    for k, v in rep.items():
        assert k in rec, k
        rec = rec.replace(k, v)
    return rec


OUTPUTS = ('index.html', 'sw.js', 'records.html', 'firebase-config.js')   # 公開するファイル（--check もこれらを確かめる）


def write(out, html, sw, rec, cfg):
    out.mkdir(parents=True, exist_ok=True)
    for name, body in zip(OUTPUTS, (html, sw, rec, cfg)):
        (out / name).write_bytes(body.encode('utf-8'))
    print(out / 'index.html', len(html), '/', out / 'sw.js', '/', out / 'records.html', len(rec))


def main(argv):
    html, sw, rec, cfg = build()
    if len(argv) == 2 and argv[0] == '--out':
        write(pathlib.Path(argv[1]), html, sw, rec, cfg)
        return 0
    if len(argv) == 2 and argv[0] == '--check':
        d, ng = pathlib.Path(argv[1]), 0
        for name, body in zip(OUTPUTS, (html, sw, rec, cfg)):
            f = d / name
            if not f.exists() or f.read_bytes() != body.encode('utf-8'):
                print('NG: %s がソースからのビルド結果と一致しません（build.py を実行してから公開してください）' % f)
                ng += 1
            else:
                print('OK: %s はビルド結果と一致' % f)
        return 1 if ng else 0
    if argv:
        print(__doc__)
        return 2
    write(ROOT / 'dist', html, sw, rec, cfg)
    (ROOT / 'LANE_NOTE.html').write_bytes(html.encode('utf-8'))   # 手元でダブルクリックして開く用
    print(ROOT / 'LANE_NOTE.html')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
