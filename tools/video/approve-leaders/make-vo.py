#!/usr/bin/env python3
"""Arabic narration for docs/design/approve-leaders (who approves a leader's own extra time).
One ElevenLabs clip per section → docs/design/approve-leaders/audio/<id>.mp3 (key: repo-root .env).
  ./make-vo.py          → every clip not yet recorded
  ./make-vo.py <id>     → re-record just that one
Same voice and model as the other mockups (eleven_multilingual_v2)."""
import json, os, sys, time, urllib.request
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.join(here, '../../..')
key = [l.split('=', 1)[1].strip().strip('"') for l in open(os.path.join(root, '.env')).read().splitlines() if l.startswith('ELEVENLABS_API_KEY=')][0]
out = os.path.join(root, 'docs/design/approve-leaders/audio')
CLIPS = [
  ('intro', 'باتريك مديرُ مساحة عمل. طلب الموافقة على وقته الإضافي، لكن الطلب لم يصل إلى أحد، لأنه هو نفسه المسؤول الوحيد في مساحته، ولا أحد يوافق على طلبه هو.'),
  ('rule', 'الحل قاعدة واحدة بسيطة. طلبات أيّ مدير أو مسؤول تذهب دائماً إلى المدراء العامّين. وإذا كان هو المدير العام الوحيد، ولا أحد فوقه، فطلبه يُعتمد تلقائياً، ويُسجَّل ذلك. لا إعدادات، ولا شيء يحتاج المكتب إلى ضبطه.'),
  ('phone', 'وعلى الهاتف رسالة واحدة فقط، فيها اسم من سيوافق: بانتظار موافقة آنا. وآنا ترى الطلب في صندوق موافقاتها، وتوافق بضغطة واحدة.'),
  ('confirm', 'سؤال واحد للتأكيد: هل نطبّق نفس القاعدة على كل طلبات المدراء، مثل الإجازات وتصحيح الساعات، وليس الوقت الإضافي فقط؟'),
]
only = sys.argv[1] if len(sys.argv) > 1 else None
for i, (cid, text) in enumerate(CLIPS):
    path = os.path.join(out, f'{cid}.mp3')
    if (only and cid != only) or (not only and os.path.exists(path)):
        continue
    body = json.dumps({
        'text': text, 'model_id': 'eleven_multilingual_v2', 'seed': 9300 + i,
        'previous_text': CLIPS[i - 1][1][-300:] if i else '',
        'next_text': CLIPS[i + 1][1][:200] if i + 1 < len(CLIPS) else '',
        'voice_settings': {'stability': .5, 'similarity_boost': .8, 'style': .2, 'use_speaker_boost': True, 'speed': .95},
    }).encode()
    req = urllib.request.Request('https://api.elevenlabs.io/v1/text-to-speech/GWparLcEBJuQc36gyF2J?output_format=mp3_44100_128',
                                 data=body, headers={'xi-api-key': key, 'Content-Type': 'application/json'})
    for a in range(4):
        try:
            open(path, 'wb').write(urllib.request.urlopen(req, timeout=240).read()); print('recorded', cid); break
        except Exception as e:
            print('retry', cid, e); time.sleep(8 * (a + 1))
    else:
        raise SystemExit(f'failed: {cid}')
