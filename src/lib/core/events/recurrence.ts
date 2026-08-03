/**
 * Recurrence expansion for ScheduleRules.
 *
 * Pure function — no DB, no side effects.
 * Uses Intl.DateTimeFormat for timezone handling — no external deps.
 */

import type { ScheduleRule } from '../types.js';

// DateRange is { start: Date; end: Date } — structurally compatible with
// @nomideusz/svelte-calendar's DateRange (peer dep, imported at the package index level).
type DateRange = { start: Date; end: Date };

/** Milliseconds in a single day. */
const MS_PER_DAY = 86_400_000;

/** A single expanded occurrence: wall-clock start and end as UTC Date objects. */
export interface OccurrencePair {
	startTime: Date;
	endTime: Date;
}

/**
 * Parse an HH:MM time string into { hours, minutes }.
 */
function parseHHMM(hhmm: string): { hours: number; minutes: number } {
	const [h, m] = hhmm.split(':').map(Number);
	return { hours: h, minutes: m };
}

/**
 * Convert a calendar date (year, month 1-based, day) plus HH:MM time
 * into a UTC Date, interpreting the time in the given IANA timezone.
 *
 * Uses Intl.DateTimeFormat with 'en-CA' locale (YYYY-MM-DD output) to
 * determine the UTC offset for any IANA timezone, including DST transitions.
 */
function localToUTC(
	year: number,
	month: number,
	day: number,
	hours: number,
	minutes: number,
	timezone: string
): Date {
	// Build an ISO string for the local datetime and parse it with the timezone offset.
	// We use Intl.DateTimeFormat to determine the UTC offset for this timezone on this date.
	// Strategy: construct a UTC candidate and adjust by the offset of that timezone.
	const isoLocal = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;

	// We interpret the local time as UTC first to get a Date, then find the real offset.
	const naiveUTC = new Date(isoLocal + 'Z');

	// Get the local time components for naiveUTC in the target timezone.
	const formatter = new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	});
	const parts = formatter.formatToParts(naiveUTC);

	const getPart = (type: string): number => {
		const part = parts.find((p) => p.type === type);
		return part ? Number(part.value) : 0;
	};

	const tzYear = getPart('year');
	const tzMonth = getPart('month');
	const tzDay = getPart('day');
	const tzHour = getPart('hour') % 24;
	const tzMinute = getPart('minute');
	const tzSecond = getPart('second');

	// Compute the offset: how far naiveUTC is from actual local time.
	const tzUTC = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute, tzSecond);
	const offsetMs = naiveUTC.getTime() - tzUTC;

	// The true UTC time is naiveUTC adjusted by the offset.
	return new Date(naiveUTC.getTime() + offsetMs);
}

/**
 * Get the ISO day-of-week (1=Monday … 7=Sunday) for a given UTC Date,
 * interpreted in the specified timezone.
 */
function getISODayOfWeek(date: Date, timezone: string): number {
	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		weekday: 'long',
	});
	const name = formatter.format(date);
	const map: Record<string, number> = {
		Monday: 1,
		Tuesday: 2,
		Wednesday: 3,
		Thursday: 4,
		Friday: 5,
		Saturday: 6,
		Sunday: 7,
	};
	return map[name] ?? 1;
}

/**
 * Return the local calendar date (year, month 1-based, day) for a UTC Date
 * interpreted in the given timezone.
 */
function getLocalDate(
	date: Date,
	timezone: string
): { year: number; month: number; day: number } {
	const formatter = new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	});
	const [datePart] = formatter.format(date).split(', ');
	const [y, mo, d] = datePart.split('-').map(Number);
	return { year: y, month: mo, day: d };
}

/**
 * Advance a local calendar date by one day, handling month/year boundaries.
 */
function addOneDay(year: number, month: number, day: number): { year: number; month: number; day: number } {
	const d = new Date(Date.UTC(year, month - 1, day + 1));
	return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * Day index (days since the Unix epoch, local-calendar semantics).
 * Used for interval comparisons across daily/weekly patterns without
 * depending on wall-clock times.
 */
function dayOrdinal(year: number, month: number, day: number): number {
	return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/** Whether a given (year, month, day) triple is a real calendar date. */
function isValidCalendarDate(year: number, month: number, day: number): boolean {
	if (day < 1 || day > 31 || month < 1 || month > 12) return false;
	const d = new Date(Date.UTC(year, month - 1, day));
	return (
		d.getUTCFullYear() === year &&
		d.getUTCMonth() === month - 1 &&
		d.getUTCDate() === day
	);
}

/** Month ordinal (months since year 0, month 1 = +1). */
function monthOrdinal(year: number, month: number): number {
	return year * 12 + (month - 1);
}

/**
 * Expand a ScheduleRule into concrete { startTime, endTime } pairs
 * that fall within the given DateRange.
 *
 * - `pattern: 'once'`   → 0 or 1 occurrence (only if validFrom is in range)
 * - `pattern: 'weekly'` → one per matching weekday within range, respecting validUntil
 * - `pattern: 'custom'` → empty array (TODO: custom recurrence)
 */
const localDateFmtCache = new Map<string, Intl.DateTimeFormat>();
/** UTC instant → YYYY-MM-DD wall date in `timezone`. */
function localDateISO(d: Date, timezone: string): string {
	let fmt = localDateFmtCache.get(timezone);
	if (!fmt) {
		fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
		localDateFmtCache.set(timezone, fmt);
	}
	return fmt.format(d);
}

export function expandRule(rule: ScheduleRule, range: DateRange): OccurrencePair[] {
	const occurrences = expandRuleUnfiltered(rule, range);
	if (!rule.excludeDates?.length) return occurrences;
	const excluded = new Set(rule.excludeDates.map((d) => d.slice(0, 10)));
	return occurrences.filter((o) => !excluded.has(localDateISO(o.startTime, rule.timezone)));
}

function expandRuleUnfiltered(rule: ScheduleRule, range: DateRange): OccurrencePair[] {
	const { timezone, startTime: startHHMM, endTime: endHHMM } = rule;
	const start = parseHHMM(startHHMM);
	const end = parseHHMM(endHHMM);

	if (rule.pattern === 'once') {
		// validFrom is an ISO date string like '2024-03-15' (may include time portion)
		const [y, mo, d] = rule.validFrom.slice(0, 10).split('-').map(Number);
		const slotStart = localToUTC(y, mo, d, start.hours, start.minutes, timezone);
		const slotEnd = localToUTC(y, mo, d, end.hours, end.minutes, timezone);

		// If end is before start (crosses midnight), advance end by one day
		const adjustedEnd = slotEnd <= slotStart ? new Date(slotEnd.getTime() + MS_PER_DAY) : slotEnd;

		if (slotStart >= range.start && slotStart < range.end) {
			return [{ startTime: slotStart, endTime: adjustedEnd }];
		}
		return [];
	}

	// Compute the effective window for any recurring pattern.
	const recurringWindow = computeRecurringWindow(rule, range);
	if (!recurringWindow) return [];
	const { effectiveStart, effectiveEnd } = recurringWindow;

	const interval = Math.max(1, rule.interval ?? 1);

	if (rule.pattern === 'daily') {
		const results: OccurrencePair[] = [];
		const [vy, vmo, vd] = rule.validFrom.slice(0, 10).split('-').map(Number);
		const ruleOriginOrdinal = dayOrdinal(vy, vmo, vd);

		let { year, month, day } = getLocalDate(effectiveStart, timezone);

		const maxIterations = 365 * 2 + 1;
		let iterations = 0;

		while (iterations < maxIterations) {
			const slotStart = localToUTC(year, month, day, start.hours, start.minutes, timezone);
			if (slotStart >= effectiveEnd) break;

			if (slotStart >= effectiveStart) {
				const ord = dayOrdinal(year, month, day);
				if ((ord - ruleOriginOrdinal) % interval === 0 && ord >= ruleOriginOrdinal) {
					const slotEnd = localToUTC(year, month, day, end.hours, end.minutes, timezone);
					const adjustedEnd =
						slotEnd <= slotStart ? new Date(slotEnd.getTime() + MS_PER_DAY) : slotEnd;
					results.push({ startTime: slotStart, endTime: adjustedEnd });
				}
			}

			({ year, month, day } = addOneDay(year, month, day));
			iterations++;
		}

		return results;
	}

	if (rule.pattern === 'weekly') {
		const daysOfWeek = rule.daysOfWeek ?? [];
		if (daysOfWeek.length === 0) return [];

		const results: OccurrencePair[] = [];

		// Origin ordinal of the rule's validFrom day (used for `interval` weekly spacing).
		const [vy, vmo, vd] = rule.validFrom.slice(0, 10).split('-').map(Number);
		const ruleOriginOrdinal = dayOrdinal(vy, vmo, vd);

		let { year, month, day } = getLocalDate(effectiveStart, timezone);

		const maxIterations = 365 * 2 + 1;
		let iterations = 0;

		while (iterations < maxIterations) {
			const slotStart = localToUTC(year, month, day, start.hours, start.minutes, timezone);
			if (slotStart >= effectiveEnd) break;

			if (slotStart >= effectiveStart) {
				const isoDow = getISODayOfWeek(slotStart, timezone);
				if (daysOfWeek.includes(isoDow)) {
					// For interval > 1, only include weeks that are N apart from the origin week.
					const ord = dayOrdinal(year, month, day);
					const weekIndex = Math.floor((ord - ruleOriginOrdinal) / 7);
					if (interval === 1 || (weekIndex >= 0 && weekIndex % interval === 0)) {
						const slotEnd = localToUTC(year, month, day, end.hours, end.minutes, timezone);
						const adjustedEnd =
							slotEnd <= slotStart ? new Date(slotEnd.getTime() + MS_PER_DAY) : slotEnd;
						results.push({ startTime: slotStart, endTime: adjustedEnd });
					}
				}
			}

			({ year, month, day } = addOneDay(year, month, day));
			iterations++;
		}

		return results;
	}

	if (rule.pattern === 'monthly') {
		const daysOfMonth = (rule.daysOfMonth ?? []).filter((d) => d >= 1 && d <= 31);
		if (daysOfMonth.length === 0) return [];

		const results: OccurrencePair[] = [];

		const [vy, vmo] = rule.validFrom.slice(0, 10).split('-').map(Number);
		const ruleOriginMonth = monthOrdinal(vy, vmo);

		// Walk month-by-month from the start of effectiveStart's month.
		const { year: startYear, month: startMonth } = getLocalDate(effectiveStart, timezone);
		let curYear = startYear;
		let curMonth = startMonth;

		// Cap at ~10 years of monthly iteration.
		const maxMonths = 120;
		let months = 0;

		while (months < maxMonths) {
			// Early exit: if first day of this month is past effectiveEnd, we're done.
			const monthStartUTC = localToUTC(curYear, curMonth, 1, 0, 0, timezone);
			if (monthStartUTC >= effectiveEnd) break;

			const curMonthOrd = monthOrdinal(curYear, curMonth);
			const monthIndex = curMonthOrd - ruleOriginMonth;
			const monthMatchesInterval =
				monthIndex >= 0 && (interval === 1 || monthIndex % interval === 0);

			if (monthMatchesInterval) {
				// Emit one occurrence per listed day that actually exists in this month.
				for (const dayNum of daysOfMonth) {
					if (!isValidCalendarDate(curYear, curMonth, dayNum)) continue;
					const slotStart = localToUTC(
						curYear,
						curMonth,
						dayNum,
						start.hours,
						start.minutes,
						timezone
					);
					if (slotStart < effectiveStart || slotStart >= effectiveEnd) continue;
					const slotEnd = localToUTC(
						curYear,
						curMonth,
						dayNum,
						end.hours,
						end.minutes,
						timezone
					);
					const adjustedEnd =
						slotEnd <= slotStart ? new Date(slotEnd.getTime() + MS_PER_DAY) : slotEnd;
					results.push({ startTime: slotStart, endTime: adjustedEnd });
				}
			}

			// Advance to next month.
			curMonth += 1;
			if (curMonth > 12) {
				curMonth = 1;
				curYear += 1;
			}
			months += 1;
		}

		// Ensure chronological order (days-of-month list isn't required to be sorted).
		results.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
		return results;
	}

	// custom — not yet implemented
	return [];
}

/**
 * Intersect a rule's validFrom/validUntil window with the requested range.
 * Returns null if the intersection is empty.
 */
function computeRecurringWindow(
	rule: ScheduleRule,
	range: DateRange
): { effectiveStart: Date; effectiveEnd: Date } | null {
	const { timezone } = rule;
	const [vy, vmo, vd] = rule.validFrom.slice(0, 10).split('-').map(Number);
	const validFromUTC = localToUTC(vy, vmo, vd, 0, 0, timezone);
	const effectiveStart = validFromUTC > range.start ? validFromUTC : range.start;

	let effectiveEnd = range.end;
	if (rule.validUntil) {
		const [ey, emo, ed] = rule.validUntil.slice(0, 10).split('-').map(Number);
		const { year: ny, month: nm, day: nd } = addOneDay(ey, emo, ed);
		const validUntilExclusive = localToUTC(ny, nm, nd, 0, 0, timezone);
		if (validUntilExclusive < effectiveEnd) effectiveEnd = validUntilExclusive;
	}

	if (effectiveStart >= effectiveEnd) return null;
	return { effectiveStart, effectiveEnd };
}
