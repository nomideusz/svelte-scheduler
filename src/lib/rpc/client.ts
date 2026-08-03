/**
 * Client-side SchedulerAdapter proxying every call to a createSchedulerHandler
 * endpoint — what BookingFlow/AvailabilityPicker use in the browser.
 * Domain errors rethrow as BookingError/AttendanceError with their code.
 */
import type { SchedulerAdapter } from '../adapters/types.js';
import { BookingError } from '../core/booking.js';
import { AttendanceError } from '../core/attendance.js';
import { ERROR_MARK, parse, stringify, type WireError } from './serialize.js';
import type { SchedulerMethod } from './handler.js';

export interface FetchAdapterOptions {
	endpoint?: string;
	/** Override fetch (tests, SSR with cookies, custom headers). */
	fetch?: typeof fetch;
}

export function createFetchAdapter(options: FetchAdapterOptions = {}): SchedulerAdapter {
	const endpoint = options.endpoint ?? '/api/scheduler';
	const fetchFn = options.fetch ?? fetch;

	async function rpc<T>(method: SchedulerMethod, ...args: unknown[]): Promise<T> {
		while (args.length > 0 && args[args.length - 1] === undefined) args.pop();
		const res = await fetchFn(endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: stringify({ method, args }),
		});
		const body = parse(await res.text()) as Record<string, unknown> | null;
		if (!res.ok) {
			const err = (body?.[ERROR_MARK] ?? undefined) as WireError | undefined;
			if (err?.name === 'BookingError' && err.code) {
				throw new BookingError(err.message, err.code as ConstructorParameters<typeof BookingError>[1]);
			}
			if (err?.name === 'AttendanceError' && err.code) {
				throw new AttendanceError(err.message, err.code as ConstructorParameters<typeof AttendanceError>[1]);
			}
			throw new Error(`scheduler rpc ${method} → ${res.status}: ${err?.message ?? 'request failed'}`);
		}
		return body as T;
	}

	// get*: the wire encodes "not found" as null; the interface says undefined.
	return {
		getOfferings: (filter) => rpc('getOfferings', filter),
		getOfferingById: async (id) => (await rpc('getOfferingById', id)) ?? undefined,
		createOffering: (offering) => rpc('createOffering', offering),
		updateOffering: (id, patch) => rpc('updateOffering', id, patch),
		deleteOffering: async (id) => {
			await rpc('deleteOffering', id);
		},
		getSlots: (offeringId, range) => rpc('getSlots', offeringId, range),
		getSlotById: async (id) => (await rpc('getSlotById', id)) ?? undefined,
		createSlot: (slot) => rpc('createSlot', slot),
		updateSlot: (id, patch) => rpc('updateSlot', id, patch),
		cancelSlot: (id, cancelledBy) => rpc('cancelSlot', id, cancelledBy),
		getBookingsForSlot: (slotId) => rpc('getBookingsForSlot', slotId),
		getBookingsForOffering: (offeringId, range) => rpc('getBookingsForOffering', offeringId, range),
		getBookingById: async (id) => (await rpc('getBookingById', id)) ?? undefined,
		getBookingByReference: async (ref) => (await rpc('getBookingByReference', ref)) ?? undefined,
		createBooking: (booking) => rpc('createBooking', booking),
		updateBookingStatus: (id, status, metadata) => rpc('updateBookingStatus', id, status, metadata),
		updateAttendance: (id, attendanceStatus) => rpc('updateAttendance', id, attendanceStatus),
	};
}
