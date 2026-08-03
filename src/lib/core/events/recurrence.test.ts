import { describe, it, expect } from 'vitest';
import { expandRule } from './recurrence.js';
import type { ScheduleRule } from '../types.js';

// ─── Helpers ────────────────────────────────────────────

function range(start: string, end: string): { start: Date; end: Date } {
	return { start: new Date(start), end: new Date(end) };
}

function onceRule(validFrom: string, opts?: Partial<ScheduleRule>): ScheduleRule {
	return {
		id: 'r1',
		pattern: 'once',
		startTime: '10:00',
		endTime: '12:00',
		validFrom,
		timezone: 'UTC',
		...opts,
	};
}

function weeklyRule(daysOfWeek: number[], opts?: Partial<ScheduleRule>): ScheduleRule {
	return {
		id: 'r2',
		pattern: 'weekly',
		daysOfWeek,
		startTime: '09:00',
		endTime: '11:00',
		validFrom: '2024-01-01',
		timezone: 'UTC',
		...opts,
	};
}

// ─── once pattern ────────────────────────────────────────

describe('expandRule — once', () => {
	it('returns 1 occurrence when validFrom is inside the range', () => {
		const result = expandRule(
			onceRule('2024-03-15'),
			range('2024-03-01T00:00:00Z', '2024-03-31T23:59:59Z')
		);
		expect(result).toHaveLength(1);
		expect(result[0].startTime.toISOString()).toBe('2024-03-15T10:00:00.000Z');
		expect(result[0].endTime.toISOString()).toBe('2024-03-15T12:00:00.000Z');
	});

	it('returns 0 occurrences when validFrom is before the range', () => {
		const result = expandRule(
			onceRule('2024-02-10'),
			range('2024-03-01T00:00:00Z', '2024-03-31T23:59:59Z')
		);
		expect(result).toHaveLength(0);
	});

	it('returns 0 occurrences when validFrom is after the range', () => {
		const result = expandRule(
			onceRule('2024-04-01'),
			range('2024-03-01T00:00:00Z', '2024-03-31T23:59:59Z')
		);
		expect(result).toHaveLength(0);
	});

	it('returns 0 occurrences when start equals range.end (exclusive)', () => {
		// range.end is 2024-03-16T00:00:00Z, slot start is exactly that — should be excluded
		const result = expandRule(
			onceRule('2024-03-16'),
			range('2024-03-01T00:00:00Z', '2024-03-16T00:00:00Z')
		);
		expect(result).toHaveLength(0);
	});

	it('handles midnight-crossing times (endTime < startTime)', () => {
		const rule: ScheduleRule = {
			...onceRule('2024-03-15'),
			startTime: '23:00',
			endTime: '01:00',
		};
		const result = expandRule(rule, range('2024-03-15T00:00:00Z', '2024-03-16T00:00:00Z'));
		expect(result).toHaveLength(1);
		expect(result[0].endTime.getTime()).toBeGreaterThan(result[0].startTime.getTime());
		// end should be 01:00 next day
		expect(result[0].endTime.toISOString()).toBe('2024-03-16T01:00:00.000Z');
	});
});

// ─── weekly pattern ──────────────────────────────────────

describe('expandRule — weekly', () => {
	it('returns only occurrences on matching weekdays (Monday=1)', () => {
		// 2024-03-11 is a Monday, 2024-03-12 is Tuesday, etc.
		const result = expandRule(
			weeklyRule([1], { validFrom: '2024-03-01' }),
			range('2024-03-11T00:00:00Z', '2024-03-18T00:00:00Z')
		);
		// Monday Mar 11 and Monday Mar 18 (range end is exclusive so Mar 18 09:00 is inside)
		// Wait — range end is 2024-03-18T00:00:00Z, so Mar 18 09:00 is NOT in range.
		// So only Mar 11 qualifies.
		expect(result).toHaveLength(1);
		expect(result[0].startTime.toISOString()).toBe('2024-03-11T09:00:00.000Z');
	});

	it('returns multiple weekday occurrences across a week', () => {
		// Mon+Wed+Fri in a two-week range
		const result = expandRule(
			weeklyRule([1, 3, 5], { validFrom: '2024-03-01' }),
			range('2024-03-11T00:00:00Z', '2024-03-23T00:00:00Z')
		);
		// Week 1: Mon 11, Wed 13, Fri 15; Week 2: Mon 18, Wed 20, Fri 22 — 6 occurrences
		expect(result).toHaveLength(6);
	});

	it('respects validUntil — excludes dates after it', () => {
		const result = expandRule(
			weeklyRule([1], { validFrom: '2024-03-01', validUntil: '2024-03-11' }),
			range('2024-03-01T00:00:00Z', '2024-03-31T00:00:00Z')
		);
		// Only Mondays up to and including 2024-03-11: Mar 4 and Mar 11
		expect(result).toHaveLength(2);
		const dates = result.map((r) => r.startTime.toISOString().slice(0, 10));
		expect(dates).toContain('2024-03-04');
		expect(dates).toContain('2024-03-11');
	});

	it('returns empty array when validFrom is after range.end', () => {
		const result = expandRule(
			weeklyRule([1], { validFrom: '2024-04-01' }),
			range('2024-03-01T00:00:00Z', '2024-03-31T00:00:00Z')
		);
		expect(result).toHaveLength(0);
	});

	it('returns empty array when daysOfWeek is empty', () => {
		const result = expandRule(
			weeklyRule([], { validFrom: '2024-03-01' }),
			range('2024-03-01T00:00:00Z', '2024-03-31T00:00:00Z')
		);
		expect(result).toHaveLength(0);
	});

	it('returns Sunday occurrences (ISO 7)', () => {
		// 2024-03-03 and 2024-03-10 are Sundays
		const result = expandRule(
			weeklyRule([7], { validFrom: '2024-03-01' }),
			range('2024-03-01T00:00:00Z', '2024-03-11T00:00:00Z')
		);
		expect(result).toHaveLength(2);
		expect(result[0].startTime.toISOString()).toBe('2024-03-03T09:00:00.000Z');
		expect(result[1].startTime.toISOString()).toBe('2024-03-10T09:00:00.000Z');
	});
});

// ─── Timezone correctness (Europe/Warsaw) ────────────────

describe('expandRule — timezone (Europe/Warsaw)', () => {
	/**
	 * Europe/Warsaw is UTC+1 in winter, UTC+2 in summer (DST starts last Sunday of March).
	 * DST 2024: clocks spring forward on 2024-03-31 02:00 → 03:00.
	 */

	it('once rule: 10:00 Warsaw in winter = 09:00 UTC', () => {
		const rule: ScheduleRule = {
			id: 'tz1',
			pattern: 'once',
			startTime: '10:00',
			endTime: '12:00',
			validFrom: '2024-03-15', // winter: UTC+1
			timezone: 'Europe/Warsaw',
		};
		const result = expandRule(rule, range('2024-03-15T00:00:00Z', '2024-03-16T00:00:00Z'));
		expect(result).toHaveLength(1);
		expect(result[0].startTime.toISOString()).toBe('2024-03-15T09:00:00.000Z');
		expect(result[0].endTime.toISOString()).toBe('2024-03-15T11:00:00.000Z');
	});

	it('once rule: 10:00 Warsaw in summer = 08:00 UTC', () => {
		const rule: ScheduleRule = {
			id: 'tz2',
			pattern: 'once',
			startTime: '10:00',
			endTime: '12:00',
			validFrom: '2024-06-15', // summer: UTC+2
			timezone: 'Europe/Warsaw',
		};
		const result = expandRule(rule, range('2024-06-15T00:00:00Z', '2024-06-16T00:00:00Z'));
		expect(result).toHaveLength(1);
		expect(result[0].startTime.toISOString()).toBe('2024-06-15T08:00:00.000Z');
		expect(result[0].endTime.toISOString()).toBe('2024-06-15T10:00:00.000Z');
	});

	it('weekly rule in Europe/Warsaw uses local weekday correctly', () => {
		// 2024-03-11 is a Monday in Warsaw. With UTC+1 in winter,
		// 09:00 Warsaw = 08:00 UTC.
		const rule: ScheduleRule = {
			id: 'tz3',
			pattern: 'weekly',
			daysOfWeek: [1], // Monday
			startTime: '09:00',
			endTime: '11:00',
			validFrom: '2024-03-01',
			timezone: 'Europe/Warsaw',
		};
		const result = expandRule(rule, range('2024-03-11T00:00:00Z', '2024-03-12T00:00:00Z'));
		expect(result).toHaveLength(1);
		expect(result[0].startTime.toISOString()).toBe('2024-03-11T08:00:00.000Z');
	});

	it('weekly rule across DST boundary generates correct UTC offsets', () => {
		// Range covers the DST switch: 2024-03-25 (Mon, UTC+1) and 2024-04-01 (Mon, UTC+2).
		const rule: ScheduleRule = {
			id: 'tz4',
			pattern: 'weekly',
			daysOfWeek: [1], // Monday
			startTime: '10:00',
			endTime: '12:00',
			validFrom: '2024-03-01',
			timezone: 'Europe/Warsaw',
		};
		const result = expandRule(rule, range('2024-03-25T00:00:00Z', '2024-04-02T00:00:00Z'));
		expect(result).toHaveLength(2);
		// Mar 25 (winter, UTC+1): 10:00 Warsaw = 09:00 UTC
		expect(result[0].startTime.toISOString()).toBe('2024-03-25T09:00:00.000Z');
		// Apr 1 (summer, UTC+2): 10:00 Warsaw = 08:00 UTC
		expect(result[1].startTime.toISOString()).toBe('2024-04-01T08:00:00.000Z');
	});
});

// ─── custom pattern ──────────────────────────────────────

describe('expandRule — custom', () => {
	it('returns empty array (not yet implemented)', () => {
		const rule: ScheduleRule = {
			id: 'c1',
			pattern: 'custom',
			startTime: '09:00',
			endTime: '10:00',
			validFrom: '2024-03-01',
			timezone: 'UTC',
		};
		const result = expandRule(rule, range('2024-03-01T00:00:00Z', '2024-03-31T00:00:00Z'));
		expect(result).toHaveLength(0);
	});
});

// ─── daily pattern ───────────────────────────────────────

function dailyRule(opts?: Partial<ScheduleRule>): ScheduleRule {
	return {
		id: 'rd',
		pattern: 'daily',
		startTime: '08:00',
		endTime: '09:00',
		validFrom: '2024-03-01',
		timezone: 'UTC',
		...opts,
	};
}

describe('expandRule — daily', () => {
	it('every day within the range (interval defaults to 1)', () => {
		const result = expandRule(
			dailyRule({ validFrom: '2024-03-10' }),
			range('2024-03-10T00:00:00Z', '2024-03-15T00:00:00Z')
		);
		expect(result).toHaveLength(5);
		expect(result[0].startTime.toISOString()).toBe('2024-03-10T08:00:00.000Z');
		expect(result[4].startTime.toISOString()).toBe('2024-03-14T08:00:00.000Z');
	});

	it('every 3 days with interval = 3, from validFrom', () => {
		const result = expandRule(
			dailyRule({ validFrom: '2024-03-10', interval: 3 }),
			range('2024-03-10T00:00:00Z', '2024-03-25T00:00:00Z')
		);
		// 10, 13, 16, 19, 22
		expect(result.map((r) => r.startTime.toISOString())).toEqual([
			'2024-03-10T08:00:00.000Z',
			'2024-03-13T08:00:00.000Z',
			'2024-03-16T08:00:00.000Z',
			'2024-03-19T08:00:00.000Z',
			'2024-03-22T08:00:00.000Z',
		]);
	});

	it('respects validUntil (inclusive)', () => {
		const result = expandRule(
			dailyRule({ validFrom: '2024-03-10', validUntil: '2024-03-12' }),
			range('2024-03-01T00:00:00Z', '2024-03-31T00:00:00Z')
		);
		expect(result.map((r) => r.startTime.toISOString().slice(0, 10))).toEqual([
			'2024-03-10',
			'2024-03-11',
			'2024-03-12',
		]);
	});

	it('does not emit before validFrom even if range.start is earlier', () => {
		const result = expandRule(
			dailyRule({ validFrom: '2024-03-15' }),
			range('2024-03-10T00:00:00Z', '2024-03-20T00:00:00Z')
		);
		expect(result[0].startTime.toISOString().slice(0, 10)).toBe('2024-03-15');
	});
});

// ─── weekly with interval ────────────────────────────────

describe('expandRule — weekly (interval)', () => {
	it('every other week (interval = 2) on specified days', () => {
		// validFrom is a Monday (2024-03-04); Mondays every 2 weeks
		const result = expandRule(
			weeklyRule([1], { validFrom: '2024-03-04', interval: 2 }),
			range('2024-03-01T00:00:00Z', '2024-04-15T00:00:00Z')
		);
		// 2024-03-04, 2024-03-18, 2024-04-01
		expect(result.map((r) => r.startTime.toISOString().slice(0, 10))).toEqual([
			'2024-03-04',
			'2024-03-18',
			'2024-04-01',
		]);
	});

	it('interval = 1 behaves like plain weekly', () => {
		const result = expandRule(
			weeklyRule([1], { validFrom: '2024-03-04', interval: 1 }),
			range('2024-03-01T00:00:00Z', '2024-04-01T00:00:00Z')
		);
		// Every Monday: 4, 11, 18, 25
		expect(result).toHaveLength(4);
	});
});

// ─── monthly pattern ─────────────────────────────────────

function monthlyRule(daysOfMonth: number[], opts?: Partial<ScheduleRule>): ScheduleRule {
	return {
		id: 'rm',
		pattern: 'monthly',
		daysOfMonth,
		startTime: '10:00',
		endTime: '12:00',
		validFrom: '2024-01-01',
		timezone: 'UTC',
		...opts,
	};
}

describe('expandRule — monthly', () => {
	it('emits on each listed day each month (interval default)', () => {
		const result = expandRule(
			monthlyRule([1, 15], { validFrom: '2024-03-01' }),
			range('2024-03-01T00:00:00Z', '2024-05-01T00:00:00Z')
		);
		// March 1, March 15, April 1, April 15
		expect(result.map((r) => r.startTime.toISOString().slice(0, 10))).toEqual([
			'2024-03-01',
			'2024-03-15',
			'2024-04-01',
			'2024-04-15',
		]);
	});

	it('skips months that do not have the listed day', () => {
		const result = expandRule(
			monthlyRule([31], { validFrom: '2024-01-31' }),
			range('2024-01-01T00:00:00Z', '2024-07-01T00:00:00Z')
		);
		// Jan 31, Mar 31, May 31 — Feb/Apr/Jun have no 31
		expect(result.map((r) => r.startTime.toISOString().slice(0, 10))).toEqual([
			'2024-01-31',
			'2024-03-31',
			'2024-05-31',
		]);
	});

	it('every other month (interval = 2)', () => {
		const result = expandRule(
			monthlyRule([10], { validFrom: '2024-01-10', interval: 2 }),
			range('2024-01-01T00:00:00Z', '2024-07-01T00:00:00Z')
		);
		// Jan, Mar, May
		expect(result.map((r) => r.startTime.toISOString().slice(0, 10))).toEqual([
			'2024-01-10',
			'2024-03-10',
			'2024-05-10',
		]);
	});

	it('emits days in chronological order even if daysOfMonth is unsorted', () => {
		const result = expandRule(
			monthlyRule([15, 1, 20], { validFrom: '2024-03-01' }),
			range('2024-03-01T00:00:00Z', '2024-04-01T00:00:00Z')
		);
		expect(result.map((r) => r.startTime.toISOString().slice(0, 10))).toEqual([
			'2024-03-01',
			'2024-03-15',
			'2024-03-20',
		]);
	});

	it('respects validUntil', () => {
		const result = expandRule(
			monthlyRule([1], { validFrom: '2024-01-01', validUntil: '2024-03-31' }),
			range('2024-01-01T00:00:00Z', '2024-12-31T00:00:00Z')
		);
		expect(result.map((r) => r.startTime.toISOString().slice(0, 10))).toEqual([
			'2024-01-01',
			'2024-02-01',
			'2024-03-01',
		]);
	});

	it('returns empty for leap-day (Feb 29) in non-leap year', () => {
		const result = expandRule(
			monthlyRule([29], {
				validFrom: '2023-02-01',
				validUntil: '2023-02-28',
			}),
			range('2023-02-01T00:00:00Z', '2023-03-01T00:00:00Z')
		);
		expect(result).toHaveLength(0);
	});
});

describe('excludeDates (EXDATE)', () => {
	it('skips excluded dates, keeps the rest, tolerates datetime strings', () => {
		const rule = {
			id: 'r1',
			pattern: 'weekly' as const,
			daysOfWeek: [1, 3], // Mon, Wed
			startTime: '10:00',
			endTime: '11:00',
			validFrom: '2030-06-01',
			timezone: 'Europe/Warsaw',
			excludeDates: ['2030-06-03', '2030-06-05T00:00:00'], // Mon + Wed of week 1
		};
		const range = {
			start: new Date('2030-06-01T00:00:00Z'),
			end: new Date('2030-06-15T00:00:00Z'),
		};
		const withEx = expandRule(rule, range);
		const without = expandRule({ ...rule, excludeDates: undefined }, range);
		expect(without.length - withEx.length).toBe(2);
		const dates = withEx.map((o) => o.startTime.toISOString().slice(0, 10));
		expect(dates).not.toContain('2030-06-03');
		expect(dates).not.toContain('2030-06-05');
		expect(dates).toContain('2030-06-10');
	});
});
