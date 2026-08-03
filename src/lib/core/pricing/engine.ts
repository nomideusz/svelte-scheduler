/**
 * Pricing engine — pure function that calculates a PriceBreakdown.
 *
 * Supports all 4 pricing models defined in PricingModel:
 *   1. per_person           — basePrice × participants
 *   2. participant_categories — per-category prices, summed
 *   3. group_tiers          — flat price per group size bracket
 *   4. private_tour         — flat rate regardless of participant count
 *
 * Discount application order:
 *   Step 1 — base price (model-dependent)
 *   Step 2 — participant type modifiers (embedded in participant_categories model)
 *   Step 3 — group discounts (percentage or fixed)
 *   Step 4 — add-ons (flat per booking)
 *   Step 5 — Stripe processing fee
 *   Step 6 — TODO: platform fee (thebest.travel only — not in this package)
 *
 * Pure function only — no DB, no Stripe SDK, no SvelteKit imports.
 */

import type {
	PriceStructure,
	PriceBreakdown,
} from '../types.js';
import { STRIPE_FEES } from './currency.js';

// ─── Input ──────────────────────────────────────────────

export interface PricingInput {
	/** Pricing configuration from the offering definition. */
	pricing: PriceStructure;
	/** Total number of participants. */
	participants: number;
	/**
	 * Breakdown by category ID → count.
	 * Required when pricing.model === 'participant_categories'.
	 */
	participantsByCategory?: Record<string, number>;
	/** IDs of optional add-ons the guest selected. */
	selectedAddonIds?: string[];
}

// ─── Engine ─────────────────────────────────────────────

/**
 * Calculate the full price breakdown for a booking.
 *
 * Returns a PriceBreakdown with no mutations on the input.
 * Errors are collected in `result.errors` — the function never throws.
 */
export function calculatePrice(input: PricingInput): PriceBreakdown {
	const {
		pricing,
		participants,
		participantsByCategory = {},
		selectedAddonIds = [],
	} = input;

	const errors: string[] = [];

	// ─── Step 1 + 2: base price ──────────────────────────

	let basePrice = 0;
	let categoryBreakdown: PriceBreakdown['categoryBreakdown'];
	let selectedTier: PriceBreakdown['selectedTier'];

	switch (pricing.model) {
		// ── 1. per_person ──────────────────────────────────
		case 'per_person': {
			if (participants <= 0) {
				errors.push('participants must be greater than 0');
				basePrice = 0;
			} else {
				basePrice = pricing.basePrice * participants;
			}
			break;
		}

		// ── 2. participant_categories ──────────────────────
		case 'participant_categories': {
			const cats = pricing.participantCategories;
			if (!cats?.length) {
				errors.push('No participant categories defined for participant_categories model');
				break;
			}

			categoryBreakdown = {};

			for (const [categoryId, count] of Object.entries(participantsByCategory)) {
				if (count <= 0) continue;

				const cat = cats.find((c) => c.id === categoryId);
				if (!cat) {
					errors.push(`Unknown category id: "${categoryId}"`);
					continue;
				}

				const lineTotal = cat.price * count;
				basePrice += lineTotal;
				categoryBreakdown[categoryId] = {
					label: cat.label,
					count,
					originalPrice: cat.price,
					discountedPrice: cat.price, // may be updated in step 3
					subtotal: lineTotal,
				};
			}

			if (basePrice === 0 && Object.keys(participantsByCategory).length === 0) {
				errors.push('participantsByCategory is required for participant_categories model');
			}
			break;
		}

		// ── 3. group_tiers ────────────────────────────────
		case 'group_tiers': {
			const tiers = pricing.groupPricingTiers;
			if (!tiers?.length) {
				errors.push('No group pricing tiers defined for group_tiers model');
				// fall back to per-person basePrice
				basePrice = pricing.basePrice * participants;
				break;
			}

			const tier = tiers.find(
				(t) => participants >= t.minParticipants && participants <= t.maxParticipants,
			);
			if (!tier) {
				errors.push(
					`No group pricing tier matches ${participants} participant(s) — falling back to basePrice × participants`,
				);
				basePrice = pricing.basePrice * participants;
			} else {
				basePrice = tier.price;
				selectedTier = {
					minParticipants: tier.minParticipants,
					maxParticipants: tier.maxParticipants,
					label: tier.label,
				};
			}
			break;
		}

		// ── 4. private_tour ───────────────────────────────
		case 'private_tour': {
			const pt = pricing.privateTour;
			if (!pt) {
				errors.push('No privateTour config defined for private_tour model');
				basePrice = pricing.basePrice;
				break;
			}

			basePrice = pt.flatPrice;

			if (pt.minCapacity !== undefined && participants < pt.minCapacity) {
				errors.push(
					`Minimum capacity for this private offering is ${pt.minCapacity} (got ${participants})`,
				);
			}
			if (pt.maxCapacity !== undefined && participants > pt.maxCapacity) {
				errors.push(
					`Maximum capacity for this private offering is ${pt.maxCapacity} (got ${participants})`,
				);
			}
			break;
		}

		default: {
			errors.push(`Unknown pricing model: "${(pricing as { model: string }).model}"`);
			break;
		}
	}

	// ─── Step 3: group discounts ─────────────────────────

	let groupDiscount = 0;

	if (pricing.groupDiscountsEnabled && pricing.groupDiscountTiers?.length) {
		const discountTier = pricing.groupDiscountTiers.find(
			(t) => participants >= t.minParticipants && participants <= t.maxParticipants,
		);

		if (discountTier) {
			groupDiscount =
				discountTier.discountType === 'percentage'
					? (basePrice * discountTier.discountValue) / 100
					: discountTier.discountValue;

			selectedTier = {
				minParticipants: discountTier.minParticipants,
				maxParticipants: discountTier.maxParticipants,
				discountPercent:
					discountTier.discountType === 'percentage'
						? discountTier.discountValue
						: undefined,
				label: discountTier.label,
			};

			// Propagate discount ratio to category breakdown (proportional reduction)
			if (categoryBreakdown && basePrice > 0) {
				const retainRatio = Math.max(0, (basePrice - groupDiscount) / basePrice);
				for (const cb of Object.values(categoryBreakdown)) {
					cb.discountedPrice = round2(cb.originalPrice * retainRatio);
					cb.subtotal = round2(cb.discountedPrice * cb.count);
				}
			}
		}
	}

	const discountedBase = round2(Math.max(0, basePrice - groupDiscount));

	// ─── Step 4: add-ons ─────────────────────────────────

	let addonsTotal = 0;

	if (pricing.optionalAddons?.length) {
		for (const addon of pricing.optionalAddons) {
			if (addon.required || selectedAddonIds.includes(addon.id)) {
				addonsTotal = round2(addonsTotal + addon.price);
			}
		}
	}

	const subtotal = round2(discountedBase + addonsTotal);

	// ─── Step 5: Stripe processing fee ───────────────────

	const currencyKey = pricing.currency.toUpperCase();
	const feeEntry = STRIPE_FEES[currencyKey] ?? STRIPE_FEES['EUR'];
	const processingFee = round2(subtotal * feeEntry.percentage + feeEntry.fixed);

	// ─── Step 6: TODO platform fee (thebest.travel only) ─

	// ─── Final amounts ───────────────────────────────────

	// When the guide absorbs the fee, the customer pays only `subtotal`.
	// When the guide does NOT absorb the fee, it is added on top for the customer.
	const totalAmount = pricing.guidePaysProcessingFee
		? subtotal
		: round2(subtotal + processingFee);

	// Guide receives subtotal minus the fee if they absorb it.
	const guideReceives = pricing.guidePaysProcessingFee
		? round2(subtotal - processingFee)
		: subtotal;

	return {
		basePrice,
		groupDiscount,
		discountedBase,
		addonsTotal,
		subtotal,
		processingFee,
		totalAmount,
		guideReceives,
		guidePaysProcessingFee: pricing.guidePaysProcessingFee,
		...(categoryBreakdown !== undefined ? { categoryBreakdown } : {}),
		...(selectedTier !== undefined ? { selectedTier } : {}),
		errors,
	};
}

// ─── Helpers ─────────────────────────────────────────────

/** Round to 2 decimal places. */
function round2(n: number): number {
	return Math.round(n * 100) / 100;
}
