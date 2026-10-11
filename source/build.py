#!/usr/bin/env python3
"""LANE NOTE を1つのHTMLにまとめる。

  python3 build.py              → dist/index.html, dist/sw.js（公開用）と LANE_NOTE.html（手元用）
  python3 build.py --out DIR    → DIR/index.html・DIR/sw.js・DIR/records.html（記録）・DIR/check.html（エントリー照合）などを作る（GitHub Actions 用）
  python3 build.py --check DIR  → ビルドして DIR の3つのファイルと1バイトも違わないか確かめる

パスはこのファイルの場所からの相対で決める（どこに置いても・どこから実行しても同じ結果）。
外部ライブラリは使わない（Python 3 の標準ライブラリだけ）。
"""
import base64, hashlib, html as htmlmod, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent
S = ROOT / 'src'
SHARE_BASE = 'https://masarun0721.github.io/lane-note/'   # 共有リンク・QRの公開アドレス（file:// で開いたとき用）
VERSION = 'v0.20.2'   # 画面右上と「このツールについて」の両方に出る版。公開のたびに上げる
# 作成日は版番号から取れないので固定（ビルドした日で変わると、公開時の一致検査ができないため）
BUILD_DATE = '2026年10月12日'
REC_VERSION = 'v0.10.1'   # LANE LOG（records.html）だけの版
REC_BUILD_DATE = '2026年10月12日'


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


def changelog_html():
    """更新情報（src/changelog.json に古い順で1件ずつ足していく）→ 大会準備のページの上に、新しい順で出す"""
    items = json.loads(text('src/changelog.json'))
    e = htmlmod.escape
    lis = ''.join('<li><div class="cl-h"><b>%s</b>%s</div><div class="cl-b">%s</div></li>' % (e(x['ver']), e(x['date'].replace('-', '/')), e(x['text'])) for x in reversed(items))
    new = items[-1]
    return ('<details class="changelog" id="changelog"><summary><b>📰 更新情報</b>　<span class="small muted">最新：%s（%s）</span><span class="cl-new">NEW</span></summary><ol>%s</ol></details>'
            % (e(new['ver']), e(new['date'].replace('-', '/')), lis))


def build():
    html = text('src/template.html')
    rep = {
        '__PARSER__': text('src/parser.js'), '__RESULTS__': text('src/results.js'), '__LOGIC__': text('src/logic.js'), '__PLAYER__': text('src/player.js'), '__PERSONAL__': text('src/personal.js'),
        '__ZEKKEN__': text('src/zekken.js'), '__APP__': text('src/app.js'), '__URLLOAD__': text('src/urlload.js'), '__FEEDBACK__': text('src/feedback.js'),
        '__AUTHCOMMON__': text('src/auth_common.js'), '__CHANGELOG__': changelog_html(),
        '__KOSHI_B64__': b64('templates/koshi_template.docx'), '__MUNE_B64__': b64('templates/mune_template.docx'),
        '__LOGO_DARK__': logo_inline('logo/option_A_dark.svg'),
        '__FAVICON__': 'data:image/svg+xml;base64,' + b64('logo/option_A_icon.svg'),
        '__APPLE_ICON__': 'data:image/png;base64,' + b64('logo/png/option_A_icon_180.png'),
        '__VERSION__': VERSION, '__SHARE_BASE__': SHARE_BASE, '__QRCODE__': text('vendor/qrcode.js'),
        '__BUILD_DATE__': BUILD_DATE, '__REC_VERSION__': REC_VERSION,
        '__PRINT_ICON__': 'data:image/svg+xml;base64,' + b64('logo/option_A_icon_mono.svg'),
    }
    for k, v in rep.items():
        assert k in html, k
        html = html.replace(k, v)
    rec = build_records(html)
    guide = build_guide()
    chk = build_check()
    # v0.14（監査F13）：Service Worker のキャッシュ名に版とページの中身のハッシュを入れる（公開のたびに古いページが入れ替わる）
    h = hashlib.sha256((html + rec + guide + chk).encode('utf-8')).hexdigest()[:10]
    sw = text('src/sw.js')
    assert '__CACHE__' in sw
    sw = sw.replace('__CACHE__', 'lanenote-page-%s-r%s-%s' % (VERSION, REC_VERSION, h))
    return html, sw, rec, text('src/firebase-config.js'), guide, chk


def build_check():
    """v0.19 エントリー照合（check.html）：エントリーファイルとスタートリストを端末の中で突き合わせる"""
    base = text('src/template.html')
    g = text('src/check_template.html')
    rep = {'__BASE_CSS__': base[base.index('<style>') + 7:base.index('</style>')], '__LOGO_DARK__': logo_inline('logo/option_A_dark.svg'),
           '__FAVICON__': 'data:image/svg+xml;base64,' + b64('logo/option_A_icon.svg'),
           '__APPLE_ICON__': 'data:image/png;base64,' + b64('logo/png/option_A_icon_180.png'), '__VERSION__': VERSION, '__REC_VERSION__': REC_VERSION,
           '__PARSER__': text('src/parser.js'), '__LOGIC__': text('src/logic.js'), '__ENTRY__': text('src/entry.js'), '__CHECKAPP__': text('src/check_app.js'), '__URLLOAD__': text('src/urlload.js'),
           '__AUTHCOMMON__': text('src/auth_common.js'), '__FEEDBACK__': text('src/feedback.js'), '__CHANGELOG__': changelog_html()}
    for k, v in rep.items():
        assert k in g, k
        g = g.replace(k, v)
    return g


def build_guide():
    """はじめての人はこちら（guide.html）：使い方とデータの取り扱いの全文"""
    base = text('src/template.html')
    g = text('src/guide_template.html')
    rep = {'__BASE_CSS__': base[base.index('<style>') + 7:base.index('</style>')], '__LOGO_DARK__': logo_inline('logo/option_A_dark.svg'),
           '__FAVICON__': 'data:image/svg+xml;base64,' + b64('logo/option_A_icon.svg'),
           '__APPLE_ICON__': 'data:image/png;base64,' + b64('logo/png/option_A_icon_180.png'), '__VERSION__': VERSION}
    for k, v in rep.items():
        assert k in g, k
        g = g.replace(k, v)
    return g


def build_records(index_html):
    """LANE LOGのページ。見た目は大会準備のページと同じCSSを使う（template.html の <style> をそのまま入れる）"""
    base = text('src/template.html')
    css = base[base.index('<style>') + 7:base.index('</style>')]
    rec = text('src/records_template.html')
    rep = {
        '__BASE_CSS__': css, '__RESULTS__': text('src/results.js'), '__RECAPP__': text('src/records_app.js'), '__URLLOAD__': text('src/urlload.js'), '__PERSONAL__': text('src/personal.js'), '__PRINT__': text('src/print.js'), '__SHARE_BASE__': SHARE_BASE, '__FEEDBACK__': text('src/feedback.js'), '__AUTHCOMMON__': text('src/auth_common.js'),
        '__LOGO_DARK__': logo_inline('logo/option_A_dark.svg'),
        '__FAVICON__': 'data:image/svg+xml;base64,' + b64('logo/option_A_icon.svg'),
        '__APPLE_ICON__': 'data:image/png;base64,' + b64('logo/png/option_A_icon_180.png'),
        '__VERSION__': VERSION, '__REC_VERSION__': REC_VERSION, '__BUILD_DATE__': REC_BUILD_DATE, '__CHANGELOG__': changelog_html(),
    }
    for k, v in rep.items():
        assert k in rec, k
        rec = rec.replace(k, v)
    return rec


OUTPUTS = ('index.html', 'sw.js', 'records.html', 'firebase-config.js', 'guide.html', 'check.html')   # 公開するファイル（--check もこれらを確かめる）


def write(out, *bodies):
    out.mkdir(parents=True, exist_ok=True)
    for name, body in zip(OUTPUTS, bodies):
        (out / name).write_bytes(body.encode('utf-8'))
    print(' / '.join('%s %d' % (out / n, len(b)) for n, b in zip(OUTPUTS, bodies)))


def main(argv):
    bodies = build()
    if len(argv) == 2 and argv[0] == '--out':
        write(pathlib.Path(argv[1]), *bodies)
        return 0
    if len(argv) == 2 and argv[0] == '--check':
        d, ng = pathlib.Path(argv[1]), 0
        for name, body in zip(OUTPUTS, bodies):
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
    write(ROOT / 'dist', *bodies)
    (ROOT / 'LANE_NOTE.html').write_bytes(bodies[0].encode('utf-8'))   # 手元でダブルクリックして開く用
    print(ROOT / 'LANE_NOTE.html')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
