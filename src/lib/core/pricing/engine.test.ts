import { describe, it, expect } from 'vitest';
import { calculatePrice } from './engine.js';
import { STRIPE_FEES } from './currency.js';
import type { PriceStructure } from '../types.js';

// ─── Helpers ────────────────────────────────────────────

function basePricing(overrides: Partial<PriceStructure> = {}): PriceStructure {
	return {
		model: 'per_person',
		basePrice: 100,
		currency: 'EUR',
		guidePaysProcessingFee: false,
		groupDiscountsEnabled: false,
		...overrides,
	};
}

// ─── STRIPE_FEES table ───────────────────────────────────

describe('STRIPE_FEES', () => {
	it('includes PLN', () => {
		expect(STRIPE_FEES['PLN']).toBeDefined();
		expect(STRIPE_FEES['PLN'].fixed).toBeGreaterThan(0);
	});

	it('includes Scandinavian currencies', () => {
		expect(STRIPE_FEES['NOK']).toBeDefined();
		expect(STRIPE_FEES['SEK']).toBeDefined();
		expect(STRIPE_FEES['DKK']).toBeDefined();
	});

	it('includes EUR as fallback', () => {
		expect(STRIPE_FEES['EUR']).toBeDefined();
	});

	it('all entries have percentage and fixed fields', () => {
		for (const [currency, entry] of Object.entries(STRIPE_FEES)) {
			expect(entry.percentage, `${currency}.percentage`).toBeGreaterThan(0);
			expect(entry.fixed, `${currency}.fixed`).toBeGreaterThanOrEqual(0);
		}
	});
});

// ─── Model 1: per_person ─────────────────────────────────

describe('per_person model', () => {
	it('calculates basePrice × participants', () => {
		const result = calculatePrice({
			pricing: basePricing({ basePrice: 50, guidePaysProcessingFee: true }),
			participants: 3,
		});
		expect(result.basePrice).toBe(150);
		expect(result.errors).toHaveLength(0);
	});

	it('returns 0 base for 0 participants', () => {
		const result = calculatePrice({
			pricing: basePricing({ guidePaysProcessingFee: true }),
			participants: 0,
		});
		expect(result.basePrice).toBe(0);
	});

	it('totalAmount equals subtotal when guide pays processing fee', () => {
		const result = calculatePrice({
			pricing: basePricing({ basePrice: 100, guidePaysProcessingFee: true }),
			participants: 2,
		});
		expect(result.totalAmount).toBe(result.subtotal);
		expect(result.guideReceives).toBe(result.subtotal - result.processingFee);
	});

	it('totalAmount includes processing fee when guest pays', () => {
		const result = calculatePrice({
			pricing: basePricing({ basePrice: 100, guidePaysProcessingFee: false }),
			participants: 2,
		});
		expect(result.totalAmount).toBe(
			Math.round((result.subtotal + result.processingFee) * 100) / 100,
		);
		expect(result.guideReceives).toBe(result.subtotal);
	});
});

// ─── Model 2: participant_categories ────────────────────

describe('participant_categories model', () => {
	const pricing = basePricing({
		model: 'participant_categories',
		participantCategories: [
			{ id: 'adult', label: 'Adult', price: 80, sortOrder: 0 },
			{ id: 'child', label: 'Child', price: 40, sortOrder: 1 },
			{ id: 'infant', label: 'Infant', price: 0, sortOrder: 2 },
		],
		guidePaysProcessingFee: true,
	});

	it('sums per-category prices', () => {
		const result = calculatePrice({
			pricing,
			participants: 3,
			participantsByCategory: { adult: 2, child: 1 },
		});
		// 2×80 + 1×40 = 200
		expect(result.basePrice).toBe(200);
		expect(result.errors).toHaveLength(0);
	});

	it('populates categoryBreakdown', () => {
		const result = calculatePrice({
			pricing,
			participants: 3,
			participantsByCategory: { adult: 2, child: 1 },
		});
		expect(result.categoryBreakdown).toBeDefined();
		expect(result.categoryBreakdown!['adult'].count).toBe(2);
		expect(result.categoryBreakdown!['adult'].originalPrice).toBe(80);
		expect(result.categoryBreakdown!['adult'].subtotal).toBe(160);
		expect(result.categoryBreakdown!['child'].count).toBe(1);
		expect(result.categoryBreakdown!['child'].subtotal).toBe(40);
	});

	it('skips categories with count 0', () => {
		const result = calculatePrice({
			pricing,
			participants: 2,
			participantsByCategory: { adult: 2, child: 0 },
		});
		expect(result.categoryBreakdown!['child']).toBeUndefined();
	});

	it('adds error for unknown category id', () => {
		const result = calculatePrice({
			pricing,
			participants: 1,
			participantsByCategory: { unknown_cat: 1 },
		});
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors[0]).toContain('unknown_cat');
	});

	it('adds error when no categories defined', () => {
		const result = calculatePrice({
			pricing: basePricing({
				model: 'participant_categories',
				participantCategories: [],
				guidePaysProcessingFee: true,
			}),
			participants: 1,
		});
		expect(result.errors.length).toBeGreaterThan(0);
	});

	it('handles free (price 0) categories without error', () => {
		const result = calculatePrice({
			pricing,
			participants: 1,
			participantsByCategory: { infant: 1 },
		});
		expect(result.basePrice).toBe(0);
		expect(result.errors).toHaveLength(0);
	});
});

// ─── Model 3: group_tiers ────────────────────────────────

describe('group_tiers model', () => {
	const pricing = basePricing({
		model: 'group_tiers',
		groupPricingTiers: [
			{ id: 't1', minParticipants: 1, maxParticipants: 4, price: 200, label: 'Small group' },
			{ id: 't2', minParticipants: 5, maxParticipants: 10, price: 350, label: 'Medium group' },
			{ id: 't3', minParticipants: 11, maxParticipants: 20, price: 500, label: 'Large group' },
		],
		guidePaysProcessingFee: true,
	});

	it('uses flat price for matching tier', () => {
		const result = calculatePrice({ pricing, participants: 3 });
		expect(result.basePrice).toBe(200);
		expect(result.errors).toHaveLength(0);
	});

	it('selects correct tier for mid-range', () => {
		const result = calculatePrice({ pricing, participants: 7 });
		expect(result.basePrice).toBe(350);
		expect(result.selectedTier?.label).toBe('Medium group');
	});

	it('adds error when no tier matches', () => {
		const result = calculatePrice({ pricing, participants: 25 });
		expect(result.errors.length).toBeGreaterThan(0);
	});

	it('adds error when no tiers defined', () => {
		const result = calculatePrice({
			pricing: basePricing({
				model: 'group_tiers',
				groupPricingTiers: [],
				guidePaysProcessingFee: true,
			}),
			participants: 5,
		});
		expect(result.errors.length).toBeGreaterThan(0);
	});

	it('populates selectedTier', () => {
		const result = calculatePrice({ pricing, participants: 15 });
		expect(result.selectedTier).toMatchObject({
			minParticipants: 11,
			maxParticipants: 20,
		});
	});
});

// ─── Model 4: private_tour ───────────────────────────────

describe('private_tour model', () => {
	const pricing = basePricing({
		model: 'private_tour',
		privateTour: { flatPrice: 500, minCapacity: 1, maxCapacity: 8 },
		guidePaysProcessingFee: true,
	});

	it('uses flat price regardless of participant count', () => {
		const r1 = calculatePrice({ pricing, participants: 1 });
		const r2 = calculatePrice({ pricing, participants: 8 });
		expect(r1.basePrice).toBe(500);
		expect(r2.basePrice).toBe(500);
	});

	it('adds error when participants below minCapacity', () => {
		const result = calculatePrice({ pricing, participants: 0 });
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors[0]).toContain('Minimum capacity');
	});

	it('adds error when participants above maxCapacity', () => {
		const result = calculatePrice({ pricing, participants: 10 });
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors[0]).toContain('Maximum capacity');
	});

	it('adds error when privateTour config is missing', () => {
		const result = calculatePrice({
			pricing: basePricing({
				model: 'private_tour',
				guidePaysProcessingFee: true,
			}),
			participants: 2,
		});
		expect(result.errors.length).toBeGreaterThan(0);
	});

	it('no errors within capacity range', () => {
		const result = calculatePrice({ pricing, participants: 5 });
		expect(result.errors).toHaveLength(0);
	});
});

// ─── Group discounts ─────────────────────────────────────

describe('group discounts', () => {
	const pricingWithDiscount = basePricing({
		basePrice: 100,
		groupDiscountsEnabled: true,
		groupDiscountTiers: [
			{ id: 'd1', minParticipants: 5, maxParticipants: 10, discountType: 'percentage', discountValue: 10, label: '10% off' },
			{ id: 'd2', minParticipants: 11, maxParticipants: 20, discountType: 'fixed', discountValue: 50, label: '50 off' },
		],
		guidePaysProcessingFee: true,
	});

	it('applies percentage discount', () => {
		const result = calculatePrice({ pricing: pricingWithDiscount, participants: 5 });
		// base = 100×5 = 500, 10% discount = 50
		expect(result.basePrice).toBe(500);
		expect(result.groupDiscount).toBe(50);
		expect(result.discountedBase).toBe(450);
	});

	it('applies fixed discount', () => {
		const result = calculatePrice({ pricing: pricingWithDiscount, participants: 11 });
		// base = 100×11 = 1100, fixed discount = 50
		expect(result.basePrice).toBe(1100);
		expect(result.groupDiscount).toBe(50);
		expect(result.discountedBase).toBe(1050);
	});

	it('no discount when groupDiscountsEnabled is false', () => {
		const result = calculatePrice({
			pricing: basePricing({
				basePrice: 100,
				groupDiscountsEnabled: false,
				groupDiscountTiers: [
					{ id: 'd1', minParticipants: 1, maxParticipants: 99, discountType: 'percentage', discountValue: 20 },
				],
				guidePaysProcessingFee: true,
			}),
			participants: 5,
		});
		expect(result.groupDiscount).toBe(0);
		expect(result.discountedBase).toBe(500);
	});

	it('populates selectedTier with discountPercent for percentage discounts', () => {
		const result = calculatePrice({ pricing: pricingWithDiscount, participants: 5 });
		expect(result.selectedTier?.discountPercent).toBe(10);
	});

	it('no discount when no tier matches participant count', () => {
		const result = calculatePrice({ pricing: pricingWithDiscount, participants: 1 });
		expect(result.groupDiscount).toBe(0);
	});

	it('applies discount to category breakdown proportionally', () => {
		const pricingCats = basePricing({
			model: 'participant_categories',
			participantCategories: [
				{ id: 'adult', label: 'Adult', price: 100, sortOrder: 0 },
			],
			groupDiscountsEnabled: true,
			groupDiscountTiers: [
				{ id: 'd1', minParticipants: 2, maxParticipants: 10, discountType: 'percentage', discountValue: 20 },
			],
			guidePaysProcessingFee: true,
		});
		const result = calculatePrice({
			pricing: pricingCats,
			participants: 2,
			participantsByCategory: { adult: 2 },
		});
		// base = 200, 20% off = 40, discounted = 160
		expect(result.groupDiscount).toBe(40);
		expect(result.categoryBreakdown!['adult'].discountedPrice).toBe(80);
		expect(result.categoryBreakdown!['adult'].subtotal).toBe(160);
	});
});

// ─── Add-ons ─────────────────────────────────────────────

describe('add-ons', () => {
	const pricing = basePricing({
		basePrice: 100,
		optionalAddons: [
			{ id: 'audio', name: 'Audio guide', price: 10, required: false },
			{ id: 'photo', name: 'Photo package', price: 25, required: false },
			{ id: 'insurance', name: 'Travel insurance', price: 5, required: true },
		],
		guidePaysProcessingFee: true,
	});

	it('always includes required add-ons', () => {
		const result = calculatePrice({ pricing, participants: 1, selectedAddonIds: [] });
		// insurance (5) always included
		expect(result.addonsTotal).toBe(5);
	});

	it('includes selected optional add-ons', () => {
		const result = calculatePrice({
			pricing,
			participants: 1,
			selectedAddonIds: ['audio'],
		});
		// audio (10) + insurance (5) = 15
		expect(result.addonsTotal).toBe(15);
	});

	it('includes multiple selected add-ons', () => {
		const result = calculatePrice({
			pricing,
			participants: 1,
			selectedAddonIds: ['audio', 'photo'],
		});
		// audio (10) + photo (25) + insurance (5) = 40
		expect(result.addonsTotal).toBe(40);
	});

	it('does not include unselected optional add-ons', () => {
		const result = calculatePrice({ pricing, participants: 1, selectedAddonIds: [] });
		// only insurance (5) — photo and audio not selected
		expect(result.addonsTotal).toBe(5);
	});

	it('add-ons are included in subtotal', () => {
		const result = calculatePrice({
			pricing,
			participants: 1,
			selectedAddonIds: ['audio'],
		});
		// base=100, addons=15, subtotal=115
		expect(result.subtotal).toBe(115);
	});
});

// ─── Stripe fee ──────────────────────────────────────────

describe('Stripe processing fee', () => {
	it('uses EUR fallback for unknown currencies', () => {
		const result = calculatePrice({
			pricing: basePricing({ currency: 'XYZ', guidePaysProcessingFee: false }),
			participants: 1,
		});
		const eurFee = STRIPE_FEES['EUR'];
		const expectedFee =
			Math.round((100 * eurFee.percentage + eurFee.fixed) * 100) / 100;
		expect(result.processingFee).toBe(expectedFee);
	});

	it('uses PLN fee for PLN currency', () => {
		const result = calculatePrice({
			pricing: basePricing({ currency: 'PLN', basePrice: 300, guidePaysProcessingFee: false }),
			participants: 1,
		});
		const plnFee = STRIPE_FEES['PLN'];
		const expectedFee = Math.round((300 * plnFee.percentage + plnFee.fixed) * 100) / 100;
		expect(result.processingFee).toBe(expectedFee);
	});

	it('uses NOK fee for Norwegian bookings', () => {
		const result = calculatePrice({
			pricing: basePricing({ currency: 'NOK', basePrice: 500, guidePaysProcessingFee: false }),
			participants: 1,
		});
		const nokFee = STRIPE_FEES['NOK'];
		const expectedFee = Math.round((500 * nokFee.percentage + nokFee.fixed) * 100) / 100;
		expect(result.processingFee).toBe(expectedFee);
	});

	it('currency lookup is case-insensitive', () => {
		const lower = calculatePrice({
			pricing: basePricing({ currency: 'eur', guidePaysProcessingFee: false }),
			participants: 1,
		});
		const upper = calculatePrice({
			pricing: basePricing({ currency: 'EUR', guidePaysProcessingFee: false }),
			participants: 1,
		});
		expect(lower.processingFee).toBe(upper.processingFee);
	});
});

// ─── Full breakdown integrity ────────────────────────────

describe('PriceBreakdown integrity', () => {
	it('always has errors array', () => {
		const result = calculatePrice({
			pricing: basePricing({ guidePaysProcessingFee: true }),
			participants: 1,
		});
		expect(Array.isArray(result.errors)).toBe(true);
	});

	it('guideReceives + processingFee === subtotal when guide pays fee', () => {
		const result = calculatePrice({
			pricing: basePricing({ basePrice: 200, guidePaysProcessingFee: true }),
			participants: 2,
		});
		expect(result.guideReceives + result.processingFee).toBeCloseTo(result.subtotal, 2);
	});

	it('guideReceives === subtotal when guest pays fee', () => {
		const result = calculatePrice({
			pricing: basePricing({ basePrice: 200, guidePaysProcessingFee: false }),
			participants: 2,
		});
		expect(result.guideReceives).toBe(result.subtotal);
	});

	it('discountedBase === basePrice when no discount', () => {
		const result = calculatePrice({
			pricing: basePricing({ guidePaysProcessingFee: true }),
			participants: 3,
		});
		expect(result.discountedBase).toBe(result.basePrice);
		expect(result.groupDiscount).toBe(0);
	});
});
