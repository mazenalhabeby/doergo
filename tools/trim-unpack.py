#!/usr/bin/env python3
"""`const { a, b, … } = <source>;` → keep only the names used after it in the same file.
<source> is a variable name or a call such as useX() — matched literally."""
import re, sys
path, src = sys.argv[1], sys.argv[2]
s = open(path).read()
m = re.search(r'\n(\s*)const \{\n((?:\s*[A-Za-z_$][\w$]*,?\n)+)\s*\} = ' + re.escape(src) + r';', s)
if not m: sys.exit(f'{path}: no plain unpack of {src}')
ind = m.group(1)
names = [n.strip().rstrip(',') for n in m.group(2).strip().split('\n')]
rest = s[m.end():]
used = [n for n in names if re.search(r'(?<![\w$.])' + re.escape(n) + r'(?![\w$])', rest)]
if used:
    blk = f'\n{ind}const {{\n' + ''.join(f'{ind}  {n},\n' for n in used) + f'{ind}}} = {src};'
else:
    blk = f'\n{ind}{src};' if '(' in src else ''
open(path, 'w').write(s[:m.start()] + blk + rest)
print(f'{path}: {len(names)} → {len(used)}')
