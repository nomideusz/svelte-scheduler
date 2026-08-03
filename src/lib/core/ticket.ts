/**
 * Ticket primitive — the contract between a booking and its scannable proof.
 *
 * A ticket is just the booking reference plus the URL a QR code points at;
 * rendering the QR itself belongs to the app (e.g. @nomideusz/svelte-qr).
 */

import type { Booking } from './types.js';

export interface Ticket {
	/** Human-readable booking reference, e.g. BK-7F3K9QAZ. */
	reference: string;
	/** Absolute URL the QR code encodes — resolves to the verify/check-in page. */
	verifyUrl: string;
}

export function ticketFor(
	booking: Pick<Booking, 'bookingReference'>,
	baseUrl: string,
	verifyPath = '/verify',
): Ticket {
	const base = baseUrl.replace(/\/$/, '');
	return {
		reference: booking.bookingReference,
		verifyUrl: `${base}${verifyPath}/${encodeURIComponent(booking.bookingReference)}`,
	};
}

/** Canonical booking reference: BK- + 8 unambiguous uppercase alphanumerics. */
export function generateBookingReference(prefix = 'BK'): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	const bytes = new Uint8Array(8);
	crypto.getRandomValues(bytes);
	let result = `${prefix}-`;
	for (let i = 0; i < 8; i++) {
		result += chars[bytes[i] % chars.length];
	}
	return result;
}
