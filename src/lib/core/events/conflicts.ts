/**
 * Conflict detection over time slots.
 *
 * Pure — no DB, no side effects. Works on any type that has { startTime, endTime }.
 * Slots that touch at a single instant (a.endTime === b.startTime) are NOT
 * considered conflicts.
 */

/** Minimum shape a slot must have to be checked. */
export interface SlotLike {
	/** Stable identifier; callers attach whatever they need. */
	id: string;
	startTime: Date;
	endTime: Date;
}

/** Two slots that overlap in time. Order is a < b by startTime. */
export interface ConflictPair<S extends SlotLike = SlotLike> {
	a: S;
	b: S;
}

/**
 * Detect overlapping pairs among a set of slots.
 *
 * Sweep-line: sort by startTime, then for each slot only compare against
 * later slots whose startTime is before this slot's endTime. O(n log n + n·k)
 * where k is the average cluster size.
 */
export function detectConflicts<S extends SlotLike>(slots: readonly S[]): ConflictPair<S>[] {
	if (slots.length < 2) return [];

	const sorted = [...slots].sort(
		(x, y) => x.startTime.getTime() - y.startTime.getTime()
	);

	const conflicts: ConflictPair<S>[] = [];

	for (let i = 0; i < sorted.length; i++) {
		const a = sorted[i];
		const aEnd = a.endTime.getTime();
		for (let j = i + 1; j < sorted.length; j++) {
			const b = sorted[j];
			const bStart = b.startTime.getTime();
			if (bStart >= aEnd) break; // sorted: no later slot can overlap
			// bStart < aEnd → overlap (touching is excluded by strict <)
			conflicts.push({ a, b });
		}
	}

	return conflicts;
}

/** A group of slots belonging to one offering. */
export interface Slots<S extends SlotLike = SlotLike> {
	offeringId: string;
	slots: readonly S[];
}

/** A cross-offering conflict; each side is labelled with its offering. */
export interface CrossTourConflict<S extends SlotLike = SlotLike> {
	tourAId: string;
	tourBId: string;
	a: S;
	b: S;
}

/**
 * Detect conflicts where two slots from DIFFERENT offerings overlap.
 * Same-offering overlaps are ignored (use `detectConflicts` per offering for those).
 */
export function detectCrossTourConflicts<S extends SlotLike>(
	toursWithSlots: readonly Slots<S>[]
): CrossTourConflict<S>[] {
	type Tagged = { offeringId: string; slot: S };
	const all: Tagged[] = [];
	for (const { offeringId, slots } of toursWithSlots) {
		for (const slot of slots) all.push({ offeringId, slot });
	}
	if (all.length < 2) return [];

	all.sort((x, y) => x.slot.startTime.getTime() - y.slot.startTime.getTime());

	const conflicts: CrossTourConflict<S>[] = [];

	for (let i = 0; i < all.length; i++) {
		const { offeringId: aTour, slot: a } = all[i];
		const aEnd = a.endTime.getTime();
		for (let j = i + 1; j < all.length; j++) {
			const { offeringId: bTour, slot: b } = all[j];
			if (b.startTime.getTime() >= aEnd) break;
			if (aTour === bTour) continue;
			conflicts.push({ tourAId: aTour, tourBId: bTour, a, b });
		}
	}

	return conflicts;
}
