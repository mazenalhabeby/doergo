import { Test } from '@nestjs/testing';
import {
  SERVICE_NAMES,
  scoreTemplateBinding,
  audienceFor,
  resolveAudiences,
} from '@hbcfield/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MrzOcrService } from '../mrz-ocr.service';
import { DocumentsService } from '../documents.service';
import { OBJECT_STORE } from '../object-store.provider';

/**
 * Which contract a person gets — asked twice, and the two answers have to agree.
 *
 * The admin screen answers it in the browser, from the member list, before
 * anything is saved ("this reaches 4 people: Lisa, Karim…"). The server answers
 * it again months later, when somebody accepts an invitation. If those two ever
 * disagree, the screen is a lie in the one place an administrator is relying on
 * it — so the arithmetic lives in `scoreTemplateBinding`, and this file exists
 * to prove both callers reach it.
 */

const TECH = 'role-tech';
const MGR = 'role-mgr';

const tpl = (id: string, roleId: string | null, position: string | null) => ({
  id,
  appliesToRoleId: roleId,
  appliesToPosition: position,
});

const person = (memberRoleId: string | null, position: string | null) => ({
  memberRoleId,
  position,
});

describe('scoreTemplateBinding', () => {
  it('scores an unbound template as the organization default', () => {
    expect(scoreTemplateBinding(tpl('t', null, null), person(TECH, 'Electrician'))).toBe(0);
  });

  it('scores role, then job title, then both', () => {
    expect(scoreTemplateBinding(tpl('t', TECH, null), person(TECH, 'Electrician'))).toBe(2);
    expect(scoreTemplateBinding(tpl('t', null, 'Electrician'), person(TECH, 'Electrician'))).toBe(1);
    expect(scoreTemplateBinding(tpl('t', TECH, 'Electrician'), person(TECH, 'Electrician'))).toBe(3);
  });

  it('excludes — never falls back — when a named binding does not match', () => {
    // The distinction the whole feature rests on: a Manager contract is not a
    // worse-fitting contract for a technician, it is somebody else's contract.
    expect(scoreTemplateBinding(tpl('t', MGR, null), person(TECH, 'Electrician'))).toBe(-1);
    expect(scoreTemplateBinding(tpl('t', null, 'Plumber'), person(TECH, 'Electrician'))).toBe(-1);
  });

  it('matches a job title regardless of case and padding', () => {
    // Positions are typed by hand, in two places, months apart.
    expect(scoreTemplateBinding(tpl('t', null, '  electrician '), person(TECH, 'Electrician'))).toBe(1);
  });

  it('does not treat a missing job title as a match for a template that names one', () => {
    expect(scoreTemplateBinding(tpl('t', null, 'Electrician'), person(TECH, null))).toBe(-1);
    expect(scoreTemplateBinding(tpl('t', null, 'Electrician'), person(TECH, '   '))).toBe(-1);
  });
});

describe('resolveAudiences', () => {
  const members = [
    { id: 'a', memberRoleId: TECH, position: 'Electrician' },
    { id: 'b', memberRoleId: TECH, position: 'Plumber' },
    { id: 'c', memberRoleId: MGR, position: 'Operations Manager' },
    { id: 'd', memberRoleId: null, position: null },
  ];

  it('gives each person exactly one template', () => {
    const out = resolveAudiences(members, [tpl('default', null, null), tpl('tech', TECH, null)]);
    const assigned = [...out.values()].flat().map((m) => m.id);
    expect(assigned.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does NOT let the default claim people a sharper template covers', () => {
    /*
      The bug this exists to prevent. Counting eligibility, the default reads
      "reaches 4 people" — on the day it reaches the two nobody else claims.
    */
    const out = resolveAudiences(members, [tpl('default', null, null), tpl('tech', TECH, null)]);
    expect(out.get('tech')!.map((m) => m.id)).toEqual(['a', 'b']);
    expect(out.get('default')!.map((m) => m.id)).toEqual(['c', 'd']);
  });

  it('prefers the sharpest binding of several', () => {
    const out = resolveAudiences(members, [
      tpl('default', null, null),
      tpl('tech', TECH, null),
      tpl('tech-electrician', TECH, 'Electrician'),
    ]);
    expect(out.get('tech-electrician')!.map((m) => m.id)).toEqual(['a']);
    expect(out.get('tech')!.map((m) => m.id)).toEqual(['b']);
  });

  it('leaves people unassigned when nothing fits, rather than guessing', () => {
    const out = resolveAudiences(members, [tpl('mgr', MGR, null)]);
    expect(out.get('mgr')!.map((m) => m.id)).toEqual(['c']);
    expect([...out.values()].flat()).toHaveLength(1);
  });

  it('gives a tie to the earlier template, as the server reads them', () => {
    const out = resolveAudiences(members, [tpl('first', TECH, null), tpl('second', TECH, null)]);
    expect(out.get('first')).toHaveLength(2);
    expect(out.get('second')).toHaveLength(0);
  });

  it('returns an entry for every template, including the ones nobody matches', () => {
    // The screen renders a row per template; a missing key would render blank
    // rather than the "reaches nobody" warning that is the point of the row.
    const out = resolveAudiences([], [tpl('a', null, null), tpl('b', MGR, null)]);
    expect([...out.keys()].sort()).toEqual(['a', 'b']);
  });
});

describe('audienceFor', () => {
  it('is eligibility, not assignment — everyone the binding admits', () => {
    const members = [person(TECH, 'Electrician'), person(MGR, 'Ops')];
    expect(audienceFor(members, tpl('t', null, null))).toHaveLength(2);
    expect(audienceFor(members, tpl('t', TECH, null))).toHaveLength(1);
  });
});

describe('the server resolves the same way the screen predicts', () => {
  let service: DocumentsService;

  const prisma: Record<string, any> = {
    documentTemplate: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        DocumentsService,
        // Stubbed: every test here is about who may file what, not about
        // reading pixels — and a real WASM engine per suite would add minutes.
        { provide: MrzOcrService, useValue: { read: jest.fn().mockResolvedValue(null) } },
        { provide: PrismaService, useValue: prisma },
        { provide: OBJECT_STORE, useValue: {} },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = mod.get(DocumentsService);
  });

  const TEMPLATES = [
    { ...tpl('default', null, null), type: { id: 'ty', label: 'Contract', retentionMonths: 84 } },
    { ...tpl('tech', TECH, null), type: { id: 'ty', label: 'Contract', retentionMonths: 84 } },
    { ...tpl('tech-electrician', TECH, 'Electrician'), type: { id: 'ty', label: 'Contract', retentionMonths: 84 } },
    { ...tpl('mgr', MGR, null), type: { id: 'ty', label: 'Contract', retentionMonths: 84 } },
  ];

  const PEOPLE = [
    { id: 'a', memberRoleId: TECH, position: 'Electrician' },
    { id: 'b', memberRoleId: TECH, position: 'Plumber' },
    { id: 'c', memberRoleId: MGR, position: 'Operations Manager' },
    { id: 'd', memberRoleId: null, position: null },
    { id: 'e', memberRoleId: TECH, position: '  ELECTRICIAN  ' },
  ];

  it('agrees with resolveAudiences for every member', async () => {
    prisma.documentTemplate.findMany.mockResolvedValue(TEMPLATES);
    const predicted = resolveAudiences(PEOPLE, TEMPLATES);

    for (const p of PEOPLE) {
      const actual = await service.resolveTemplate({
        organizationId: 'org1',
        roleId: p.memberRoleId,
        position: p.position,
      });
      const expected = [...predicted.entries()].find(([, ms]) => ms.some((m) => m.id === p.id))?.[0];
      expect({ who: p.id, template: actual?.id ?? null }).toEqual({ who: p.id, template: expected ?? null });
    }
  });

  it('returns nothing when every template belongs to somebody else', async () => {
    prisma.documentTemplate.findMany.mockResolvedValue([TEMPLATES[3]]);
    await expect(
      service.resolveTemplate({ organizationId: 'org1', roleId: TECH, position: 'Electrician' }),
    ).resolves.toBeNull();
  });
});
