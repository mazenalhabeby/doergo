"""Turn a vertical ad (1080x1920) into a widescreen one (1920x1080).

The vertical composition keeps every scene, time and motion; it sits in a
1080-wide frame that is CROPPED to its readable band (y 220–1300) and slides:
right-hand side while captions are spoken (captions become large text on the
left), centred when a scene carries its own words (pain cards, TIME = MONEY,
the slam, the end card)."""
import sys, re, os, shutil
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
s = open(f'{src}/ad.html').read()
def rep(old, new):
    global s
    assert s.count(old) == 1, old[:70]
    s = s.replace(old, new)
rep('html,body{width:1080px;height:1920px;', 'html,body{width:1920px;height:1080px;')
rep('#grain{position:absolute;inset:0;', '#frame{position:absolute;left:0;top:0;width:1080px;height:1920px}\n#grain{position:absolute;inset:0;')
# captions: large text in the left column, vertically centred by render()
s = re.sub(r'#cap\{position:absolute;left:70px;width:840px;top:1110px;', '#cap{position:absolute;left:120px;width:720px;top:300px;justify-content:flex-start !important;', s)
s = s.replace('#cap span{font-weight:900;font-size:90px;', '#cap span{font-weight:900;font-size:96px;')
s = s.replace('#cap span{font-weight:900;font-size:80px}', '#cap span{font-size:84px}')
first = s.index('<div class="scene" id="sA">')
flash = s.index('<div id="flash"></div>')
s = s[:first] + '<div id="frame">\n' + s[first:flash] + '</div>\n' + s[flash:]
rep('<canvas id="grain" width="540" height="960" style="width:1080px;height:1920px"></canvas>',
    '<canvas id="grain" width="960" height="540" style="width:1920px;height:1080px"></canvas>')
rep('const gctx=$(\'grain\').getContext(\'2d\');const gimg=gctx.createImageData(540,960);',
    'const gctx=$(\'grain\').getContext(\'2d\');const gimg=gctx.createImageData(960,540);')
s = re.sub(r"const bl=\[\['b1',(mix\([^)]*\)),900,[^\]]*\],\['b2',(mix\([^)]*\)),700,[^\]]*\],\['b3',(mix\([^)]*\)),600,[^\]]*\]\];",
  lambda m: f"const bl=[['b1',{m.group(1)},1000,150+80*Math.sin(t*.6),-150+60*Math.cos(t*.5)],['b2',{m.group(2)},900,1100+90*Math.cos(t*.4),250+60*Math.sin(t*.7)],['b3',{m.group(3)},700,500+70*Math.sin(t*.8),650]];", s)
assert "['b3'" in s and '1100+90' in s
# frame position per scene: right when captions speak, centred otherwise
rep("  grain(frame%12+1);", """  grain(frame%12+1);
  {
    const X_CAP = 800, X_MID = 420, Y = -220, T = 0.45;
    // the opening counter sits high in the vertical frame: drop it to the middle
    const YS = { sA: Y + 110 };
    let x = X_MID, y = Y;
    SC.forEach(([id, , , caps], i) => {
      const [a] = W[i];
      if (t >= a) {
        const k = eio((t - a) / T), pid = i ? SC[i - 1][0] : id;
        const prev = i ? (SC[i - 1][3] ? X_CAP : X_MID) : (caps ? X_CAP : X_MID);
        x = lerp(prev, caps ? X_CAP : X_MID, k);
        y = lerp(YS[pid] ?? Y, YS[id] ?? Y, k);
      }
    });
    $('frame').style.transform = `translate(${x}px, ${y}px)`;
  }""")
rep("  cap.style.top=scn==4?'1130px':(scn==3?'1100px':'1110px');",
    "")
rep("  [...cap.children].forEach((sp,i)=>{",
    "  {for(const sp of cap.children)sp.style.fontSize='';let fs=parseFloat(getComputedStyle(cap.children[0]||cap).fontSize);let h=cap.offsetHeight,f=1;while(h>620&&f>0.6){f-=0.06;for(const sp of cap.children)sp.style.fontSize=(fs*f)+'px';h=cap.offsetHeight;}cap.style.top=Math.round(540-h/2)+'px';}\n  [...cap.children].forEach((sp,i)=>{")
open(f'{dst}/ad.html', 'w').write(s)
for f in ['timeline.json', 'voice.wav', 'logo.svg']:
    shutil.copy(f'{src}/{f}', f'{dst}/{f}')
if not os.path.exists(f'{dst}/f'):
    os.symlink(os.path.abspath('money-vertical/f'), f'{dst}/f')
r = open('money-vertical/render.mjs').read().replace('width: 1080, height: 1920', 'width: 1920, height: 1080').replace("'money-vertical.mp4'", f"'{os.path.basename(dst)}.mp4'")
open(f'{dst}/render.mjs', 'w').write(r)
print('ok', dst)
