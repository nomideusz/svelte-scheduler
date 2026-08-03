// ─── Re-exports from @nomideusz/svelte-calendar (peer dep) ──
// These types are inherited — never redefined in this package.
export type {
	TimelineEvent,
	CalendarAdapter,
	DateRange,
} from '@nomideusz/svelte-calendar';

// ─── Core domain types ──────────────────────────────────
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
} from './core/index.js';

// ─── Cancellation policy ────────────────────────────────
export {
	CANCELLATION_POLICIES,
	getApplicableRule,
	calculateRefund,
	describeRefund,
} from './core/index.js';

// ─── Pricing engine ─────────────────────────────────────
export type { StripeFeeEntry, PricingInput } from './core/index.js';
export { STRIPE_FEES, calculatePrice } from './core/index.js';

// ─── Recurrence & slot generation ───────────────────────
export type { OccurrencePair } from './core/index.js';
export { expandRule, generateSlots } from './core/index.js';

// ─── Conflict detection ─────────────────────────────────
export type {
	SlotLike,
	ConflictPair,
	Slots,
	CrossTourConflict,
} from './core/index.js';
export { detectConflicts, detectCrossTourConflicts } from './core/index.js';

// ─── Capacity utilities ─────────────────────────────────
export { availableSpots, isFull, isAtRisk, checkCapacity } from './core/index.js';

// ─── Booking state machine ──────────────────────────────
export { createBooking, confirmBooking, cancelBooking, BookingError } from './core/index.js';
export {
	DEFAULT_HOLD_MINUTES,
	holdExpiry,
	isExpiredHold,
	occupyingBookings,
	recountSlotCapacity,
	expireHolds,
	checkIn,
	markNoShow,
	resetAttendance,
	AttendanceError,
	ticketFor,
	generateBookingReference,
} from './core/index.js';
export type { Ticket } from './core/index.js';

// ─── Adapter interface ──────────────────────────────────
export type {
	SchedulerAdapter,
} from './adapters/index.js';

// ─── In-memory adapter ──────────────────────────────────
export { createMemoryAdapter } from './adapters/index.js';
export type { MemoryAdapterSeed } from './adapters/index.js';

// ─── RPC (client components ↔ server adapter over HTTP) ─
export {
	createSchedulerHandler,
	SCHEDULER_METHODS,
	PUBLIC_SCHEDULER_METHODS,
} from './rpc/handler.js';
export type { SchedulerMethod, SchedulerHandlerOptions } from './rpc/handler.js';
export { createFetchAdapter } from './rpc/client.js';
export type { FetchAdapterOptions } from './rpc/client.js';

// ─── Svelte components ──────────────────────────────────
export { BookingFlow, CancelFlow, AvailabilityPicker, GroupManifest, useScheduler } from './components/index.js';

// ─── Calendar bridge ─────────────────────────────────────
export { toTimelineEvent, toCalendarAdapter } from './bridge/index.js';
