# Changelog

## Unreleased

### Changed
- `sideEffects: false`, so bundlers can tree-shake unused exports.
  Not yet released — this package has no publish path from the monorepo,
  see docs/plans/2026-08-02-v1-roadmap.md.

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
