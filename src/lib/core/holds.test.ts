import { describe, it, expect } from 'vitest';
import { createBooking, confirmBooking, BookingError } from './booking.js';
import { holdExpiry, isExpiredHold, expireHolds, occupyingBookings } from './holds.js';
import { checkIn, markNoShow, resetAttendance, AttendanceError } from './attendance.js';
import { ticketFor, generateBookingReference } from './ticket.js';
import { createMemoryAdapter } from '../adapters/memory.js';
import type { Offering, Slot } from './types.js';

function makeOffering(overrides: Partial<Offering> = {}): Omit<Offering, 'id'> {
	return {
		name: 'Morning Vinyasa',
		description: 'A yoga class.',
		duration: 60,
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
		pricing: { model: 'per_person', basePrice: 45, currency: 'PLN', guidePaysProcessingFee: false },
		cancellationPolicy: {
			id: 'flexible',
			name: 'Flexible',
			description: 'Full refund 24h before.',
			rules: [
				{ hoursBeforeTour: 24, refundPercentage: 100, description: 'full' },
				{ hoursBeforeTour: 0, refundPercentage: 0, description: 'none' },
			],
		},
		scheduleRules: [],
		...overrides,
	};
}

function makeSlot(offeringId: string, overrides: Partial<Slot> = {}): Omit<Slot, 'id'> {
	return {
		offeringId,
		startTime: new Date('2030-06-01T10:00:00Z'),
		endTime: new Date('2030-06-01T11:00:00Z'),
		availableSpots: 10,
		bookedSpots: 0,
		status: 'open',
		isGenerated: false,
		...overrides,
	};
}

const guest = { name: 'Alice', email: 'alice@example.com' };

async function setup(slotOverrides: Partial<Slot> = {}) {
	const adapter = createMemoryAdapter();
	const offering = await adapter.createOffering(makeOffering());
	const slot = await adapter.createSlot(makeSlot(offering.id, slotOverrides));
	return { adapter, offering, slot };
}

describe('holds', () => {
	it('createBooking with holdMinutes creates a pending booking with expiry', async () => {
		const { adapter, slot } = await setup();
		const b = await createBooking(adapter, slot.id, guest, 2, { holdMinutes: 30 });
		expect(b.status).toBe('pending');
		expect(b.expiresAt).toBeDefined();
		expect(new Date(b.expiresAt!).getTime()).toBeGreaterThan(Date.now());
		// hold occupies capacity
		expect((await adapter.getSlotById(slot.id))!.bookedSpots).toBe(2);
	});

	it('isExpiredHold: pending past expiry only', async () => {
		const { adapter, slot } = await setup();
		const b = await createBooking(adapter, slot.id, guest, 1, { holdMinutes: 30 });
		expect(isExpiredHold(b)).toBe(false);
		expect(isExpiredHold({ ...b, expiresAt: holdExpiry(-1) })).toBe(true);
		expect(isExpiredHold({ ...b, status: 'confirmed', expiresAt: holdExpiry(-1) })).toBe(false);
		expect(isExpiredHold({ ...b, expiresAt: undefined })).toBe(false);
	});

	it('expireHolds cancels lapsed holds and releases capacity, reopening full slots', async () => {
		const { adapter, slot } = await setup({ availableSpots: 2 });
		const hold = await createBooking(adapter, slot.id, guest, 2, { holdMinutes: 30 });
		expect((await adapter.getSlotById(slot.id))!.status).toBe('full');

		// lapse the hold manually (memory adapter has no clock)
		await adapter.updateBookingStatus(hold.id, 'pending');
		const future = new Date(Date.now() + 31 * 60_000);

		const expired = await expireHolds(adapter, slot.id, future);
		expect(expired.map((b) => b.id)).toEqual([hold.id]);
		const after = (await adapter.getSlotById(slot.id))!;
		expect(after.bookedSpots).toBe(0);
		expect(after.status).toBe('open');
		expect((await adapter.getBookingById(hold.id))!.status).toBe('cancelled');
		// idempotent
		expect(await expireHolds(adapter, slot.id, future)).toEqual([]);
	});

	it('occupyingBookings counts confirmed + live holds, not cancelled/expired', async () => {
		const { adapter, slot } = await setup();
		const confirmed = await createBooking(adapter, slot.id, guest, 1);
		const hold = await createBooking(adapter, slot.id, guest, 2, { holdMinutes: 30 });
		const all = await adapter.getBookingsForSlot(slot.id);
		expect(occupyingBookings(all).reduce((s, b) => s + b.participants, 0)).toBe(3);
		const later = new Date(Date.now() + 31 * 60_000);
		expect(occupyingBookings(all, later).map((b) => b.id)).toEqual([confirmed.id]);
		void hold;
	});
});

describe('confirmBooking', () => {
	it('confirms a live hold; idempotent on already-confirmed', async () => {
		const { adapter, slot } = await setup();
		const hold = await createBooking(adapter, slot.id, guest, 2, { holdMinutes: 30 });
		const confirmed = await confirmBooking(adapter, hold.id);
		expect(confirmed.status).toBe('confirmed');
		expect((await confirmBooking(adapter, hold.id)).status).toBe('confirmed');
	});

	it('confirms an expired hold while seats remain (payment wins the race)', async () => {
		const { adapter, slot } = await setup();
		const hold = await createBooking(adapter, slot.id, guest, 2, { holdMinutes: -1 });
		const confirmed = await confirmBooking(adapter, hold.id);
		expect(confirmed.status).toBe('confirmed');
	});

	it('throws OVER_CAPACITY when an expired hold’s seats were resold', async () => {
		const { adapter, slot } = await setup({ availableSpots: 2 });
		const hold = await createBooking(adapter, slot.id, guest, 2, { holdMinutes: -1 });
		await expireHolds(adapter, slot.id); // releases the 2 seats
		await createBooking(adapter, slot.id, { name: 'Bob', email: 'bob@x.pl' }, 1);
		// hold was cancelled by expireHolds — recreate the race: pending + expired + seats partially taken
		await adapter.updateBookingStatus(hold.id, 'pending');
		await expect(confirmBooking(adapter, hold.id)).rejects.toMatchObject({
			code: 'OVER_CAPACITY',
		});
	});

	it('rejects non-pending bookings', async () => {
		const { adapter, slot } = await setup();
		const b = await createBooking(adapter, slot.id, guest, 1);
		const { id } = await adapter.updateBookingStatus(b.id, 'cancelled');
		await expect(confirmBooking(adapter, id)).rejects.toMatchObject({ code: 'NOT_PENDING' });
		await expect(confirmBooking(adapter, 'nope')).rejects.toMatchObject({
			code: 'BOOKING_NOT_FOUND',
		});
		expect(() => new BookingError('x', 'NOT_PENDING')).not.toThrow();
	});
});

describe('attendance', () => {
	it('check-in / no-show / reset on a confirmed booking', async () => {
		const { adapter, slot } = await setup();
		const b = await createBooking(adapter, slot.id, guest, 1);
		expect((await checkIn(adapter, b.id)).attendanceStatus).toBe('checked_in');
		expect((await markNoShow(adapter, b.id)).attendanceStatus).toBe('no_show');
		expect((await resetAttendance(adapter, b.id)).attendanceStatus).toBe('not_arrived');
	});

	it('rejects attendance on pending or cancelled bookings', async () => {
		const { adapter, slot } = await setup();
		const hold = await createBooking(adapter, slot.id, guest, 1, { holdMinutes: 30 });
		await expect(checkIn(adapter, hold.id)).rejects.toMatchObject({ code: 'NOT_ATTENDABLE' });
	});

	it('throws ATTENDANCE_UNSUPPORTED when the adapter lacks updateAttendance', async () => {
		const { adapter, slot } = await setup();
		const b = await createBooking(adapter, slot.id, guest, 1);
		const bare = { ...adapter, updateAttendance: undefined };
		await expect(checkIn(bare, b.id)).rejects.toMatchObject({
			code: 'ATTENDANCE_UNSUPPORTED',
		});
		expect(AttendanceError.name).toBe('AttendanceError');
	});
});

describe('tickets', () => {
	it('ticketFor builds the verify URL from the booking reference', () => {
		const t = ticketFor({ bookingReference: 'BK-ABC12345' }, 'https://example.com/');
		expect(t).toEqual({
			reference: 'BK-ABC12345',
			verifyUrl: 'https://example.com/verify/BK-ABC12345',
		});
		expect(ticketFor({ bookingReference: 'X' }, 'https://e.com', '/t').verifyUrl).toBe(
			'https://e.com/t/X',
		);
	});

	it('generateBookingReference: PREFIX-XXXXXXXX shape', () => {
		expect(generateBookingReference()).toMatch(/^BK-[A-Z0-9]{8}$/);
		expect(generateBookingReference('YG')).toMatch(/^YG-[A-Z0-9]{8}$/);
	});
});
