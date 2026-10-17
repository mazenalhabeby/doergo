/**
 * A job row redraws only when what it shows changed.
 *
 * `memo(JobRow)` compared `who` and `right` by reference, and the list builds
 * both afresh for every row on every render — so a keystroke in search redrew
 * every visible row. The comparator reads them by value.
 */
import fs from 'fs';
import path from 'path';
import { rowRight, type RowRight, type RowWho, rowWho, sameJobRowProps, sameRowRight, sameRowWho , type JobFacts } from '../../components/jobs-list/jobs-logic';
import { readSource } from '../../test-utils/read-source';

const facts: JobFacts = { mine: false, closed: false, canceled: false, underWay: false };
const now = new Date('2026-10-10T08:00:00');

describe('row facts by value', () => {
  it('two builds of the same right-hand fact are the same', () => {
    const task = { dueDate: '2026-10-12T13:00:00.000Z' };
    expect(rowRight(task, facts, now)).not.toBe(rowRight(task, facts, now));
    expect(sameRowRight(rowRight(task, facts, now), rowRight(task, facts, now))).toBe(true);
  });
  it('a different day, lateness or kind is a change', () => {
    expect(sameRowRight({ kind: 'due', at: 'a' }, { kind: 'due', at: 'b' })).toBe(false);
    expect(sameRowRight({ kind: 'late', days: 1 }, { kind: 'late', days: 2 })).toBe(false);
    expect(sameRowRight({ kind: 'done' }, { kind: 'none' })).toBe(false);
    expect(sameRowRight({ kind: 'pending' }, { kind: 'pending' })).toBe(true);
  });
  it('who has it, by value', () => {
    const task = { assignedToId: 'k', assignedTo: { firstName: 'Karim' }, assignees: [{ userId: 'k' }] };
    const v = { oversee: true, everyone: true };
    expect(sameRowWho(rowWho(task, facts, v), rowWho(task, facts, v))).toBe(true);
    expect(sameRowWho({ kind: 'name', name: 'Karim' }, { kind: 'name', name: 'Lisa' })).toBe(false);
    expect(sameRowWho(null, { kind: 'you' })).toBe(false);
    expect(sameRowWho(null, null)).toBe(true);
  });
});

describe('the row memo', () => {
  const onOpen = () => undefined;
  const base = () => ({ id: '1', title: 'Fix', urgent: false, band: 'today', mine: true, closed: false, who: null as RowWho, place: 'Laakirchen', right: { kind: 'due', at: 'x' } as RowRight, stepLabel: 'New', onOpen });
  it('holds across a re-render that rebuilt the objects', () => {
    expect(sameJobRowProps(base(), base())).toBe(true);
  });
  it('breaks on any shown change, and on a new callback', () => {
    expect(sameJobRowProps(base(), { ...base(), title: 'Fix it' })).toBe(false);
    expect(sameJobRowProps(base(), { ...base(), right: { kind: 'due', at: 'y' } as RowRight })).toBe(false);
    expect(sameJobRowProps(base(), { ...base(), onOpen: () => undefined })).toBe(false);
  });
  it('the list hands every row ONE callback, not an arrow per row', () => {
    const src = readSource(path.resolve(__dirname, '../../components/jobs-list/jobs-screen.tsx'), 'utf8');
    expect(src).toMatch(/onOpen=\{openById\}/);
    expect(src).not.toMatch(/<JobRow[\s\S]*?onPress=\{\(\) =>/);
    const row = readSource(path.resolve(__dirname, '../../components/jobs-list/job-row.tsx'), 'utf8');
    expect(row).toMatch(/\}, sameJobRowProps\);/);
  });
});
