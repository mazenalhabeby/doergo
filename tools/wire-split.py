#!/usr/bin/env python3
"""
After a class split: point a caller's `this.<field>.<method>(` at the new service,
inject that service, import it, and register it in a module.

  python3 tools/wire-split.py <plan.json>

plan.json:
  { "dir": "apps/api/.../customers",
    "services": { "CustomerWriteService": { "file": "customer-write.service", "field": "customerWrite",
                                            "methods": ["create", "update"] }, … },
    "callers": [ { "file": "customers.controller.ts", "field": "customersService" } ],
    "module": "customers.module.ts", "anchor": "CustomersService", "export": true }

A caller's constructor gets `private readonly <field>: <Service>,` after the old
field's line; the module lists every new service right after `anchor` in
`providers` (and `exports` when asked). Refuses when a call it should move is
not found, so a typo never silently leaves a call on the old class.
"""
import json, re, sys, os

plan = json.load(open(sys.argv[1]))
d = plan['dir']
svcs = plan['services']

def add_import(s, cls, file):
    line = f"import {{ {cls} }} from './{file}';"
    if line in s:
        return s
    imports = list(re.finditer(r"^(?:import [^;]*?;|\} from '[^']+';)\n", s, re.M))
    at = imports[-1].end() if imports else 0
    return s[:at] + line + '\n' + s[at:]

for caller in plan.get('callers', []):
    p = os.path.join(d, caller['file'])
    s = open(p).read()
    used = []
    for cls, v in svcs.items():
        hit = 0
        for m in v['methods']:
            s, n = re.subn(rf"this\.{caller['field']}\.{m}\(", f"this.{v['field']}.{m}(", s)
            hit += n
        if hit:
            used.append(cls)
    if not used and caller.get('required', True):
        sys.exit(f"{p}: no call moved")
    # a one-line constructor becomes one parameter per line first
    one = re.search(rf"constructor\((private|protected) readonly {caller['field']}: (\w+)\) \{{", s)
    if one:
        s = s.replace(one.group(0), f"constructor(\n    {one.group(1)} readonly {caller['field']}: {one.group(2)},\n  ) {{", 1)
    # Type references to a moved method (`Parameters<Old['m']>`, `ReturnType<…>`) follow it too.
    if plan.get('oldClass'):
        for cls, v in svcs.items():
            for m in v['methods']:
                n0 = len(s)
                s = re.sub(rf"\b{plan['oldClass']}\['{m}'\]", f"{cls}['{m}']", s)
                if len(s) != n0 or re.search(rf"\b{cls}\['{m}'\]", s):
                    if cls not in used:
                        used.append(cls)
    for cls in used:
        v = svcs[cls]
        s = add_import(s, cls, v['file'])
        decl = re.search(rf"^(\s*)(?:private|protected) readonly {caller['field']}: [^,\n]+,?\n", s, re.M)
        if not decl:
            sys.exit(f"{p}: constructor field {caller['field']} not found")
        ind = decl.group(1)
        if re.search(rf"(?:private|protected) readonly {v['field']}: {cls}\b", s):
            continue  # injected by an earlier pass
        if re.search(rf"^\s+(?:async\s+)?{v['field']}\(", s, re.M):
            sys.exit(f"{p}: field {v['field']} would collide with a method of the same name — pick another")
        text = decl.group(0) if decl.group(0).rstrip().endswith(',') else decl.group(0).rstrip('\n') + ',\n'
        s = s.replace(decl.group(0), text + f"{ind}private readonly {v['field']}: {cls},\n", 1)
        # a one-line constructor `constructor(private readonly x: X) {}`
    # The old field, if nothing reads it any more, is REPLACED (same constructor length).
    if used and not re.search(rf"this\.{caller['field']}\b", s):
        decl = re.search(rf"^\s*(?:private|protected) readonly {caller['field']}: (\w+),?\n", s, re.M)
        if decl:
            s = s.replace(decl.group(0), '', 1)
            imp = re.search(rf"^import \{{ {decl.group(1)} \}} from '[^']+';\n", s, re.M)
            if imp and not re.search(rf"\b{decl.group(1)}\b", s.replace(imp.group(0), '')):
                s = s.replace(imp.group(0), '', 1)
            print(f"{p}: {caller['field']} replaced (no longer read)")
    open(p, 'w').write(s)
    print(f"{p}: {', '.join(used)}")

if plan.get('module'):
    p = os.path.join(d, plan['module'])
    s = open(p).read()
    for cls, v in svcs.items():
        s = add_import(s, cls, v['file'])
    names = list(svcs)
    anchor = plan['anchor']
    def insert_after_anchor(s, region_re):
        """Add the new names on their own lines right after the anchor, inside the first region that holds it.
        Never re-splits the list — a comment with a comma in it stays one comment."""
        for m in re.finditer(region_re, s):
            body = m.group(0)
            if not re.search(rf"\b{anchor}\b", body):
                continue
            missing = [n for n in names if not re.search(rf"\b{n}\b", body)]
            if not missing:
                return s, True
            line = re.search(rf"^(\s*)(?:\.\.\.)?{anchor},?[^\n]*$", body, re.M)
            if line:  # the anchor on a line of its own
                ind = line.group(1)
                text = line.group(0) if line.group(0).rstrip().endswith(',') else line.group(0).rstrip() + ','
                new_body = body.replace(line.group(0), text + ''.join(f"\n{ind}{n}," for n in missing), 1)
            else:     # a one-line list: `[A, B]` — one name per line once it would pass 120 characters
                new_body = re.sub(rf"\b{anchor}\b", anchor + ''.join(f", {n}" for n in missing), body, count=1)
                inner = re.search(r"\[([^\]\n]*)\]", new_body)
                if inner and len(new_body) > 100:
                    items = [x.strip() for x in inner.group(1).split(',') if x.strip()]
                    new_body = new_body.replace(inner.group(0), '[\n' + ''.join(f'    {x},\n' for x in items) + '  ]', 1)
            return s.replace(body, new_body, 1), True
        return s, False
    s, done = insert_after_anchor(s, r"const \w+ = \[[^\]]*\]")
    if not done:
        s, done = insert_after_anchor(s, r"providers: \[[^\]]*\]")
    if not done:
        sys.exit(f"{p}: {anchor} not found in a provider list")
    if plan.get('export'):
        s, _ = insert_after_anchor(s, r"exports: \[[^\]]*\]")
    open(p, 'w').write(s)
    print(f"{p}: registered {len(names)}")
