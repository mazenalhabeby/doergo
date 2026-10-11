#!/usr/bin/env python3
"""One continuous ElevenLabs take per ad, with per-word times, then pauses cut in.
   ./make-vo.py <dir> [seed]   reads <dir>/script.json, writes voice.wav + timeline.json.
   Key: ELEVENLABS_API_KEY from tools/video/.env (never in the repo)."""
import json,sys,os,base64,urllib.request,subprocess,array
d=sys.argv[1]; seed=int(sys.argv[2]) if len(sys.argv)>2 else 1002
here=os.path.dirname(os.path.abspath(__file__))
env=open(os.path.join(here,'../../../../.env')).read().splitlines()
key=[l.split('=',1)[1].strip().strip('"') for l in env if l.startswith('ELEVENLABS_API_KEY=')][0]
sc=json.load(open(f'{d}/script.json'))['phrases']
text=' '.join(p['text'] for p in sc)
body=json.dumps({"text":text,"model_id":"eleven_multilingual_v2","seed":seed,
  "voice_settings":{"stability":.42,"similarity_boost":.8,"style":.3,"use_speaker_boost":True,"speed":1.04}}).encode()
req=urllib.request.Request('https://api.elevenlabs.io/v1/text-to-speech/GWparLcEBJuQc36gyF2J/with-timestamps?output_format=mp3_44100_192',
  data=body,headers={'xi-api-key':key,'Content-Type':'application/json'})
r=json.load(urllib.request.urlopen(req,timeout=180))
open(f'{d}/vo.mp3','wb').write(base64.b64decode(r['audio_base64']))
al=r['alignment']; json.dump({'text':text,'alignment':al},open(f'{d}/vo.json','w'))
cs,ce=al['character_start_times_seconds'],al['character_end_times_seconds']
# phrase + word times in the raw take
pos=0;raw=[]
for p in sc:
    a=text.index(p['text'],pos);b=a+len(p['text']);pos=b
    ws=[];i=a
    for w in p['text'].split(' '):
        j=text.index(w,i);ws.append(cs[j]);i=j+len(w)
    raw.append((cs[a],ce[b-1],ws))
pcm=subprocess.run(['ffmpeg','-v','error','-i',f'{d}/vo.mp3','-f','s16le','-ac','1','-ar','44100','-'],capture_output=True).stdout
S=array.array('h');S.frombytes(pcm);R=44100
LEAD=.3;cuts=[0]+[(raw[i][1]+raw[i+1][0])/2 for i in range(len(raw)-1)]+[len(S)/R]
out=array.array('h',[0]*int(LEAD*R));phr=[]
for i,p in enumerate(sc):
    off=len(out)/R-cuts[i]
    out.extend(S[int(cuts[i]*R):int(cuts[i+1]*R)])
    s,e,ws=raw[i]
    phr.append({'text':p['text'],'start':round(s+off,3),'end':round(e+off,3),'wordStarts':[round(w+off,3) for w in ws]})
    out.extend([0]*int(p['pause']*R))
TAIL=2.0;out.extend([0]*int(TAIL*R))
subprocess.run(['ffmpeg','-v','error','-y','-f','s16le','-ac','1','-ar','44100','-i','-',f'{d}/voice.wav'],input=out.tobytes(),check=True)
dur=round(len(out)/R,2)
json.dump({'phrases':phr,'duration':dur,'lang':json.load(open(f'{d}/script.json')).get('lang','en')},open(f'{d}/timeline.json','w'),indent=1)
print(d,dur,'s')
