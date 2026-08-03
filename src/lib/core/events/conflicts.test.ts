import { describe, it, expect } from 'vitest';
import { detectConflicts, detectCrossTourConflicts } from './conflicts.js';
import type { SlotLike } from './conflicts.js';

function slot(id: string, startISO: string, endISO: string): SlotLike {
	return { id, startTime: new Date(startISO), endTime: new Date(endISO) };
}

describe('detectConflicts', () => {
	it('returns empty for 0 or 1 slots', () => {
		expect(detectConflicts([])).toEqual([]);
		expect(detectConflicts([slot('a', '2024-03-01T10:00Z', '2024-03-01T11:00Z')])).toEqual([]);
	});

	it('returns empty when slots do not overlap', () => {
		const s1 = slot('a', '2024-03-01T09:00Z', '2024-03-01T10:00Z');
		const s2 = slot('b', '2024-03-01T11:00Z', '2024-03-01T12:00Z');
		expect(detectConflicts([s1, s2])).toEqual([]);
	});

	it('touching slots are not conflicts', () => {
		const s1 = slot('a', '2024-03-01T09:00Z', '2024-03-01T10:00Z');
		const s2 = slot('b', '2024-03-01T10:00Z', '2024-03-01T11:00Z');
		expect(detectConflicts([s1, s2])).toEqual([]);
	});

	it('detects partial overlap', () => {
		const s1 = slot('a', '2024-03-01T09:00Z', '2024-03-01T10:30Z');
		const s2 = slot('b', '2024-03-01T10:00Z', '2024-03-01T11:00Z');
		const result = detectConflicts([s1, s2]);
		expect(result).toHaveLength(1);
		expect(result[0].a.id).toBe('a');
		expect(result[0].b.id).toBe('b');
	});

	it('detects nested overlap', () => {
		const outer = slot('a', '2024-03-01T09:00Z', '2024-03-01T12:00Z');
		const inner = slot('b', '2024-03-01T10:00Z', '2024-03-01T11:00Z');
		const result = detectConflicts([outer, inner]);
		expect(result).toHaveLength(1);
	});

	it('finds all pairs in a dense cluster', () => {
		const a = slot('a', '2024-03-01T09:00Z', '2024-03-01T12:00Z');
		const b = slot('b', '2024-03-01T10:00Z', '2024-03-01T13:00Z');
		const c = slot('c', '2024-03-01T11:00Z', '2024-03-01T14:00Z');
		const result = detectConflicts([a, b, c]);
		expect(result).toHaveLength(3); // a-b, a-c, b-c
	});

	it('is order-independent', () => {
		const a = slot('a', '2024-03-01T10:00Z', '2024-03-01T11:30Z');
		const b = slot('b', '2024-03-01T11:00Z', '2024-03-01T12:00Z');
		expect(detectConflicts([a, b])).toHaveLength(1);
		expect(detectConflicts([b, a])).toHaveLength(1);
	});
});

describe('detectCrossTourConflicts', () => {
	it('ignores same-offering overlaps', () => {
		const result = detectCrossTourConflicts([
			{
				offeringId: 't1',
				slots: [
					slot('a', '2024-03-01T09:00Z', '2024-03-01T11:00Z'),
					slot('b', '2024-03-01T10:00Z', '2024-03-01T12:00Z'),
				],
			},
		]);
		expect(result).toEqual([]);
	});

	it('detects overlap between different offerings', () => {
		const result = detectCrossTourConflicts([
			{
				offeringId: 't1',
				slots: [slot('a', '2024-03-01T09:00Z', '2024-03-01T11:00Z')],
			},
			{
				offeringId: 't2',
				slots: [slot('b', '2024-03-01T10:00Z', '2024-03-01T12:00Z')],
			},
		]);
		expect(result).toHaveLength(1);
		expect(result[0].tourAId).toBe('t1');
		expect(result[0].tourBId).toBe('t2');
	});

	it('mixes same-offering and cross-offering; only returns cross-offering pairs', () => {
		const result = detectCrossTourConflicts([
			{
				offeringId: 't1',
				slots: [
					slot('a', '2024-03-01T09:00Z', '2024-03-01T11:00Z'),
					slot('b', '2024-03-01T10:00Z', '2024-03-01T12:00Z'),
				],
			},
			{
				offeringId: 't2',
				slots: [slot('c', '2024-03-01T10:30Z', '2024-03-01T11:30Z')],
			},
		]);
		// t1/a vs t2/c, and t1/b vs t2/c → 2 cross-offering conflicts
		expect(result).toHaveLength(2);
		for (const conflict of result) {
			expect(conflict.tourAId).not.toBe(conflict.tourBId);
		}
	});

	it('touching cross-offering slots are not conflicts', () => {
		const result = detectCrossTourConflicts([
			{ offeringId: 't1', slots: [slot('a', '2024-03-01T09:00Z', '2024-03-01T10:00Z')] },
			{ offeringId: 't2', slots: [slot('b', '2024-03-01T10:00Z', '2024-03-01T11:00Z')] },
		]);
		expect(result).toEqual([]);
	});
});
