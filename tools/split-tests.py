#!/usr/bin/env python3
"""
After a class split: one test fixture that combines the new services, and the
usual test shapes repointed at it.

  python3 tools/split-tests.py <wire.json> <OldClass> <old file stem> <fixture fn> <spec files…>

Writes `<dir>/__tests__/<stem>.fixture.ts` exporting `<fixture fn>(...ctorArgs)`
(every service built with the same constructor arguments, combined by
`combinedServices`) and type `<OldClass>Parts`. In each spec:
  - `import { OldClass } from '<..>/<stem>'`   → the fixture import (kept when still used)
  - `new OldClass(args)`                         → `fixture(args)`
  - Test.createTestingModule({ providers: [OldClass, { provide: PrismaService, useValue: X }] })
        .compile(); svc = mod.get(OldClass);     → `svc = fixture(X);`
  - `: OldClass` / `<OldClass>`                  → the combined type
`Object.create(OldClass.prototype)` is left alone (it reads one class) — reported.
"""
import json, os, re, sys

args = sys.argv[1:]
lst = None
if '--list' in args:  # --list NAME:file-stem — a provider list the module and tests share
    i = args.index('--list'); lst = args[i + 1].split(':'); del args[i:i + 2]
wire_path, old, stem, fn, *specs = args
wire = json.load(open(wire_path))
d = wire['dir']
classes = [old] + list(wire['services'])
files = {old: stem, **{c: v['file'] for c, v in wire['services'].items()}}
typ = f'{old}Parts'

def ctor_params(path):
    """Constructor parameter names, in order (a trimmed constructor keeps a subset of the original's)."""
    src = open(path).read()
    m = re.search(r"constructor\(([\s\S]*?)\)\s*\{", src)
    if not m:
        return []
    return re.findall(r"(?:private|protected|public)?\s*readonly\s+(\w+)\??:", m.group(1)) or re.findall(r"(\w+)\??:", m.group(1))

orig_params = ctor_params(os.path.join(d, files[old] + '.ts'))
def pick(c):
    """This class's constructor arguments, taken BY NAME from the original constructor's order."""
    mine = ctor_params(os.path.join(d, files[c] + '.ts'))
    if not mine or mine == orig_params[:len(mine)]:
        return '...args'
    return ', '.join(f'args[{orig_params.index(n)}]' if n in orig_params else 'undefined' for n in mine)

def var(c):
    return c[0].lower() + c[1:]
wired = []  # (class, field, injected class) for property injection between the parts
for c in classes:
    for dep, field in re.findall(r"@Inject\((\w+)\) (?:private |protected )?readonly (\w+)!", open(os.path.join(d, files[c] + '.ts')).read()):
        if dep in classes:
            wired.append((c, field, dep))
fixture = os.path.join(d, '__tests__', f'{stem}.fixture.ts')
depth = d.split('/src/', 1)[1].count('/') + 2  # __tests__ → src
common = '../' * depth + 'common/testing/combined-services'
lines = [f"import {{ combinedServices }} from '{common}';"]
lines += [f"import {{ {c} }} from '../{files[c]}';" for c in classes]
lines += ['',
          '/** The public face of a class (an intersection of classes with private members is `never`). */',
          'type Public<T> = { [K in keyof T]: T[K] };', '',
          f'/** Every service split out of {old}, as ONE object — the tests were written against the single class. */',
          f'export type {typ} = ' + ' & '.join(f'Public<{c}>' for c in classes) + ';', '',
          f'export function {fn}(...args: unknown[]): {typ} {{',
          *[f'  const {var(c)} = new ({c} as unknown as new (...a: unknown[]) => object)({pick(c)}) as any;' for c in classes],
          *[f'  {var(c)}.{field} = {var(dep)}; // @Inject({dep}) property — Nest fills it, a test must' for c, field, dep in wired],
          f'  return combinedServices<{typ}>(' + ', '.join(var(c) for c in classes) + ');', '}', '',
          '/** The same, from a Nest test module that registered them all. */',
          f'export function {fn}Of(mod: {{ get<T>(cls: new (...a: never[]) => T): T }}): {typ} {{',
          '  // Only the services this test module registered — a test that provides one of them still works.',
          '  const parts = [' + ', '.join(classes) + '].flatMap((C) => {',
          '    try { return [mod.get(C as unknown as new (...a: never[]) => object)]; } catch { return []; }',
          '  });',
          f'  return combinedServices<{typ}>(...parts);', '}', '']
os.makedirs(os.path.dirname(fixture), exist_ok=True)
open(fixture, 'w').write('\n'.join(lines))
print('fixture', fixture)

for spec in specs:
    s = open(spec).read()
    rel = os.path.relpath(fixture, os.path.dirname(spec))[:-3]
    if not rel.startswith('.'):
        rel = './' + rel
    s = re.sub(rf"Test\.createTestingModule\(\{{\s*providers: \[{old}, \{{ provide: PrismaService, useValue: (\w+) \}}\],?\s*\}}\)\.compile\(\);\n(\s*)(\w+) = \w+\.get\({old}\);",
               lambda m: f"null;\n{m.group(2)}{m.group(3)} = {fn}({m.group(1)});", s)
    s = re.sub(r"(?:const|let) \w+(?:: TestingModule)? = await null;\n\s*", '', s)
    if lst:
        s = re.sub(r'providers:\s*\[[\s\S]*?\]\s*[,}]',
                   lambda m: re.sub(rf'(?<![\w.]){old}(?=\s*[,\]])', f'...{lst[0]}', m.group(0)), s)
    # A test module that registers the old class by name registers the new ones beside it.
    if re.search(rf"\b\w+\.get(?:<{old}>)?\({old}\)", s):
        def add_providers(m):
            body = m.group(0)
            if not re.search(rf"(?<![\w.]){old}(?=\s*[,\]])", body):
                return body
            extra = [c for c in classes[1:] if not re.search(rf"\b{c}\b", body)]
            line = re.search(rf"^(\s*){old},\s*$", body, re.M)
            if line and extra:
                body = body.replace(line.group(0), line.group(0) + ''.join(f"\n{line.group(1)}{c}," for c in extra), 1)
            return body
        s = re.sub(r'providers:\s*\[[\s\S]*?\]\s*[,}]', add_providers, s)
        for c in classes[1:]:
            imp = f"import {{ {c} }} from '{os.path.relpath(os.path.join(d, files[c]), os.path.dirname(spec))}';\n"
            imp = imp.replace("from '", "from './", 1) if not imp.split("from '")[1].startswith('.') else imp
            if re.search(rf"^\s*{c},$", s, re.M) and imp not in s:
                s = imp + s
    s = re.sub(rf"\b(\w+)\.get(?:<{old}>)?\({old}\)", rf"{fn}Of(\1)", s)
    s = re.sub(rf"Object\.create\({old}\.prototype\)", f"{fn}()", s)
    s = re.sub(rf"\bnew {old}\(", f"{fn}(", s)
    s = re.sub(rf"(?<!provide)(?<!provide )(:\s*){old}\b(?!\.)", rf"\1{typ}", s)  # a type, never `provide: X`
    s = re.sub(rf"<{old}>", f"<{typ}>", s)
    imp = re.search(rf"^import \{{ {old} \}} from '[^']*{re.escape(stem)}';\n", s, re.M)
    used = [n for n in (fn, f'{fn}Of', typ) if re.search(rf'\b{n}\b', s)]
    new_imp = f"import {{ {', '.join(('type ' + n) if n == typ else n for n in used)} }} from '{rel}';\n"
    if lst and f'...{lst[0]}' in s and f"from './{lst[1]}'" not in s and f"from '../{lst[1]}'" not in s:
        new_imp += f"import {{ {lst[0]} }} from '../{lst[1]}';\n"
    if imp:
        still = re.search(rf"\b{old}\b", s.replace(imp.group(0), ''))
        s = s.replace(imp.group(0), (imp.group(0) if still else '') + new_imp, 1)
    elif new_imp not in s:
        s = new_imp + s
    open(spec, 'w').write(s)
    left = re.findall(rf"\b{old}\b[^\n]*", s)
    print(spec, '— still names', old, ':', len(left)) if left else print(spec)
