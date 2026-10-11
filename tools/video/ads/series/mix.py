#!/usr/bin/env python3
"""Voice + music (ducked under the voice) + sound effects → final ad.
   ./mix.py <dir> <music id> [music start s] [music volume] [music enters at s]
   Reads <dir>/voice.wav, <dir>/<dir>-silent.mp4, <dir>/sfx.json ([{t, s:'s1372', v:0.5, d:1.2?}])
   Writes <dir>/<dir>.mp4 at −14 LUFS (social standard)."""
import json,sys,subprocess,os
d=sys.argv[1].rstrip('/');mid=sys.argv[2];ms=float(sys.argv[3]) if len(sys.argv)>3 else 0;mv=float(sys.argv[4]) if len(sys.argv)>4 else .5;md=float(sys.argv[5]) if len(sys.argv)>5 else 0
sfx_=('-wide' if os.environ.get('WIDE') else '')
A=os.path.join(os.path.dirname(os.path.abspath(__file__)),'_audio')
dur=json.load(open(f'{d}/timeline.json'))['duration']
sfx=json.load(open(f'{d}/sfx.json')) if os.path.exists(f'{d}/sfx.json') else []
inp=['-i',f'{d}/{d}{sfx_}-silent.mp4','-i',f'{d}/voice.wav','-ss',str(ms),'-i',f'{A}/m{mid}.mp3']
fl=[f'[1:a]aformat=channel_layouts=stereo:sample_rates=48000,asplit=2[v][sc]',
    f'[2:a]aformat=channel_layouts=stereo:sample_rates=48000,volume={mv},afade=t=in:d=0.5,adelay={int(md*1000)}:all=1,afade=t=out:st={max(0,dur-2.2)}:d=2.2[m]',
    '[m][sc]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[duck]']
lab=['[v]','[duck]']
for i,e in enumerate(sfx):
    k=i+3;inp+=['-i',f"{A}/{e['s']}.mp3"]
    trim=f",atrim=0:{e['d']},afade=t=out:st={max(0,e['d']-.15)}:d=0.15" if e.get('d') else ''
    fl.append(f"[{k}:a]aformat=channel_layouts=stereo:sample_rates=48000{trim},volume={e.get('v',.5)},adelay={int(e['t']*1000)}:all=1[x{i}]");lab.append(f'[x{i}]')
fl.append(''.join(lab)+f'amix=inputs={len(lab)}:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=9[a]')
subprocess.run(['ffmpeg','-v','error','-y',*inp,'-filter_complex',';'.join(fl),'-map','0:v','-map','[a]','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-t',str(dur),'-movflags','+faststart',f'{d}/{d}{sfx_}.mp4'],check=True)
print(f'{d}/{d}{sfx_}.mp4')
