import { describe, it, expect } from 'vitest';
import { availableSpots, isFull, isAtRisk, checkCapacity } from './capacity.js';
import type { Slot, Offering } from './types.js';

// ─── Helpers ────────────────────────────────────────────

function makeSlot(overrides: Partial<Slot> = {}): Slot {
	return {
		id: 'slot-1',
		offeringId: 'offering-1',
		startTime: new Date('2030-06-01T10:00:00Z'),
		endTime: new Date('2030-06-01T12:00:00Z'),
		availableSpots: 10,
		bookedSpots: 0,
		status: 'open',
		isGenerated: false,
		...overrides,
	};
}

function makeTour(overrides: Partial<Offering> = {}): Offering {
	return {
		id: 'offering-1',
		name: 'City Walk',
		description: 'A walking offering.',
		duration: 120,
		capacity: 10,
		minCapacity: 3,
		maxCapacity: 10,
		languages: ['en'],
		categories: [],
		includedItems: [],
		requirements: [],
		images: [],
		isPublic: true,
		status: 'active',
		pricing: {
			model: 'per_person',
			basePrice: 50,
			currency: 'PLN',
			guidePaysProcessingFee: false,
		},
		cancellationPolicy: {
			id: 'flexible',
			name: 'Flexible',
			description: 'Full refund if 24h before.',
			rules: [
				{ hoursBeforeTour: 24, refundPercentage: 100, description: 'Full refund' },
				{ hoursBeforeTour: 0, refundPercentage: 0, description: 'No refund' },
			],
		},
		scheduleRules: [],
		...overrides,
	};
}

// ─── availableSpots ──────────────────────────────────────

describe('availableSpots', () => {
	it('returns full capacity when no spots are booked', () => {
		expect(availableSpots(makeSlot({ availableSpots: 10, bookedSpots: 0 }))).toBe(10);
	});

	it('returns remaining capacity after some bookings', () => {
		expect(availableSpots(makeSlot({ availableSpots: 10, bookedSpots: 3 }))).toBe(7);
	});

	it('returns 0 when slot is at full capacity', () => {
		expect(availableSpots(makeSlot({ availableSpots: 5, bookedSpots: 5 }))).toBe(0);
	});

	it('handles single-spot slots', () => {
		expect(availableSpots(makeSlot({ availableSpots: 1, bookedSpots: 0 }))).toBe(1);
		expect(availableSpots(makeSlot({ availableSpots: 1, bookedSpots: 1 }))).toBe(0);
	});
});

// ─── isFull ──────────────────────────────────────────────

describe('isFull', () => {
	it('returns false when no spots are booked', () => {
		expect(isFull(makeSlot({ availableSpots: 10, bookedSpots: 0 }))).toBe(false);
	});

	it('returns false when some spots remain', () => {
		expect(isFull(makeSlot({ availableSpots: 10, bookedSpots: 9 }))).toBe(false);
	});

	it('returns true when bookedSpots equals availableSpots', () => {
		expect(isFull(makeSlot({ availableSpots: 5, bookedSpots: 5 }))).toBe(true);
	});

	it('returns true when bookedSpots exceeds availableSpots', () => {
		expect(isFull(makeSlot({ availableSpots: 5, bookedSpots: 6 }))).toBe(true);
	});
});

// ─── isAtRisk ────────────────────────────────────────────

describe('isAtRisk', () => {
	const offering = makeTour({ minCapacity: 3 });

	it('returns true when below minCapacity and within 24h', () => {
		const slot = makeSlot({
			status: 'open',
			bookedSpots: 2, // below minCapacity of 3
			startTime: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12h from now
		});
		expect(isAtRisk(slot, offering)).toBe(true);
	});

	it('returns false when at or above minCapacity', () => {
		const slot = makeSlot({
			status: 'open',
			bookedSpots: 3, // meets minCapacity
			startTime: new Date(Date.now() + 12 * 60 * 60 * 1000),
		});
		expect(isAtRisk(slot, offering)).toBe(false);
	});

	it('returns false when more than 24h away (even if below min)', () => {
		const slot = makeSlot({
			status: 'open',
			bookedSpots: 1,
			startTime: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48h from now
		});
		expect(isAtRisk(slot, offering)).toBe(false);
	});

	it('returns false when status is not open', () => {
		const now = new Date();
		const slot = makeSlot({
			status: 'full',
			bookedSpots: 1,
			startTime: new Date(now.getTime() + 12 * 60 * 60 * 1000),
		});
		expect(isAtRisk(slot, offering)).toBe(false);
	});

	it('returns false for cancelled slot even within 24h', () => {
		const slot = makeSlot({
			status: 'cancelled',
			bookedSpots: 0,
			startTime: new Date(Date.now() + 6 * 60 * 60 * 1000),
		});
		expect(isAtRisk(slot, offering)).toBe(false);
	});

	it('accepts an explicit now parameter', () => {
		const now = new Date('2030-06-01T06:00:00Z');
		const startTime = new Date('2030-06-01T10:00:00Z'); // 4h later
		const slot = makeSlot({ status: 'open', bookedSpots: 1, startTime });
		expect(isAtRisk(slot, offering, now)).toBe(true);
	});

	it('returns false when exactly 24h remain', () => {
		// 24h is NOT less than 24, so should return false
		const now = new Date();
		const slot = makeSlot({
			status: 'open',
			bookedSpots: 1,
			startTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
		});
		expect(isAtRisk(slot, offering, now)).toBe(false);
	});
});

// ─── checkCapacity ───────────────────────────────────────

describe('checkCapacity', () => {
	it('returns null when count fits within remaining spots', () => {
		const slot = makeSlot({ availableSpots: 10, bookedSpots: 3 });
		expect(checkCapacity(slot, 5)).toBeNull();
	});

	it('returns null when count exactly equals remaining spots', () => {
		const slot = makeSlot({ availableSpots: 5, bookedSpots: 2 });
		expect(checkCapacity(slot, 3)).toBeNull();
	});

	it('returns error string when count exceeds remaining spots', () => {
		const slot = makeSlot({ availableSpots: 5, bookedSpots: 3 });
		const result = checkCapacity(slot, 4);
		expect(result).toBeTypeOf('string');
		expect(result).not.toBeNull();
	});

	it('returns error string when count is 0', () => {
		const slot = makeSlot({ availableSpots: 10, bookedSpots: 0 });
		const result = checkCapacity(slot, 0);
		expect(result).toBeTypeOf('string');
	});

	it('returns error string when count is negative', () => {
		const slot = makeSlot({ availableSpots: 10, bookedSpots: 0 });
		const result = checkCapacity(slot, -1);
		expect(result).toBeTypeOf('string');
	});

	it('returns error when slot is fully booked', () => {
		const slot = makeSlot({ availableSpots: 3, bookedSpots: 3 });
		const result = checkCapacity(slot, 1);
		expect(result).not.toBeNull();
	});
});
