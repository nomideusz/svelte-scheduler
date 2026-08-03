/**
 * Capacity holds — a 'pending' booking reserves seats for a limited time
 * (typically while the guest pays). Expired holds release their capacity.
 *
 * Pure orchestration: no timers here. Callers run expireHolds() at read
 * time (before availability checks) or from a sweep job — same idempotent
 * result either way.
 */

import type { SchedulerAdapter } from '../adapters/types.js';
import type { Booking, Slot } from './types.js';

/** Default hold duration; covers a payment round-trip with slack. */
export const DEFAULT_HOLD_MINUTES = 30;

export function holdExpiry(minutes = DEFAULT_HOLD_MINUTES, now = new Date()): string {
	return new Date(now.getTime() + minutes * 60_000).toISOString();
}

/** A pending booking whose hold has lapsed. No expiresAt = never expires. */
export function isExpiredHold(booking: Booking, now = new Date()): boolean {
	return (
		booking.status === 'pending' &&
		booking.expiresAt !== undefined &&
		new Date(booking.expiresAt).getTime() <= now.getTime()
	);
}

/** Bookings that currently occupy capacity: confirmed, or pending with a live hold. */
export function occupyingBookings(bookings: Booking[], now = new Date()): Booking[] {
	return bookings.filter(
		(b) => b.status === 'confirmed' || (b.status === 'pending' && !isExpiredHold(b, now)),
	);
}

/**
 * Recount a slot's bookedSpots from its occupying bookings and persist the
 * result, reopening a 'full' slot when seats came free. Returns the updated
 * slot (or the input slot when nothing changed).
 */
export async function recountSlotCapacity(
	adapter: SchedulerAdapter,
	slot: Slot,
	now = new Date(),
): Promise<Slot> {
	const bookings = await adapter.getBookingsForSlot(slot.id);
	const bookedSpots = occupyingBookings(bookings, now).reduce((sum, b) => sum + b.participants, 0);
	const status =
		slot.status === 'full' && bookedSpots < slot.availableSpots ? ('open' as const) : undefined;
	if (bookedSpots === slot.bookedSpots && !status) return slot;
	return adapter.updateSlot(slot.id, { bookedSpots, ...(status ? { status } : {}) });
}

/**
 * Cancel every expired hold on a slot and release its capacity.
 * Idempotent. Returns the bookings that were expired by this call.
 */
export async function expireHolds(
	adapter: SchedulerAdapter,
	slotId: string,
	now = new Date(),
): Promise<Booking[]> {
	const slot = await adapter.getSlotById(slotId);
	if (!slot) return [];

	const bookings = await adapter.getBookingsForSlot(slotId);
	const expired = bookings.filter((b) => isExpiredHold(b, now));
	for (const b of expired) {
		await adapter.updateBookingStatus(b.id, 'cancelled', {
			cancelledBy: 'system',
			cancellationReason: 'hold_expired',
		});
	}
	if (expired.length > 0) await recountSlotCapacity(adapter, slot, now);
	return expired;
}
