/**
 * Booking state machine — all booking lifecycle transitions.
 *
 * Pure orchestration layer: validates, prices, delegates persistence to adapter.
 * No DB, no Stripe, no SvelteKit imports.
 *
 * State machine reference: see AGENTS.md "Slot State Machine".
 */

import type { SchedulerAdapter } from '../adapters/types.js';
import type { Booking, GuestProfile } from './types.js';
import { calculatePrice } from './pricing/index.js';
import { calculateRefund } from './policy.js';
import { holdExpiry, isExpiredHold, occupyingBookings, recountSlotCapacity } from './holds.js';

// ─── Error ───────────────────────────────────────────────

export class BookingError extends Error {
	constructor(
		message: string,
		public readonly code:
			| 'SLOT_NOT_FOUND'
			| 'TOUR_NOT_FOUND'
			| 'SLOT_NOT_OPEN'
			| 'OVER_CAPACITY'
			| 'INVALID_PARTICIPANTS'
			| 'BOOKING_NOT_FOUND'
			| 'NOT_PENDING',
	) {
		super(message);
		this.name = 'BookingError';
	}
}

// ─── createBooking ───────────────────────────────────────

/**
 * Create a booking for an open slot.
 *
 * Steps:
 * 1. Load slot — throw BookingError('SLOT_NOT_FOUND') if missing
 * 2. Load offering — throw BookingError('TOUR_NOT_FOUND') if missing
 * 3. Validate slot is open — throw BookingError('SLOT_NOT_OPEN') otherwise
 * 4. Validate participants > 0 and within remaining capacity
 * 5. Calculate price via pricing engine
 * 6. Persist via adapter.createBooking with status 'confirmed'
 */
export async function createBooking(
	adapter: SchedulerAdapter,
	slotId: string,
	guest: GuestProfile,
	participants: number,
	options?: {
		participantsByCategory?: Record<string, number>;
		selectedAddonIds?: string[];
		specialRequests?: string;
		/**
		 * Create as a 'pending' hold that expires after this many minutes
		 * unless confirmed (see confirmBooking). Default: immediate 'confirmed'
		 * booking with no expiry — the pre-payments behaviour.
		 */
		holdMinutes?: number;
	},
): Promise<Booking> {
	// Step 1: load slot
	const slot = await adapter.getSlotById(slotId);
	if (!slot) {
		throw new BookingError(`Slot not found: ${slotId}`, 'SLOT_NOT_FOUND');
	}

	// Step 2: load offering
	const offering = await adapter.getOfferingById(slot.offeringId);
	if (!offering) {
		throw new BookingError(`Offering not found: ${slot.offeringId}`, 'TOUR_NOT_FOUND');
	}

	// Step 3: slot must be open
	if (slot.status !== 'open') {
		throw new BookingError(
			`Slot is not open for booking (status: ${slot.status})`,
			'SLOT_NOT_OPEN',
		);
	}

	// Step 4: validate participants
	if (participants <= 0) {
		throw new BookingError('Participants must be greater than 0', 'INVALID_PARTICIPANTS');
	}
	const remaining = slot.availableSpots - slot.bookedSpots;
	if (participants > remaining) {
		throw new BookingError(
			`Not enough capacity: ${remaining} spot(s) available, ${participants} requested`,
			'OVER_CAPACITY',
		);
	}

	// Step 5: calculate price
	const priceBreakdown = calculatePrice({
		pricing: offering.pricing,
		participants,
		participantsByCategory: options?.participantsByCategory,
		selectedAddonIds: options?.selectedAddonIds,
	});

	// Step 6: persist booking
	const booking = await adapter.createBooking({
		offeringId: offering.id,
		slotId,
		guest,
		participants,
		...(options?.participantsByCategory !== undefined
			? { participantsByCategory: options.participantsByCategory }
			: {}),
		...(options?.selectedAddonIds !== undefined
			? { selectedAddonIds: options.selectedAddonIds }
			: {}),
		...(options?.specialRequests !== undefined
			? { specialRequests: options.specialRequests }
			: {}),
		priceBreakdown,
		totalAmount: priceBreakdown.totalAmount,
		currency: offering.pricing.currency,
		status: options?.holdMinutes ? 'pending' : 'confirmed',
		...(options?.holdMinutes ? { expiresAt: holdExpiry(options.holdMinutes) } : {}),
		paymentStatus: 'pending',
		attendanceStatus: 'not_arrived',
	});

	return booking;
}

// ─── confirmBooking ──────────────────────────────────────

/**
 * Confirm a 'pending' hold — typically because its payment settled.
 *
 * A hold that expired is still confirmable as long as the seats are free
 * (payment races the expiry sweep; the paying guest wins when possible),
 * but throws OVER_CAPACITY if the seats have since been taken.
 */
export async function confirmBooking(
	adapter: SchedulerAdapter,
	bookingId: string,
): Promise<Booking> {
	const booking = await adapter.getBookingById(bookingId);
	if (!booking) {
		throw new BookingError(`Booking not found: ${bookingId}`, 'BOOKING_NOT_FOUND');
	}
	if (booking.status === 'confirmed') return booking; // idempotent
	if (booking.status !== 'pending') {
		throw new BookingError(
			`Booking is ${booking.status} — only pending bookings can be confirmed`,
			'NOT_PENDING',
		);
	}

	if (isExpiredHold(booking)) {
		// Expired: the seats may have been resold. Re-validate against the
		// bookings that currently occupy capacity (excluding this one).
		const slot = await adapter.getSlotById(booking.slotId);
		if (!slot) throw new BookingError(`Slot not found: ${booking.slotId}`, 'SLOT_NOT_FOUND');
		const others = (await adapter.getBookingsForSlot(slot.id)).filter((b) => b.id !== booking.id);
		const occupied = occupyingBookings(others).reduce((sum, b) => sum + b.participants, 0);
		if (occupied + booking.participants > slot.availableSpots) {
			throw new BookingError(
				`Hold expired and seats were resold: ${slot.availableSpots - occupied} left, ${booking.participants} needed`,
				'OVER_CAPACITY',
			);
		}
		const confirmed = await adapter.updateBookingStatus(bookingId, 'confirmed');
		await recountSlotCapacity(adapter, slot);
		return confirmed;
	}

	return adapter.updateBookingStatus(bookingId, 'confirmed');
}

// ─── cancelBooking ───────────────────────────────────────

/**
 * Cancel a booking and calculate the refund.
 *
 * Steps:
 * 1. Load booking — throw if not found
 * 2. Load slot — throw BookingError('SLOT_NOT_FOUND') if missing
 * 3. Load offering — throw BookingError('TOUR_NOT_FOUND') if missing
 * 4. Calculate refund via policy module
 * 5. Update booking status to 'cancelled'
 * 6. If slot was full, count remaining confirmed bookings;
 *    if bookedSpots < availableSpots, reopen slot to 'open'
 * 7. Return updated booking and refund amount
 *
 * Non-negotiable: cancelledBy === 'guide' → 100% refund always.
 */
export async function cancelBooking(
	adapter: SchedulerAdapter,
	bookingId: string,
	cancelledBy: 'guest' | 'guide' | 'system',
	reason?: string,
): Promise<{ booking: Booking; refundAmount: number }> {
	// Step 1: load booking
	const booking = await adapter.getBookingById(bookingId);
	if (!booking) {
		throw new Error(`Booking not found: ${bookingId}`);
	}

	// Step 2: load slot
	const slot = await adapter.getSlotById(booking.slotId);
	if (!slot) {
		throw new BookingError(`Slot not found: ${booking.slotId}`, 'SLOT_NOT_FOUND');
	}

	// Step 3: load offering
	const offering = await adapter.getOfferingById(booking.offeringId);
	if (!offering) {
		throw new BookingError(`Offering not found: ${booking.offeringId}`, 'TOUR_NOT_FOUND');
	}

	// Step 4: calculate refund (guide cancellation = 100% always)
	const { refundAmount } = calculateRefund(
		booking.totalAmount,
		offering.cancellationPolicy,
		slot.startTime,
		cancelledBy,
	);

	// Step 5: update booking status
	const updatedBooking = await adapter.updateBookingStatus(bookingId, 'cancelled', {
		cancelledBy,
		cancellationReason: reason,
	});

	// Step 6: release capacity. Adapters' updateBookingStatus doesn't touch
	// bookedSpots; recount from the bookings that still occupy seats
	// (confirmed + live pending holds) and reopen the slot if seats came free.
	await recountSlotCapacity(adapter, slot);

	return { booking: updatedBooking, refundAmount };
}
