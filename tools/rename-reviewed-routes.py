#!/usr/bin/env python3
"""
After a controller split: the gateway's reviewed list of routes an external member
can reach (common/__tests__/external-open-routes.ts) names `Class.method`. Rename
each moved method to its new class, and give every new class the old class's
reason line.

  python3 tools/rename-reviewed-routes.py <split plan.json>
"""
import json, re, sys
plan = json.load(open(sys.argv[1]))
old, mem = plan['className'], plan['members']
p = 'apps/api/gateway/src/common/__tests__/external-open-routes.ts'
s = open(p).read()
s = re.sub(rf"^  '{old}\.(\w+)': '{old}',",
           lambda m: f"  '{mem.get(m.group(1), old)}.{m.group(1)}': '{mem.get(m.group(1), old)}',", s, flags=re.M)
reason = re.search(rf'^  {old}: (".*"|\'.*\'),$', s, re.M)
if reason:
    used = sorted({c for c in mem.values() if re.search(rf"'{c}\.", s)})
    add = ''.join(f'  {c}: {reason.group(1)},\n' for c in used if not re.search(rf'^  {c}: ', s, re.M))
    s = s.replace(reason.group(0) + '\n', reason.group(0) + '\n' + add, 1)
open(p, 'w').write(s)
print('renamed in', p)
