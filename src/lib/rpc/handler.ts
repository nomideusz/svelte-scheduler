/**
 * Framework-agnostic RPC handler exposing a SchedulerAdapter over HTTP —
 * the server half of createFetchAdapter. Mount it on a POST route:
 *
 *   const handle = createSchedulerHandler(adapter, {
 *     authorize: ({ method, args, ctx }) => canManage(ctx.user, ...),
 *   });
 *   export const POST = ({ request, locals }) => handle(request, { user: locals.user });
 *
 * Security model: methods outside `publicMethods` run ONLY when authorize()
 * returns true — no authorize configured means they are simply unreachable.
 * Domain errors (BookingError, AttendanceError) travel to the client and
 * rethrow there with their code; anything else stays a server 500.
 */
import type { SchedulerAdapter } from '../adapters/types.js';
import { BookingError } from '../core/booking.js';
import { AttendanceError } from '../core/attendance.js';
import { ERROR_MARK, parse, stringify, type WireError } from './serialize.js';

export const SCHEDULER_METHODS = [
	'getOfferings',
	'getOfferingById',
	'createOffering',
	'updateOffering',
	'deleteOffering',
	'getSlots',
	'getSlotById',
	'createSlot',
	'updateSlot',
	'cancelSlot',
	'getBookingsForSlot',
	'getBookingsForOffering',
	'getBookingById',
	'getBookingByReference',
	'createBooking',
	'updateBookingStatus',
	'updateAttendance',
] as const;
export type SchedulerMethod = (typeof SCHEDULER_METHODS)[number];

/**
 * The guest booking flow: browse, pick a slot (materializing it), book,
 * look the booking up by its reference. Everything else is management
 * surface and needs authorize().
 */
export const PUBLIC_SCHEDULER_METHODS = [
	'getOfferings',
	'getOfferingById',
	'getSlots',
	'getSlotById',
	'createBooking',
	'getBookingByReference',
] as const satisfies readonly SchedulerMethod[];

export interface SchedulerHandlerOptions<TCtx> {
	/** Methods callable without authorize(). Default: PUBLIC_SCHEDULER_METHODS. */
	publicMethods?: readonly SchedulerMethod[];
	/** Gate for non-public methods. Absent → non-public methods always 403. */
	authorize?(input: {
		request: Request;
		method: SchedulerMethod;
		args: unknown[];
		ctx: TCtx;
	}): boolean | Promise<boolean>;
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

function errorResponse(status: number, err: WireError): Response {
	return jsonResponse({ [ERROR_MARK]: err }, status);
}

export function createSchedulerHandler<TCtx = void>(
	adapter: SchedulerAdapter | ((request: Request, ctx: TCtx) => SchedulerAdapter),
	options: SchedulerHandlerOptions<TCtx> = {},
): (request: Request, ctx: TCtx) => Promise<Response> {
	const publicMethods = new Set<string>(options.publicMethods ?? PUBLIC_SCHEDULER_METHODS);

	return async (request, ctx) => {
		let payload: { method?: string; args?: unknown };
		try {
			payload = parse(await request.text()) as typeof payload;
		} catch {
			return errorResponse(400, { name: 'Error', message: 'Invalid JSON body' });
		}
		const method = payload?.method as SchedulerMethod;
		const args = payload?.args;
		if (!SCHEDULER_METHODS.includes(method)) {
			return errorResponse(400, { name: 'Error', message: `Unknown method: ${String(method)}` });
		}
		if (!Array.isArray(args)) {
			return errorResponse(400, { name: 'Error', message: 'args must be an array' });
		}

		if (!publicMethods.has(method)) {
			const allowed = options.authorize
				? await options.authorize({ request, method, args, ctx })
				: false;
			if (!allowed) {
				return errorResponse(403, { name: 'Error', message: `Not allowed: ${method}` });
			}
		}

		const resolved = typeof adapter === 'function' ? adapter(request, ctx) : adapter;
		const fn = resolved[method];
		if (typeof fn !== 'function') {
			// e.g. optional updateAttendance on an adapter that doesn't support it
			return errorResponse(501, { name: 'Error', message: `Not implemented: ${method}` });
		}

		try {
			const result = await (fn as (...a: unknown[]) => Promise<unknown>).apply(resolved, args);
			return jsonResponse(result ?? null);
		} catch (e) {
			if (e instanceof BookingError || e instanceof AttendanceError) {
				return errorResponse(409, { name: e.name, message: e.message, code: e.code });
			}
			throw e; // infrastructure failure — let the host framework 500
		}
	};
}
