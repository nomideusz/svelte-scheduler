# @nomideusz/svelte-scheduler

Booking domain engine for Svelte 5 — offerings, recurring schedules, lazy slots, capacity holds, pricing, cancellation policies, tickets and attendance. The layer between "here is a bookable service" and "a paid guest with a QR ticket walked in".

Service-neutral by design: tours, yoga classes, salon appointments, workshops — anything with a schedule, capacity and a price.

## Installation

```bash
npm install @nomideusz/svelte-scheduler @nomideusz/svelte-calendar
```

## The model

```
Offering        what is bookable — duration, capacity, pricing, policy, schedule rules
ScheduleRule    when it recurs — daily / weekly / monthly patterns + excludeDates (EXDATE) for holidays
Slot            one occurrence — generated lazily, persisted on first touch
Booking         a guest's purchase — holds, payment status, reference, attendance
```

Slots are **lazy**: `generateSlots(offering, existingSlots, range)` expands schedule rules on demand and only materializes a row when something happens to it (a booking, an edit). Virtual slots carry `virtual:{offeringId}:{ruleId}:{iso}` ids.

## Quick start

```ts
import {
  createMemoryAdapter, createBooking, confirmBooking, expireHolds,
  calculatePrice, generateSlots, ticketFor, checkIn,
} from '@nomideusz/svelte-scheduler';

const adapter = createMemoryAdapter(); // or your own SchedulerAdapter

// A pending booking holds seats for 30 minutes while the guest pays
const booking = await createBooking(adapter, slotId, guest, 2, { holdMinutes: 30 });

// Payment settled → confirm (idempotent; expired holds re-validate capacity)
await confirmBooking(adapter, booking.id);

// The ticket is a reference + verify URL — render it as a QR
const ticket = ticketFor(booking, 'https://example.com');

// At the door
await checkIn(adapter, booking.id);
```

Persistence is one interface — `SchedulerAdapter` (offerings, slots, bookings CRUD). The in-memory reference implementation runs the complete flow; write a database adapter by mirroring it.

## Client ↔ server RPC

Expose any adapter over HTTP with deny-by-default authorization:

```ts
// server route
const handle = createSchedulerHandler(adapter, {
  authorize: ({ method, args, ctx }) => canManage(ctx.user, args),
});
export const POST = ({ request, locals }) => handle(request, { user: locals.user });

// browser — a full SchedulerAdapter for BookingFlow / AvailabilityPicker
const rpc = createFetchAdapter({ endpoint: '/api/scheduler' });
```

The default public surface is exactly the guest booking flow; everything else is unreachable without `authorize`. Domain errors (`BookingError`, `AttendanceError`) rethrow client-side with their code.

## What's inside

- **Pricing engine** — per-person, participant categories, group tiers, private pricing, add-ons, group discounts
- **Cancellation policies** — rule-based refund calculation; provider cancellations always refund 100%
- **Holds** — pending bookings with TTL occupy capacity; `expireHolds` releases lapsed ones; capacity math counts confirmed + live holds
- **Conflicts** — overlap detection within and across offerings
- **Tickets & attendance** — reference generation, verify-URL payloads, check-in / no-show transitions
- **Calendar bridge** — `toTimelineEvent` / `toCalendarAdapter` render slots on [@nomideusz/svelte-calendar](https://www.npmjs.com/package/@nomideusz/svelte-calendar)
- **UI components** — `BookingFlow` (6-step guest flow), `AvailabilityPicker`, `CancelFlow`, `GroupManifest`

Pure logic throughout: no database, no payment SDK, no framework server code. Pair with [@nomideusz/svelte-payments](https://www.npmjs.com/package/@nomideusz/svelte-payments) for checkout.

## License

MIT
