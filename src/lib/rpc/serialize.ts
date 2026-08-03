/**
 * Wire format for the scheduler RPC. Dates are marked explicitly — a blanket
 * "looks like an ISO string" heuristic would corrupt fields that are ISO
 * strings BY TYPE (Booking.createdAt, Booking.expiresAt).
 */

const DATE_MARK = '__$schedDate';
export const ERROR_MARK = '__$schedError';

export function stringify(value: unknown): string {
	return JSON.stringify(value, function (key: string) {
		const raw = (this as Record<string, unknown>)[key];
		return raw instanceof Date ? { [DATE_MARK]: raw.toISOString() } : raw;
	});
}

export function parse(text: string): unknown {
	if (text === '') return null;
	return JSON.parse(text, (_key, v) =>
		v !== null && typeof v === 'object' && typeof v[DATE_MARK] === 'string'
			? new Date(v[DATE_MARK])
			: v,
	);
}

export interface WireError {
	name: string;
	message: string;
	code?: string;
}
