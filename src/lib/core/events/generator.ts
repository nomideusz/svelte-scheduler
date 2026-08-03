/**
 * Lazy slot generator.
 *
 * Expands ScheduleRules into Slot objects, merging with
 * persisted slots (e.g. cancellations) and excluding cancelled slots.
 *
 * Pure function — reads inputs, returns outputs, no writes to any store.
 */

import type { Offering, Slot } from '../types.js';
import { expandRule } from './recurrence.js';

// DateRange is { start: Date; end: Date } — structurally compatible with
// @nomideusz/svelte-calendar's DateRange (peer dep, imported at the package index level).
type DateRange = { start: Date; end: Date };

/**
 * Generate slots for a offering within the given date range.
 *
 * 1. Expand all offering.scheduleRules into { startTime, endTime } pairs.
 * 2. Merge with existingSlots (persisted exceptions: cancellations, manual overrides).
 * 3. Exclude cancelled slots.
 * 4. Return sorted ascending by startTime.
 *
 * No slot is written anywhere — this is a pure read operation.
 */
export function generateSlots(
	offering: Offering,
	existingSlots: Slot[],
	range: DateRange
): Slot[] {
	// Build an index of existing persisted slots keyed by their canonical key.
	// Key: `${scheduleRuleId}:${startTime.toISOString()}` for generated slots,
	//      `manual:${id}` for manually created slots.
	const persistedByKey = new Map<string, Slot>();
	for (const slot of existingSlots) {
		const key = slotKey(slot);
		persistedByKey.set(key, slot);
	}

	const result: Slot[] = [];

	// Expand each schedule rule and build virtual slots.
	for (const rule of offering.scheduleRules) {
		const occurrences = expandRule(rule, range);

		for (const occ of occurrences) {
			const key = `${rule.id}:${occ.startTime.toISOString()}`;

			if (persistedByKey.has(key)) {
				// Use the persisted slot (may be cancelled, full, etc.)
				const persisted = persistedByKey.get(key)!;
				if (persisted.status !== 'cancelled') {
					result.push(persisted);
				}
				// Mark as consumed so it's not added again from existingSlots below.
				persistedByKey.delete(key);
			} else {
				// Virtual slot — generated on the fly, not yet persisted.
				result.push({
					id: `virtual:${offering.id}:${rule.id}:${occ.startTime.toISOString()}`,
					offeringId: offering.id,
					startTime: occ.startTime,
					endTime: occ.endTime,
					availableSpots: offering.capacity,
					bookedSpots: 0,
					status: 'open',
					isGenerated: true,
					scheduleRuleId: rule.id,
				});
			}
		}
	}

	// Add remaining persisted slots that are within the range but did not match
	// any rule expansion. Two sub-cases:
	//   1. Manual slots (no scheduleRuleId) — always include.
	//   2. Rule-generated slots whose rule/time no longer produces this slot
	//      (e.g. rule was edited). These are orphaned "ghost" slots — drop them
	//      UNLESS they have bookings, in which case the booked slot must still
	//      surface so the booking remains resolvable.
	for (const slot of persistedByKey.values()) {
		if (slot.status === 'cancelled') continue;
		if (slot.startTime < range.start || slot.startTime >= range.end) continue;

		const isOrphanedRuleSlot = Boolean(slot.scheduleRuleId);
		if (isOrphanedRuleSlot && slot.bookedSpots === 0) {
			// Ghost: rule edited, no bookings — skip.
			continue;
		}

		result.push(slot);
	}

	// Sort ascending by startTime.
	result.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

	return result;
}

/**
 * Compute a canonical lookup key for a persisted Slot.
 */
function slotKey(slot: Slot): string {
	if (slot.scheduleRuleId) {
		return `${slot.scheduleRuleId}:${slot.startTime.toISOString()}`;
	}
	return `manual:${slot.id}`;
}
