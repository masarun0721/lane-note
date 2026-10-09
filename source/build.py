import base64, pathlib
S = pathlib.Path('/workspace/meet_app/src')
html = (S / 'template.html').read_text(encoding='utf-8')
b64 = lambda p: base64.b64encode(pathlib.Path(p).read_bytes()).decode()
import re
def logo_inline(p):
    s = pathlib.Path(p).read_text(encoding='utf-8')
    s = re.sub(r'<\?xml[^>]*>\s*', '', s)
    s = re.sub(r'<title>.*?</title>', '', s, flags=re.S)
    s = s.replace(' width="924" height="240"', '', 1).replace('role="img" aria-label="LANE NOTE"', 'aria-hidden="true" focusable="false"', 1)
    return s.strip()
SHARE_BASE = 'https://masarun0721.github.io/lane-note/'   # 共有リンク・QRの公開アドレス（file:// で開いたとき用）
VERSION = 'proto-2026.10.09'   # 画面右上と「このツールについて」の両方に出る版
rep = {'__PARSER__': (S/'parser.js').read_text(encoding='utf-8'), '__LOGIC__': (S/'logic.js').read_text(encoding='utf-8'),
       '__ZEKKEN__': (S/'zekken.js').read_text(encoding='utf-8'), '__APP__': (S/'app.js').read_text(encoding='utf-8'),
       '__KOSHI_B64__': b64('/workspace/meet_app/templates/koshi_template.docx'), '__MUNE_B64__': b64('/workspace/meet_app/templates/mune_template.docx'),
       '__LOGO_DARK__': logo_inline('/workspace/meet_app/logo/option_A_dark.svg'),
       '__FAVICON__': 'data:image/svg+xml;base64,' + b64('/workspace/meet_app/logo/option_A_icon.svg'),
       '__APPLE_ICON__': 'data:image/png;base64,' + b64('/workspace/meet_app/logo/png/option_A_icon_180.png'),
       '__VERSION__': VERSION, '__SHARE_BASE__': SHARE_BASE, '__QRCODE__': pathlib.Path('/workspace/meet_app/vendor/qrcode.js').read_text(encoding='utf-8'), '__BUILD_DATE__': __import__('datetime').date.today().strftime('%Y年%m月%d日'),
       '__PRINT_ICON__': 'data:image/svg+xml;base64,' + b64('/workspace/meet_app/logo/option_A_icon_mono.svg'),
       }
for k, v in rep.items():
    assert k in html, k
    html = html.replace(k, v)
out = pathlib.Path('/workspace/meet_app/LANE_NOTE.html')
out.write_text(html, encoding='utf-8')
pathlib.Path('/workspace/meet_app/陸上大会_出場一覧メーカー.html').write_text(html, encoding='utf-8')  # 旧名のコピー（当面）
print(out, len(html))
# 公開用（GitHub Pages など）：dist/index.html と sw.js
D = pathlib.Path('/workspace/meet_app/dist'); D.mkdir(exist_ok=True)
(D / 'index.html').write_text(html, encoding='utf-8')
(D / 'sw.js').write_text((S / 'sw.js').read_text(encoding='utf-8'), encoding='utf-8')
print(D / 'index.html', D / 'sw.js')
