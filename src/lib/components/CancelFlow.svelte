<script lang="ts">
	import type { SchedulerAdapter } from '../adapters/types.js';
	import type { Booking, Slot, Offering } from '../core/types.js';
	import { cancelBooking } from '../core/booking.js';
	import { calculateRefund } from '../core/policy.js';

	interface Props {
		adapter: SchedulerAdapter;
		bookingId: string;
		cancelledBy?: 'guest' | 'guide';
		oncancelled?: (result: { booking: Booking; refundAmount: number }) => void;
		onaborted?: () => void;
	}

	let { adapter, bookingId, cancelledBy = 'guest', oncancelled, onaborted }: Props = $props();

	// Steps: 1=load, 2=refund-preview, 3=confirm, 4=result
	let step = $state(1);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let submitting = $state(false);

	let booking = $state<Booking | null>(null);
	let slot = $state<Slot | null>(null);
	let offering = $state<Offering | null>(null);
	let refundAmount = $state(0);
	let refundPercentage = $state(0);
	let cancelledBooking = $state<Booking | null>(null);

	$effect(() => {
		loadBooking();
	});

	async function loadBooking() {
		loading = true;
		error = null;
		try {
			booking = (await adapter.getBookingById(bookingId)) ?? null;
			if (!booking) {
				error = 'Booking not found.';
				return;
			}
			slot = (await adapter.getSlotById(booking.slotId)) ?? null;
			offering = (await adapter.getOfferingById(booking.offeringId)) ?? null;
			if (!slot || !offering) {
				error = 'Associated offering or slot not found.';
				return;
			}
			const refundResult = calculateRefund(
				booking.totalAmount,
				offering.cancellationPolicy,
				slot.startTime,
				cancelledBy,
			);
			refundAmount = refundResult.refundAmount;
			refundPercentage = refundResult.refundPercentage;
			step = 2;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load booking.';
		} finally {
			loading = false;
		}
	}

	async function handleConfirm() {
		submitting = true;
		error = null;
		try {
			const result = await cancelBooking(adapter, bookingId, cancelledBy);
			cancelledBooking = result.booking;
			step = 4;
			oncancelled?.(result);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Cancellation failed. Please try again.';
		} finally {
			submitting = false;
		}
	}

	function formatDate(d: Date): string {
		return new Date(d).toLocaleString(undefined, {
			weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
			hour: '2-digit', minute: '2-digit',
		});
	}

	// Booking amounts are in major units (20 = €20).
	function formatCurrency(amount: number, currency: string): string {
		return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
	}
</script>

<div class="cf-root">
	{#if loading}
		<p class="cf-loading">Loading booking…</p>
	{:else if error && step === 1}
		<p class="cf-error">{error}</p>
	{:else if booking && slot && offering}

		<!-- Step 2: Refund preview -->
		{#if step === 2}
			<div class="cf-panel">
				<h2 class="cf-heading">Cancel booking</h2>
				<dl class="cf-dl">
					<dt>Reference</dt><dd>{booking.bookingReference}</dd>
					<dt>Service</dt><dd>{offering.name}</dd>
					<dt>Date</dt><dd>{formatDate(slot.startTime)}</dd>
					<dt>Participants</dt><dd>{booking.participants}</dd>
					<dt>Total paid</dt><dd>{formatCurrency(booking.totalAmount, booking.currency)}</dd>
				</dl>
				<div class="cf-refund-box">
					<span class="cf-refund-label">Refund amount</span>
					<strong class="cf-refund-amount">
						{formatCurrency(refundAmount, booking.currency)}
					</strong>
					<span class="cf-refund-pct">({refundPercentage}%)</span>
				</div>
				{#if cancelledBy === 'guide'}
					<p class="cf-note">Guide cancellation — full refund is guaranteed.</p>
				{/if}
				<div class="cf-actions">
					{#if onaborted}
						<button class="cf-btn cf-btn--secondary" onclick={onaborted}>Keep booking</button>
					{/if}
					<button class="cf-btn cf-btn--danger" onclick={() => { error = null; step = 3; }}>
						Proceed to cancel
					</button>
				</div>
			</div>

		<!-- Step 3: Confirm cancellation -->
		{:else if step === 3}
			<div class="cf-panel">
				<h2 class="cf-heading">Confirm cancellation</h2>
				{#if error}<p class="cf-error">{error}</p>{/if}
				<p class="cf-confirm-msg">
					Are you sure you want to cancel <strong>{booking.bookingReference}</strong>?
					You will receive a refund of <strong>{formatCurrency(refundAmount, booking.currency)}</strong>.
				</p>
				<div class="cf-actions">
					<button class="cf-btn cf-btn--secondary" onclick={() => step = 2} disabled={submitting}>
						Back
					</button>
					<button class="cf-btn cf-btn--danger" onclick={handleConfirm} disabled={submitting}>
						{submitting ? 'Cancelling…' : 'Confirm cancellation'}
					</button>
				</div>
			</div>

		<!-- Step 4: Result -->
		{:else if step === 4 && cancelledBooking}
			<div class="cf-panel cf-panel--done">
				<h2 class="cf-heading">Booking cancelled</h2>
				<p class="cf-confirm-msg">
					Booking <strong>{cancelledBooking.bookingReference}</strong> has been cancelled.
				</p>
				<div class="cf-refund-box">
					<span class="cf-refund-label">Refund amount</span>
					<strong class="cf-refund-amount">{formatCurrency(refundAmount, cancelledBooking.currency)}</strong>
				</div>
				<p class="cf-note">The refund will be processed within 5–10 business days.</p>
			</div>
		{/if}
	{/if}
</div>

<style>
	.cf-root {
		font-family: var(--asini-font-sans, sans-serif);
		color: var(--asini-text, #111);
		background: var(--asini-bg, #fff);
		max-width: 480px;
	}

	.cf-loading,
	.cf-error {
		padding: 0.75rem 1rem;
		border-radius: var(--asini-radius-sm, 4px);
	}

	.cf-loading {
		color: var(--asini-text-2, #555);
	}

	.cf-error {
		color: var(--asini-danger, #c00);
		background: color-mix(in srgb, var(--asini-danger, #c00) 10%, transparent);
		margin-bottom: 0.75rem;
	}

	.cf-panel {
		background: var(--asini-surface, #f9f9f9);
		border: 1px solid var(--asini-border, #ddd);
		border-radius: var(--asini-radius, 8px);
		padding: 1.5rem;
	}

	.cf-panel--done {
		border-color: var(--asini-success, #009900);
	}

	.cf-heading {
		margin: 0 0 1rem;
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--asini-text, #111);
	}

	.cf-dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.35rem 1rem;
		margin: 0 0 1rem;
	}

	.cf-dl dt {
		color: var(--asini-text-2, #555);
		font-size: 0.875rem;
	}

	.cf-dl dd {
		margin: 0;
		font-size: 0.875rem;
	}

	.cf-refund-box {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: color-mix(in srgb, var(--asini-info, #0077cc) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--asini-info, #0077cc) 30%, transparent);
		border-radius: var(--asini-radius-sm, 4px);
		margin-bottom: 1rem;
	}

	.cf-refund-label {
		font-size: 0.875rem;
		color: var(--asini-text-2, #555);
	}

	.cf-refund-amount {
		font-size: 1.25rem;
		color: var(--asini-accent, #0066cc);
	}

	.cf-refund-pct {
		font-size: 0.8rem;
		color: var(--asini-text-3, #999);
	}

	.cf-confirm-msg {
		font-size: 0.95rem;
		margin-bottom: 1rem;
	}

	.cf-note {
		font-size: 0.875rem;
		color: var(--asini-text-2, #555);
		margin-top: 0.5rem;
	}

	.cf-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 1.25rem;
	}

	.cf-btn {
		padding: 0.5rem 1.25rem;
		border-radius: var(--asini-radius-sm, 4px);
		font-family: inherit;
		font-size: 0.95rem;
		font-weight: 500;
		cursor: pointer;
		border: 1px solid transparent;
		transition: opacity 0.15s;
	}

	.cf-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.cf-btn--secondary {
		background: var(--asini-surface, #f5f5f5);
		color: var(--asini-text, #111);
		border-color: var(--asini-border, #ddd);
	}

	.cf-btn--danger {
		background: var(--asini-danger, #c00);
		color: #fff;
		border-color: var(--asini-danger, #c00);
	}
</style>
