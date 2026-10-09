#!/usr/bin/env python3
"""Cuts the recorded clips into the showcase video (ffmpeg only, no server or browser needed).

Reads <work>/clips/*.mp4 and <work>/caps/*.png (from record.mjs) and the cut list in story.json, writes
<out>/gemcourt-showcase.mp4 (1920x1080) and <out>/gemcourt-showcase-1080x1350.mp4 (4:5 feed version).
Requires Python 3.8+.
"""
import argparse
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def rel(p):
    return os.path.abspath(os.path.join(HERE, p))


ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('--work-dir', default=os.environ.get('SHOWCASE_WORK_DIR', '.work'), help='where record.mjs put clips/ and caps/ (default: .work)')
ap.add_argument('--out-dir', default=os.environ.get('SHOWCASE_OUT_DIR', 'out'), help='output folder (default: out)')
ap.add_argument('--name', default='gemcourt-showcase', help='output file name stem')
ap.add_argument('--ffmpeg', default=os.environ.get('SHOWCASE_FFMPEG', 'ffmpeg'))
ap.add_argument('--no-feed', action='store_true', help='skip the 1080x1350 (4:5) feed version')
args = ap.parse_args()

work, out_dir = rel(args.work_dir), rel(args.out_dir)
C, CAP = os.path.join(work, 'clips'), os.path.join(work, 'caps')
with open(os.path.join(HERE, 'story.json')) as f:
    story = json.load(f)
FPS = story['fps']
segs = story['segments']
caps = story['captions']

missing = [p for p in {os.path.join(C, s['clip'] + '.mp4') for s in segs} | {os.path.join(CAP, c['id'] + '.png') for c in caps} if not os.path.exists(p)]
if missing:
    sys.exit('[edit] missing inputs (run record.mjs first, or `npm run cards` for captions):\n  ' + '\n  '.join(sorted(missing)))
os.makedirs(out_dir, exist_ok=True)

lens = [(s['end'] - s['start']) / s['speed'] for s in segs]
starts = [0.0]
for i in range(1, len(segs)):
    starts.append(starts[-1] + lens[i - 1] - segs[i]['xfade'])
total = starts[-1] + lens[-1]

inputs, fc = [], []
for i, s in enumerate(segs):
    inputs += ['-i', os.path.join(C, s['clip'] + '.mp4')]
    fc.append(f"[{i}:v]trim={s['start']}:{s['end']},setpts=(PTS-STARTPTS)/{s['speed']},fps={FPS},settb=1/{FPS},"
              f"scale=in_range=full:out_range=limited,format=yuv420p,setsar=1[s{i}]")
last = 's0'
for i in range(1, len(segs)):
    s = segs[i]
    fc.append(f"[{last}][s{i}]xfade=transition={s.get('transition', 'fade')}:duration={s['xfade']}:offset={starts[i]:.3f}[x{i}]")
    last = f'x{i}'
n = len(segs)
for k, c in enumerate(caps):
    seg = c['segment']
    t0 = starts[seg] + c['padIn']
    t1 = starts[seg] + lens[seg] - c['padOut']
    idx = n + k
    inputs += ['-loop', '1', '-t', f'{total:.3f}', '-i', os.path.join(CAP, c['id'] + '.png')]
    fc.append(f'[{idx}:v]format=rgba,fps={FPS},fade=t=in:st={t0:.3f}:d=0.35:alpha=1,fade=t=out:st={t1 - 0.35:.3f}:d=0.35:alpha=1[c{k}]')
    fc.append(f"[{last}][c{k}]overlay=0:0:enable='between(t,{t0 - 0.05:.3f},{t1 + 0.05:.3f})'[o{k}]")
    last = f'o{k}'
# gentle global fade in/out
fc.append(f'[{last}]fade=t=in:st=0:d=0.4,fade=t=out:st={total - 0.5:.3f}:d=0.5,format=yuv420p[v]')
# silent stereo track: some platforms reject video-only uploads
inputs += ['-f', 'lavfi', '-t', f'{total:.3f}', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000']
aidx = n + len(caps)

ENC = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-color_range', 'tv',
       '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-r', str(FPS), '-movflags', '+faststart']
out = os.path.join(out_dir, f'{args.name}.mp4')
subprocess.run([args.ffmpeg, '-y', '-loglevel', 'error', *inputs, '-filter_complex', ';'.join(fc), '-map', '[v]', '-map', f'{aidx}:a',
                *ENC, '-c:a', 'aac', '-b:a', '128k', '-t', f'{total:.3f}', out], check=True)
print(f'[edit] {out}')

if not args.no_feed:
    # 4:5 feed cut: the 16:9 video centred over a blurred, darkened, zoomed copy of itself.
    feed = os.path.join(out_dir, f'{args.name}-1080x1350.mp4')
    vf = ('split[a][b];[a]scale=2400:1350,crop=1080:1350,boxblur=40:2,eq=brightness=-0.32[bg];'
          '[b]scale=1080:-2[fg];[bg][fg]overlay=0:(H-h)/2,format=yuv420p[v]')
    subprocess.run([args.ffmpeg, '-y', '-loglevel', 'error', '-i', out, '-filter_complex', vf, '-map', '[v]', '-map', '0:a',
                    *ENC, '-c:a', 'copy', feed], check=True)
    print(f'[edit] {feed}')

print(json.dumps({'total': round(total, 2), 'starts': [round(s, 2) for s in starts], 'lens': [round(x, 2) for x in lens]}))
