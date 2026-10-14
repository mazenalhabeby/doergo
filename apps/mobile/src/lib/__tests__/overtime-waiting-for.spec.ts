import { waitingText } from '../../components/time/time-logic';

/* The extra-time line names who it waits for — one line, not two. */
const t = (k: string, o?: Record<string, unknown>) => `${k}${o ? ' ' + JSON.stringify(o) : ''}`;

describe('waiting for whom', () => {
  it('names the one person asked', () => {
    expect(waitingText({ askedOf: { names: ['Anna'], more: 0 } }, t)).toBe('overtime.waitingFor {"name":"Anna"}');
  });
  it('several administrators: the first, and how many others', () => {
    expect(waitingText({ askedOf: { names: ['Anna', 'John'], more: 2 } }, t)).toBe('overtime.waitingForOthers {"name":"Anna","count":3}');
  });
  it('an older server sends no names: the line it always said', () => {
    expect(waitingText({}, t)).toBe('overtime.waitingApproval');
    expect(waitingText({ askedOf: { names: [], more: 0 } }, t)).toBe('overtime.waitingApproval');
  });
});
