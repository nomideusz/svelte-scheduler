<script lang="ts">
	import type { SchedulerAdapter } from '../adapters/types.js';
	import type { Booking } from '../core/types.js';

	interface Props {
		adapter: SchedulerAdapter;
		slotId: string;
	}

	let { adapter, slotId }: Props = $props();

	let loading = $state(true);
	let error = $state<string | null>(null);
	let bookings = $state<Booking[]>([]);

	$effect(() => {
		void slotId;
		loadBookings();
	});

	async function loadBookings() {
		loading = true;
		error = null;
		try {
			bookings = await adapter.getBookingsForSlot(slotId);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load bookings.';
		} finally {
			loading = false;
		}
	}

	let totalParticipants = $derived(
		bookings.filter((b) => b.status !== 'cancelled').reduce((s, b) => s + b.participants, 0),
	);

	let totalRevenue = $derived(
		bookings.filter((b) => b.status !== 'cancelled').reduce((s, b) => s + b.totalAmount, 0),
	);

	let currency = $derived(bookings[0]?.currency ?? 'USD');

	// Booking amounts are in major units (20 = €20).
	function formatCurrency(amount: number, cur: string): string {
		return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(amount);
	}

	function statusLabel(status: Booking['status']): string {
		switch (status) {
			case 'pending': return 'Pending';
			case 'confirmed': return 'Confirmed';
			case 'cancelled': return 'Cancelled';
			case 'completed': return 'Completed';
			case 'no_show': return 'No-show';
		}
	}
</script>

<div class="gm-root">
	{#if loading}
		<p class="gm-loading">Loading bookings…</p>
	{:else if error}
		<p class="gm-error">{error}</p>
	{:else if bookings.length === 0}
		<p class="gm-empty">No bookings for this slot.</p>
	{:else}
		<div class="gm-summary">
			<span>Total participants: <strong>{totalParticipants}</strong></span>
			<span>Total revenue: <strong>{formatCurrency(totalRevenue, currency)}</strong></span>
		</div>
		<div class="gm-table-wrapper">
			<table class="gm-table">
				<thead>
					<tr>
						<th>Reference</th>
						<th>Guest</th>
						<th>Email</th>
						<th>Participants</th>
						<th>Status</th>
					</tr>
				</thead>
				<tbody>
					{#each bookings as b (b.id)}
						<tr class="gm-row gm-row--{b.status}">
							<td class="gm-ref">{b.bookingReference}</td>
							<td>{b.guest.name}</td>
							<td class="gm-email">{b.guest.email}</td>
							<td class="gm-center">{b.participants}</td>
							<td>
								<span class="gm-badge gm-badge--{b.status}">{statusLabel(b.status)}</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.gm-root {
		font-family: var(--asini-font-sans, sans-serif);
		color: var(--asini-text, #111);
	}

	.gm-loading,
	.gm-error,
	.gm-empty {
		padding: 0.75rem 1rem;
		border-radius: var(--asini-radius-sm, 4px);
		font-size: 0.875rem;
	}

	.gm-loading {
		color: var(--asini-text-2, #555);
	}

	.gm-error {
		color: var(--asini-danger, #c00);
		background: color-mix(in srgb, var(--asini-danger, #c00) 10%, transparent);
	}

	.gm-empty {
		color: var(--asini-text-3, #999);
	}

	.gm-summary {
		display: flex;
		gap: 1.5rem;
		padding: 0.75rem 1rem;
		background: var(--asini-surface, #f9f9f9);
		border: 1px solid var(--asini-border, #ddd);
		border-radius: var(--asini-radius-sm, 4px);
		margin-bottom: 0.75rem;
		font-size: 0.875rem;
	}

	.gm-table-wrapper {
		overflow-x: auto;
		border: 1px solid var(--asini-border, #ddd);
		border-radius: var(--asini-radius-sm, 4px);
	}

	.gm-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	.gm-table th {
		padding: 0.5rem 0.75rem;
		text-align: left;
		background: var(--asini-surface, #f5f5f5);
		color: var(--asini-text-2, #555);
		font-weight: 600;
		border-bottom: 1px solid var(--asini-border, #ddd);
		white-space: nowrap;
	}

	.gm-table td {
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--asini-border, #eee);
		vertical-align: middle;
	}

	.gm-row--cancelled td {
		opacity: 0.6;
	}

	.gm-ref {
		font-family: var(--asini-font-mono, monospace);
		font-size: 0.8rem;
	}

	.gm-email {
		color: var(--asini-text-2, #555);
	}

	.gm-center {
		text-align: center;
	}

	.gm-badge {
		padding: 0.2rem 0.5rem;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 600;
		white-space: nowrap;
	}

	.gm-badge--confirmed {
		background: color-mix(in srgb, var(--asini-success, #009900) 15%, transparent);
		color: var(--asini-success, #009900);
	}

	.gm-badge--pending {
		background: color-mix(in srgb, var(--asini-warning, #cc6600) 15%, transparent);
		color: var(--asini-warning, #cc6600);
	}

	.gm-badge--cancelled {
		background: color-mix(in srgb, var(--asini-danger, #c00) 15%, transparent);
		color: var(--asini-danger, #c00);
	}

	.gm-badge--completed {
		background: color-mix(in srgb, var(--asini-accent, #0066cc) 15%, transparent);
		color: var(--asini-accent, #0066cc);
	}

	.gm-badge--no_show {
		background: color-mix(in srgb, var(--asini-text-3, #999) 15%, transparent);
		color: var(--asini-text-3, #999);
	}
</style>
