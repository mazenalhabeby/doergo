#!/usr/bin/env python3
"""The explainer's narration: one ElevenLabs take PER CHAPTER (a 9-minute single take
drifts in tone and is one failure from starting over), with per-word times, the
script's pauses cut in, chapters joined with a breath between them.
  ./make-vo.py            → voice.wav + timeline.json   (key: repo-root .env)
  ./make-vo.py <chapter>  → re-record just that chapter (the others are reused)
  LANG_VO=de ./make-vo.py    → script.de.json → vo-de/, voice-de.wav, timeline-de.json"""
import json,sys,os,base64,urllib.request,subprocess,array,time
here=os.path.dirname(os.path.abspath(__file__))
env=open(os.path.join(here,'../../../.env')).read().splitlines()
key=[l.split('=',1)[1].strip().strip('"') for l in env if l.startswith('ELEVENLABS_API_KEY=')][0]
L=os.environ.get('LANG_VO','en'); X='' if L=='en' else f'.{L}'; V='vo' if L=='en' else f'vo-{L}'; W='' if L=='en' else f'-{L}'
S=json.load(open(f'{here}/script{X}.json')); R=44100; os.makedirs(f'{here}/{V}',exist_ok=True)
only=sys.argv[1] if len(sys.argv)>1 else None
chs=S['chapters']
def take(i,ch):
    text=' '.join(p['text'] for p in ch['phrases'])
    prev=' '.join(p['text'] for p in chs[i-1]['phrases'])[-400:] if i else ''
    nxt=' '.join(p['text'] for p in chs[i+1]['phrases'])[:300] if i+1<len(chs) else ''
    body=json.dumps({"text":text,"model_id":"eleven_multilingual_v2","seed":3100+i,"previous_text":prev,"next_text":nxt,
      "voice_settings":{"stability":.5,"similarity_boost":.8,"style":.22,"use_speaker_boost":True,"speed":1.0}}).encode()
    req=urllib.request.Request('https://api.elevenlabs.io/v1/text-to-speech/GWparLcEBJuQc36gyF2J/with-timestamps?output_format=mp3_44100_192',
      data=body,headers={'xi-api-key':key,'Content-Type':'application/json'})
    for a in range(4):
        try: r=json.load(urllib.request.urlopen(req,timeout=240)); break
        except Exception as e: print('retry',ch['id'],e); time.sleep(8*(a+1))
    open(f"{here}/{V}/{ch['id']}.mp3",'wb').write(base64.b64decode(r['audio_base64']))
    json.dump({'text':text,'alignment':r['alignment']},open(f"{here}/{V}/{ch['id']}.json",'w'))
for i,ch in enumerate(chs):
    if only and ch['id']!=only and os.path.exists(f"{here}/{V}/{ch['id']}.json"): continue
    if not only and os.path.exists(f"{here}/{V}/{ch['id']}.json"): continue
    print('recording',ch['id']); take(i,ch)
out=array.array('h',[0]*int(.4*R)); timeline=[]
for ch in chs:
    v=json.load(open(f"{here}/{V}/{ch['id']}.json")); text=v['text']; al=v['alignment']
    cs,ce=al['character_start_times_seconds'],al['character_end_times_seconds']
    pos=0;raw=[]
    for p in ch['phrases']:
        a=text.index(p['text'],pos);b=a+len(p['text']);pos=b
        ws=[];k=a
        for w in p['text'].split(' '):
            j=text.index(w,k);ws.append(cs[j]);k=j+len(w)
        raw.append((cs[a],ce[b-1],ws))
    pcm=subprocess.run(['ffmpeg','-v','error','-i',f"{here}/{V}/{ch['id']}.mp3",'-f','s16le','-ac','1','-ar',str(R),'-'],capture_output=True).stdout
    A=array.array('h');A.frombytes(pcm)
    cuts=[max(0,raw[0][0]-.05)]+[(raw[i][1]+raw[i+1][0])/2 for i in range(len(raw)-1)]+[min(len(A)/R,raw[-1][1]+.25)]
    cstart=len(out)/R; phr=[]
    for i,p in enumerate(ch['phrases']):
        off=len(out)/R-cuts[i]
        out.extend(A[int(cuts[i]*R):int(cuts[i+1]*R)])
        s,e,ws=raw[i]
        phr.append({'text':p['text'],'start':round(s+off,3),'end':round(e+off,3),'wordStarts':[round(w+off,3) for w in ws]})
        out.extend([0]*int(p['pause']*R))
    timeline.append({'id':ch['id'],'start':round(cstart,3),'end':round(len(out)/R,3),'phrases':phr})
out.extend([0]*int(2.5*R))
subprocess.run(['ffmpeg','-v','error','-y','-f','s16le','-ac','1','-ar',str(R),'-i','-',f'{here}/voice{W}.wav'],input=out.tobytes(),check=True)
dur=round(len(out)/R,2)
json.dump({'chapters':timeline,'duration':dur,'lang':S.get('lang','en')},open(f'{here}/timeline{W}.json','w'),indent=1)
print('voice',dur,'s =',round(dur/60,2),'min')
