import { describe, it, expect } from 'vitest';
import { createBooking, cancelBooking, BookingError } from './booking.js';
import { createMemoryAdapter } from '../adapters/memory.js';
import type { Offering, Slot } from './types.js';

// ─── Helpers ────────────────────────────────────────────

function makeTour(overrides: Partial<Offering> = {}): Omit<Offering, 'id'> {
	return {
		name: 'City Walk',
		description: 'A walking offering of the city.',
		duration: 120,
		capacity: 10,
		minCapacity: 2,
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
				{ hoursBeforeTour: 24, refundPercentage: 100, description: 'Full refund if 24h before' },
				{ hoursBeforeTour: 0, refundPercentage: 0, description: 'No refund' },
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
		endTime: new Date('2030-06-01T12:00:00Z'),
		availableSpots: 10,
		bookedSpots: 0,
		status: 'open',
		isGenerated: false,
		...overrides,
	};
}

const guest = { name: 'Alice', email: 'alice@example.com' };

// ─── createBooking — happy path ──────────────────────────

describe('createBooking — happy path', () => {
	it('creates a booking on an open slot', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id));

		const booking = await createBooking(adapter, slot.id, guest, 2);

		expect(booking.id).toBeTruthy();
		expect(booking.bookingReference).toMatch(/^BK-[A-Z0-9]{8}$/);
		expect(booking.offeringId).toBe(offering.id);
		expect(booking.slotId).toBe(slot.id);
		expect(booking.guest).toEqual(guest);
		expect(booking.participants).toBe(2);
		expect(booking.status).toBe('confirmed');
		expect(booking.paymentStatus).toBe('pending');
		expect(booking.attendanceStatus).toBe('not_arrived');
	});

	it('sets totalAmount and currency from pricing engine', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id));

		const booking = await createBooking(adapter, slot.id, guest, 3);

		// 3 × 50 PLN base = 150, plus Stripe fee
		expect(booking.totalAmount).toBeGreaterThan(0);
		expect(booking.currency).toBe('PLN');
		expect(booking.priceBreakdown.basePrice).toBe(150);
	});

	it('slot transitions to full when capacity is reached', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id, { availableSpots: 2 }));

		await createBooking(adapter, slot.id, guest, 2);

		const updatedSlot = await adapter.getSlotById(slot.id);
		expect(updatedSlot?.status).toBe('full');
		expect(updatedSlot?.bookedSpots).toBe(2);
	});

	it('slot remains open when not at full capacity after booking', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id, { availableSpots: 5 }));

		await createBooking(adapter, slot.id, guest, 2);

		const updatedSlot = await adapter.getSlotById(slot.id);
		expect(updatedSlot?.status).toBe('open');
		expect(updatedSlot?.bookedSpots).toBe(2);
	});

	it('passes optional fields through to the booking', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id));

		const booking = await createBooking(adapter, slot.id, guest, 1, {
			specialRequests: 'Vegetarian lunch',
		});

		expect(booking.specialRequests).toBe('Vegetarian lunch');
	});
});

// ─── createBooking — error cases ─────────────────────────

describe('createBooking — error cases', () => {
	it('throws BookingError(SLOT_NOT_FOUND) for unknown slotId', async () => {
		const adapter = createMemoryAdapter();

		await expect(createBooking(adapter, 'nonexistent', guest, 1)).rejects.toMatchObject({
			name: 'BookingError',
			code: 'SLOT_NOT_FOUND',
		});
	});

	it('throws BookingError(TOUR_NOT_FOUND) when offering is missing', async () => {
		const adapter = createMemoryAdapter();
		// Create a slot without a corresponding offering
		const slot = await adapter.createSlot(makeSlot('nonexistent-offering'));

		await expect(createBooking(adapter, slot.id, guest, 1)).rejects.toMatchObject({
			name: 'BookingError',
			code: 'TOUR_NOT_FOUND',
		});
	});

	it('throws BookingError(SLOT_NOT_OPEN) when slot is cancelled', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id, { status: 'cancelled' }));

		await expect(createBooking(adapter, slot.id, guest, 1)).rejects.toMatchObject({
			name: 'BookingError',
			code: 'SLOT_NOT_OPEN',
		});
	});

	it('throws BookingError(SLOT_NOT_OPEN) when slot is full', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(
			makeSlot(offering.id, { status: 'full', availableSpots: 3, bookedSpots: 3 }),
		);

		await expect(createBooking(adapter, slot.id, guest, 1)).rejects.toMatchObject({
			name: 'BookingError',
			code: 'SLOT_NOT_OPEN',
		});
	});

	it('throws BookingError(SLOT_NOT_OPEN) when slot is completed', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id, { status: 'completed' }));

		await expect(createBooking(adapter, slot.id, guest, 1)).rejects.toMatchObject({
			name: 'BookingError',
			code: 'SLOT_NOT_OPEN',
		});
	});

	it('throws BookingError(SLOT_NOT_OPEN) when slot is at_risk', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id, { status: 'at_risk' }));

		await expect(createBooking(adapter, slot.id, guest, 1)).rejects.toMatchObject({
			name: 'BookingError',
			code: 'SLOT_NOT_OPEN',
		});
	});

	it('throws BookingError(INVALID_PARTICIPANTS) when participants is 0', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id));

		await expect(createBooking(adapter, slot.id, guest, 0)).rejects.toMatchObject({
			name: 'BookingError',
			code: 'INVALID_PARTICIPANTS',
		});
	});

	it('throws BookingError(INVALID_PARTICIPANTS) when participants is negative', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id));

		await expect(createBooking(adapter, slot.id, guest, -1)).rejects.toMatchObject({
			name: 'BookingError',
			code: 'INVALID_PARTICIPANTS',
		});
	});

	it('throws BookingError(OVER_CAPACITY) when requesting more than available', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(
			makeSlot(offering.id, { availableSpots: 3, bookedSpots: 2 }),
		);

		await expect(createBooking(adapter, slot.id, guest, 2)).rejects.toMatchObject({
			name: 'BookingError',
			code: 'OVER_CAPACITY',
		});
	});
});

// ─── cancelBooking — slot transition ─────────────────────

describe('cancelBooking — slot transitions', () => {
	it('slot transitions from full back to open after cancellation', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id, { availableSpots: 2 }));

		// Fill the slot
		const booking = await createBooking(adapter, slot.id, guest, 2);
		const filledSlot = await adapter.getSlotById(slot.id);
		expect(filledSlot?.status).toBe('full');

		// Cancel the booking
		await cancelBooking(adapter, booking.id, 'guest');

		const reopenedSlot = await adapter.getSlotById(slot.id);
		expect(reopenedSlot?.status).toBe('open');
	});

	it('booking status is set to cancelled', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id));

		const booking = await createBooking(adapter, slot.id, guest, 1);
		const { booking: cancelled } = await cancelBooking(adapter, booking.id, 'guest');

		expect(cancelled.status).toBe('cancelled');
		expect(cancelled.cancelledBy).toBe('guest');
	});

	it('cancellation reason is stored when provided', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id));

		const booking = await createBooking(adapter, slot.id, guest, 1);
		const { booking: cancelled } = await cancelBooking(
			adapter,
			booking.id,
			'guest',
			'Change of plans',
		);

		expect(cancelled.cancellationReason).toBe('Change of plans');
	});

	it('slot stays full when another booking remains after partial cancellation', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		// 2 spots, book with 2 separate guests of 1 each
		const slot = await adapter.createSlot(makeSlot(offering.id, { availableSpots: 2 }));

		const guest2 = { name: 'Bob', email: 'bob@example.com' };
		// First booking fills 1 spot
		const b1 = await createBooking(adapter, slot.id, guest, 1);
		// Second booking fills the last spot
		const b2 = await createBooking(adapter, slot.id, guest2, 1);

		// Slot should now be full
		const fullSlot = await adapter.getSlotById(slot.id);
		expect(fullSlot?.status).toBe('full');

		// Cancel only the first booking
		await cancelBooking(adapter, b1.id, 'guest');

		// Slot should reopen (1 spot still available)
		const afterSlot = await adapter.getSlotById(slot.id);
		expect(afterSlot?.status).toBe('open');

		// b2 is still confirmed
		const remaining = await adapter.getBookingById(b2.id);
		expect(remaining?.status).toBe('confirmed');
	});
});

// ─── cancelBooking — refund amounts ──────────────────────

describe('cancelBooking — refund calculation', () => {
	it('guide cancellation always results in 100% refund', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		// Slot starts in 1 hour (normally within no-refund window for guest)
		const slot = await adapter.createSlot(
			makeSlot(offering.id, {
				startTime: new Date(Date.now() + 1 * 60 * 60 * 1000),
				endTime: new Date(Date.now() + 3 * 60 * 60 * 1000),
			}),
		);

		const booking = await createBooking(adapter, slot.id, guest, 2);
		const { refundAmount } = await cancelBooking(adapter, booking.id, 'guide');

		expect(refundAmount).toBe(booking.totalAmount);
	});

	it('guest cancellation far in advance gives full refund (flexible policy)', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour()); // uses flexible policy
		// Slot starts 48h from now
		const slot = await adapter.createSlot(
			makeSlot(offering.id, {
				startTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
				endTime: new Date(Date.now() + 50 * 60 * 60 * 1000),
			}),
		);

		const booking = await createBooking(adapter, slot.id, guest, 1);
		const { refundAmount } = await cancelBooking(adapter, booking.id, 'guest');

		expect(refundAmount).toBe(booking.totalAmount);
	});

	it('guest cancellation at last minute gives zero refund (flexible policy)', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour()); // uses flexible policy
		// Slot starts 1 hour from now (within 24h no-refund window)
		const slot = await adapter.createSlot(
			makeSlot(offering.id, {
				startTime: new Date(Date.now() + 1 * 60 * 60 * 1000),
				endTime: new Date(Date.now() + 3 * 60 * 60 * 1000),
			}),
		);

		const booking = await createBooking(adapter, slot.id, guest, 1);
		const { refundAmount } = await cancelBooking(adapter, booking.id, 'guest');

		expect(refundAmount).toBe(0);
	});

	it('system cancellation far in advance gives full refund', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(
			makeSlot(offering.id, {
				startTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
				endTime: new Date(Date.now() + 50 * 60 * 60 * 1000),
			}),
		);

		const booking = await createBooking(adapter, slot.id, guest, 1);
		const { refundAmount } = await cancelBooking(adapter, booking.id, 'system');

		expect(refundAmount).toBe(booking.totalAmount);
	});
});

// ─── cancelBooking — error cases ─────────────────────────

describe('cancelBooking — error cases', () => {
	it('throws when booking is not found', async () => {
		const adapter = createMemoryAdapter();

		await expect(cancelBooking(adapter, 'nonexistent', 'guest')).rejects.toThrow();
	});
});

// ─── BookingError class ───────────────────────────────────

describe('BookingError', () => {
	it('has name "BookingError"', () => {
		const err = new BookingError('test', 'SLOT_NOT_FOUND');
		expect(err.name).toBe('BookingError');
	});

	it('carries the error code', () => {
		const codes = [
			'SLOT_NOT_FOUND',
			'TOUR_NOT_FOUND',
			'SLOT_NOT_OPEN',
			'OVER_CAPACITY',
			'INVALID_PARTICIPANTS',
		] as const;
		for (const code of codes) {
			const err = new BookingError('msg', code);
			expect(err.code).toBe(code);
		}
	});

	it('extends Error', () => {
		const err = new BookingError('test', 'OVER_CAPACITY');
		expect(err).toBeInstanceOf(Error);
	});

	it('message is set correctly', () => {
		const err = new BookingError('slot is gone', 'SLOT_NOT_FOUND');
		expect(err.message).toBe('slot is gone');
	});
});
