import {describe,it,expect} from 'vitest';
import {monthlyRound} from '../src/shared/calendar';
describe('Taiwan monthly calendar',()=>{
  it('starts with November and uses the final second of day 20 as the enrollment boundary',()=>{
    const r=monthlyRound(Date.parse('2026-10-01T00:00:00Z'));
    expect(r.sequence).toBe(1);expect(r.slug).toBe('2026-11');
    expect(r.opensAt).toBe('2026-10-31T16:00:00.000Z');
    expect(r.closesAt).toBe('2026-11-20T16:00:00.000Z');
    expect(r.endAt).toBe('2026-11-30T16:00:00.000Z');
    expect(r.daysInMonth).toBe(30);
  });
  it('handles Taiwan midnight, year rollover and leap February',()=>{
    expect(monthlyRound(Date.parse('2026-11-30T15:59:59Z')).slug).toBe('2026-11');
    expect(monthlyRound(Date.parse('2026-11-30T16:00:00Z')).slug).toBe('2026-12');
    expect(monthlyRound(Date.parse('2026-12-31T16:00:00Z')).sequence).toBe(3);
    const leap=monthlyRound(Date.parse('2028-02-10T00:00:00Z'));
    expect(leap.daysInMonth).toBe(29);expect(leap.endAt).toBe('2028-02-29T16:00:00.000Z');
  });
});
