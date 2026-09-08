/**
 * Attendance transitions — the check-in desk.
 *
 * A QR ticket resolves to a booking; staff check guests in, mark no-shows,
 * or undo either. Attendance only applies to bookings that will actually
 * happen: confirmed or completed.
 */

import type { SchedulerAdapter } from '../adapters/types.js';
import type { AttendanceStatus, Booking } from './types.js';

export class AttendanceError extends Error {
	constructor(
		message: string,
		public readonly code: 'ATTENDANCE_UNSUPPORTED' | 'BOOKING_NOT_FOUND' | 'NOT_ATTENDABLE',
	) {
		super(message);
		this.name = 'AttendanceError';
	}
}

async function setAttendance(
	adapter: SchedulerAdapter,
	bookingId: string,
	attendanceStatus: AttendanceStatus,
	slotId?: string,
): Promise<Booking> {
	if (!adapter.updateAttendance) {
		throw new AttendanceError('Adapter does not support attendance', 'ATTENDANCE_UNSUPPORTED');
	}
	const booking = await adapter.getBookingById(bookingId);
	if (!booking) {
		throw new AttendanceError(`Booking not found: ${bookingId}`, 'BOOKING_NOT_FOUND');
	}
	if (booking.status !== 'confirmed' && booking.status !== 'completed') {
		throw new AttendanceError(
			`Booking is ${booking.status} — attendance applies to confirmed/completed bookings`,
			'NOT_ATTENDABLE',
		);
	}
	// A series booking is checked in per session; `slotId` says which one. It
	// must be a session of THIS booking — checking someone into a class they
	// never bought is the kind of thing a desk does by mistyping.
	if (slotId) {
		const sessions = booking.slotIds ?? [booking.slotId];
		if (!sessions.includes(slotId)) {
			throw new AttendanceError(
				`Slot ${slotId} is not a session of booking ${bookingId}`,
				'NOT_ATTENDABLE',
			);
		}
	}
	return adapter.updateAttendance(bookingId, attendanceStatus, slotId);
}

/** `slotId` checks in ONE session of a series; omit it for a single class. */
export const checkIn = (adapter: SchedulerAdapter, bookingId: string, slotId?: string) =>
	setAttendance(adapter, bookingId, 'checked_in', slotId);

export const markNoShow = (adapter: SchedulerAdapter, bookingId: string, slotId?: string) =>
	setAttendance(adapter, bookingId, 'no_show', slotId);

export const resetAttendance = (adapter: SchedulerAdapter, bookingId: string, slotId?: string) =>
	setAttendance(adapter, bookingId, 'not_arrived', slotId);
