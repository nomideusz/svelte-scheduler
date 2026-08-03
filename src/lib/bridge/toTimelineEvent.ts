/**
 * Maps a Slot + Offering to a TimelineEvent for calendar rendering.
 *
 * Pure function — no side effects, no async.
 */

import type { TimelineEvent, EventStatus } from '@nomideusz/svelte-calendar';
import type { Slot, Offering } from '../core/types.js';

/** Threshold for "few spots left" → 'limited' status. */
const LIMITED_THRESHOLD = 3;

function mapAvailabilityStatus(slot: Slot): EventStatus {
	switch (slot.status) {
		case 'open': {
			const spotsLeft = slot.availableSpots - slot.bookedSpots;
			return spotsLeft <= LIMITED_THRESHOLD ? 'limited' : 'confirmed';
		}
		case 'full':
			return 'full';
		case 'cancelled':
			return 'cancelled';
		case 'completed':
			return 'confirmed';
		case 'at_risk':
			return 'limited';
	}
}

/**
 * Convert a `Slot` and its parent `Offering` into a `TimelineEvent`
 * suitable for rendering with `@nomideusz/svelte-calendar`.
 *
 * Status mapping:
 * - `open` with ≤3 spots left → `'limited'`
 * - `open` with plenty of spots → `'confirmed'`
 * - `full` → `'full'`
 * - `cancelled` → `'cancelled'`
 * - `completed` → `'confirmed'` (historical, still renderable)
 * - `at_risk` → `'limited'`
 *
 * `category` is always set from `offering.categories[0]` (never a hardcoded color).
 */
export function toTimelineEvent(slot: Slot, offering: Offering): TimelineEvent {
	const spotsLeft = slot.availableSpots - slot.bookedSpots;

	return {
		id: slot.id,
		title: offering.name,
		start: slot.startTime,
		end: slot.endTime,
		category: offering.categories[0] ?? offering.name,
		status: mapAvailabilityStatus(slot),
		data: {
			slotId: slot.id,
			offeringId: offering.id,
			bookedSpots: slot.bookedSpots,
			availableSpots: slot.availableSpots,
			spotsLeft,
		},
	};
}
