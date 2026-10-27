import { durationInRange, durationMinutes, durationText, readDurationPart, minutesText } from '../approval-duration';

describe('approval duration — hours + minutes', () => {
  it('reads decimal hours with a comma or a dot', () => {
    expect(durationMinutes({ h: '1,5', m: '' })).toBe(90);
    expect(durationMinutes({ h: '1.5', m: '' })).toBe(90);
    expect(durationMinutes({ h: '2', m: '15' })).toBe(135);
    expect(durationMinutes({ h: '', m: '45' })).toBe(45);
  });

  it('empty is nothing, unreadable is null', () => {
    expect(durationMinutes({ h: '', m: '' })).toBe(0);
    expect(durationMinutes({ h: 'abc', m: '' })).toBeNull();
    expect(durationMinutes({ h: '-1', m: '' })).toBeNull();
    expect(durationMinutes({ h: '1,2,3', m: '' })).toBeNull();
    expect(readDurationPart('1.000')).toBeNull();
    expect(readDurationPart(' 3 ')).toBe(3);
  });

  it('sends only 1 min – 24 h', () => {
    expect(durationInRange(0)).toBe(false);
    expect(durationInRange(null)).toBe(false);
    expect(durationInRange(1)).toBe(true);
    expect(durationInRange(1440)).toBe(true);
    expect(durationInRange(1441)).toBe(false);
    expect(durationInRange(durationMinutes({ h: '25', m: '' }))).toBe(false);
  });

  it('shows whole minutes as hours + minutes', () => {
    expect(durationText(90)).toEqual({ h: '1', m: '30' });
    expect(durationText(120)).toEqual({ h: '2', m: '' });
    expect(durationText(30)).toEqual({ h: '', m: '30' });
    expect(durationText(0)).toEqual({ h: '', m: '' });
  });

  it('says a duration in the reader’s words — hours + minutes, never “1h 30m”', () => {
    const de = (k: string) => (k === 'approvals.unitHours' ? 'Std.' : 'Min.');
    expect(minutesText(90, de)).toBe('1 Std. 30 Min.');
    expect(minutesText(120, de)).toBe('2 Std.');
    expect(minutesText(45, de)).toBe('45 Min.');
  });
});
