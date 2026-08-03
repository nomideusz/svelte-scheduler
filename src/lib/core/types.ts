/**
 * Canonical domain types for @nomideusz/svelte-scheduler.
 *
 * These are the source of truth for the entire booking system.
 * Changing any of these is a breaking change — stop and flag before modifying.
 *
 * Inherited from @nomideusz/svelte-calendar (never redefine here):
 *   TimelineEvent, CalendarAdapter, DateRange
 */

// ─── Status unions ──────────────────────────────────────

/** The 4 pricing models supported by the engine. */
export type PricingModel =
	| 'per_person'
	| 'participant_categories'
	| 'group_tiers'
	| 'private_tour';

/** Booking lifecycle states. */
export type BookingStatus =
	| 'pending'
	| 'confirmed'
	| 'cancelled'
	| 'completed'
	| 'no_show';

/**
 * Slot lifecycle states.
 * See AGENTS.md "Slot State Machine" for the full transition diagram.
 */
export type SlotStatus =
	| 'open'
	| 'full'
	| 'at_risk'
	| 'cancelled'
	| 'completed';

/** Payment processing states. */
export type PaymentStatus =
	| 'pending'
	| 'paid'
	| 'failed'
	| 'refunded'
	| 'partially_refunded';

/** Guest attendance tracking. */
export type AttendanceStatus =
	| 'not_arrived'
	| 'checked_in'
	| 'no_show';

// ─── Schedule patterns ──────────────────────────────────

/**
 * How a offering recurs.
 * - `once`     — a single occurrence on a specific date
 * - `daily`    — every N days (N = `interval`)
 * - `weekly`   — specific `daysOfWeek`, every N weeks (N = `interval`)
 * - `monthly`  — specific `daysOfMonth`, every N months (N = `interval`)
 * - `custom`   — reserved for future custom expansion (not implemented)
 */
export type SchedulePattern = 'once' | 'daily' | 'weekly' | 'monthly' | 'custom';

// ─── Core entities ──────────────────────────────────────

/**
 * What a offering IS — the definition / template.
 * Maps from Zaur's `offerings` table shape, de-SvelteKit-ified.
 */
export interface Offering {
	id: string;
	name: string;
	description: string;
	/** Duration in minutes. */
	duration: number;
	/** Default capacity per slot. */
	capacity: number;
	/** Minimum participants to run the offering. */
	minCapacity: number;
	/** Maximum participants allowed. */
	maxCapacity: number;
	/** ISO language codes. */
	languages: string[];
	/** Location name or address. */
	location?: string;
	/** Offering categories / tags. */
	categories: string[];
	/** Items included in the offering. */
	includedItems: string[];
	/** Requirements for participants. */
	requirements: string[];
	/** Image URLs. */
	images: string[];
	/** Whether the offering is publicly listed. */
	isPublic: boolean;
	/** 'active' or 'draft'. */
	status: 'active' | 'draft';
	/** Pricing configuration. */
	pricing: PriceStructure;
	/** Cancellation policy for this offering. */
	cancellationPolicy: CancellationPolicy;
	/** Schedule rules defining when slots are generated. */
	scheduleRules: ScheduleRule[];
	/** Guide availability constraints. */
	providerAvailability?: ProviderAvailability;
}

/**
 * When a offering runs — recurrence pattern.
 * Maps from booking-platform's RecurrenceRule concept.
 */
export interface ScheduleRule {
	id: string;
	/** The recurrence pattern. */
	pattern: SchedulePattern;
	/**
	 * Days of week (ISO: 1=Monday ... 7=Sunday).
	 * Only relevant when pattern is 'weekly'.
	 */
	daysOfWeek?: number[];
	/**
	 * Days of month (1-31).
	 * Only relevant when pattern is 'monthly'. Months that don't have a listed
	 * day are skipped (e.g. day 31 in February).
	 */
	daysOfMonth?: number[];
	/**
	 * Repeat interval. E.g. 2 with pattern 'weekly' = every other week.
	 * Applies to 'daily', 'weekly', 'monthly'. Defaults to 1 when absent.
	 */
	interval?: number;
	/** Start time in HH:MM format (24h). */
	startTime: string;
	/** End time in HH:MM format (24h). */
	endTime: string;
	/** Date from which this rule is active (ISO date string). */
	validFrom: string;
	/** Date until which this rule is active (ISO date string). Optional. */
	validUntil?: string;
	/**
	 * Dates (ISO YYYY-MM-DD, in the rule's timezone) with NO occurrence —
	 * holidays, closures. The iCal EXDATE analog.
	 */
	excludeDates?: string[];
	/** Timezone identifier (e.g. 'Europe/Warsaw'). */
	timezone: string;
}

/**
 * A specific occurrence of a offering — a bookable time slot.
 * Maps from Zaur's `timeSlots` table.
 */
export interface Slot {
	id: string;
	/** Reference to the parent Offering. */
	offeringId: string;
	/** Slot start datetime. */
	startTime: Date;
	/** Slot end datetime. */
	endTime: Date;
	/** Total spots available for this slot. */
	availableSpots: number;
	/** Number of spots currently booked. */
	bookedSpots: number;
	/** Current lifecycle state. See SlotStatus. */
	status: SlotStatus;
	/** Whether this slot was generated from a ScheduleRule or manually created. */
	isGenerated: boolean;
	/** Reference to the ScheduleRule that generated this slot, if any. */
	scheduleRuleId?: string;
	/** Optional notes for this specific occurrence. */
	notes?: string;
}

/**
 * A tourist's purchase — a confirmed booking.
 * Maps from Zaur's `bookings` table.
 */
export interface Booking {
	id: string;
	/** Reference to the Offering. */
	offeringId: string;
	/** Reference to the specific Slot. */
	slotId: string;
	/** Guest information. */
	guest: GuestProfile;
	/** Total number of participants. */
	participants: number;
	/** Breakdown of participants by category ID. */
	participantsByCategory?: Record<string, number>;
	/** Selected optional add-on IDs. */
	selectedAddonIds?: string[];
	/** Calculated price breakdown. */
	priceBreakdown: PriceBreakdown;
	/** Total amount charged. */
	totalAmount: number;
	/** Currency code (ISO 4217). */
	currency: string;
	/** Current booking status. */
	status: BookingStatus;
	/** Payment processing status. */
	paymentStatus: PaymentStatus;
	/** Unique human-readable booking reference. */
	bookingReference: string;
	/** Guest attendance tracking. */
	attendanceStatus: AttendanceStatus;
	/** Special requests from the guest. */
	specialRequests?: string;
	/** Who cancelled: 'guest' | 'guide' | 'system'. */
	cancelledBy?: 'guest' | 'guide' | 'system';
	/** Reason for cancellation. */
	cancellationReason?: string;
	/** ISO datetime after which a 'pending' booking's capacity hold lapses.
	 *  Absent = the booking never expires (legacy/immediate-confirm flows). */
	expiresAt?: string;
	/** ISO datetime of booking creation. */
	createdAt: string;
}

/**
 * Guest contact information.
 * No auth required — guests book without accounts.
 */
export interface GuestProfile {
	name: string;
	email: string;
	phone?: string;
	/** Preferred language (ISO 639-1 code, e.g. 'en', 'pl'). */
	language?: string;
}

// ─── Pricing ────────────────────────────────────────────

/**
 * Pricing rules for a offering — how to calculate the price.
 * Maps from Zaur's pricingModel + related JSON fields on the offerings table.
 */
export interface PriceStructure {
	/** Which pricing model to use. */
	model: PricingModel;
	/** Base price per person (for 'per_person' model). */
	basePrice: number;
	/** Currency code (ISO 4217). */
	currency: string;
	/** Participant categories with per-category pricing. */
	participantCategories?: ParticipantCategory[];
	/** Group pricing tiers (flat price per group size bracket). */
	groupPricingTiers?: GroupPricingTier[];
	/** Group discount tiers (percentage or fixed discount). */
	groupDiscountTiers?: GroupDiscountTier[];
	/** Whether group discounts are enabled. */
	groupDiscountsEnabled?: boolean;
	/** Optional add-ons. */
	optionalAddons?: OptionalAddon[];
	/** Private offering flat pricing. */
	privateTour?: {
		flatPrice: number;
		minCapacity?: number;
		maxCapacity?: number;
	};
	/** Whether the guide absorbs the processing fee. */
	guidePaysProcessingFee: boolean;
	/** Whether to count infants toward capacity. */
	countInfantsTowardCapacity?: boolean;
}

/**
 * A participant category with its own price.
 * Maps from Zaur's participantCategories JSON field.
 */
export interface ParticipantCategory {
	id: string;
	label: string;
	price: number;
	ageRange?: string;
	description?: string;
	sortOrder: number;
	minAge?: number;
	maxAge?: number;
	/** Whether this category counts toward slot capacity. */
	countsTowardCapacity?: boolean;
}

/**
 * A group pricing tier — flat price for a group size range.
 * Maps from Zaur's groupPricingTiers JSON field.
 */
export interface GroupPricingTier {
	id: string;
	minParticipants: number;
	maxParticipants: number;
	/** Flat price for the entire group in this tier. */
	price: number;
	label?: string;
}

/**
 * A group discount tier — percentage or fixed discount.
 * Maps from Zaur's groupDiscounts JSON field.
 */
export interface GroupDiscountTier {
	id: string;
	minParticipants: number;
	maxParticipants: number;
	discountType: 'percentage' | 'fixed';
	discountValue: number;
	label?: string;
}

/**
 * An optional add-on for a booking.
 * Maps from Zaur's optionalAddons JSON field.
 */
export interface OptionalAddon {
	id: string;
	name: string;
	description?: string;
	/** Price per booking (flat, not per person). */
	price: number;
	/** Whether this add-on is required (always included). */
	required: boolean;
	icon?: string;
}

/**
 * Calculated price result — output of the pricing engine.
 * Maps from Zaur's BookingPriceResult.
 */
export interface PriceBreakdown {
	/** Total base price before discounts. */
	basePrice: number;
	/** Amount saved from group discount. */
	groupDiscount: number;
	/** Base price after group discount. */
	discountedBase: number;
	/** Total cost of selected add-ons. */
	addonsTotal: number;
	/** Subtotal before payment processing fees. */
	subtotal: number;
	/** Payment processing fee (e.g. Stripe). */
	processingFee: number;
	/** Final all-in amount the customer pays. */
	totalAmount: number;
	/** Amount the guide receives after fees. */
	guideReceives: number;
	/** Whether the guide absorbs the processing fee. */
	guidePaysProcessingFee: boolean;
	/** Per-category breakdown, if applicable. */
	categoryBreakdown?: Record<string, {
		label: string;
		count: number;
		originalPrice: number;
		discountedPrice: number;
		subtotal: number;
	}>;
	/** Matched group tier, if applicable. */
	selectedTier?: {
		minParticipants: number;
		maxParticipants: number;
		discountPercent?: number;
		label?: string;
	};
	/** Validation errors from the pricing engine. */
	errors: string[];
}

// ─── Cancellation ───────────────────────────────────────

/**
 * Cancellation and refund policy for a offering.
 * Maps from Zaur's CancellationPolicyConfig.
 */
export interface CancellationPolicy {
	id: string;
	name: string;
	description: string;
	/** Ordered rules — matched by hours before offering start. */
	rules: CancellationRule[];
}

/**
 * A single cancellation rule — refund percentage at a time threshold.
 * Maps from Zaur's CancellationRule.
 */
export interface CancellationRule {
	/** Hours before offering start for this rule to apply. */
	hoursBeforeTour: number;
	/** Refund percentage (0-100). */
	refundPercentage: number;
	/** Human-readable description of this rule. */
	description: string;
}

// ─── Guide availability ─────────────────────────────────

/**
 * Guide availability constraints.
 * Controls when a guide can be booked.
 */
export interface ProviderAvailability {
	/** Blocked time ranges (ISO date strings). */
	blockedRanges?: Array<{
		start: string;
		end: string;
		reason?: string;
	}>;
	/** Buffer time in minutes between consecutive offerings. */
	bufferMinutes: number;
	/** Maximum offerings a guide can run per day. */
	maxToursPerDay: number;
}

// ─── Deprecated aliases (tour-era names, pre-generalization) ────────────────
// The domain went service-neutral while the package was unpublished; these
// keep existing consumers compiling. New code uses the generic names.

/** @deprecated Renamed to `Offering`. */
export type TourDefinition = Offering;
/** @deprecated Renamed to `Slot`. */
export type TourSlot = Slot;
/** @deprecated Renamed to `ProviderAvailability`. */
export type GuideAvailability = ProviderAvailability;
