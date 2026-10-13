# v0.26.21 リレーの結果PDF（架空の学校・選手だけ）を2つの形で作る
#   A：走者名の列に「ナンバー 名前(中3) ﾌﾘｶﾞﾅ」が縦に4行（1組・2組を左右に並べる）
#   B：順位 ﾚｰﾝ ﾁｰﾑ ﾅﾝﾊﾞｰ ｵｰﾀﾞｰ ｶﾅ 記録 ｺﾒﾝﾄ（チーム名は右寄せ・小さく詰めた字の名前・DQ は ｺﾒﾝﾄ に）
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
pdfmetrics.registerFont(UnicodeCIDFont('HeiseiKakuGo-W5'))
F='HeiseiKakuGo-W5'; OUT='fixtures/'
def mk(path, size):
    c=canvas.Canvas(path,pagesize=size); W,H=size
    def t(x,y,s,sz=8,scale=100,right=False):
        o=c.beginText(); o.setFont(F,sz); o.setHorizScale(scale)
        if right: x-=pdfmetrics.stringWidth(s,F,sz)*scale/100
        o.setTextOrigin(x,H-y); o.textOut(s); c.drawText(o)
    return c,t
# ---------- A ----------
c,t=mk(OUT+'relay_a.pdf',landscape(A4))
t(40,40,'男子中学共通　４×１００ｍ',18); t(40,62,'タイムレース　全2組',12)
TEAMS_A=[[('1','5','架空中A','45.33'),('2','6','見本第二中A','46.49'),('','3','試験中','DNS')],[('1','4','仮名中B','47.02'),('2','2','架空中B','48.10')]]
RUN=[('架空','一郎','中3','ｶｸｳ ｲﾁﾛｳ'),('見本','二郎','中2','ﾐﾎﾝ ｼﾞﾛｳ'),('試験','三太','中3','ｼｹﾝ ｻﾝﾀ'),('仮名','四郎','中1','ｶﾒｲ ｼﾛｳ')]
for col,(x0,heat) in enumerate(((30,1),(420,2))):
    t(x0+20,80,'%d組'%heat,12)
    for x,s in ((0,'順位'),(16,'ﾚｰﾝ'),(50,'チーム'),(110,'ﾅﾝﾊﾞｰ'),(170,'走者名'),(300,'記録'),(345,'ｺﾒﾝﾄ')): t(x0+x,95,s,6)
    y=108
    for k,(rk,ln,tm,mk_) in enumerate(TEAMS_A[col]):
        t(x0+2,y,rk,8); t(x0+20,y,ln,8); t(x0+30,y,tm,8); t(x0+300,y,mk_,8)
        if mk_!='DNS':
            for i,(a,b,g,kn) in enumerate(RUN):
                t(x0+112,y+i*10,str(100+heat*50+k*4+i),8,right=False); t(x0+135,y+i*10,'%s　%s(%s)'%(a,b,g),8); t(x0+225,y+i*10,kn,7)
            y+=48
        else: y+=22
c.showPage(); c.save()
# ---------- B ----------
c,t=mk(OUT+'relay_b.pdf',landscape(A4))
t(40,30,'女子中学共通　４×１００ｍ',18); t(40,50,'タイムレース',12)
TEAMS_B=[[('1','6','架空中B','52.78',''),('2','4','見本第三中A','53.58',''),('','3','架空中D','','DQ,R1')],[('1','3','試験中','51.26',''),('2','4','架空中E','52.55',''),('','1','仮名中C','','DQ,R1')]]
RB=[('架空','花子','(13)','ｶｸｳ ﾊﾅｺ'),('見本','桜','(14)','ﾐﾎﾝ ｻｸﾗ'),('コールンストラ','未来','(13)','ｺｰﾙﾝｽﾄﾗ ﾐﾗｲ'),('試験','葵','(13)','ｼｹﾝ ｱｵｲ')]
for col,(x0,heat) in enumerate(((30,3),(420,4))):
    t(x0,70,'%d組'%heat,13)
    for x,s in ((0,'順位'),(14,'ﾚｰﾝ'),(75,'ﾁｰﾑ'),(110,'ﾅﾝﾊﾞｰ'),(140,'ｵｰﾀﾞｰ'),(220,'ｶﾅ'),(310,'記録'),(350,'ｺﾒﾝﾄ')): t(x0+x,82,s,6)
    y=95
    for k,(rk,ln,tm,mk_,cm) in enumerate(TEAMS_B[col]):
        small = k==1
        t(x0+4,y,rk,8); t(x0+20,y,ln,8); t(x0+128,y,tm,5 if small else 8,right=True); t(x0+310,y,mk_,8); t(x0+350,y,cm,5)
        for i,(a,b,g,kn) in enumerate(RB):
            bib=str(400+heat*20+k*4+i); t(x0+150,y+i*10,bib,8,right=True)
            if i==2: t(x0+155,y+i*10,'%s　%s%s'%(a,b,g),5,scale=60); t(x0+220,y+i*10,kn,5,scale=60)
            else: t(x0+155,y+i*10,'%s　%s%s'%(a,b,g),8); t(x0+220,y+i*10,kn,7)
        c.line(x0,y+36,x0+380,y+36); y+=42
c.showPage(); c.save()
