# v0.26.23 記録の横に「NGR」などが付いた結果PDF（架空データのみ）
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
pdfmetrics.registerFont(UnicodeCIDFont('HeiseiKakuGo-W5'))
def mk(path, tagged):
    c = canvas.Canvas(path, pagesize=(595, 842)); H = 842
    def t(x, y, s, sz=9): c.setFont('HeiseiKakuGo-W5', sz); c.drawString(x, H - y, s)
    t(40, 40, '第1回架空記録会', 12); t(40, 70, '男子 100m'); t(40, 85, '決勝  風:+1.2')
    for x, h in [(40, '順位'), (80, 'ナンバー'), (140, '氏名'), (260, '所属'), (380, '記録'), (470, 'コメント')]: t(x, 110, h)
    rows = [('1', '101', '架空 一郎', '架空学園高', '10.85NGR' if tagged else '10.85', ''),
            ('2', '102', '見本 二郎', '見本高', '10.99', 'GR' if tagged else ''),
            ('3', '103', '試験 三太', '架空学園高', 'PB 11.20' if tagged else '11.20', ''),
            ('4', '104', '例示 四郎', '例示高', '11.31', '')]
    y = 130
    for r in rows:
        for x, s in zip((40, 80, 140, 260, 380, 470), r):
            if s: t(x, y, s)
        y += 18
    c.save()
mk('fixtures/mark_plain.pdf', False); mk('fixtures/mark_tagged.pdf', True)
