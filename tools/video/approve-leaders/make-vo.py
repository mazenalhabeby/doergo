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
  ('intro', 'باتريك مديرٌ في مساحة العمل. عمل وقتاً إضافياً بعد نهاية مناوبته، وطلب الموافقة عليه. شاشته تقول: بانتظار الموافقة، تم إبلاغ مسؤولك. لكن السؤال: من هو مسؤول باتريك؟ ومن سيوافق عليه فعلاً؟'),
  ('today', 'هذا ما يحدث اليوم. النظام يبحث عن من يملك صلاحية الموافقة على الوقت الإضافي في مساحة العمل، فيجد باتريك نفسه فقط. ثم يحذفه، لأن لا أحد يوافق على طلبه هو. فتبقى القائمة فارغة، ولا يصل الطلب إلى أحد. والأسوأ أن النظام لا يجرّب الخطوة التالية، لأن القائمة لم تكن فارغة قبل حذف باتريك. وإذا كان باتريك مديراً عاماً، فمسموح له أن يوافق على طلبه، لكن صندوق الموافقات يخفي طلباته الشخصية، فلا يراه أبداً. والنتيجة: طلب ينتظر إلى الأبد، ووقت لا يُحسب. وفوق ذلك تظهر له رسالتان تقولان الشيء نفسه.'),
  ('chain', 'وهذا ما نقترحه. الطلب يصعد درجةً درجة، ولا يتوقف عند لا أحد. أولاً: من يوافق على الوقت الإضافي في مساحة العمل نفسها، ما عدا باتريك. ثانياً: إن لم يوجد أحد، يذهب إلى الأشخاص المعيّنين لمتابعة باتريك. ثالثاً: إن لم يوجد أحد، يذهب إلى مدراء المؤسسة. وفي كل خطوة، يرى من يوافق سبب ظهور الطلب عنده.'),
  ('owner', 'وماذا لو كان باتريك هو المدير العام؟ إذا كان في المؤسسة مدير عام آخر، يذهب الطلب إليه. أما إذا كان هو المالك الوحيد، ولا أحد فوقه، فيُعتمد وقته الإضافي مباشرة، ويُسجَّل في السجل أنه وافق عليه بنفسه بصفته المالك. لا داعي لانتظار شخص غير موجود.'),
  ('phone', 'وعلى الهاتف، يرى باتريك رسالة واحدة فقط، تذكر اسم من سيوافق: بانتظار موافقة آنا على وقتك الإضافي. وآنا ترى الطلب في صندوق موافقاتها، مع السبب: باتريك لا يوجد مسؤول فوقه في هذه المساحة.'),
  ('decisions', 'قبل البناء، نحتاج تأكيد ثلاثة أمور. أولاً: ترتيب الدرجات، المساحة، ثم المتابعون، ثم المدراء. ثانياً: الاعتماد المباشر للمالك الوحيد. ثالثاً: نفس القاعدة لكل الطلبات، ليس الوقت الإضافي فقط، بل الإجازات وتصحيح الساعات أيضاً.'),
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
