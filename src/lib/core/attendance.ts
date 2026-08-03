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
	return adapter.updateAttendance(bookingId, attendanceStatus);
}

export const checkIn = (adapter: SchedulerAdapter, bookingId: string) =>
	setAttendance(adapter, bookingId, 'checked_in');

export const markNoShow = (adapter: SchedulerAdapter, bookingId: string) =>
	setAttendance(adapter, bookingId, 'no_show');

export const resetAttendance = (adapter: SchedulerAdapter, bookingId: string) =>
	setAttendance(adapter, bookingId, 'not_arrived');
