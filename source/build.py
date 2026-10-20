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
VERSION = 'v0.27.0'   # 画面右上と「このツールについて」の両方に出る版。公開のたびに上げる
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
    """v0.26.38.1 更新情報は guide.html の「📰 更新情報」の欄だけに出す（各ページの上の欄はやめた）。
    src/changelog.json は古い順（新しい版は末尾に足す）。ここで新しい順にして、最新の10件を出し、それより前はたたむ。
    v0.26.30〜v0.26.38 を先頭に足してしまい、最新が v0.26.29 のまま止まって見えたので、並びが日付順でなければビルドを止める"""
    items = json.loads(text('src/changelog.json'))
    assert [x['date'] for x in items] == sorted(x['date'] for x in items), 'changelog.json は古い順（新しい版は末尾）に足してください'
    items = list(reversed(items))
    e = htmlmod.escape
    li = lambda x: '<li><div class="cl-h"><b>%s</b>%s</div><div class="cl-b">%s</div></li>' % (e(x['ver']), e(x['date'].replace('-', '/')), e(x['text']))
    head, rest = items[:10], items[10:]
    more = ('<details><summary>それより前の更新情報（%d件）</summary><ol>%s</ol></details>' % (len(rest), ''.join(map(li, rest)))) if rest else ''
    return ('<section class="box g-card changelog" id="changelog"><h2><span class="no">📰</span>更新情報</h2><ol>%s</ol>%s</section>'
            % (''.join(map(li, head)), more))


MODEBTN, MODEPICK = _mp()


def build():
    html = text('src/template.html')
    rep = {
        '__PARSER__': text('src/parser.js'), '__RESULTS__': text('src/results.js'), '__LOGIC__': text('src/logic.js'), '__PLAYER__': text('src/player.js'), '__PERSONAL__': text('src/personal.js'), '__MODE__': (text('src/mode.js') + '\n' + text('src/plans.js')), '__TALK__': text('src/talk.js'),
        '__ZEKKEN__': text('src/zekken.js'), '__APP__': text('src/app.js'), '__PARENT__': text('src/parent.js'), '__NOTICE__': text('src/notice.js'), '__URLLOAD__': text('src/urlload.js') + '\n' + text('src/pubmeets.js') + '\n' + text('src/prepdel.js'), '__OVERLAY__': text('src/overlay.js'), '__PDFMAKE__': text('src/pdfmake.js'), '__FEEDBACK__': text('src/feedback.js'),
        '__AUTHCOMMON__': text('src/auth_common.js'),
        '__KOSHI_B64__': b64('templates/koshi_template.docx'), '__MUNE_B64__': b64('templates/mune_template.docx'),
        '__LOGO_DARK__': logo_inline('logo/option_A_dark.svg'),
        '__FAVICON__': 'data:image/svg+xml;base64,' + b64('logo/option_A_icon.svg'),
        '__APPLE_ICON__': 'data:image/png;base64,' + b64('logo/png/option_A_icon_180.png'),
        '__VERSION__': VERSION, '__MODEBTN__': MODEBTN, '__MODEPICK__': MODEPICK, '__MODE__': (text('src/mode.js') + '\n' + text('src/plans.js')), '__SHARE_BASE__': SHARE_BASE, '__QRCODE__': text('vendor/qrcode.js'),
        '__BUILD_DATE__': BUILD_DATE, '__REC_VERSION__': REC_VERSION,
        '__PRINT_ICON__': 'data:image/svg+xml;base64,' + b64('logo/option_A_icon_mono.svg'),
    }
    for k, v in rep.items():
        assert k in html or k == '__MODEBTN__', k
        html = html.replace(k, v)
    rec = build_records(html)
    guide = build_guide()
    chk = build_check()
    trial = build_try()
    # v0.26.10：全ページの見出しに「3分体験」「チーム」（チームは選手モードでは出さない）。チームの設定は team.html（記録のページと同じ部品で、チームの欄だけを出す）
    html, rec, chk = [with_nav(x.replace('__TOPBAR__', ''), c) for x, c in ((html, 'index'), (rec, 'records'), (chk, 'check'))]
    # v0.27（案）説明は「？」の中へ：大会準備・記録（チーム・大会予定も）のページに小さな部品を入れる
    tips = '<script>\n' + text('src/tips.js') + '\n</script>\n'
    html, rec, chk = [x[:x.rindex('</body>')] + tips + x[x.rindex('</body>'):] for x in (html, rec, chk)]
    guide = with_nav(guide, 'guide').replace('__TOPBAR__', '').replace('__CHANGELOG__', changelog_html()).replace('__FBSCRIPTS__', fb_scripts())
    guide = guide[:guide.rindex('</body>')] + tips + guide[guide.rindex('</body>'):]
    # 3分体験は Firebase・中継を読み込まない（v0.26.6）。「不具合・要望を送る」は記録のページで開く（?fb=1）
    trial = with_nav(trial, 'try').replace('__TOPBAR__', '').replace('__FBSCRIPTS__', '')
    trial = trial.replace('<button type="button" class="tb-btn fb-link" data-feedback="1" data-tb="feedback">🚨 不具合・要望を送る</button>', '<a href="records.html?fb=1" class="tb-btn fb-link" data-tb="feedback">🚨 不具合・要望を送る</a>', 1)
    assert 'records.html?fb=1' in trial
    trial = trial.replace('__MODEPICK__', MODEPICK).replace('__MODE__', (text('src/mode.js') + '\n' + text('src/plans.js')))
    team = build_team(rec)
    sched = build_sched(rec)
    # v0.14（監査F13）：Service Worker のキャッシュ名に版とページの中身のハッシュを入れる（公開のたびに古いページが入れ替わる）
    h = hashlib.sha256((html + rec + guide + chk + trial + team + sched).encode('utf-8')).hexdigest()[:10]
    sw = text('src/sw.js')
    assert '__CACHE__' in sw
    sw = sw.replace('__CACHE__', 'lanenote-page-%s-r%s-%s' % (VERSION, REC_VERSION, h))
    return html, sw, rec, text('src/firebase-config.js'), guide, chk, trial, team, build_intro(), sched, build_admin()


def build_admin():
    """v0.26.64 管理（admin.html）：作成者がチームの名前だけを確かめる。どこからもリンクしない・検索に出さない（noindex）・Service Worker にも入れない"""
    base = text('src/template.html')
    g = text('src/admin_template.html')
    rep = {'__BASE_CSS__': base[base.index('<style>') + 7:base.index('</style>')], '__LOGO_DARK__': logo_inline('logo/option_A_dark.svg'),
           '__FAVICON__': 'data:image/svg+xml;base64,' + b64('logo/option_A_icon.svg'), '__VERSION__': VERSION,
           '__AUTHCOMMON__': text('src/auth_common.js'), '__ADMINAPP__': text('src/admin_app.js')}
    for k, v in rep.items():
        assert k in g, k
        g = g.replace(k, v)
    return g


def build_intro():
    """v0.26.13 導入説明（intro.html）：A4 1枚。印刷・PDFにして配る"""
    g = text('src/intro_template.html')
    rep = {'__FAVICON__': 'data:image/svg+xml;base64,' + b64('logo/option_A_icon.svg'), '__LOGO_DARK__': logo_inline('logo/option_A_dark.svg'),
           '__VERSION__': VERSION, '__SITE__': SHARE_BASE, '__QRCODE__': text('vendor/qrcode.js')}
    for k, v in rep.items():
        assert k in g or k == '__MODEBTN__', k
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
        assert k in g or k == '__MODEBTN__', k
        g = g.replace(k, v)
    return g


def build_check():
    """v0.19 エントリー照合（check.html）：エントリーファイルとスタートリストを端末の中で突き合わせる"""
    base = text('src/template.html')
    g = text('src/check_template.html')
    rep = {'__BASE_CSS__': base[base.index('<style>') + 7:base.index('</style>')], '__LOGO_DARK__': logo_inline('logo/option_A_dark.svg'),
           '__FAVICON__': 'data:image/svg+xml;base64,' + b64('logo/option_A_icon.svg'),
           '__APPLE_ICON__': 'data:image/png;base64,' + b64('logo/png/option_A_icon_180.png'), '__VERSION__': VERSION, '__MODEBTN__': MODEBTN, '__MODEPICK__': MODEPICK, '__MODE__': (text('src/mode.js') + '\n' + text('src/plans.js')), '__MODEBTN__': MODEBTN, '__MODEPICK__': MODEPICK, '__MODE__': (text('src/mode.js') + '\n' + text('src/plans.js')), '__REC_VERSION__': REC_VERSION,
           '__PARSER__': text('src/parser.js'), '__LOGIC__': text('src/logic.js'), '__ENTRY__': text('src/entry.js'), '__CHECKAPP__': text('src/check_app.js'), '__URLLOAD__': text('src/urlload.js'), '__OVERLAY__': text('src/overlay.js'), '__PDFMAKE__': text('src/pdfmake.js'),
           '__AUTHCOMMON__': text('src/auth_common.js'), '__FEEDBACK__': text('src/feedback.js')}
    for k, v in rep.items():
        assert k in g or k == '__MODEBTN__', k
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
    out = ['<section class="box g-card" id="manual"><h2>📖 マニュアル</h2><p data-xp="" data-xp-at="h2">LANE NOTE で「何ができるか」を、やりたいこと別にまとめました。まず自分に近いものを選んでください。下には、画面ごとのボタンの説明があります。絵は架空のデータで撮った実際の画面です（押すと大きく表示）。</p>',
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
           '__APPLE_ICON__': 'data:image/png;base64,' + b64('logo/png/option_A_icon_180.png'), '__VERSION__': VERSION, '__MODEBTN__': MODEBTN, '__MODEPICK__': MODEPICK, '__MODE__': (text('src/mode.js') + '\n' + text('src/plans.js')), '__BUTTONS__': buttons_html(), '__OVERLAY__': text('src/overlay.js')}
    for k, v in rep.items():
        assert k in g or k == '__MODEBTN__', k
        g = g.replace(k, v)
    return g


# v0.26.22：見出しの下のボタンの列は、全ページこの1か所から作る（同じ並び・同じ見た目。今いるページは強調）
#   チームは選手モードでは出さない（body.ln-player）。intro.html は印刷して配るA4 1枚なので、ボタンの列は付けない
NAV_MAIN = [('records', 'records.html', '📒 記録'), ('index', 'index.html', '🏁 大会準備'), ('check', 'check.html', '✅ 照合')]
NAV_SUB = [('guide', 'guide.html', 'tb-begin', '🔰 はじめての人はこちら'), ('try', 'try.html', 'tb-try', '⏱ 3分体験'),
           ('team', 'team.html', 'tb-team', '👥 チーム'), ('manual', 'guide.html#manual', 'tb-manual', '📖 マニュアル')]
NAV_CSS = (
    '<style>'
    '.pagenav.ln-nav{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;margin-top:10px;position:relative}'
    '.ln-nav a,.ln-nav .pn-b,.ln-nav .tb-btn{display:inline-flex;align-items:center;gap:4px;min-height:30px;box-sizing:border-box;background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.45);border-radius:999px;padding:3px 12px;font-size:13px;font-weight:600;text-decoration:none;cursor:pointer;font-family:inherit;line-height:1.3;white-space:nowrap}'
    '.ln-nav a,.ln-nav .pn-b,.ln-nav .tb-btn{transition:none!important}.ln-nav a:not(.on),.ln-nav .pn-b,.ln-nav .tb-btn:not(.on){color:#fff!important;background:rgba(255,255,255,.14)!important}.ln-nav .pn-sub .pn-b,.ln-nav .pn-sub a:not(.on),.ln-nav .pn-sub .tb-btn:not(.on){background:rgba(255,255,255,.10)!important}'
    '.ln-nav a.on,.ln-nav .tb-btn.on{background:#fff!important;color:#1f3a68!important;border-color:#fff!important;font-weight:800}'
    '.ln-nav .tb-btn.mode-sw small{font-size:11px;opacity:.8;margin-left:4px}'
    '.ln-nav .cl-new{background:#e4572e;color:#fff;border-radius:999px;font-size:10px;padding:0 6px;font-weight:800}'
    # v0.26.36 見出しは どの幅でも「記録・大会準備・照合・大会予定・≡ メニュー」だけ。ほかは全部メニューの中（JS で幅を測るのは、スマホで5つが入りきらないときだけ）
    '.pagenav.ln-nav{flex-wrap:nowrap;max-width:100%;min-width:0;box-sizing:border-box}header{overflow-x:clip}'
    # v0.26.45 PC の広い画面でも、ボタンの列をロゴ・説明と同じ左端に（header>* と同じ最大幅 1180px・左右の auto 余白）
    'header>.pagenav.ln-nav{max-width:min(100%,1180px);margin-left:auto;margin-right:auto}'
    '.ln-nav .pn-sub{display:none}.ln-nav.open .pn-sub{display:flex;flex-direction:column;align-items:stretch;gap:6px;position:fixed;z-index:1000;min-width:230px;max-width:calc(100vw - 16px);box-sizing:border-box;overflow:auto;background:rgba(15,22,40,.96);border:1px solid rgba(255,255,255,.35);border-radius:12px;padding:10px}'
    '.pagenav.ln-nav.open{z-index:1001}.ln-nav .pn-sub>*{justify-content:flex-start;min-height:40px;font-size:14px}'
    '.ln-nav .pn-menu .cl-new{margin-left:2px}body.ln-player .ln-nav .pn-menu .cl-new{display:none}'
    'body.ln-player .ln-nav .pn-main,body.ln-player .ln-nav .tb-team,body.ln-player .ln-nav .tb-sched,body.ln-player .ln-nav [data-tb="changelog"]{display:none!important}'
    '@media screen and (max-width:720px){.pagenav.ln-nav{gap:6px}.ln-nav .pn-main,.ln-nav .pn-menu{padding:3px 9px;font-size:13px}}'
    '@media print{.ln-nav{display:none!important}}'
    '</style>')
NAV_JS = ('<script>(function () { var n = document.currentScript.parentNode, m = n.querySelector(".pn-menu"), sub = n.querySelector(".pn-sub");'
          # v0.26.36 入りきらないとき（スマホ）だけ、大会予定→照合→大会準備→記録の順にメニューの上へ移す。≡ メニューは必ず見える
          ' var mains = [].slice.call(n.querySelectorAll(".pn-main")), first = sub.firstChild;'
          ' function vis(x) { return x.offsetWidth > 0; } function close() { if (n.classList.contains("open")) { n.classList.remove("open"); m.setAttribute("aria-expanded", "false"); } }'
          ' function over() { var lim = n.getBoundingClientRect().right - (parseFloat(n.style.paddingRight) || 0) + 1; return m.getBoundingClientRect().right > lim; }'
          ' var lastFold = ""; function fit() { mains.forEach(function (x) { n.insertBefore(x, m); x.classList.remove("pn-in"); }); n.style.paddingRight = ""; n.style.marginTop = "";'
          '  var c = document.querySelector(".hdr-meta>.use-count"), nr = n.getBoundingClientRect();'
          '  if (c && !c.hidden && c.offsetWidth) { var cr = c.getBoundingClientRect(); if (cr.bottom > nr.top - 2 && cr.top < nr.top + 34 && cr.left < nr.right) { n.style.paddingRight = Math.ceil(nr.right - cr.left + 8) + "px"; if (over()) { n.style.paddingRight = ""; n.style.marginTop = Math.ceil(cr.bottom - nr.top + 16) + "px"; } } }'
          '  for (var i = mains.length - 1; i >= 0 && over(); i--) { if (vis(mains[i])) { sub.insertBefore(mains[i], sub.firstChild); mains[i].classList.add("pn-in"); } }'
          '  var f = mains.filter(function (x) { return x.classList.contains("pn-in"); }).length + ""; if (f !== lastFold) { lastFold = f; close(); }'
          '  if (window.scrollX) window.scrollTo(0, window.scrollY); place(); }'
          ' function place() { if (!n.classList.contains("open")) return; var r = m.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight;'
          '  sub.style.top = Math.round(r.bottom + 6) + "px"; sub.style.maxHeight = Math.max(120, vh - r.bottom - 14) + "px"; var w = sub.offsetWidth;'
          '  sub.style.left = Math.round(Math.max(8, Math.min(r.left, vw - w - 8))) + "px"; }'
          ' window.__lnNavFit = fit; window.__lnNavPlace = place; window.addEventListener("resize", fit); window.addEventListener("load", fit); setTimeout(fit, 0); if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);'
          ' if (window.ResizeObserver) new ResizeObserver(function () { clearTimeout(n._ft); n._ft = setTimeout(fit, 50); }).observe(n.parentNode);'
          ' window.addEventListener("scroll", place, { passive: true }); window.addEventListener("pageshow", close);'
          ' var cc = document.querySelector(".hdr-meta>.use-count"); if (cc && window.MutationObserver) new MutationObserver(function () { setTimeout(fit, 0); }).observe(cc, { attributes: true, childList: true, subtree: true });'
          ' m.addEventListener("click", function (e) { e.stopPropagation(); var o = n.classList.toggle("open"); m.setAttribute("aria-expanded", o); place(); setTimeout(function () { if (window.scrollX) window.scrollTo(0, window.scrollY); }, 0); });'
          ' document.addEventListener("click", function (e) { if (!n.contains(e.target)) close(); });'
          ' document.addEventListener("keydown", function (e) { if (e.key === "Escape" && n.classList.contains("open")) { close(); m.focus(); } });'
          ' })();</script>')


def hdrnav(cur=''):
    """v0.26.22：全ページ共通の見出し（ヘッダー）のボタン。v0.26.36 どの幅でも 記録・大会準備・照合・大会予定 ＋「≡ メニュー」（中身は全ページ同じ）"""
    on = lambda k: (' class="on" aria-current="page"' if k == cur else '')
    h = '<nav class="pagenav ln-nav" id="lnNav" aria-label="ページ" data-nav="v0.26.22">'
    h += ''.join('<a href="%s" class="pn-main%s" data-tb="%s"%s>%s</a>' % (href, ' on' if k == cur else '', k, ' aria-current="page"' if k == cur else '', label) for k, href, label in NAV_MAIN)
    # v0.26.36 大会予定は見出しに出す（tb-sched：選手モードでは出さない）
    h += '<a href="schedule.html" class="pn-main tb-sched%s" data-tb="schedule"%s>📅 大会予定</a>' % (' on' if cur == 'schedule' else '', ' aria-current="page"' if cur == 'schedule' else '')
    h += '<button type="button" class="pn-b pn-menu" aria-expanded="false" aria-controls="lnNavSub">≡ メニュー</button><div class="pn-sub" id="lnNavSub">'
    h += '<a href="guide.html#changelog" class="tb-btn tb-guide tb-cl" data-tb="changelog">📰 更新情報</a>'   # v0.26.38.1 更新情報は guide.html の欄へ
    for k in ['team', 'manual', 'guide', 'try']:
        href, cls, label = {x[0]: x[1:] for x in NAV_SUB}[k]
        h += '<a href="%s" class="tb-btn tb-guide %s%s" data-tb="%s"%s>%s</a>' % (href, cls, ' on' if k == cur else '', k, ' aria-current="page"' if k == cur else '', label)
    h += '<button type="button" class="tb-btn fb-link" data-feedback="1" data-tb="feedback">🚨 不具合・要望を送る</button>' + MODEBTN + '</div>' + NAV_CSS + NAV_JS + '</nav>'
    return h


def with_nav(page, cur):
    page, n = re.subn(r'<nav class="pagenav" aria-label="ページ">.*?</nav>', lambda m: hdrnav(cur), page, count=1, flags=re.S)
    assert n == 1, cur
    return page


def fb_scripts():
    """不具合・要望を送る（ボタンの列にあるので、どのページでも使えるように）"""
    return '<script src="firebase-config.js"></script>\n<script>\n' + text('src/auth_common.js') + '\n</script>\n<script>\n' + text('src/feedback.js') + '\n</script>'


def build_team(rec):
    """v0.26.10 チームの設定ページ（team.html）：records.html と同じ中身に team-page の印をつけ、チームの欄だけを見せる"""
    assert '<body class="records">' in rec and '<title>' in rec
    t = rec.replace('<body class="records">', '<body class="records team-page">', 1)
    t = re.sub(r'<title>[^<]*</title>', '<title>LANE NOTE チームの設定</title>', t, count=1)
    t = t.replace('<a href="records.html" class="pn-main on" data-tb="records" aria-current="page">', '<a href="records.html" class="pn-main" data-tb="records">', 1)
    t = t.replace('<a href="team.html" class="tb-btn tb-guide tb-team" data-tb="team">', '<a href="team.html" class="tb-btn tb-guide tb-team on" data-tb="team" aria-current="page">', 1)
    assert 'tb-team on' in t
    return t


def build_sched(rec):
    """v0.26.30 大会予定のページ（schedule.html）：records.html と同じ部品（ログイン・チームの切り替え・保存先も同じ）に sched-page の印をつけ、大会予定の欄だけを見せる"""
    assert '<body class="records">' in rec and '<title>' in rec
    t = rec.replace('<body class="records">', '<body class="records sched-page">', 1)
    t = re.sub(r'<title>[^<]*</title>', '<title>LANE NOTE 大会予定</title>', t, count=1)
    t = t.replace('<a href="records.html" class="pn-main on" data-tb="records" aria-current="page">', '<a href="records.html" class="pn-main" data-tb="records">', 1)
    t = t.replace('<a href="schedule.html" class="pn-main tb-sched" data-tb="schedule">', '<a href="schedule.html" class="pn-main tb-sched on" data-tb="schedule" aria-current="page">', 1)
    assert 'tb-sched on' in t
    return t


def build_records(index_html):
    """LANE LOGのページ。見た目は大会準備のページと同じCSSを使う（template.html の <style> をそのまま入れる）"""
    base = text('src/template.html')
    css = base[base.index('<style>') + 7:base.index('</style>')]
    rec = text('src/records_template.html')
    rep = {
        '__BASE_CSS__': css, '__RESULTS__': text('src/results.js'), '__RECAPP__': text('src/records_app.js'), '__URLLOAD__': text('src/urlload.js') + '\n' + text('src/pubmeets.js') + '\n' + text('src/prepdel.js') + '\n' + text('src/yearbuild.js') + '\n' + text('src/suspect.js'), '__OVERLAY__': text('src/overlay.js'), '__PDFMAKE__': text('src/pdfmake.js'), '__PERSONAL__': text('src/personal.js'), '__TALK__': text('src/talk.js'), '__TEAM__': text('src/team.js'), '__ROSTER__': text('src/roster.js'), '__PRINT__': text('src/print.js') + '\n' + text('src/review.js') + '\n' + text('src/entrydraft.js'), '__SHARE_BASE__': SHARE_BASE, '__FEEDBACK__': text('src/feedback.js'), '__AUTHCOMMON__': text('src/auth_common.js'),
        '__LOGO_DARK__': logo_inline('logo/option_A_dark.svg'),
        '__FAVICON__': 'data:image/svg+xml;base64,' + b64('logo/option_A_icon.svg'),
        '__APPLE_ICON__': 'data:image/png;base64,' + b64('logo/png/option_A_icon_180.png'),
        '__VERSION__': VERSION, '__MODEBTN__': MODEBTN, '__MODEPICK__': MODEPICK, '__MODE__': (text('src/mode.js') + '\n' + text('src/plans.js')), '__REC_VERSION__': REC_VERSION, '__BUILD_DATE__': REC_BUILD_DATE,
    }
    for k, v in rep.items():
        assert k in rec or k == '__MODEBTN__', k
        rec = rec.replace(k, v)
    return rec


OUTPUTS = ('index.html', 'sw.js', 'records.html', 'firebase-config.js', 'guide.html', 'check.html', 'try.html', 'team.html', 'intro.html', 'schedule.html', 'admin.html')   # 公開するファイル（--check もこれらを確かめる）


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
