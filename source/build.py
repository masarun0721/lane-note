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
VERSION = 'v0.26.15'   # 画面右上と「このツールについて」の両方に出る版。公開のたびに上げる
# 作成日は版番号から取れないので固定（ビルドした日で変わると、公開時の一致検査ができないため）
BUILD_DATE = '2026年10月12日'
REC_VERSION = 'v0.11.1'   # LANE LOG（records.html）だけの版
REC_BUILD_DATE = '2026年10月12日'


def _mp():
    s = (ROOT / 'src/mode_pick.html').read_text(encoding='utf-8')
    return s.split('\n', 1)


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


MODEBTN, MODEPICK = _mp()


def build():
    html = text('src/template.html')
    rep = {
        '__PARSER__': text('src/parser.js'), '__RESULTS__': text('src/results.js'), '__LOGIC__': text('src/logic.js'), '__PLAYER__': text('src/player.js'), '__PERSONAL__': text('src/personal.js'), '__MODE__': text('src/mode.js'), '__TALK__': text('src/talk.js'),
        '__ZEKKEN__': text('src/zekken.js'), '__APP__': text('src/app.js'), '__PARENT__': text('src/parent.js'), '__NOTICE__': text('src/notice.js'), '__URLLOAD__': text('src/urlload.js'), '__OVERLAY__': text('src/overlay.js'), '__PDFMAKE__': text('src/pdfmake.js'), '__FEEDBACK__': text('src/feedback.js'),
        '__AUTHCOMMON__': text('src/auth_common.js'), '__CHANGELOG__': changelog_html(),
        '__KOSHI_B64__': b64('templates/koshi_template.docx'), '__MUNE_B64__': b64('templates/mune_template.docx'),
        '__LOGO_DARK__': logo_inline('logo/option_A_dark.svg'),
        '__FAVICON__': 'data:image/svg+xml;base64,' + b64('logo/option_A_icon.svg'),
        '__APPLE_ICON__': 'data:image/png;base64,' + b64('logo/png/option_A_icon_180.png'),
        '__VERSION__': VERSION, '__MODEBTN__': MODEBTN, '__MODEPICK__': MODEPICK, '__MODE__': text('src/mode.js'), '__SHARE_BASE__': SHARE_BASE, '__QRCODE__': text('vendor/qrcode.js'),
        '__BUILD_DATE__': BUILD_DATE, '__REC_VERSION__': REC_VERSION,
        '__PRINT_ICON__': 'data:image/svg+xml;base64,' + b64('logo/option_A_icon_mono.svg'),
    }
    for k, v in rep.items():
        assert k in html, k
        html = html.replace(k, v)
    rec = build_records(html)
    guide = build_guide()
    chk = build_check()
    trial = build_try()
    # v0.26.10：全ページの見出しに「3分体験」「チーム」（チームは選手モードでは出さない）。チームの設定は team.html（記録のページと同じ部品で、チームの欄だけを出す）
    html, rec, guide, chk = [x.replace('__TOPLINKS__', TOPLINKS) for x in (html, rec, guide, chk)]
    team = build_team(rec)
    # v0.14（監査F13）：Service Worker のキャッシュ名に版とページの中身のハッシュを入れる（公開のたびに古いページが入れ替わる）
    h = hashlib.sha256((html + rec + guide + chk + trial + team).encode('utf-8')).hexdigest()[:10]
    sw = text('src/sw.js')
    assert '__CACHE__' in sw
    sw = sw.replace('__CACHE__', 'lanenote-page-%s-r%s-%s' % (VERSION, REC_VERSION, h))
    return html, sw, rec, text('src/firebase-config.js'), guide, chk, trial, team, build_intro()


def build_intro():
    """v0.26.13 導入説明（intro.html）：A4 1枚。印刷・PDFにして配る"""
    g = text('src/intro_template.html')
    rep = {'__FAVICON__': 'data:image/svg+xml;base64,' + b64('logo/option_A_icon.svg'), '__LOGO_DARK__': logo_inline('logo/option_A_dark.svg'),
           '__VERSION__': VERSION, '__SITE__': SHARE_BASE, '__QRCODE__': text('vendor/qrcode.js')}
    for k, v in rep.items():
        assert k in g, k
        g = g.replace(k, v)
    return g


def build_try():
    """v0.26.6 3分体験（try.html）：架空のサンプルで、大会準備・記録のできあがりまでを試す。保存・通信はしない"""
    base = text('src/template.html')
    g = text('src/try_template.html')
    rep = {'__BASE_CSS__': base[base.index('<style>') + 7:base.index('</style>')], '__LOGO_DARK__': logo_inline('logo/option_A_dark.svg'),
           '__FAVICON__': 'data:image/svg+xml;base64,' + b64('logo/option_A_icon.svg'),
           '__APPLE_ICON__': 'data:image/png;base64,' + b64('logo/png/option_A_icon_180.png'), '__VERSION__': VERSION,
           '__PARSER__': text('src/parser.js'), '__LOGIC__': text('src/logic.js'), '__RESULTS__': text('src/results.js'),
           '__TRYSAMPLE__': text('src/try_sample.js'), '__TRYAPP__': text('src/try_app.js')}
    for k, v in rep.items():
        assert k in g, k
        g = g.replace(k, v)
    return g


def build_check():
    """v0.19 エントリー照合（check.html）：エントリーファイルとスタートリストを端末の中で突き合わせる"""
    base = text('src/template.html')
    g = text('src/check_template.html')
    rep = {'__BASE_CSS__': base[base.index('<style>') + 7:base.index('</style>')], '__LOGO_DARK__': logo_inline('logo/option_A_dark.svg'),
           '__FAVICON__': 'data:image/svg+xml;base64,' + b64('logo/option_A_icon.svg'),
           '__APPLE_ICON__': 'data:image/png;base64,' + b64('logo/png/option_A_icon_180.png'), '__VERSION__': VERSION, '__MODEBTN__': MODEBTN, '__MODEPICK__': MODEPICK, '__MODE__': text('src/mode.js'), '__MODEBTN__': MODEBTN, '__MODEPICK__': MODEPICK, '__MODE__': text('src/mode.js'), '__REC_VERSION__': REC_VERSION,
           '__PARSER__': text('src/parser.js'), '__LOGIC__': text('src/logic.js'), '__ENTRY__': text('src/entry.js'), '__CHECKAPP__': text('src/check_app.js'), '__URLLOAD__': text('src/urlload.js'), '__OVERLAY__': text('src/overlay.js'), '__PDFMAKE__': text('src/pdfmake.js'),
           '__AUTHCOMMON__': text('src/auth_common.js'), '__FEEDBACK__': text('src/feedback.js'), '__CHANGELOG__': changelog_html()}
    for k, v in rep.items():
        assert k in g, k
        g = g.replace(k, v)
    return g


MANUAL_IMG = 'img/manual'   # v0.25.3：マニュアルの絵（guide.html には埋め込まず、別ファイルとして公開する）


def manual_assets():
    d = ROOT / MANUAL_IMG
    return sorted(p for p in d.glob('*.webp')) if d.exists() else []


def img_url(name):
    p = ROOT / MANUAL_IMG / (name + '.webp')
    return '%s/%s.webp?v=%s' % (MANUAL_IMG, name, hashlib.sha256(p.read_bytes()).hexdigest()[:8]) if p.exists() else ''


def buttons_html():
    """マニュアル（src/buttons.json から作る。文言が実際の画面と同じかは test/v0251_buttons_check.mjs で確かめる）"""
    import html as H
    E = H.escape
    data = json.loads(text('src/buttons.json'))
    scr = {sc['id']: sc for sc in data['screens']}

    def zoom(name, cap, w, h, cls):
        u = img_url(name)
        if not u:
            return ''
        return ('<button type="button" class="mz-open %s" data-kind="%s" data-full="%s" data-cap="%s" aria-label="%sを大きく表示">'
                '<img loading="lazy" decoding="async" src="%s" width="%d" height="%d" alt="%s（架空のデータ）"></button>') % (cls, {'mz-pc': '🖥 パソコン', 'mz-sp': '📱 スマホ'}.get(cls, ''), E(u), E(cap), E(cap), E(u), w, h, E(cap))

    def chip(sid, t):
        it = [x for x in scr[sid]['items'] if x['t'] == t][0]
        return '<span class="%s bx-chip" aria-hidden="true">%s</span>' % (E(it['c']), E(t))
    out = ['<section class="box g-card" id="manual"><h2>📖 マニュアル</h2><p>LANE NOTE で「何ができるか」を、やりたいこと別にまとめました。まず自分に近いものを選んでください。下には、画面ごとのボタンの説明があります。絵は架空のデータで撮った実際の画面です（押すと大きく表示）。</p>',
           '<h3>こんなときに使えます</h3><nav class="bx-toc" aria-label="やりたいこと">']
    out += ['<a href="#u%d">%s</a>' % (i + 1, E(u['q'])) for i, u in enumerate(data['purposes'])]
    out.append('</nav><h3>画面ごとのボタン</h3><nav class="bx-toc" aria-label="画面ごとの目次">')
    out += ['<a href="#%s">%s</a>' % (sc['id'], E(sc['title'])) for sc in data['screens']]
    out.append('</nav></section>')
    for i, u in enumerate(data['purposes']):
        out.append('<section class="box g-card bx-use" id="u%d"><h2>💡 %s</h2><p class="bx-get"><b>できあがるもの：</b>%s</p>' % (i + 1, E(u['q']), E(u['get'])))
        for name, cap in u['shots']:
            out.append('<figure class="mz-pair"><figcaption>%s</figcaption><div class="mz-row">%s%s</div></figure>' % (
                E(cap), zoom(name + '_pc', cap + '（パソコン）', 1280, 800, 'mz-pc'), zoom(name + '_sp', cap + '（スマホ）', 824, 1830, 'mz-sp')))
        out.append('<ol class="bx-steps">')
        for sid, t, how in u['steps']:
            out.append('<li><a class="bx-where" href="#%s">%s</a> %s<br><span class="bx-how">%s</span></li>' % (sid, E(scr[sid]['title']), chip(sid, t), E(how)))
        out.append('</ol></section>')
    for sc in data['screens']:
        out.append('<section class="box g-card" id="%s"><h2>%s</h2><p>%s%s</p>' % (sc['id'], E(sc['title']), E(sc['intro']), (' <a href="%s">このページを開く →</a>' % sc['page']) if sc['page'] else ''))
        if sc['shot']:
            out.append('<div class="mz-row">%s</div>' % zoom(sc['shot'], sc['title'] + 'の画面', 390, 640, 'mz-mini'))
        out.append('<ul class="bx-list">')
        for it in sc['items']:
            out.append('<li data-bx-src="%s"><div class="bx-look"><span class="%s" aria-hidden="true">%s</span></div><p class="bx-does"><b class="vh">%s：</b>%s<span class="bx-need">必要なもの：%s</span></p></li>' % (E(it['f']), E(it['c']), E(it['t']), E(it['t']), E(it['does']), E(it['needs'])))
        out.append('</ul><p><a href="#manual">↑ マニュアルの最初へ</a></p></section>')
    return '\n'.join(out)


def build_guide():
    """はじめての人はこちら（guide.html）：使い方とデータの取り扱いの全文"""
    base = text('src/template.html')
    g = text('src/guide_template.html')
    rep = {'__BASE_CSS__': base[base.index('<style>') + 7:base.index('</style>')], '__LOGO_DARK__': logo_inline('logo/option_A_dark.svg'),
           '__FAVICON__': 'data:image/svg+xml;base64,' + b64('logo/option_A_icon.svg'),
           '__APPLE_ICON__': 'data:image/png;base64,' + b64('logo/png/option_A_icon_180.png'), '__VERSION__': VERSION, '__MODEBTN__': MODEBTN, '__MODEPICK__': MODEPICK, '__MODE__': text('src/mode.js'), '__BUTTONS__': buttons_html(), '__OVERLAY__': text('src/overlay.js')}
    for k, v in rep.items():
        assert k in g, k
        g = g.replace(k, v)
    return g


TOPLINKS = ('<a href="try.html" class="tb-btn tb-guide tb-try">⏱ 3分体験</a>'
            '<a href="team.html" class="tb-btn tb-guide tb-team">👥 チーム</a>'
            '<style>body.ln-player .tb-team{display:none!important}</style>')


def build_team(rec):
    """v0.26.10 チームの設定ページ（team.html）：records.html と同じ中身に team-page の印をつけ、チームの欄だけを見せる"""
    assert '<body class="records">' in rec and '<title>' in rec
    t = rec.replace('<body class="records">', '<body class="records team-page">', 1)
    t = re.sub(r'<title>[^<]*</title>', '<title>LANE NOTE チームの設定</title>', t, count=1)
    t = t.replace('<a href="team.html" class="tb-btn tb-guide tb-team">', '<a href="team.html" class="tb-btn tb-guide tb-team on" aria-current="page">', 1)
    return t


def build_records(index_html):
    """LANE LOGのページ。見た目は大会準備のページと同じCSSを使う（template.html の <style> をそのまま入れる）"""
    base = text('src/template.html')
    css = base[base.index('<style>') + 7:base.index('</style>')]
    rec = text('src/records_template.html')
    rep = {
        '__BASE_CSS__': css, '__RESULTS__': text('src/results.js'), '__RECAPP__': text('src/records_app.js'), '__URLLOAD__': text('src/urlload.js'), '__OVERLAY__': text('src/overlay.js'), '__PDFMAKE__': text('src/pdfmake.js'), '__PERSONAL__': text('src/personal.js'), '__TALK__': text('src/talk.js'), '__TEAM__': text('src/team.js'), '__ROSTER__': text('src/roster.js'), '__PRINT__': text('src/print.js'), '__SHARE_BASE__': SHARE_BASE, '__FEEDBACK__': text('src/feedback.js'), '__AUTHCOMMON__': text('src/auth_common.js'),
        '__LOGO_DARK__': logo_inline('logo/option_A_dark.svg'),
        '__FAVICON__': 'data:image/svg+xml;base64,' + b64('logo/option_A_icon.svg'),
        '__APPLE_ICON__': 'data:image/png;base64,' + b64('logo/png/option_A_icon_180.png'),
        '__VERSION__': VERSION, '__MODEBTN__': MODEBTN, '__MODEPICK__': MODEPICK, '__MODE__': text('src/mode.js'), '__REC_VERSION__': REC_VERSION, '__BUILD_DATE__': REC_BUILD_DATE, '__CHANGELOG__': changelog_html(),
    }
    for k, v in rep.items():
        assert k in rec, k
        rec = rec.replace(k, v)
    return rec


OUTPUTS = ('index.html', 'sw.js', 'records.html', 'firebase-config.js', 'guide.html', 'check.html', 'try.html', 'team.html', 'intro.html')   # 公開するファイル（--check もこれらを確かめる）


def write(out, *bodies):
    out.mkdir(parents=True, exist_ok=True)
    for name, body in zip(OUTPUTS, bodies):
        (out / name).write_bytes(body.encode('utf-8'))
    dst = out / MANUAL_IMG   # マニュアルの絵を写す（ないものは消す）
    dst.mkdir(parents=True, exist_ok=True)
    keep = set()
    for p in manual_assets():
        keep.add(p.name)
        if not (dst / p.name).exists() or (dst / p.name).read_bytes() != p.read_bytes():
            (dst / p.name).write_bytes(p.read_bytes())
    for p in dst.glob('*.webp'):
        if p.name not in keep:
            p.unlink()
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
        assets = manual_assets()
        for p in assets:
            f = d / MANUAL_IMG / p.name
            if not f.exists() or f.read_bytes() != p.read_bytes():
                print('NG: %s がソースの絵と一致しません' % f)
                ng += 1
        extra = [p for p in (d / MANUAL_IMG).glob('*.webp') if p.name not in {a.name for a in assets}] if (d / MANUAL_IMG).exists() else []
        for p in extra:
            print('NG: %s はソースにない絵です' % p)
            ng += 1
        print('OK: マニュアルの絵 %d 枚' % len(assets) if not ng else '')
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
