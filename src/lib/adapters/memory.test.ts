import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from './memory.js';
import type { Offering, Slot, Booking } from '../core/types.js';

// ─── Helpers ──────────────────────────────────────────────

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
			id: 'cp1',
			name: 'Standard',
			description: 'Standard cancellation policy.',
			rules: [{ hoursBeforeTour: 24, refundPercentage: 100, description: 'Full refund if 24h before' }],
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
		availableSpots: 5,
		bookedSpots: 0,
		status: 'open',
		isGenerated: false,
		...overrides,
	};
}

function makeBooking(offeringId: string, slotId: string, overrides: Partial<Booking> = {}): Omit<Booking, 'id' | 'bookingReference' | 'createdAt'> {
	return {
		offeringId,
		slotId,
		guest: { name: 'Alice', email: 'alice@example.com' },
		participants: 1,
		priceBreakdown: {
			basePrice: 50,
			groupDiscount: 0,
			discountedBase: 50,
			addonsTotal: 0,
			subtotal: 50,
			processingFee: 0,
			totalAmount: 50,
			guideReceives: 50,
			guidePaysProcessingFee: false,
			errors: [],
		},
		totalAmount: 50,
		currency: 'PLN',
		status: 'confirmed',
		paymentStatus: 'paid',
		attendanceStatus: 'not_arrived',
		...overrides,
	};
}

// ─── Offering CRUD ────────────────────────────────────────────

describe('createMemoryAdapter — offering CRUD', () => {
	it('creates a offering and assigns an ID', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		expect(offering.id).toBeTruthy();
		expect(offering.name).toBe('City Walk');
	});

	it('getOfferings returns all offerings', async () => {
		const adapter = createMemoryAdapter();
		await adapter.createOffering(makeTour({ name: 'Walk A' }));
		await adapter.createOffering(makeTour({ name: 'Walk B', status: 'draft' }));
		const all = await adapter.getOfferings();
		expect(all).toHaveLength(2);
	});

	it('getOfferings filters by status', async () => {
		const adapter = createMemoryAdapter();
		await adapter.createOffering(makeTour({ name: 'Active', status: 'active' }));
		await adapter.createOffering(makeTour({ name: 'Draft', status: 'draft' }));
		const active = await adapter.getOfferings({ status: 'active' });
		expect(active).toHaveLength(1);
		expect(active[0].name).toBe('Active');
	});

	it('getOfferingById returns the correct offering', async () => {
		const adapter = createMemoryAdapter();
		const created = await adapter.createOffering(makeTour());
		const found = await adapter.getOfferingById(created.id);
		expect(found).toEqual(created);
	});

	it('getOfferingById returns undefined for unknown ID', async () => {
		const adapter = createMemoryAdapter();
		const found = await adapter.getOfferingById('nonexistent');
		expect(found).toBeUndefined();
	});

	it('updateOffering applies a patch', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const updated = await adapter.updateOffering(offering.id, { name: 'Updated Walk' });
		expect(updated.name).toBe('Updated Walk');
		expect(updated.id).toBe(offering.id);
	});

	it('updateOffering throws for unknown ID', async () => {
		const adapter = createMemoryAdapter();
		await expect(adapter.updateOffering('bad-id', { name: 'X' })).rejects.toThrow('Offering not found');
	});

	it('deleteOffering removes the offering', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		await adapter.deleteOffering(offering.id);
		expect(await adapter.getOfferingById(offering.id)).toBeUndefined();
	});

	it('deleteOffering cascades to slots and bookings', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id));
		await adapter.createBooking(makeBooking(offering.id, slot.id));

		await adapter.deleteOffering(offering.id);

		expect(await adapter.getSlotById(slot.id)).toBeUndefined();
		expect(await adapter.getBookingsForSlot(slot.id)).toHaveLength(0);
	});
});

// ─── Slot management ──────────────────────────────────────

describe('createMemoryAdapter — slot management', () => {
	it('creates a slot and assigns an ID', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id));
		expect(slot.id).toBeTruthy();
		expect(slot.offeringId).toBe(offering.id);
	});

	it('getSlots returns slots within the date range', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const inside = await adapter.createSlot(
			makeSlot(offering.id, { startTime: new Date('2030-06-15T10:00:00Z'), endTime: new Date('2030-06-15T12:00:00Z') }),
		);
		await adapter.createSlot(
			makeSlot(offering.id, { startTime: new Date('2030-07-01T10:00:00Z'), endTime: new Date('2030-07-01T12:00:00Z') }),
		);

		const slots = await adapter.getSlots(offering.id, {
			start: new Date('2030-06-01T00:00:00Z'),
			end: new Date('2030-06-30T23:59:59Z'),
		});
		expect(slots).toHaveLength(1);
		expect(slots[0].id).toBe(inside.id);
	});

	it('getSlots filters by offeringId', async () => {
		const adapter = createMemoryAdapter();
		const tourA = await adapter.createOffering(makeTour({ name: 'A' }));
		const tourB = await adapter.createOffering(makeTour({ name: 'B' }));
		await adapter.createSlot(makeSlot(tourA.id));
		await adapter.createSlot(makeSlot(tourB.id));

		const range = { start: new Date('2020-01-01'), end: new Date('2040-01-01') };
		const aSlots = await adapter.getSlots(tourA.id, range);
		expect(aSlots).toHaveLength(1);
		expect(aSlots[0].offeringId).toBe(tourA.id);
	});

	it('getSlotById returns undefined for unknown ID', async () => {
		const adapter = createMemoryAdapter();
		expect(await adapter.getSlotById('x')).toBeUndefined();
	});

	it('updateSlot applies a patch', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id));
		const updated = await adapter.updateSlot(slot.id, { notes: 'Rain gear required' });
		expect(updated.notes).toBe('Rain gear required');
		expect(updated.id).toBe(slot.id);
	});

	it('updateSlot throws for unknown ID', async () => {
		const adapter = createMemoryAdapter();
		await expect(adapter.updateSlot('bad-id', {})).rejects.toThrow('Slot not found');
	});

	it('cancelSlot sets status to cancelled', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id));
		const cancelled = await adapter.cancelSlot(slot.id, 'guide');
		expect(cancelled.status).toBe('cancelled');
	});

	it('cancelSlot throws for unknown ID', async () => {
		const adapter = createMemoryAdapter();
		await expect(adapter.cancelSlot('bad-id', 'system')).rejects.toThrow('Slot not found');
	});

	it('cancelSlot cascades to confirmed bookings', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id));
		const booking = await adapter.createBooking(makeBooking(offering.id, slot.id, { status: 'confirmed' }));

		await adapter.cancelSlot(slot.id, 'guide');

		const updated = await adapter.getBookingById(booking.id);
		expect(updated?.status).toBe('cancelled');
		expect(updated?.cancelledBy).toBe('guide');
	});

	it('cancelSlot does not cascade to already-cancelled bookings', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id));
		const booking = await adapter.createBooking(makeBooking(offering.id, slot.id, { status: 'cancelled' }));

		await adapter.cancelSlot(slot.id, 'system');

		// cancelledBy should still be undefined since the booking was already cancelled
		const updated = await adapter.getBookingById(booking.id);
		expect(updated?.cancelledBy).toBeUndefined();
	});
});

// ─── Booking lifecycle ────────────────────────────────────

describe('createMemoryAdapter — booking lifecycle', () => {
	it('creates a booking with a generated ID and reference', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id));
		const booking = await adapter.createBooking(makeBooking(offering.id, slot.id));

		expect(booking.id).toBeTruthy();
		expect(booking.bookingReference).toMatch(/^BK-[A-Z0-9]{8}$/);
		expect(booking.createdAt).toBeTruthy();
	});

	it('increments bookedSpots on slot when booking is created', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id, { availableSpots: 5, bookedSpots: 0 }));

		await adapter.createBooking(makeBooking(offering.id, slot.id, { participants: 2 }));

		const updatedSlot = await adapter.getSlotById(slot.id);
		expect(updatedSlot?.bookedSpots).toBe(2);
		expect(updatedSlot?.status).toBe('open');
	});

	it('slot transitions to full when bookedSpots reaches availableSpots', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id, { availableSpots: 3, bookedSpots: 0 }));

		await adapter.createBooking(makeBooking(offering.id, slot.id, { participants: 3 }));

		const updatedSlot = await adapter.getSlotById(slot.id);
		expect(updatedSlot?.bookedSpots).toBe(3);
		expect(updatedSlot?.status).toBe('full');
	});

	it('slot transitions to full when bookedSpots exceeds availableSpots', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id, { availableSpots: 2, bookedSpots: 0 }));

		await adapter.createBooking(makeBooking(offering.id, slot.id, { participants: 3 }));

		const updatedSlot = await adapter.getSlotById(slot.id);
		expect(updatedSlot?.status).toBe('full');
	});

	it('does not change cancelled slot status when booking is created', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id, { availableSpots: 2, bookedSpots: 0, status: 'cancelled' }));

		await adapter.createBooking(makeBooking(offering.id, slot.id, { participants: 2 }));

		const updatedSlot = await adapter.getSlotById(slot.id);
		expect(updatedSlot?.status).toBe('cancelled');
	});

	it('getBookingsForSlot returns all bookings for a slot', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id, { availableSpots: 10 }));

		await adapter.createBooking(makeBooking(offering.id, slot.id));
		await adapter.createBooking(makeBooking(offering.id, slot.id));

		const result = await adapter.getBookingsForSlot(slot.id);
		expect(result).toHaveLength(2);
	});

	it('getBookingsForOffering returns all bookings across slots', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot1 = await adapter.createSlot(makeSlot(offering.id, { startTime: new Date('2030-06-01T10:00:00Z'), endTime: new Date('2030-06-01T12:00:00Z'), availableSpots: 10 }));
		const slot2 = await adapter.createSlot(makeSlot(offering.id, { startTime: new Date('2030-06-02T10:00:00Z'), endTime: new Date('2030-06-02T12:00:00Z'), availableSpots: 10 }));

		await adapter.createBooking(makeBooking(offering.id, slot1.id));
		await adapter.createBooking(makeBooking(offering.id, slot2.id));

		const result = await adapter.getBookingsForOffering(offering.id);
		expect(result).toHaveLength(2);
	});

	it('getBookingsForOffering filters by date range', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot1 = await adapter.createSlot(makeSlot(offering.id, { startTime: new Date('2030-06-01T10:00:00Z'), endTime: new Date('2030-06-01T12:00:00Z'), availableSpots: 10 }));
		const slot2 = await adapter.createSlot(makeSlot(offering.id, { startTime: new Date('2030-07-01T10:00:00Z'), endTime: new Date('2030-07-01T12:00:00Z'), availableSpots: 10 }));

		const b1 = await adapter.createBooking(makeBooking(offering.id, slot1.id));
		await adapter.createBooking(makeBooking(offering.id, slot2.id));

		const result = await adapter.getBookingsForOffering(offering.id, {
			start: new Date('2030-06-01T00:00:00Z'),
			end: new Date('2030-06-30T23:59:59Z'),
		});
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(b1.id);
	});

	it('getBookingById returns the correct booking', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id));
		const booking = await adapter.createBooking(makeBooking(offering.id, slot.id));

		const found = await adapter.getBookingById(booking.id);
		expect(found).toEqual(booking);
	});

	it('getBookingById returns undefined for unknown ID', async () => {
		const adapter = createMemoryAdapter();
		expect(await adapter.getBookingById('x')).toBeUndefined();
	});

	it('getBookingByReference finds by reference', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id));
		const booking = await adapter.createBooking(makeBooking(offering.id, slot.id));

		const found = await adapter.getBookingByReference(booking.bookingReference);
		expect(found?.id).toBe(booking.id);
	});

	it('getBookingByReference returns undefined for unknown reference', async () => {
		const adapter = createMemoryAdapter();
		expect(await adapter.getBookingByReference('BK-NOTFOUND')).toBeUndefined();
	});

	it('updateBookingStatus changes the status', async () => {
		const adapter = createMemoryAdapter();
		const offering = await adapter.createOffering(makeTour());
		const slot = await adapter.createSlot(makeSlot(offering.id));
		const booking = await adapter.createBooking(makeBooking(offering.id, slot.id));

		const updated = await adapter.updateBookingStatus(booking.id, 'cancelled', {
			cancelledBy: 'guest',
			cancellationReason: 'Change of plans',
		});

		expect(updated.status).toBe('cancelled');
		expect(updated.cancelledBy).toBe('guest');
		expect(updated.cancellationReason).toBe('Change of plans');
	});

	it('updateBookingStatus throws for unknown ID', async () => {
		const adapter = createMemoryAdapter();
		await expect(adapter.updateBookingStatus('bad-id', 'confirmed')).rejects.toThrow('Booking not found');
	});
});

// ─── Seed data ────────────────────────────────────────────

describe('createMemoryAdapter — seed data', () => {
	it('accepts pre-seeded offerings', async () => {
		const offering: Offering = {
			id: 'seed-offering-1',
			...makeTour({ name: 'Seeded Offering' }),
		};
		const adapter = createMemoryAdapter({ offerings: [offering] });
		const found = await adapter.getOfferingById('seed-offering-1');
		expect(found?.name).toBe('Seeded Offering');
	});

	it('accepts pre-seeded slots and bookings', async () => {
		const offering: Offering = { id: 'offering-1', ...makeTour() };
		const slot: Slot = { id: 'slot-1', ...makeSlot('offering-1') };
		const booking: Booking = {
			id: 'booking-1',
			bookingReference: 'BK-SEEDED01',
			createdAt: new Date().toISOString(),
			...makeBooking('offering-1', 'slot-1'),
		};

		const adapter = createMemoryAdapter({ offerings: [offering], slots: [slot], bookings: [booking] });

		expect(await adapter.getSlotById('slot-1')).toBeDefined();
		expect(await adapter.getBookingByReference('BK-SEEDED01')).toBeDefined();
	});
});
