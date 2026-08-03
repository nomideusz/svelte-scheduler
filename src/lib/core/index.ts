export type {
	PricingModel,
	BookingStatus,
	SlotStatus,
	PaymentStatus,
	AttendanceStatus,
	SchedulePattern,
	Offering,
	ScheduleRule,
	Slot,
	Booking,
	GuestProfile,
	PriceStructure,
	ParticipantCategory,
	GroupPricingTier,
	GroupDiscountTier,
	OptionalAddon,
	PriceBreakdown,
	CancellationPolicy,
	CancellationRule,
	ProviderAvailability,
	// deprecated tour-era aliases
	TourDefinition,
	TourSlot,
	GuideAvailability,
} from './types.js';

export {
	CANCELLATION_POLICIES,
	getApplicableRule,
	calculateRefund,
	describeRefund,
} from './policy.js';

// ─── Pricing engine ─────────────────────────────────────
export type { StripeFeeEntry, PricingInput } from './pricing/index.js';
export { STRIPE_FEES, calculatePrice } from './pricing/index.js';

export type { OccurrencePair } from './events/recurrence.js';
export { expandRule } from './events/recurrence.js';
export { generateSlots } from './events/generator.js';

// ─── Conflict detection ─────────────────────────────────
export type {
	SlotLike,
	ConflictPair,
	Slots,
	CrossTourConflict,
} from './events/conflicts.js';
export { detectConflicts, detectCrossTourConflicts } from './events/conflicts.js';

// ─── Capacity utilities ─────────────────────────────────
export { availableSpots, isFull, isAtRisk, checkCapacity } from './capacity.js';

// ─── Booking state machine ──────────────────────────────
export { createBooking, confirmBooking, cancelBooking, BookingError } from './booking.js';

// ─── Holds, attendance, tickets ─────────────────────────
export {
	DEFAULT_HOLD_MINUTES,
	holdExpiry,
	isExpiredHold,
	occupyingBookings,
	recountSlotCapacity,
	expireHolds,
} from './holds.js';
export { checkIn, markNoShow, resetAttendance, AttendanceError } from './attendance.js';
export type { Ticket } from './ticket.js';
export { ticketFor, generateBookingReference } from './ticket.js';
