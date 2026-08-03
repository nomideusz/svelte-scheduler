/**
 * Cancellation policy logic — extracted from Zaur's cancellation-policies.ts.
 *
 * Pure functions only — no DB, no Stripe, no SvelteKit imports.
 *
 * Non-negotiable rule: cancelledBy === 'guide' → 100% refund. Always.
 */

import type { CancellationPolicy, CancellationRule } from './types.js';

// ─── Predefined policies ────────────────────────────────

/**
 * Standard cancellation policies available to all guides.
 * Guides may also define custom policies with arbitrary rules.
 */
export const CANCELLATION_POLICIES: Record<string, CancellationPolicy> = {
	flexible: {
		id: 'flexible',
		name: 'Flexible',
		description: 'Full refund if cancelled at least 24 hours before the offering.',
		rules: [
			{
				hoursBeforeTour: 24,
				refundPercentage: 100,
				description: 'Full refund when cancelled more than 24 hours before the offering.',
			},
			{
				hoursBeforeTour: 0,
				refundPercentage: 0,
				description: 'No refund when cancelled less than 24 hours before the offering.',
			},
		],
	},

	moderate: {
		id: 'moderate',
		name: 'Moderate',
		description: 'Full refund up to 48 hours before, 50% refund 24–48 hours before the offering.',
		rules: [
			{
				hoursBeforeTour: 48,
				refundPercentage: 100,
				description: 'Full refund when cancelled more than 48 hours before the offering.',
			},
			{
				hoursBeforeTour: 24,
				refundPercentage: 50,
				description: '50% refund when cancelled 24–48 hours before the offering.',
			},
			{
				hoursBeforeTour: 0,
				refundPercentage: 0,
				description: 'No refund when cancelled less than 24 hours before the offering.',
			},
		],
	},

	strict: {
		id: 'strict',
		name: 'Strict',
		description: 'Full refund if cancelled at least 7 days before the offering.',
		rules: [
			{
				hoursBeforeTour: 168, // 7 days × 24 h
				refundPercentage: 100,
				description: 'Full refund when cancelled more than 7 days before the offering.',
			},
			{
				hoursBeforeTour: 0,
				refundPercentage: 0,
				description: 'No refund when cancelled less than 7 days before the offering.',
			},
		],
	},

	no_refund: {
		id: 'no_refund',
		name: 'No Refund',
		description: 'No refund for guest-initiated cancellations.',
		rules: [
			{
				hoursBeforeTour: 0,
				refundPercentage: 0,
				description: 'No refund for any guest-initiated cancellation.',
			},
		],
	},
};

// ─── Core functions ─────────────────────────────────────

/**
 * Returns the applicable cancellation rule for a given cancellation time.
 *
 * Rules are evaluated in descending order of `hoursBeforeTour`.
 * The first rule whose threshold is met (hoursUntilTour >= rule.hoursBeforeTour)
 * is returned.
 *
 * Does NOT handle guide cancellations — callers must check `cancelledBy` first.
 */
export function getApplicableRule(
	policy: CancellationPolicy,
	tourStartTime: Date,
	cancellationTime: Date = new Date(),
): CancellationRule {
	const hoursUntilTour =
		(tourStartTime.getTime() - cancellationTime.getTime()) / (1000 * 60 * 60);

	// Evaluate rules from most-generous to least-generous
	const sortedRules = [...policy.rules].sort((a, b) => b.hoursBeforeTour - a.hoursBeforeTour);

	for (const rule of sortedRules) {
		if (hoursUntilTour >= rule.hoursBeforeTour) {
			return rule;
		}
	}

	// Fallback: least-generous rule (lowest hoursBeforeTour, typically 0%)
	return sortedRules[sortedRules.length - 1];
}

/**
 * Calculates the refund amount for a booking cancellation.
 *
 * Non-negotiable: cancelledBy === 'guide' → 100% refund always, regardless of
 * timing. This is preserved exactly from Zaur and must never be changed.
 */
export function calculateRefund(
	totalAmount: number,
	policy: CancellationPolicy,
	tourStartTime: Date,
	cancelledBy: 'guest' | 'guide' | 'system',
	cancellationTime: Date = new Date(),
): { refundAmount: number; refundPercentage: number; rule: CancellationRule | null } {
	// Guide cancellation: always full refund — no time window, no exceptions
	if (cancelledBy === 'guide') {
		return {
			refundAmount: totalAmount,
			refundPercentage: 100,
			rule: null,
		};
	}

	const rule = getApplicableRule(policy, tourStartTime, cancellationTime);
	const refundAmount = Math.round(totalAmount * rule.refundPercentage) / 100;

	return {
		refundAmount,
		refundPercentage: rule.refundPercentage,
		rule,
	};
}

/**
 * Returns a human-readable description of the refund outcome.
 *
 * Useful for displaying confirmation messages to guests and guides.
 */
export function describeRefund(
	policy: CancellationPolicy,
	cancelledBy: 'guest' | 'guide' | 'system',
	tourStartTime: Date,
	cancellationTime: Date = new Date(),
): string {
	if (cancelledBy === 'guide') {
		return 'Guide cancelled — full refund (100%).';
	}

	const rule = getApplicableRule(policy, tourStartTime, cancellationTime);

	if (rule.refundPercentage === 100) {
		return `Full refund (100%). ${rule.description}`;
	}

	if (rule.refundPercentage === 0) {
		return `No refund (0%). ${rule.description}`;
	}

	return `Partial refund (${rule.refundPercentage}%). ${rule.description}`;
}
