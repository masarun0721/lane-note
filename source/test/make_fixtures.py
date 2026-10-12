# 架空の大会PDF（選手・学校はすべて架空）を作る。監査の再現条件に合わせたもの
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
pdfmetrics.registerFont(UnicodeCIDFont('HeiseiKakuGo-W5'))
F='HeiseiKakuGo-W5'; W,H=A4; OUT='fixtures/'
def t(c,x,y,s,size=9): c.setFont(F,size); c.drawString(x,H-y,s)
NAMES=['架空 一郎(2)','見本 二郎(1)','試験 三太(3)','仮名 四郎(2)','例示 五郎(1)','模擬 六助(2)','空想 七海(3)','想定 八雲(1)']
TEAMS=['架空第一高','見本高','試験高','仮名高','例示高','模擬高','空想高','想定高']
def block(c,y0,heat,rows,start_bib):
    t(c,48,y0-10,'%d組'%heat)
    for x,s in ((40,'ﾚｰﾝ'),(68,'ﾅﾝﾊﾞｰ'),(110,'氏'),(128,'名'),(190,'所'),(208,'属'),(270,'記録')): t(c,x,y0,s)
    for i in range(rows):
        y=y0+14+i*14
        t(c,52,y,str(i+1)); t(c,74,y,str(start_bib+i)); t(c,110,y,NAMES[i%8]); t(c,190,y,TEAMS[i%8])
    return y0+14+rows*14+20
def sl_page(c,title,rnd,heats,bib0,title_size=16,date=None,sched=None,rows=4):
    if date: t(c,48,22,date,9)
    t(c,48,43,title,title_size)
    if sched:
        for k,sx in enumerate(sched): t(c,380,43+k*12,sx,8)
    t(c,48,62,rnd,12.9)
    y=95
    for h in heats: y=block(c,y,h,rows,bib0+h*10)
    # 本文の文字数（中央値の計算用。見出しが本文より大きいかの判定に使われる）
    c.showPage()

# 1. 見出しの継承：2ページ目の「男子 高校 200m」を本文と同じ大きさにする
c=canvas.Canvas(OUT+'f1_small_heading.pdf',pagesize=A4)
sl_page(c,'男子 高校 100m','予選',[1],100)
sl_page(c,'男子 高校 200m','予選',[1],200,title_size=9)
c.save()
# 1b. 1ページ目に見出しが無いのに番号の行だけがある（読めない部分）
c=canvas.Canvas(OUT+'f1b_no_heading.pdf',pagesize=A4)
t(c,48,62,'予選',12.9); block(c,95,1,6,300); c.showPage()
sl_page(c,'男子 高校 400m','予選',[1],400)
c.save()

# 2. 決勝の時刻：プログラム形式で、決勝の表に「09:00 予選」の日程しか無い
c=canvas.Canvas(OUT+'f2_program_final.pdf',pagesize=A4)
sl_page(c,'中学男子100m','決勝',[1],100,sched=['10月11日 09:00 予選'])
sl_page(c,'中学男子200m','予選',[1],200,sched=['10月11日 10:00 予選','10月11日 13:00 決勝'])
c.save()
# 2b. スタートリスト（決勝）＋タイムテーブル（予選の時刻だけ）
c=canvas.Canvas(OUT+'f2b_sl_final.pdf',pagesize=A4)
sl_page(c,'男子 高校 100m','決勝',[1],100)
c.save()
def tt(name,lines,pages=None):
    c=canvas.Canvas(OUT+name,pagesize=A4)
    for pg in (pages or [(None,lines)]):
        hdr,ls=pg
        if hdr: t(c,40,40,hdr,10)
        t(c,40,60,'競技日程（タイムテーブル）',12)
        for i,row in enumerate(ls):
            x=40
            for w in row: t(c,x,90+i*16,w,9); x+=12+len(w)*7
        c.showPage()
    c.save()
tt('f2b_tt_heatonly.pdf',[['09:00','高校','男子','100m','予選','3組']])

# 3. 組ごとの時刻：2組から始まる／欠番あり
c=canvas.Canvas(OUT+'f3_sl_heats.pdf',pagesize=A4)
sl_page(c,'男子 高校 100m','予選',[1,2,3,4],100,rows=3)
c.save()
tt('f3_tt_from2.pdf',[['09:10','高校','男子','100m','予選','2組'],['09:20','高校','男子','100m','予選','3組'],['09:30','高校','男子','100m','予選','4組']])
tt('f3_tt_gap.pdf',[['09:00','高校','男子','100m','予選','1組'],['09:20','高校','男子','100m','予選','3組'],['09:30','高校','男子','100m','予選','4組']])
tt('f3_tt_all.pdf',[['09:00','高校','男子','100m','予選','全4組']])

# 4. 複数日：日付がページごとに分かれている
c=canvas.Canvas(OUT+'f4_sl_twodays.pdf',pagesize=A4)
sl_page(c,'男子 高校 100m','予選',[1],100,date='第1日 10月11日（日）')
sl_page(c,'男子 高校 100m','準決勝',[1],200,date='第2日 10月12日（月）')
c.save()
tt('f4_tt_twodays.pdf',None,pages=[('第1日 10月11日（日）',[['10:00','高校','男子','100m','予選','全1組']]),('第2日 10月12日（月）',[['09:30','高校','男子','100m','準決勝','全1組']])])

# 5・6. 競技注意事項（参加料あり／なし、招集時刻が違う）
def note(name,lines):
    c=canvas.Canvas(OUT+name,pagesize=A4)
    t(c,40,40,'競技注意事項（架空大会）',14)
    for i,l in enumerate(lines): t(c,40,80+i*18,l,10)
    c.save()
note('f5_note_fee500.pdf',['1. 招集について','トラック競技 招集開始 30分前 招集完了 20分前','フィールド競技 招集開始 40分前 招集完了 30分前','2. 参加料 高校生 1種目 500円'])
note('f5_note_nofee.pdf',['1. 招集について','トラック競技 招集開始 30分前 招集完了 20分前','フィールド競技 招集開始 40分前 招集完了 30分前'])
note('f6_note_track60.pdf',['1. 招集について','トラック競技 招集開始 60分前 招集完了 50分前','フィールド競技 招集開始 40分前 招集完了 30分前'])
print('ok')
