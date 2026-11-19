from PIL import Image, ImageDraw
def make(n, safe, path):
    S=4; N=n*S
    im=Image.new('RGB',(N,N),(236,230,214)); d=ImageDraw.Draw(im)
    u=N*safe/100  # content box scale
    o=(N-u)/2
    X=lambda f:o+f*u
    ink=(27,26,23)
    d.line([(X(.5),X(.08)),(X(.5),X(.62))],fill=ink,width=max(2,int(u*.02)))
    d.ellipse([X(.46),X(.04),X(.54),X(.12)],fill=ink)
    d.polygon([(X(.5),X(.94)),(X(.3),X(.62)),(X(.7),X(.62))],fill=ink)
    d.ellipse([X(.3),X(.5),X(.7),X(.74)],fill=ink) if False else None
    d.ellipse([X(.36),X(.58),X(.64),X(.78)],fill=ink)
    im.resize((n,n),Image.LANCZOS).save(path)
make(192,100,'icon-192.png'); make(512,100,'icon-512.png'); make(512,70,'icon-maskable-512.png')
