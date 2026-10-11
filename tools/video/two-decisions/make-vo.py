#!/usr/bin/env python3
"""Arabic narration for the two-decisions mockup (docs/design/two-decisions).
One ElevenLabs take per chapter, with per-phrase times, joined with the script's pauses.
  ./make-vo.py            → voice-ar.mp3 + timeline-ar.json   (key: repo-root .env)
  ./make-vo.py <chapter>  → re-record just that chapter
Same voice and model as tools/video/ai-explainer (eleven_multilingual_v2)."""
import json,sys,os,base64,urllib.request,subprocess,array,time
here=os.path.dirname(os.path.abspath(__file__))
env=open(os.path.join(here,'../../../.env')).read().splitlines()
key=[l.split('=',1)[1].strip().strip('"') for l in env if l.startswith('ELEVENLABS_API_KEY=')][0]
S=json.load(open(f'{here}/script.ar.json')); R=44100; V=f'{here}/vo-ar'; os.makedirs(V,exist_ok=True)
only=sys.argv[1] if len(sys.argv)>1 else None
chs=S['chapters']
def take(i,ch):
    text=' '.join(p['text'] for p in ch['phrases'])
    prev=' '.join(p['text'] for p in chs[i-1]['phrases'])[-400:] if i else ''
    nxt=' '.join(p['text'] for p in chs[i+1]['phrases'])[:300] if i+1<len(chs) else ''
    body=json.dumps({"text":text,"model_id":"eleven_multilingual_v2","seed":6100+i,"previous_text":prev,"next_text":nxt,
      "voice_settings":{"stability":.5,"similarity_boost":.8,"style":.2,"use_speaker_boost":True,"speed":0.95}}).encode()
    req=urllib.request.Request('https://api.elevenlabs.io/v1/text-to-speech/GWparLcEBJuQc36gyF2J/with-timestamps?output_format=mp3_44100_128',
      data=body,headers={'xi-api-key':key,'Content-Type':'application/json'})
    for a in range(4):
        try: r=json.load(urllib.request.urlopen(req,timeout=240)); break
        except Exception as e: print('retry',ch['id'],e); time.sleep(8*(a+1))
    else: raise SystemExit(f"failed: {ch['id']}")
    open(f"{V}/{ch['id']}.mp3",'wb').write(base64.b64decode(r['audio_base64']))
    json.dump({'text':text,'alignment':r['alignment']},open(f"{V}/{ch['id']}.json",'w'),ensure_ascii=False)
for i,ch in enumerate(chs):
    done=os.path.exists(f"{V}/{ch['id']}.json")
    if (only and ch['id']!=only and done) or (not only and done): continue
    print('recording',ch['id']); take(i,ch)
out=array.array('h',[0]*int(.4*R)); timeline=[]
for ch in chs:
    v=json.load(open(f"{V}/{ch['id']}.json")); text=v['text']; al=v['alignment']
    cs,ce=al['character_start_times_seconds'],al['character_end_times_seconds']
    pos=0; raw=[]
    for p in ch['phrases']:
        a=text.index(p['text'],pos); b=a+len(p['text']); pos=b
        raw.append((cs[a],ce[b-1]))
    pcm=subprocess.run(['ffmpeg','-v','error','-i',f"{V}/{ch['id']}.mp3",'-f','s16le','-ac','1','-ar',str(R),'-'],capture_output=True).stdout
    A=array.array('h'); A.frombytes(pcm)
    cuts=[max(0,raw[0][0]-.05)]+[(raw[i][1]+raw[i+1][0])/2 for i in range(len(raw)-1)]+[min(len(A)/R,raw[-1][1]+.25)]
    cstart=len(out)/R; phr=[]
    for i,p in enumerate(ch['phrases']):
        off=len(out)/R-cuts[i]
        out.extend(A[int(cuts[i]*R):int(cuts[i+1]*R)])
        s,e=raw[i]
        phr.append({'start':round(s+off,3),'end':round(e+off,3),'scene':p.get('scene')})
        out.extend([0]*int(p.get('pause',.5)*R))
    timeline.append({'id':ch['id'],'start':round(cstart,3),'end':round(len(out)/R,3),'phrases':phr})
out.extend([0]*int(1.5*R))
subprocess.run(['ffmpeg','-v','error','-y','-f','s16le','-ac','1','-ar',str(R),'-i','-','-b:a','96k',f'{here}/voice-ar.mp3'],input=out.tobytes(),check=True)
dur=round(len(out)/R,2)
json.dump({'chapters':timeline,'duration':dur},open(f'{here}/timeline-ar.json','w'),indent=1)
print('voice',dur,'s')
