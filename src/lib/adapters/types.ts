/**
 * SchedulerAdapter — the integration contract for booking/scheduling data.
 *
 * Any data source (in-memory, REST API, database) implements this interface.
 * The scheduler engine calls these methods and the adapter handles persistence.
 *
 * Modeled after @nomideusz/svelte-calendar's CalendarAdapter pattern but
 * extended for the full booking lifecycle: offerings, slots, and bookings.
 */
import type { DateRange } from '@nomideusz/svelte-calendar';
import type {
	Offering,
	Slot,
	Booking,
	BookingStatus,
	AttendanceStatus,
} from '../core/types.js';

export interface SchedulerAdapter {
	// ─── Offering CRUD ──────────────────────────────────────

	/** Fetch all offerings, optionally filtered by status. */
	getOfferings(filter?: { status?: 'active' | 'draft' }): Promise<Offering[]>;

	/** Fetch a single offering by ID. */
	getOfferingById(id: string): Promise<Offering | undefined>;

	/** Create a new offering definition. Returns it with a server-assigned ID. */
	createOffering(offering: Omit<Offering, 'id'>): Promise<Offering>;

	/** Update a offering definition. Returns the updated offering. */
	updateOffering(id: string, patch: Partial<Offering>): Promise<Offering>;

	/** Delete a offering and all its associated slots and bookings. */
	deleteOffering(id: string): Promise<void>;

	// ─── Slot management ────────────────────────────────

	/** Fetch slots for a offering within a date range. */
	getSlots(offeringId: string, range: DateRange): Promise<Slot[]>;

	/** Fetch a single slot by ID. */
	getSlotById(id: string): Promise<Slot | undefined>;

	/** Create a manual (non-generated) slot. */
	createSlot(slot: Omit<Slot, 'id'>): Promise<Slot>;

	/** Update a slot (e.g. change status, adjust capacity). */
	updateSlot(id: string, patch: Partial<Slot>): Promise<Slot>;

	/** Cancel a slot. Triggers side effects per the state machine. */
	cancelSlot(id: string, cancelledBy: 'guide' | 'system'): Promise<Slot>;

	// ─── Booking lifecycle ──────────────────────────────

	/** Fetch bookings for a specific slot. */
	getBookingsForSlot(slotId: string): Promise<Booking[]>;

	/** Fetch bookings for a specific offering across all slots. */
	getBookingsForOffering(offeringId: string, range?: DateRange): Promise<Booking[]>;

	/** Fetch a single booking by ID. */
	getBookingById(id: string): Promise<Booking | undefined>;

	/** Fetch a booking by its human-readable reference. */
	getBookingByReference(reference: string): Promise<Booking | undefined>;

	/** Create a new booking. Returns it with a server-assigned ID and reference. */
	createBooking(booking: Omit<Booking, 'id' | 'bookingReference' | 'createdAt'>): Promise<Booking>;

	/** Update booking status (confirm, cancel, complete, mark no-show). */
	updateBookingStatus(
		id: string,
		status: BookingStatus,
		metadata?: { cancelledBy?: 'guest' | 'guide' | 'system'; cancellationReason?: string },
	): Promise<Booking>;

	/**
	 * Update guest attendance (check-in desk). Optional — adapters that
	 * don't support attendance simply omit it; core/attendance throws
	 * ATTENDANCE_UNSUPPORTED when it's missing.
	 */
	updateAttendance?(id: string, attendanceStatus: AttendanceStatus): Promise<Booking>;
}
