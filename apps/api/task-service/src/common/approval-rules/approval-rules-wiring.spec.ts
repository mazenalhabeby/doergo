import fs from 'fs';
import path from 'path';

/*
  Office rules are only real if every approve path of their kinds asks the
  gate, and every refusal path drops the open step. A new path that skips it
  lets a rule be bypassed from that page — this fails first.
*/
const MODULES = path.join(__dirname, '..', '..', 'modules');
const read = (rel: string) => fs.readFileSync(path.join(MODULES, rel), 'utf8');

describe('office rules are asked on every approve path of their kinds', () => {
  const paths: Array<[string, string]> = [
    ['attendance/extra-time.service.ts', 'overtime'],
    ['technicians/technicians.service.ts', 'request'],
    ['assets/asset-expense.service.ts', 'expense'],
  ];
  for (const [file, kind] of paths) {
    it(`${file} gates and clears '${kind}'`, () => {
      const src = read(file);
      expect(src).toMatch(new RegExp(`rules\\.gate\\(\\{[\\s\\S]{0,200}kind: '${kind}'`));
      expect(src).toMatch(new RegExp(`rules\\?\\.clear\\([^)]*'${kind}'`));
      // A step-1 answer returns BEFORE anything is written.
      expect(src).toMatch(/if \(!verdict\.finalize\)[\s\S]{0,80}return success\(/);
    });
  }
});
