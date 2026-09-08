/**
 * Series bookings — one purchase, one seat, N sessions.
 *
 * The case these exist for: a kurs sold as eight Tuesdays. Before slotIds the
 * only way to express it was one booking against one slot, which meant
 * sessions 2..N held no capacity — the room was paid for and the desk would
 * still sell the seat. Every test below is a way that can go wrong.
 */
import { describe, it, expect } from 'vitest';
import { createBooking, cancelBooking, BookingError } from './booking.js';
import { checkIn, AttendanceError } from './attendance.js';
import { recountSlotCapacity } from './holds.js';
import { createMemoryAdapter } from '../adapters/memory.js';
import type { Offering, Slot } from './types.js';

const tour = (o: Partial<Offering> = {}): Omit<Offering, 'id'> => ({
	name: 'Kurs jogi od podstaw',
	description: '8 wtorków',
	duration: 90,
	capacity: 10,
	minCapacity: 1,
	maxCapacity: 10,
	languages: ['pl'],
	categories: [],
	includedItems: [],
	requirements: [],
	images: [],
	isPublic: true,
	status: 'active',
	pricing: { model: 'per_person', basePrice: 400, currency: 'PLN', guidePaysProcessingFee: false },
	cancellationPolicy: {
		id: 'flexible',
		name: 'Flexible',
		description: 'Full refund if 24h before.',
		rules: [{ hoursBeforeTour: 24, refundPercentage: 100, description: 'Full refund' }],
	},
	scheduleRules: [],
	...o,
});

const slotAt = (offeringId: string, day: number, o: Partial<Slot> = {}): Omit<Slot, 'id'> => ({
	offeringId,
	startTime: new Date(`2030-06-${String(day).padStart(2, '0')}T17:00:00Z`),
	endTime: new Date(`2030-06-${String(day).padStart(2, '0')}T18:30:00Z`),
	availableSpots: 10,
	bookedSpots: 0,
	status: 'open',
	isGenerated: false,
	...o,
});

const guest = { name: 'Ania', email: 'ania@example.pl' };

/** A course of `n` sessions, all open. */
async function course(n: number, slotOverrides: Partial<Slot>[] = []) {
	const adapter = createMemoryAdapter();
	const offering = await adapter.createOffering(tour());
	const slots = [];
	for (let i = 0; i < n; i++) {
		slots.push(await adapter.createSlot(slotAt(offering.id, 4 + i * 7, slotOverrides[i] ?? {})));
	}
	return { adapter, offering, slots };
}

describe('createBooking — series', () => {
	it('one booking spans every session, anchored on the first', async () => {
		const { adapter, slots } = await course(8);
		const b = await createBooking(
			adapter,
			slots.map((s) => s.id),
			guest,
			1,
		);
		expect(b.slotId).toBe(slots[0].id);
		expect(b.slotIds).toHaveLength(8);
		expect(b.slotIds).toContain(slots[7].id);
		// One ticket, one price — the course fee (plus the guest-paid processing
		// fee), NOT the fee times eight sessions.
		expect(b.priceBreakdown.subtotal).toBe(400);
		expect(b.totalAmount).toBeLessThan(800);
	});

	it('a single-slot booking is stored exactly as before — no slotIds at all', async () => {
		const { adapter, slots } = await course(1);
		const b = await createBooking(adapter, slots[0].id, guest, 1);
		expect(b.slotIds).toBeUndefined();
	});

	it('an array of one is still not a series', async () => {
		const { adapter, slots } = await course(1);
		const b = await createBooking(adapter, [slots[0].id], guest, 1);
		expect(b.slotIds).toBeUndefined();
		expect(b.slotId).toBe(slots[0].id);
	});

	it('THE BUG THIS FIXES: every session holds capacity, not just the anchor', async () => {
		const { adapter, slots } = await course(3);
		await createBooking(
			adapter,
			slots.map((s) => s.id),
			guest,
			2,
		);
		for (const s of slots) {
			const held = await adapter.getBookingsForSlot(s.id);
			expect(held).toHaveLength(1);
			const recounted = await recountSlotCapacity(adapter, (await adapter.getSlotById(s.id))!);
			expect(recounted.bookedSpots).toBe(2);
		}
	});

	it('refuses the whole course when ONE session is full — all or nothing', async () => {
		const { adapter, slots } = await course(3, [{}, { availableSpots: 1, bookedSpots: 1 }, {}]);
		await expect(
			createBooking(
				adapter,
				slots.map((s) => s.id),
				guest,
				1,
			),
		).rejects.toThrow(BookingError);
		// and nothing was half-written
		expect(await adapter.getBookingsForSlot(slots[0].id)).toHaveLength(0);
		expect(await adapter.getBookingsForSlot(slots[2].id)).toHaveLength(0);
	});

	it('refuses when one session is cancelled', async () => {
		const { adapter, slots } = await course(3, [{}, {}, { status: 'cancelled' }]);
		await expect(
			createBooking(
				adapter,
				slots.map((s) => s.id),
				guest,
				1,
			),
		).rejects.toThrow(/not open/i);
	});

	it('refuses sessions from a different offering — a series is one course', async () => {
		const { adapter, offering, slots } = await course(2);
		const other = await adapter.createOffering(tour({ name: 'Inny kurs' }));
		const stray = await adapter.createSlot(slotAt(other.id, 25));
		expect(offering.id).not.toBe(other.id);
		await expect(createBooking(adapter, [slots[0].id, stray.id], guest, 1)).rejects.toThrow(
			/different offering/i,
		);
	});

	it('deduplicates a repeated session rather than charging capacity twice', async () => {
		const { adapter, slots } = await course(2);
		const b = await createBooking(adapter, [slots[0].id, slots[1].id, slots[0].id], guest, 1);
		expect(b.slotIds).toHaveLength(2);
	});
});

describe('cancelBooking — series', () => {
	it('gives back the seat in EVERY session, not just the anchor', async () => {
		const { adapter, slots } = await course(4);
		const b = await createBooking(
			adapter,
			slots.map((s) => s.id),
			guest,
			2,
		);
		for (const s of slots) await recountSlotCapacity(adapter, (await adapter.getSlotById(s.id))!);

		await cancelBooking(adapter, b.id, 'guest');

		for (const s of slots) {
			const after = await adapter.getSlotById(s.id);
			expect(after!.bookedSpots).toBe(0);
		}
	});
});

describe('attendance — series', () => {
	it('checks in one named session', async () => {
		const { adapter, slots } = await course(3);
		const b = await createBooking(
			adapter,
			slots.map((s) => s.id),
			guest,
			1,
		);
		const after = await checkIn(adapter, b.id, slots[1].id);
		expect(after.attendanceStatus).toBe('checked_in');
	});

	it('refuses a session that is not part of the booking', async () => {
		const { adapter, offering, slots } = await course(2);
		const elsewhere = await adapter.createSlot(slotAt(offering.id, 25));
		const b = await createBooking(adapter, [slots[0].id, slots[1].id], guest, 1);
		await expect(checkIn(adapter, b.id, elsewhere.id)).rejects.toThrow(AttendanceError);
	});

	it('still works with no session named, for an ordinary class', async () => {
		const { adapter, slots } = await course(1);
		const b = await createBooking(adapter, slots[0].id, guest, 1);
		expect((await checkIn(adapter, b.id)).attendanceStatus).toBe('checked_in');
	});
});
