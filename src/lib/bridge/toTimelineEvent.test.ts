import { describe, it, expect } from 'vitest';
import { toTimelineEvent } from './toTimelineEvent.js';
import type { Slot, Offering } from '../core/types.js';

// ─── Helpers ────────────────────────────────────────────

function makeTour(overrides: Partial<Offering> = {}): Offering {
	return {
		id: 'offering-1',
		name: 'City Walk',
		description: 'A walking offering of the city.',
		duration: 120,
		capacity: 10,
		minCapacity: 2,
		maxCapacity: 10,
		languages: ['en'],
		categories: ['sightseeing'],
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
			rules: [],
		},
		scheduleRules: [],
		...overrides,
	};
}

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

// ─── Status mapping ──────────────────────────────────────

describe('toTimelineEvent — availability status mapping', () => {
	it('open slot with plenty of spots → status = "confirmed"', () => {
		const slot = makeSlot({ availableSpots: 10, bookedSpots: 0, status: 'open' });
		const event = toTimelineEvent(slot, makeTour());
		expect(event.status).toBe('confirmed');
	});

	it('open slot with exactly 4 spots left → status = "confirmed"', () => {
		const slot = makeSlot({ availableSpots: 10, bookedSpots: 6, status: 'open' });
		const event = toTimelineEvent(slot, makeTour());
		expect(event.status).toBe('confirmed');
	});

	it('open slot with exactly 3 spots left → status = "limited"', () => {
		const slot = makeSlot({ availableSpots: 10, bookedSpots: 7, status: 'open' });
		const event = toTimelineEvent(slot, makeTour());
		expect(event.status).toBe('limited');
	});

	it('open slot with 1 spot left → status = "limited"', () => {
		const slot = makeSlot({ availableSpots: 10, bookedSpots: 9, status: 'open' });
		const event = toTimelineEvent(slot, makeTour());
		expect(event.status).toBe('limited');
	});

	it('full slot → status = "full"', () => {
		const slot = makeSlot({ availableSpots: 10, bookedSpots: 10, status: 'full' });
		const event = toTimelineEvent(slot, makeTour());
		expect(event.status).toBe('full');
	});

	it('cancelled slot → status = "cancelled"', () => {
		const slot = makeSlot({ status: 'cancelled' });
		const event = toTimelineEvent(slot, makeTour());
		expect(event.status).toBe('cancelled');
	});

	it('completed slot → status = "confirmed" (historical)', () => {
		const slot = makeSlot({ status: 'completed' });
		const event = toTimelineEvent(slot, makeTour());
		expect(event.status).toBe('confirmed');
	});

	it('at_risk slot → status = "limited"', () => {
		const slot = makeSlot({ status: 'at_risk' });
		const event = toTimelineEvent(slot, makeTour());
		expect(event.status).toBe('limited');
	});
});

// ─── EventStatus mapping ─────────────────────────────────

describe('toTimelineEvent — TimelineEvent.status (EventStatus)', () => {
	it('cancelled slot sets status to "cancelled" for calendar rendering', () => {
		const slot = makeSlot({ status: 'cancelled' });
		const event = toTimelineEvent(slot, makeTour());
		expect(event.status).toBe('cancelled');
	});

	it('open slot sets status to "confirmed"', () => {
		const slot = makeSlot({ status: 'open' });
		const event = toTimelineEvent(slot, makeTour());
		expect(event.status).toBe('confirmed');
	});

	it('full slot sets status to "full"', () => {
		const slot = makeSlot({ status: 'full' });
		const event = toTimelineEvent(slot, makeTour());
		expect(event.status).toBe('full');
	});
});

// ─── Field mapping ───────────────────────────────────────

describe('toTimelineEvent — field mapping', () => {
	it('id maps from slot.id', () => {
		const slot = makeSlot({ id: 'slot-abc' });
		const event = toTimelineEvent(slot, makeTour());
		expect(event.id).toBe('slot-abc');
	});

	it('title maps from offering.name', () => {
		const offering = makeTour({ name: 'Mountain Trek' });
		const event = toTimelineEvent(makeSlot(), offering);
		expect(event.title).toBe('Mountain Trek');
	});

	it('start maps from slot.startTime', () => {
		const start = new Date('2030-07-15T09:00:00Z');
		const slot = makeSlot({ startTime: start });
		const event = toTimelineEvent(slot, makeTour());
		expect(event.start).toBe(start);
	});

	it('end maps from slot.endTime', () => {
		const end = new Date('2030-07-15T11:00:00Z');
		const slot = makeSlot({ endTime: end });
		const event = toTimelineEvent(slot, makeTour());
		expect(event.end).toBe(end);
	});

	it('category uses offering.categories[0]', () => {
		const offering = makeTour({ categories: ['adventure', 'outdoor'] });
		const event = toTimelineEvent(makeSlot(), offering);
		expect(event.category).toBe('adventure');
	});

	it('category falls back to offering.name when categories is empty', () => {
		const offering = makeTour({ name: 'Special Offering', categories: [] });
		const event = toTimelineEvent(makeSlot(), offering);
		expect(event.category).toBe('Special Offering');
	});

	it('category is never a hardcoded color value', () => {
		const offering = makeTour({ categories: ['wellness'] });
		const event = toTimelineEvent(makeSlot(), offering);
		// category must be a semantic string, not a hex/rgb color
		expect(event.color).toBeUndefined();
		expect(event.category).toBe('wellness');
	});
});

// ─── data payload ────────────────────────────────────────

describe('toTimelineEvent — data payload', () => {
	it('data.slotId equals slot.id', () => {
		const slot = makeSlot({ id: 'slot-xyz' });
		const event = toTimelineEvent(slot, makeTour());
		expect(event.data?.slotId).toBe('slot-xyz');
	});

	it('data.offeringId equals offering.id', () => {
		const offering = makeTour({ id: 'offering-999' });
		const event = toTimelineEvent(makeSlot({ offeringId: 'offering-999' }), offering);
		expect(event.data?.offeringId).toBe('offering-999');
	});

	it('data.bookedSpots reflects slot.bookedSpots', () => {
		const slot = makeSlot({ availableSpots: 10, bookedSpots: 4, status: 'open' });
		const event = toTimelineEvent(slot, makeTour());
		expect(event.data?.bookedSpots).toBe(4);
	});

	it('data.availableSpots reflects slot.availableSpots', () => {
		const slot = makeSlot({ availableSpots: 8, bookedSpots: 2, status: 'open' });
		const event = toTimelineEvent(slot, makeTour());
		expect(event.data?.availableSpots).toBe(8);
	});

	it('data.spotsLeft is availableSpots - bookedSpots', () => {
		const slot = makeSlot({ availableSpots: 10, bookedSpots: 3, status: 'open' });
		const event = toTimelineEvent(slot, makeTour());
		expect(event.data?.spotsLeft).toBe(7);
	});

	it('data.spotsLeft is 0 when slot is full', () => {
		const slot = makeSlot({ availableSpots: 5, bookedSpots: 5, status: 'full' });
		const event = toTimelineEvent(slot, makeTour());
		expect(event.data?.spotsLeft).toBe(0);
	});

	it('data does not contain status key', () => {
		const event = toTimelineEvent(makeSlot(), makeTour());
		expect(event.data).not.toHaveProperty('status');
	});
});
