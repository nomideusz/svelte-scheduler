/**
 * In-memory SchedulerAdapter — for testing and demos.
 *
 * All data lives in Maps keyed by ID. No external dependencies.
 * Use `createMemoryAdapter(seed?)` to get a fresh adapter instance.
 */
import type { DateRange } from '@nomideusz/svelte-calendar';
import type { Offering, Slot, Booking, BookingStatus, AttendanceStatus } from '../core/types.js';
import type { SchedulerAdapter } from './types.js';
import { generateBookingReference } from '../core/ticket.js';

// ─── Seed data shape ─────────────────────────────────────

export interface MemoryAdapterSeed {
	offerings?: Offering[];
	slots?: Slot[];
	bookings?: Booking[];
}

// ─── Factory ─────────────────────────────────────────────

export function createMemoryAdapter(seed?: MemoryAdapterSeed): SchedulerAdapter {
	const offerings = new Map<string, Offering>();
	const slots = new Map<string, Slot>();
	const bookings = new Map<string, Booking>();

	// Populate from seed
	if (seed?.offerings) {
		for (const offering of seed.offerings) offerings.set(offering.id, { ...offering });
	}
	if (seed?.slots) {
		for (const slot of seed.slots) slots.set(slot.id, { ...slot });
	}
	if (seed?.bookings) {
		for (const booking of seed.bookings) bookings.set(booking.id, { ...booking });
	}

	// ─── Offering CRUD ───────────────────────────────────────

	async function getOfferings(filter?: { status?: 'active' | 'draft' }): Promise<Offering[]> {
		const all = Array.from(offerings.values());
		if (filter?.status) {
			return all.filter((t) => t.status === filter.status);
		}
		return all;
	}

	async function getOfferingById(id: string): Promise<Offering | undefined> {
		return offerings.get(id);
	}

	async function createOffering(offering: Omit<Offering, 'id'>): Promise<Offering> {
		const id = crypto.randomUUID();
		const newTour: Offering = { ...offering, id };
		offerings.set(id, newTour);
		return newTour;
	}

	async function updateOffering(id: string, patch: Partial<Offering>): Promise<Offering> {
		const existing = offerings.get(id);
		if (!existing) throw new Error(`Offering not found: ${id}`);
		const updated: Offering = { ...existing, ...patch, id };
		offerings.set(id, updated);
		return updated;
	}

	async function deleteOffering(id: string): Promise<void> {
		offerings.delete(id);
		// Cascade: delete all slots for this offering
		const slotIds: string[] = [];
		for (const [slotId, slot] of slots) {
			if (slot.offeringId === id) slotIds.push(slotId);
		}
		for (const slotId of slotIds) {
			slots.delete(slotId);
			// Cascade: delete all bookings for each slot
			for (const [bookingId, booking] of bookings) {
				if (booking.slotId === slotId) bookings.delete(bookingId);
			}
		}
	}

	// ─── Slot management ─────────────────────────────────

	async function getSlots(offeringId: string, range: DateRange): Promise<Slot[]> {
		return Array.from(slots.values()).filter(
			(s) =>
				s.offeringId === offeringId &&
				s.startTime >= range.start &&
				s.startTime <= range.end,
		);
	}

	async function getSlotById(id: string): Promise<Slot | undefined> {
		return slots.get(id);
	}

	async function createSlot(slot: Omit<Slot, 'id'>): Promise<Slot> {
		const id = crypto.randomUUID();
		const newSlot: Slot = { ...slot, id };
		slots.set(id, newSlot);
		return newSlot;
	}

	async function updateSlot(id: string, patch: Partial<Slot>): Promise<Slot> {
		const existing = slots.get(id);
		if (!existing) throw new Error(`Slot not found: ${id}`);
		const updated: Slot = { ...existing, ...patch, id };
		slots.set(id, updated);
		return updated;
	}

	async function cancelSlot(id: string, cancelledBy: 'guide' | 'system'): Promise<Slot> {
		const existing = slots.get(id);
		if (!existing) throw new Error(`Slot not found: ${id}`);
		const cancelled: Slot = { ...existing, id, status: 'cancelled' };
		slots.set(id, cancelled);
		// Cascade: cancel all confirmed bookings for this slot
		for (const [bookingId, booking] of bookings) {
			if (booking.slotId === id && booking.status === 'confirmed') {
				bookings.set(bookingId, {
					...booking,
					status: 'cancelled',
					cancelledBy,
					cancellationReason: `Slot cancelled by ${cancelledBy}`,
				});
			}
		}
		return cancelled;
	}

	// ─── Booking lifecycle ───────────────────────────────

	async function getBookingsForSlot(slotId: string): Promise<Booking[]> {
		return Array.from(bookings.values()).filter((b) => b.slotId === slotId);
	}

	async function getBookingsForOffering(offeringId: string, range?: DateRange): Promise<Booking[]> {
		return Array.from(bookings.values()).filter((b) => {
			if (b.offeringId !== offeringId) return false;
			if (!range) return true;
			const slot = slots.get(b.slotId);
			if (!slot) return true;
			return slot.startTime >= range.start && slot.startTime <= range.end;
		});
	}

	async function getBookingById(id: string): Promise<Booking | undefined> {
		return bookings.get(id);
	}

	async function getBookingByReference(reference: string): Promise<Booking | undefined> {
		for (const booking of bookings.values()) {
			if (booking.bookingReference === reference) return booking;
		}
		return undefined;
	}

	async function createBooking(
		booking: Omit<Booking, 'id' | 'bookingReference' | 'createdAt'>,
	): Promise<Booking> {
		const id = crypto.randomUUID();
		const bookingReference = generateBookingReference();
		const createdAt = new Date().toISOString();
		const newBooking: Booking = { ...booking, id, bookingReference, createdAt };
		bookings.set(id, newBooking);

		// Update slot: increment bookedSpots, transition to 'full' if needed
		const slot = slots.get(booking.slotId);
		if (slot) {
			const bookedSpots = slot.bookedSpots + booking.participants;
			const status =
				slot.status !== 'cancelled' && slot.status !== 'completed' && bookedSpots >= slot.availableSpots
					? 'full'
					: slot.status;
			slots.set(slot.id, { ...slot, bookedSpots, status });
		}

		return newBooking;
	}

	async function updateBookingStatus(
		id: string,
		status: BookingStatus,
		metadata?: { cancelledBy?: 'guest' | 'guide' | 'system'; cancellationReason?: string },
	): Promise<Booking> {
		const existing = bookings.get(id);
		if (!existing) throw new Error(`Booking not found: ${id}`);
		const updated: Booking = {
			...existing,
			status,
			...(metadata?.cancelledBy !== undefined ? { cancelledBy: metadata.cancelledBy } : {}),
			...(metadata?.cancellationReason !== undefined
				? { cancellationReason: metadata.cancellationReason }
				: {}),
		};
		bookings.set(id, updated);
		return updated;
	}

	async function updateAttendance(id: string, attendanceStatus: AttendanceStatus): Promise<Booking> {
		const existing = bookings.get(id);
		if (!existing) throw new Error(`Booking not found: ${id}`);
		const updated: Booking = { ...existing, attendanceStatus };
		bookings.set(id, updated);
		return updated;
	}

	return {
		getOfferings,
		getOfferingById,
		createOffering,
		updateOffering,
		deleteOffering,
		getSlots,
		getSlotById,
		createSlot,
		updateSlot,
		cancelSlot,
		getBookingsForSlot,
		getBookingsForOffering,
		getBookingById,
		getBookingByReference,
		createBooking,
		updateBookingStatus,
		updateAttendance,
	};
}
