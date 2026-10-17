#!/usr/bin/env python3
"""Turn `const { a, b, … } = useX(args);` + `return { a, b, …, own };` into
`const data = useX(args); const { used } = data;` + `return { ...data, own };`.

Same hooks in the same order; the returned object gains only keys the inner hook
already produced. Refuses (exit 1) when the destructure has renames/defaults/rest.
usage: collapse-hook.py <file> [--var data]
"""
import re, sys

path = sys.argv[1]
var = sys.argv[sys.argv.index('--var') + 1] if '--var' in sys.argv else 'data'
s = open(path).read()

m = re.search(r'\n(\s*)const \{\n((?:\s*[A-Za-z_$][\w$]*,?\n)+)\s*\} = (use[A-Z]\w*\([^;]*\));', s)
if not m:
    sys.exit(f'{path}: no plain destructure of a use*() call found')
indent, names_blk, call = m.group(1), m.group(2), m.group(3)
names = [n.strip().rstrip(',') for n in names_blk.strip().split('\n')]

ret = s.rindex('\n' + indent + 'return {')
ret_end = s.index('\n' + indent + '};', ret)
ret_names = [n.strip().rstrip(',') for n in s[ret + len('\n' + indent + 'return {'):ret_end].strip().split('\n') if n.strip()]
if any(not re.fullmatch(r'[A-Za-z_$][\w$]*', n) for n in ret_names):
    sys.exit(f'{path}: the return is not a plain list of names')

body = s[m.end():ret]
used = [n for n in names if re.search(r'(?<![\w$.])' + re.escape(n) + r'(?![\w$])', body)]
own = [n for n in ret_names if n not in names]
# A name both destructured AND returned is covered by the spread — same value.

decl = f'\n{indent}const {var} = {call};'
if used:
    decl += f'\n{indent}const {{\n' + ''.join(f'{indent}  {n},\n' for n in used) + f'{indent}}} = {var};'
new_ret = f'\n{indent}return {{\n{indent}  ...{var},\n' + ''.join(f'{indent}  {n},\n' for n in own) + f'{indent}}};'

out = s[:m.start()] + decl + body + new_ret + s[ret_end + len('\n' + indent + '};'):]
open(path, 'w').write(out)
print(f'{path}: {len(names)} unpacked → {len(used)} used; return {len(ret_names)} → ...{var} + {len(own)}')
