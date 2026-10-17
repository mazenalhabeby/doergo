#!/usr/bin/env node
/**
 * Split one class's methods across several classes — MOVE ONLY.
 *
 *   node tools/split-class.mjs <plan.json> [--write]
 *
 * plan.json:
 *   { "source": "…/locations.service.ts", "className": "LocationsService",
 *     "targets": { "SpaceRosterService": { "file": "space-roster.service.ts", "doc": "…" }, … },
 *     "members": { "getColleagues": "SpaceRosterService", … },        // unlisted members stay
 *     "helpersFile": "space-helpers.ts",                               // module-level code (not the class) goes here
 *     "inject": { "TimeOffRequestService": { "decisions": "TimeOffDecisionService" } },  // a call across classes
 *     "base": { "className": "SpaceServiceBase", "file": "space-service.base.ts", "doc": "…",
 *               "members": ["announce", …] } }                         // helpers several classes call: every class extends it
 *
 * Every target class gets the source's constructor verbatim (same injected
 * dependencies, so `new X(prisma, client)` in tests keeps working) and its
 * logger. Imports are recomputed per file from what each file uses. A moved
 * method that calls `this.<member>` living in ANOTHER class is reported and the
 * run refused — that call has to be wired by hand (inject, or a shared helper).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const [planPath, flag] = process.argv.slice(2);
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const src = readFileSync(plan.source, 'utf8');
const sf = ts.createSourceFile(plan.source, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const dir = dirname(plan.source);

const imports = [];
const topLevel = []; // non-class statements
const sourceReexports = []; // `export … from` lines: the source keeps them
let cls;
for (const st of sf.statements) {
  if (ts.isImportDeclaration(st)) {
    imports.push(st);
    continue;
  }
  if (ts.isClassDeclaration(st) && st.name?.text === plan.className) {
    cls = st;
    continue;
  }
  if (ts.isExportDeclaration(st)) {
    sourceReexports.push(src.slice(st.getStart(sf), st.getEnd()));
    continue;
  } // stays on the source
  topLevel.push(st);
}
if (!cls) throw new Error('class not found');

/** Where a statement really ends: a comment after it on the SAME line belongs to it, not to the next one. */
const lineEnd = (node) => {
  const rest = src.slice(
    node.getEnd(),
    src.indexOf('\n', node.getEnd()) === -1 ? src.length : src.indexOf('\n', node.getEnd()),
  );
  return /^\s*(\/\/.*|\/\*.*\*\/\s*)$/.test(rest) ? node.getEnd() + rest.length : node.getEnd();
};
/** A statement's text with its leading comments, minus a same-line comment that belongs to the one before. */
const fullText = (node) => {
  let start = node.getFullStart();
  const prevLineEnd = src.lastIndexOf('\n', start - 1);
  const head = src.slice(start, src.indexOf('\n', start) === -1 ? src.length : src.indexOf('\n', start));
  if (start > 0 && src[start - 1] !== '\n' && /^\s*(\/\/.*|\/\*.*\*\/\s*)$/.test(head)) start += head.length;
  void prevLineEnd;
  return src.slice(start, lineEnd(node));
};

const idsIn = (node) => {
  const s = new Set();
  const v = (n) => {
    if (ts.isIdentifier(n)) s.add(n.text);
    ts.forEachChild(n, v);
  };
  v(node);
  return s;
};
const thisCalls = (node) => {
  const s = new Set();
  const v = (n) => {
    if (ts.isPropertyAccessExpression(n) && n.expression.kind === ts.SyntaxKind.ThisKeyword) s.add(n.name.text);
    ts.forEachChild(n, v);
  };
  v(node);
  return s;
};

const memberName = (m) => (m.name ? m.name.getText(sf) : ts.isConstructorDeclaration(m) ? 'constructor' : '?');
const members = cls.members.map((m) => ({ m, name: memberName(m), text: fullText(m) }));
const owner = (name) => plan.members[name] ?? plan.className;
const ctor = members.find((x) => x.name === 'constructor');
const baseMembers = new Set(plan.base?.members ?? []);
const ctorParams = ctor ? ctor.m.parameters.map((p) => p.name.getText(sf)) : [];
const shared = new Set(['constructor', 'logger', ...ctorParams, ...baseMembers]);

// A static member nobody mapped goes with the one target whose methods read `Source.name`.
for (const x of members) {
  const isStatic = x.m.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword);
  if (!isStatic || plan.members[x.name]) continue;
  const readers = new Set(
    members.filter((y) => y !== x && y.text.includes(`${plan.className}.${x.name}`)).map((y) => owner(y.name)),
  );
  if (readers.size === 1) plan.members[x.name] = [...readers][0];
}
const staticMoves = members.filter(
  (x) => x.m.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) && owner(x.name) !== plan.className,
);

// group
const groups = new Map([[plan.className, []], ...Object.keys(plan.targets).map((k) => [k, []])]);
for (const x of members) {
  if (x.name === 'constructor' || x.name === 'logger' || baseMembers.has(x.name)) continue;
  if (!groups.has(owner(x.name))) throw new Error(`no target ${owner(x.name)}`);
  groups.get(owner(x.name)).push(x);
}

// cross-class calls
const problems = [];
// A call to a method the source does not declare is INHERITED (its own parent) — every new class has it too.
const declared = new Set(members.map((x) => x.name));
const sourceHeritage = cls.heritageClauses?.length ? ' ' + cls.heritageClauses.map((h) => h.getText(sf)).join(' ') : '';
const injected = (g) => Object.entries(plan.inject?.[g] ?? {});
const viaInject = (g, c) => injected(g).find(([, cls]) => owner(c) === cls)?.[0];
for (const [g, xs] of groups)
  for (const x of xs)
    for (const c of thisCalls(x.m)) {
      if (shared.has(c) || !declared.has(c)) continue;
      if (owner(c) !== g && !viaInject(g, c)) problems.push(`${g}.${x.name} calls this.${c} (in ${owner(c)})`);
    }
if (problems.length) {
  console.error('Cross-class calls to wire by hand:\n  ' + problems.join('\n  '));
  process.exit(1);
}

// helpers module: the top-level code, exported
const helperNames = topLevel.flatMap((st) =>
  ts.isVariableStatement(st)
    ? st.declarationList.declarations.map((d) => d.name.getText(sf))
    : st.name
      ? [st.name.text]
      : [],
);
const importText = (st) => src.slice(st.getStart(sf), st.getEnd());
const importsUsed = (ids) =>
  imports
    .map((st) => {
      const nb = st.importClause?.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) return ids.has(nb.name.text) ? importText(st) : null;
      if (!nb || !ts.isNamedImports(nb)) return ids.has(st.importClause?.name?.text) ? importText(st) : null;
      const keep = nb.elements.filter((el) => ids.has(el.name.text));
      const def = st.importClause?.name && ids.has(st.importClause.name.text) ? st.importClause.name.text : null;
      if (!keep.length && !def) return null;
      const spec = st.moduleSpecifier.getText(sf);
      const typeOnly = st.importClause.isTypeOnly ? 'type ' : '';
      if (!keep.length) return `import ${def} from ${spec};`;
      const head = def ? `${def}, ` : '';
      const list = keep.map((el) => el.getText(sf));
      const one = `import ${typeOnly}${head}{ ${list.join(', ')} } from ${spec};`;
      return one.length <= 120 ? one : `import ${typeOnly}${head}{\n  ${list.join(',\n  ')},\n} from ${spec};`;
    })
    .filter(Boolean);

/** `import|export { a, b } from 'x'`, one per line past 120 characters. */
const named = (kw, names, from) => {
  const one = `${kw} { ${names.join(', ')} }${from ? ` from '${from}'` : ''};`;
  return one.length <= 120 ? one : `${kw} {\n  ${names.join(',\n  ')},\n}${from ? ` from '${from}'` : ''};`;
};
/** A doc comment, wrapped at 80 characters so a split never adds a long line. */
const docBlock = (text) => {
  if (text.length <= 100) return `/** ${text} */`;
  const lines = [];
  let cur = '';
  for (const w of text.split(' ')) {
    if ((cur + ' ' + w).trim().length > 80) {
      lines.push(cur.trim());
      cur = w;
    } else cur += ' ' + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return ['/**', ...lines.map((l) => ' * ' + l), ' */'].join('\n');
};
/** The constructor with only the parameters this class's members use (`trimCtor`). */
const trimmedCtor = (body) => {
  const keep = ctor.m.parameters.filter((p) => new RegExp(`this\\.${p.name.getText(sf)}\\b`).test(body));
  if (!keep.length) return ''; // nothing injected through the constructor
  return `\n  constructor(\n${keep.map((p) => '    ' + src.slice(p.getFullStart(), p.getEnd()).trim()).join(',\n')},\n  ) {}\n`;
};
const out = [];
if (topLevel.length) {
  const body = topLevel.map((st) => fullText(st).replace(/^\s*\n/, '')).join('\n\n');
  const ids = new Set(topLevel.flatMap((st) => [...idsIn(st)]));
  const exportedAlready = new Set(
    topLevel
      .filter((st) => st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
      .flatMap((st) =>
        ts.isVariableStatement(st)
          ? st.declarationList.declarations.map((d) => d.name.getText(sf))
          : st.name
            ? [st.name.text]
            : [],
      ),
  );
  const toExport = helperNames.filter((n) => !exportedAlready.has(n));
  out.push({
    file: join(dir, plan.helpersFile),
    text: [...importsUsed(ids), '', body, ...(toExport.length ? ['', named('export', toExport, '')] : []), ''].join(
      '\n',
    ),
  });
}
const loggerText = members.find((x) => x.name === 'logger')?.text ?? '';
// A controller split keeps the source's class decorators (@Controller('x'), @ApiTags…) on every part.
const classDecorators = (ts.getDecorators?.(cls) ?? []).map((d) => d.getText(sf)).join('\n');
// The source class's head as written: its comments and decorators, up to `export class`.
const exportKw = cls.modifiers?.find((m) => m.kind === ts.SyntaxKind.ExportKeyword);
const classHead = src
  .slice(cls.getFullStart(), exportKw ? exportKw.getStart(sf) : cls.getStart(sf))
  .replace(/^\s+/, '')
  .replace(/\s+$/, '');
// Comments above the class (not its decorators) — kept on the base, or on the source class.
const classLead = src.slice(cls.getFullStart(), cls.getStart(sf)).trim();
const baseXs = members.filter((x) => baseMembers.has(x.name));
if (plan.base) {
  const ids = new Set([...idsIn(ctor.m), ...baseXs.flatMap((x) => [...idsIn(x.m)]), 'Injectable', 'Logger']);
  const usedHelpers = helperNames.filter((h) => ids.has(h));
  const text = [
    ...importsUsed(ids),
    ...(usedHelpers.length ? [named('import', usedHelpers, `./${plan.helpersFile.replace(/\.ts$/, '')}`)] : []),
    '',
    docBlock(plan.base.doc),
    '@Injectable()',
    `export abstract class ${plan.base.className} {`,
    ...(members.some((x) => x.name === 'logger')
      ? ['  protected readonly logger = new Logger(this.constructor.name);']
      : []),
    ctor.text.replace(/^\s*\n/, '\n').replace(/private readonly/g, 'protected readonly'),
    baseXs
      .map((x) => {
        const at = x.m.getStart(sf) - x.m.getFullStart();
        let t = x.text.slice(0, at) + x.text.slice(at).replace(/^private /, 'protected ');
        for (const y of baseXs) {
          if (y.m.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword))
            t = t.split(`${plan.className}.${y.name}`).join(`${plan.base.className}.${y.name}`);
        }
        return t;
      })
      .join(''),
    '}',
    '',
  ].join('\n');
  // A controller source never imported Injectable, but its base carries @Injectable().
  const nest = text.match(/import \{([^}]*)\} from '@nestjs\/common';/);
  const withInjectable = /\bInjectable\b[^(]/.test(nest?.[1] ?? '') || /\{[^}]*\bInjectable\b[^}]*\} from '@nestjs\/common'/.test(text)
    ? text
    : nest
      ? text.replace(nest[0], `import { Injectable,${nest[1]}} from '@nestjs/common';`)
      : `import { Injectable } from '@nestjs/common';\n${text}`;
  out.push({ file: join(dir, plan.base.file), text: withInjectable });
}
for (const [g, xs] of groups) {
  const file = g === plan.className ? plan.source : join(dir, plan.targets[g].file);
  let bodyMembers = xs.map((x) => x.text).join('');
  for (const st of staticMoves)
    bodyMembers = bodyMembers.split(`${plan.className}.${st.name}`).join(`${owner(st.name)}.${st.name}`);
  // A static that moved to the BASE is read through the base's name.
  for (const x of baseXs) {
    if (x.m.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword)) {
      bodyMembers = bodyMembers.split(`${plan.className}.${x.name}`).join(`${plan.base.className}.${x.name}`);
    }
  }
  let ownCtor = '';
  if (injected(g).length) {
    for (const x of xs)
      for (const c of thisCalls(x.m)) {
        const via = viaInject(g, c);
        if (via && owner(c) !== g)
          bodyMembers = bodyMembers.replace(new RegExp(`this\\.${c}\\(`, 'g'), `this.${via}.${c}(`);
      }
    // A PROPERTY, never an extra constructor parameter: Nest's @Inject/@Optional
    // markers are inherited from the base by index, and a subclass constructor
    // with one more parameter shifts them onto the wrong dependency.
    ownCtor = injected(g)
      .map(([n, cls]) => `\n  @Inject(${cls}) private readonly ${n}!: ${cls};\n`)
      .join('');
  }
  const decoIds = plan.controller ? (ts.getDecorators?.(cls) ?? []).flatMap((d) => [...idsIn(d)]) : ['Injectable'];
  const ctorIds =
    plan.trimCtor && g !== plan.className
      ? ctor.m.parameters
          .filter((p) => xs.some((x) => x.text.includes(`this.${p.name.getText(sf)}`)))
          .flatMap((p) => [...idsIn(p)])
      : [...idsIn(ctor.m)];
  const ids = new Set([
    ...(plan.base ? [] : ctorIds),
    ...(injected(g).length ? ['Inject'] : []),
    ...xs.flatMap((x) => [...idsIn(x.m)]),
    ...decoIds,
    ...(plan.base ? [] : ['Logger', ...(cls.heritageClauses ?? []).flatMap((h) => [...idsIn(h)])]),
  ]);
  const usedHelpers = helperNames.filter((h) => ids.has(h));
  const doc = g === plan.className ? '' : docBlock(plan.targets[g].doc) + '\n';
  const text = [
    ...importsUsed(ids),
    ...(usedHelpers.length ? [named('import', usedHelpers, `./${plan.helpersFile.replace(/\.ts$/, '')}`)] : []),
    ...(plan.base ? [`import { ${plan.base.className} } from './${plan.base.file.replace(/\.ts$/, '')}';`] : []),
    ...injected(g).map(
      ([, cls]) =>
        `import { ${cls} } from './${(cls === plan.className ? basename(plan.source) : plan.targets[cls].file).replace(/\.ts$/, '')}';`,
    ),
    '',
    g === plan.className
      ? classHead // the source class keeps its own head VERBATIM — comments between decorators included
      : `${doc}${plan.controller ? classDecorators : '@Injectable()'}`,
    `export ${g === plan.className && cls.modifiers?.some((m) => m.kind === ts.SyntaxKind.AbstractKeyword) ? 'abstract ' : ''}class ${g}${plan.base ? ` extends ${plan.base.className}` : sourceHeritage} {`,
    ...(ownCtor ? [ownCtor] : []),
    ...(plan.base
      ? []
      : [
          loggerText.replace(new RegExp(`\\b${plan.className}\\b`, 'g'), g).replace(/^\s*\n/, ''),
          // The source class keeps its constructor VERBATIM (its body may initialise state); only new classes are trimmed.
          plan.trimCtor && g !== plan.className
            ? trimmedCtor(bodyMembers)
            : ctor.text
                .replace(/^\s*\n/, '\n')
                .split(`${plan.className}.name`)
                .join(`${g}.name`),
        ]),
    bodyMembers.replace(/^\n+/, '\n'),
    '}',
    '',
  ].join('\n');
  // Property injection needs `Inject` from @nestjs/common even when the source never imported it.
  let finalText = text;
  if (ownCtor && !/\bInject\b[^\n]*from '@nestjs\/common'/.test(text.split('\n@')[0])) {
    const nest = finalText.match(/import \{([^}]*)\} from '@nestjs\/common';/);
    finalText = nest
      ? finalText.replace(nest[0], `import { Inject,${nest[1]}} from '@nestjs/common';`)
      : `import { Inject } from '@nestjs/common';\n${finalText}`;
  }
  out.push({ file, text: finalText });
}
// `export … from` lines stay on the source, as written.
{
  const main = out.find((o) => o.file === plan.source);
  if (main && sourceReexports.length) {
    main.text = main.text.replace(
      /\n((?:\/\*\*(?:(?!\*\/)[\s\S])*\*\/\n)?(?:@\w+\([^\n]*\)\n)+export (?:abstract )?class )/,
      (m, block) => `\n${sourceReexports.join('\n')}\n\n${block}`,
    );
  }
}
// The source keeps exporting what it exported before (types and constants moved to the helpers).
if (topLevel.length) {
  const publicHelpers = topLevel
    .filter((st) => st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
    .flatMap((st) => {
      const names = ts.isVariableStatement(st)
        ? st.declarationList.declarations.map((d) => d.name.getText(sf))
        : st.name
          ? [st.name.text]
          : [];
      const typeOnly = ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st);
      return names.map((n) => (typeOnly ? 'type ' : '') + n);
    });
  const main = out.find((o) => o.file === plan.source);
  if (publicHelpers.length && main) {
    const line = named('export', publicHelpers, `./${plan.helpersFile.replace(/\.ts$/, '')}`);
    // Before the class's whole decorator block (and its doc comment), never between two decorators.
    main.text = main.text.replace(
      /\n((?:\/\*\*(?:(?!\*\/)[\s\S])*\*\/\n)?(?:@\w+\([^\n]*\)\n)+export (?:abstract )?class )/,
      (m, block) => `\n${line}\n\n${block}`,
    );
  }
}
for (const o of out) console.log(`${o.file}: ${o.text.split('\n').length} lines`);
if (flag === '--write') for (const o of out) writeFileSync(o.file, o.text);
