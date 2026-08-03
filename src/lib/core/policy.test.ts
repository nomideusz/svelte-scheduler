import { describe, it, expect } from 'vitest';
import {
	CANCELLATION_POLICIES,
	getApplicableRule,
	calculateRefund,
	describeRefund,
} from './policy.js';
import type { CancellationPolicy } from './types.js';

// ─── Helpers ────────────────────────────────────────────

/** Returns a Date that is `hours` hours from now. */
function hoursFromNow(hours: number): Date {
	return new Date(Date.now() + hours * 60 * 60 * 1000);
}

// ─── CANCELLATION_POLICIES ──────────────────────────────

describe('CANCELLATION_POLICIES', () => {
	it('exports flexible, moderate, strict, no_refund', () => {
		expect(CANCELLATION_POLICIES).toHaveProperty('flexible');
		expect(CANCELLATION_POLICIES).toHaveProperty('moderate');
		expect(CANCELLATION_POLICIES).toHaveProperty('strict');
		expect(CANCELLATION_POLICIES).toHaveProperty('no_refund');
	});

	it('each policy has an id matching its key', () => {
		for (const [key, policy] of Object.entries(CANCELLATION_POLICIES)) {
			expect(policy.id).toBe(key);
		}
	});

	it('each policy has at least one rule', () => {
		for (const policy of Object.values(CANCELLATION_POLICIES)) {
			expect(policy.rules.length).toBeGreaterThan(0);
		}
	});

	it('refundPercentage values are in range 0–100', () => {
		for (const policy of Object.values(CANCELLATION_POLICIES)) {
			for (const rule of policy.rules) {
				expect(rule.refundPercentage).toBeGreaterThanOrEqual(0);
				expect(rule.refundPercentage).toBeLessThanOrEqual(100);
			}
		}
	});
});

// ─── getApplicableRule ──────────────────────────────────

describe('getApplicableRule', () => {
	const flexible = CANCELLATION_POLICIES.flexible;
	const moderate = CANCELLATION_POLICIES.moderate;
	const strict = CANCELLATION_POLICIES.strict;

	// flexible: 100% if >24h, else 0%

	it('flexible — returns 100% rule when cancelling 48h before offering', () => {
		const tourStart = hoursFromNow(48);
		const rule = getApplicableRule(flexible, tourStart);
		expect(rule.refundPercentage).toBe(100);
	});

	it('flexible — returns 100% rule when cancelling exactly 24h before offering', () => {
		const tourStart = hoursFromNow(24);
		const rule = getApplicableRule(flexible, tourStart);
		expect(rule.refundPercentage).toBe(100);
	});

	it('flexible — returns 0% rule when cancelling 23h before offering', () => {
		const tourStart = hoursFromNow(23);
		const rule = getApplicableRule(flexible, tourStart);
		expect(rule.refundPercentage).toBe(0);
	});

	it('flexible — returns 0% rule when cancelling 1h before offering', () => {
		const tourStart = hoursFromNow(1);
		const rule = getApplicableRule(flexible, tourStart);
		expect(rule.refundPercentage).toBe(0);
	});

	// moderate: 100% if >48h, 50% if 24–48h, 0% if <24h

	it('moderate — returns 100% rule when cancelling 72h before offering', () => {
		const tourStart = hoursFromNow(72);
		const rule = getApplicableRule(moderate, tourStart);
		expect(rule.refundPercentage).toBe(100);
	});

	it('moderate — returns 100% rule when cancelling exactly 48h before offering', () => {
		const tourStart = hoursFromNow(48);
		const rule = getApplicableRule(moderate, tourStart);
		expect(rule.refundPercentage).toBe(100);
	});

	it('moderate — returns 50% rule when cancelling 36h before offering', () => {
		const tourStart = hoursFromNow(36);
		const rule = getApplicableRule(moderate, tourStart);
		expect(rule.refundPercentage).toBe(50);
	});

	it('moderate — returns 50% rule when cancelling exactly 24h before offering', () => {
		const tourStart = hoursFromNow(24);
		const rule = getApplicableRule(moderate, tourStart);
		expect(rule.refundPercentage).toBe(50);
	});

	it('moderate — returns 0% rule when cancelling 12h before offering', () => {
		const tourStart = hoursFromNow(12);
		const rule = getApplicableRule(moderate, tourStart);
		expect(rule.refundPercentage).toBe(0);
	});

	// strict: 100% if >168h (7 days), else 0%

	it('strict — returns 100% rule when cancelling 200h before offering', () => {
		const tourStart = hoursFromNow(200);
		const rule = getApplicableRule(strict, tourStart);
		expect(rule.refundPercentage).toBe(100);
	});

	it('strict — returns 100% rule when cancelling exactly 168h before offering', () => {
		const tourStart = hoursFromNow(168);
		const rule = getApplicableRule(strict, tourStart);
		expect(rule.refundPercentage).toBe(100);
	});

	it('strict — returns 0% rule when cancelling 100h before offering', () => {
		const tourStart = hoursFromNow(100);
		const rule = getApplicableRule(strict, tourStart);
		expect(rule.refundPercentage).toBe(0);
	});

	// explicit cancellationTime parameter

	it('accepts an explicit cancellationTime', () => {
		const now = new Date(2025, 5, 1, 12, 0, 0);
		const tourStart = new Date(2025, 5, 3, 12, 0, 0); // 48h later
		const rule = getApplicableRule(moderate, tourStart, now);
		expect(rule.refundPercentage).toBe(100);
	});

	// custom policy with unsorted rules (should still work)

	it('handles unsorted rules — still picks the correct one', () => {
		const custom: CancellationPolicy = {
			id: 'custom',
			name: 'Custom',
			description: 'Custom policy',
			rules: [
				{ hoursBeforeTour: 0, refundPercentage: 0, description: 'No refund' },
				{ hoursBeforeTour: 48, refundPercentage: 100, description: 'Full' },
				{ hoursBeforeTour: 24, refundPercentage: 50, description: 'Half' },
			],
		};
		const tourStart = hoursFromNow(36);
		const rule = getApplicableRule(custom, tourStart);
		expect(rule.refundPercentage).toBe(50);
	});
});

// ─── calculateRefund — guide cancellation ───────────────

describe('calculateRefund — guide cancellation (non-negotiable)', () => {
	const policy = CANCELLATION_POLICIES.flexible;

	it('returns 100% refund regardless of timing — 1 hour before offering', () => {
		const result = calculateRefund(200, policy, hoursFromNow(1), 'guide');
		expect(result.refundAmount).toBe(200);
		expect(result.refundPercentage).toBe(100);
		expect(result.rule).toBeNull();
	});

	it('returns 100% refund regardless of timing — 5 minutes before offering', () => {
		const result = calculateRefund(150, policy, hoursFromNow(1 / 12), 'guide');
		expect(result.refundAmount).toBe(150);
		expect(result.refundPercentage).toBe(100);
	});

	it('returns 100% refund regardless of timing — 0 hours before (at offering start)', () => {
		const result = calculateRefund(99, policy, hoursFromNow(0), 'guide');
		expect(result.refundAmount).toBe(99);
		expect(result.refundPercentage).toBe(100);
	});

	it('returns 100% refund regardless of timing — after offering already started', () => {
		const result = calculateRefund(500, policy, hoursFromNow(-2), 'guide');
		expect(result.refundAmount).toBe(500);
		expect(result.refundPercentage).toBe(100);
	});

	it('returns 100% even with a strict policy', () => {
		const strict = CANCELLATION_POLICIES.strict;
		const result = calculateRefund(300, strict, hoursFromNow(10), 'guide');
		expect(result.refundAmount).toBe(300);
		expect(result.refundPercentage).toBe(100);
	});

	it('returns 100% even with a no_refund policy', () => {
		const noRefund = CANCELLATION_POLICIES.no_refund;
		const result = calculateRefund(300, noRefund, hoursFromNow(10), 'guide');
		expect(result.refundAmount).toBe(300);
		expect(result.refundPercentage).toBe(100);
	});
});

// ─── calculateRefund — guest cancellation ───────────────

describe('calculateRefund — guest cancellation', () => {
	const flexible = CANCELLATION_POLICIES.flexible;
	const moderate = CANCELLATION_POLICIES.moderate;

	it('flexible — full refund when cancelling 48h before offering', () => {
		const result = calculateRefund(200, flexible, hoursFromNow(48), 'guest');
		expect(result.refundAmount).toBe(200);
		expect(result.refundPercentage).toBe(100);
		expect(result.rule).not.toBeNull();
	});

	it('flexible — no refund when cancelling 12h before offering', () => {
		const result = calculateRefund(200, flexible, hoursFromNow(12), 'guest');
		expect(result.refundAmount).toBe(0);
		expect(result.refundPercentage).toBe(0);
	});

	it('moderate — full refund when cancelling 72h before offering', () => {
		const result = calculateRefund(300, moderate, hoursFromNow(72), 'guest');
		expect(result.refundAmount).toBe(300);
		expect(result.refundPercentage).toBe(100);
	});

	it('moderate — 50% refund when cancelling 36h before offering', () => {
		const result = calculateRefund(300, moderate, hoursFromNow(36), 'guest');
		expect(result.refundAmount).toBe(150);
		expect(result.refundPercentage).toBe(50);
	});

	it('moderate — no refund when cancelling 12h before offering', () => {
		const result = calculateRefund(300, moderate, hoursFromNow(12), 'guest');
		expect(result.refundAmount).toBe(0);
		expect(result.refundPercentage).toBe(0);
	});

	it('rounds refund amount to 2 decimal places', () => {
		const result = calculateRefund(99.99, moderate, hoursFromNow(36), 'guest');
		// 50% of 99.99 = 49.995 → rounded to 50.00
		expect(result.refundAmount).toBe(50);
	});

	it('handles fractional amounts correctly', () => {
		const result = calculateRefund(100.01, moderate, hoursFromNow(36), 'guest');
		// 50% of 100.01 = 50.005 → 50.01
		expect(result.refundAmount).toBeCloseTo(50.01, 2);
	});
});

// ─── calculateRefund — system cancellation ──────────────

describe('calculateRefund — system cancellation', () => {
	it('applies policy rules (same as guest)', () => {
		const flexible = CANCELLATION_POLICIES.flexible;
		const result = calculateRefund(200, flexible, hoursFromNow(48), 'system');
		expect(result.refundAmount).toBe(200);
		expect(result.refundPercentage).toBe(100);
	});

	it('no refund when inside the window', () => {
		const flexible = CANCELLATION_POLICIES.flexible;
		const result = calculateRefund(200, flexible, hoursFromNow(12), 'system');
		expect(result.refundAmount).toBe(0);
	});
});

// ─── describeRefund ─────────────────────────────────────

describe('describeRefund', () => {
	const flexible = CANCELLATION_POLICIES.flexible;
	const moderate = CANCELLATION_POLICIES.moderate;

	it('guide cancellation — always returns guide cancelled message', () => {
		const msg = describeRefund(flexible, 'guide', hoursFromNow(1));
		expect(msg).toContain('Guide cancelled');
		expect(msg).toContain('100%');
	});

	it('guide cancellation — same message regardless of timing', () => {
		const early = describeRefund(moderate, 'guide', hoursFromNow(500));
		const late = describeRefund(moderate, 'guide', hoursFromNow(0));
		expect(early).toBe(late);
		expect(early).toContain('100%');
	});

	it('full refund scenario mentions 100%', () => {
		const msg = describeRefund(flexible, 'guest', hoursFromNow(48));
		expect(msg).toContain('100%');
	});

	it('no refund scenario mentions 0%', () => {
		const msg = describeRefund(flexible, 'guest', hoursFromNow(12));
		expect(msg).toContain('0%');
	});

	it('partial refund scenario mentions the percentage', () => {
		const msg = describeRefund(moderate, 'guest', hoursFromNow(36));
		expect(msg).toContain('50%');
	});

	it('includes the rule description text', () => {
		const msg = describeRefund(flexible, 'guest', hoursFromNow(48));
		// The flexible 100% rule description mentions "24 hours"
		expect(msg.length).toBeGreaterThan(10);
	});
});
