import { describe, it, expect } from 'vitest';
import { toCalendarAdapter } from './toCalendarAdapter.js';
import { createMemoryAdapter } from '../adapters/memory.js';
import type { Offering, ScheduleRule } from '../core/types.js';

// ─── Helpers ────────────────────────────────────────────

function range(start: string, end: string): { start: Date; end: Date } {
	return { start: new Date(start), end: new Date(end) };
}

function makeTourDef(overrides: Partial<Offering> = {}): Omit<Offering, 'id'> {
	return {
		name: 'City Walk',
		description: 'A walking offering.',
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
			description: '',
			rules: [],
		},
		scheduleRules: [],
		...overrides,
	};
}

const WEEKLY_MON_RULE: ScheduleRule = {
	id: 'rule-mon',
	pattern: 'weekly',
	daysOfWeek: [1], // Monday
	startTime: '09:00',
	endTime: '11:00',
	validFrom: '2024-01-01',
	timezone: 'UTC',
};

// ─── Basic adapter behaviour ─────────────────────────────

describe('toCalendarAdapter — basic', () => {
	it('returns an empty array when the offering does not exist', async () => {
		const schedulerAdapter = createMemoryAdapter();
		const calAdapter = toCalendarAdapter(schedulerAdapter, 'nonexistent-offering');

		const events = await calAdapter.fetchEvents(range('2024-03-11T00:00:00Z', '2024-03-18T00:00:00Z'));
		expect(events).toEqual([]);
	});

	it('returns events for a offering with a weekly schedule rule', async () => {
		const schedulerAdapter = createMemoryAdapter();
		const offering = await schedulerAdapter.createOffering(
			makeTourDef({ scheduleRules: [WEEKLY_MON_RULE] }),
		);

		const calAdapter = toCalendarAdapter(schedulerAdapter, offering.id);
		const events = await calAdapter.fetchEvents(
			range('2024-03-11T00:00:00Z', '2024-03-18T00:00:00Z'),
		);

		// One Monday (Mar 11) in the range
		expect(events).toHaveLength(1);
		expect(events[0].title).toBe('City Walk');
		expect(events[0].start).toEqual(new Date('2024-03-11T09:00:00.000Z'));
		expect(events[0].end).toEqual(new Date('2024-03-11T11:00:00.000Z'));
	});

	it('returns multiple events across several weeks', async () => {
		const schedulerAdapter = createMemoryAdapter();
		const offering = await schedulerAdapter.createOffering(
			makeTourDef({ scheduleRules: [WEEKLY_MON_RULE] }),
		);

		const calAdapter = toCalendarAdapter(schedulerAdapter, offering.id);
		const events = await calAdapter.fetchEvents(
			range('2024-03-11T00:00:00Z', '2024-03-25T00:00:00Z'),
		);

		// Two Mondays: Mar 11 and Mar 18
		expect(events).toHaveLength(2);
	});
});

// ─── Generated slots ─────────────────────────────────────

describe('toCalendarAdapter — generated slots', () => {
	it('includes lazily-generated slots when no persisted slot exists', async () => {
		const schedulerAdapter = createMemoryAdapter();
		const offering = await schedulerAdapter.createOffering(
			makeTourDef({ scheduleRules: [WEEKLY_MON_RULE] }),
		);

		// No slots persisted in the adapter
		const calAdapter = toCalendarAdapter(schedulerAdapter, offering.id);
		const events = await calAdapter.fetchEvents(
			range('2024-03-11T00:00:00Z', '2024-03-18T00:00:00Z'),
		);

		expect(events).toHaveLength(1);
		// Generated slot id starts with "virtual:"
		expect(events[0].id).toMatch(/^virtual:/);
		expect(events[0].status).toBe('confirmed');
	});

	it('uses persisted slot data when it matches a generated occurrence', async () => {
		const schedulerAdapter = createMemoryAdapter();
		const offering = await schedulerAdapter.createOffering(
			makeTourDef({ scheduleRules: [WEEKLY_MON_RULE] }),
		);

		// Persist a slot with some bookings
		const persisted = await schedulerAdapter.createSlot({
			offeringId: offering.id,
			startTime: new Date('2024-03-11T09:00:00.000Z'),
			endTime: new Date('2024-03-11T11:00:00.000Z'),
			availableSpots: 10,
			bookedSpots: 7,
			status: 'open',
			isGenerated: true,
			scheduleRuleId: 'rule-mon',
		});

		const calAdapter = toCalendarAdapter(schedulerAdapter, offering.id);
		const events = await calAdapter.fetchEvents(
			range('2024-03-11T00:00:00Z', '2024-03-18T00:00:00Z'),
		);

		expect(events).toHaveLength(1);
		expect(events[0].id).toBe(persisted.id);
		expect(events[0].data?.bookedSpots).toBe(7);
		// 3 spots left → limited
		expect(events[0].status).toBe('limited');
	});
});

// ─── Cancelled slots are excluded ────────────────────────

describe('toCalendarAdapter — cancelled slots excluded', () => {
	it('excludes a cancelled persisted slot', async () => {
		const schedulerAdapter = createMemoryAdapter();
		const offering = await schedulerAdapter.createOffering(
			makeTourDef({ scheduleRules: [WEEKLY_MON_RULE] }),
		);

		// Persist a cancelled slot for the Monday
		await schedulerAdapter.createSlot({
			offeringId: offering.id,
			startTime: new Date('2024-03-11T09:00:00.000Z'),
			endTime: new Date('2024-03-11T11:00:00.000Z'),
			availableSpots: 10,
			bookedSpots: 0,
			status: 'cancelled',
			isGenerated: true,
			scheduleRuleId: 'rule-mon',
		});

		const calAdapter = toCalendarAdapter(schedulerAdapter, offering.id);
		const events = await calAdapter.fetchEvents(
			range('2024-03-11T00:00:00Z', '2024-03-18T00:00:00Z'),
		);

		// Cancelled slot should be excluded
		expect(events).toHaveLength(0);
	});
});

// ─── Offering isolation ───────────────────────────────────────

describe('toCalendarAdapter — offering isolation', () => {
	it('does not include events from a different offering', async () => {
		const schedulerAdapter = createMemoryAdapter();
		const tourA = await schedulerAdapter.createOffering(
			makeTourDef({ name: 'Offering A', scheduleRules: [WEEKLY_MON_RULE] }),
		);
		const tourB = await schedulerAdapter.createOffering(
			makeTourDef({
				name: 'Offering B',
				scheduleRules: [
					{ ...WEEKLY_MON_RULE, id: 'rule-mon-b', daysOfWeek: [3] }, // Wednesday
				],
			}),
		);

		const calAdapterA = toCalendarAdapter(schedulerAdapter, tourA.id);
		const eventsA = await calAdapterA.fetchEvents(
			range('2024-03-11T00:00:00Z', '2024-03-15T00:00:00Z'),
		);

		// Only Offering A's Monday event — Offering B's Wednesday should NOT appear
		expect(eventsA).toHaveLength(1);
		expect(eventsA[0].title).toBe('Offering A');

		// Sanity check: Offering B adapter gets its own event
		const calAdapterB = toCalendarAdapter(schedulerAdapter, tourB.id);
		const eventsB = await calAdapterB.fetchEvents(
			range('2024-03-11T00:00:00Z', '2024-03-15T00:00:00Z'),
		);
		expect(eventsB).toHaveLength(1);
		expect(eventsB[0].title).toBe('Offering B');
	});
});

// ─── Write operations throw ───────────────────────────────

describe('toCalendarAdapter — write operations are unsupported', () => {
	// The bridge always implements the optional write methods (they throw),
	// so the non-null assertions are safe here.
	it('createEvent throws', async () => {
		const calAdapter = toCalendarAdapter(createMemoryAdapter(), 'any');
		await expect(
			calAdapter.createEvent!({
				title: 'x',
				start: new Date(),
				end: new Date(),
			}),
		).rejects.toThrow();
	});

	it('updateEvent throws', async () => {
		const calAdapter = toCalendarAdapter(createMemoryAdapter(), 'any');
		await expect(calAdapter.updateEvent!('id', {})).rejects.toThrow();
	});

	it('deleteEvent throws', async () => {
		const calAdapter = toCalendarAdapter(createMemoryAdapter(), 'any');
		await expect(calAdapter.deleteEvent!('id')).rejects.toThrow();
	});
});
