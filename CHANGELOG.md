# Changelog

## 0.4.2

### Patch Changes

- Updated dependencies
  - @nomideusz/svelte-calendar@0.15.2

## 0.4.1

### Patch Changes

- a80cf55: Peer range for `@nomideusz/svelte-calendar` corrected to `^0.14.0`. The
  published `^0.6.0` could never resolve to the calendar the workspace actually
  builds against (0.x carets don't cross minors), so external installs paired
  scheduler with a calendar eight minors stale.

## 0.4.0 — 2026-08-17

### Added
- **Series bookings** — one purchase, one seat, N sessions (a kurs sold as
  eight Tuesdays). `createBooking` now accepts `string | string[]`; an array
  reserves **all-or-nothing** across every session and stores them on the new
  `Booking.slotIds`. `slotId` remains the anchor (the first session), so a
  single-session booking is stored exactly as before and `slotIds` is absent.
- `checkIn` / `markNoShow` / `resetAttendance` take an optional `slotId` to
  record attendance for ONE session of a series. The core validates the slot
  belongs to the booking; adapters decide how to store it.
- `PaymentStatus` gained **`deposit_paid`** — the guest paid a deposit and the
  balance is owed, typically at the door. This describes how much of a
  *booking* is settled, which is why `partially_refunded` already lived here;
  the per-charge vocabulary stays in `@nomideusz/svelte-payments`.

### Changed — adapter contract
- `getBookingsForSlot(slotId)` must now answer by **membership, not anchor**:
  an adapter supporting series returns a booking for every slot in its
  `slotIds`. Capacity is derived from this call, so returning only the anchor
  lets sessions 2..N be overbooked. Adapters without series are unaffected —
  with no `slotIds`, anchor and membership are the same thing.
- `updateAttendance` takes an optional third argument, `slotId`.
- `cancelBooking` recounts every session of a series, not just the anchor.

### Compatibility
Additive. Existing single-slot callers need no change. **One caveat for
consumers that persist `paymentStatus` into a narrow column or enum**: adding
`deposit_paid` widens the type, so a database enum of the old five values will
now fail to typecheck at the insert (this is how thebest caught it) — either
add the value to your column or narrow explicitly at your adapter boundary.

## 0.3.2 — 2026-08-03

### Added
- Demo site at https://svelte-scheduler.vercel.app/ — AvailabilityPicker,
  BookingFlow, CancelFlow and GroupManifest. `homepage` now points at it.

## 0.3.1 — 2026-08-03

### Changed
- `sideEffects: false` in package.json, so bundlers can tree-shake unused
  exports. Every module here is pure; without the declaration a consumer
  importing one helper had to ship the whole library.

### Added
- Standalone repo at github.com/nomideusz/svelte-scheduler with a Release & Publish
  workflow, so this package has a reproducible release path for the first time.

Backfilled 2026-08-02 from git history. Entries before that date are
reconstructed from commits, so they record what changed rather than a release
that was tagged at the time.

## 0.3.0 — 2026-07-30

### Added
- Closed dates: providers can block out dates that then never yield bookable slots.
- `AvailabilityPicker` i18n, and a payment seam in `BookingFlow` so the host app
  supplies the payment step rather than the package hard-coding one.

### Changed
- Real timezone support, in step with `svelte-calendar` 0.9.0.

## 0.2.0 — 2026-07-29

### Added
- RPC layer: `createSchedulerHandler` + `createFetchAdapter`, so the scheduler
  core can run server-side with a thin typed client in the browser.
- Booking holds, confirm, attendance and ticket primitives.

### Changed
- **Breaking — domain generalized away from tours.** `Tour*` types became
  `Offering`/`Slot`, and `guide` became `provider`, so the package describes
  scheduling rather than one vertical. This is what let yoga adopt it alongside
  thebest.

## 0.1.0

Initial extraction from the Zaur reference implementation: scheduling core,
components, and the calendar bridge.
