#!/usr/bin/env python3
"""Arabic narration for what was built: one ElevenLabs clip per section → audio/<id>.mp3.
Same narrator as docs/design/custom-requests (GWparLcEBJuQc36gyF2J, eleven_multilingual_v2). Key: repo-root .env"""
import json,os,sys,urllib.request,time
here=os.path.dirname(os.path.abspath(__file__))
key=[l.split('=',1)[1].strip().strip('"') for l in open(os.path.join(here,'../../../.env')).read().splitlines() if l.startswith('ELEVENLABS_API_KEY=')][0]
S=json.load(open(f'{here}/vo.json')); ids=list(S); only=sys.argv[1:]
for i,k in enumerate(ids):
    out=f'{here}/audio/{k}.mp3'
    if (only and k not in only) or (not only and os.path.exists(out)): continue
    body=json.dumps({"text":S[k],"model_id":"eleven_multilingual_v2","seed":9900+i,
      "previous_text":S[ids[i-1]][-300:] if i else "","next_text":S[ids[i+1]][:200] if i+1<len(ids) else "",
      "voice_settings":{"stability":.5,"similarity_boost":.8,"style":.2,"use_speaker_boost":True,"speed":0.95}}).encode()
    req=urllib.request.Request('https://api.elevenlabs.io/v1/text-to-speech/GWparLcEBJuQc36gyF2J?output_format=mp3_44100_96',data=body,headers={'xi-api-key':key,'Content-Type':'application/json'})
    for a in range(4):
        try: open(out,'wb').write(urllib.request.urlopen(req,timeout=240).read()); print('ok',k); break
        except Exception as e: print('retry',k,e); time.sleep(6*(a+1))
    else: sys.exit('failed '+k)
