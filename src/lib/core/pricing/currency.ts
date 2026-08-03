/**
 * Stripe processing fee table.
 *
 * Rates source: Stripe pricing page (https://stripe.com/pricing).
 * Covers all currencies used in the Polish and Scandinavian tourism markets
 * plus the major Western European currencies.
 *
 * Each entry holds:
 *   percentage — the variable rate (multiply by transaction amount, 0–1 scale)
 *   fixed      — the per-transaction fixed fee in the currency's standard unit
 *
 * Used by the pricing engine as step 5 in the discount chain:
 *   base → participant modifiers → group discounts → add-ons → Stripe fee → TODO platform fee
 */

export interface StripeFeeEntry {
	/** Variable rate fraction (e.g. 0.015 = 1.5%). */
	percentage: number;
	/** Fixed per-transaction fee in the currency's main unit. */
	fixed: number;
}

/**
 * STRIPE_FEES — keyed by ISO 4217 currency code (uppercase).
 *
 * Percentages reflect Stripe's blended rate for European cards on European
 * accounts. Non-EU cards incur an extra 1.5% surcharge that is NOT included
 * here — it is not predictable at quote time and is passed through by Stripe.
 *
 * For currencies not listed here, the engine falls back to EUR.
 */
export const STRIPE_FEES: Record<string, StripeFeeEntry> = {
	// ─── Euro zone ───────────────────────────────────────
	EUR: { percentage: 0.015, fixed: 0.25 },

	// ─── Polish Zloty ───────────────────────────────────
	PLN: { percentage: 0.015, fixed: 1.00 },

	// ─── Scandinavian currencies ────────────────────────
	/** Norwegian Krone */
	NOK: { percentage: 0.015, fixed: 2.00 },
	/** Swedish Krona */
	SEK: { percentage: 0.015, fixed: 1.80 },
	/** Danish Krone */
	DKK: { percentage: 0.015, fixed: 1.80 },

	// ─── Other major European currencies ─────────────────
	/** British Pound */
	GBP: { percentage: 0.015, fixed: 0.20 },
	/** Swiss Franc */
	CHF: { percentage: 0.015, fixed: 0.30 },
	/** Czech Koruna */
	CZK: { percentage: 0.015, fixed: 6.50 },
	/** Hungarian Forint */
	HUF: { percentage: 0.015, fixed: 85.00 },
	/** Romanian Leu */
	RON: { percentage: 0.015, fixed: 1.20 },
	/** Bulgarian Lev */
	BGN: { percentage: 0.015, fixed: 0.50 },
	/** Croatian Kuna (legacy — Croatia joined EUR 2023, kept for historical data) */
	HRK: { percentage: 0.015, fixed: 1.90 },

	// ─── USD ─────────────────────────────────────────────
	/** US Dollar — used for international bookings */
	USD: { percentage: 0.029, fixed: 0.30 },

	// ─── Other ───────────────────────────────────────────
	/** Canadian Dollar */
	CAD: { percentage: 0.029, fixed: 0.30 },
	/** Australian Dollar */
	AUD: { percentage: 0.017, fixed: 0.30 },
};
