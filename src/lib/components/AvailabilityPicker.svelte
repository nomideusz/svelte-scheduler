<script lang="ts" module>
	import type { Slot } from '../core/types.js';

	/** All user-visible text in AvailabilityPicker. Override via the `labels` prop. */
	export interface AvailabilityPickerLabels {
		loading: string;
		empty: string;
		offeringNotFound: string;
		loadFailed: string;
		status: Record<Slot['status'], string>;
		/** e.g. "3 spots" */
		nSpots: (n: number) => string;
	}

	export const defaultAvailabilityPickerLabels: AvailabilityPickerLabels = {
		loading: 'Loading availability…',
		empty: 'No available slots in this date range.',
		offeringNotFound: 'Offering not found.',
		loadFailed: 'Failed to load availability.',
		status: {
			open: 'Available',
			full: 'Full',
			at_risk: 'At risk',
			completed: 'Completed',
			cancelled: 'Cancelled',
		},
		nSpots: (n) => `${n} spot${n === 1 ? '' : 's'}`,
	};
</script>

<script lang="ts">
	import type { SchedulerAdapter } from '../adapters/types.js';
	import type { DateRange } from '@nomideusz/svelte-calendar';
	import { generateSlots } from '../core/events/generator.js';

	interface Props {
		adapter: SchedulerAdapter;
		offeringId: string;
		range: DateRange;
		onselect?: (slot: Slot) => void;
		/** BCP 47 tag for date/time formatting, e.g. 'pl-PL'. Default: browser locale. */
		locale?: string;
		labels?: Partial<AvailabilityPickerLabels>;
	}

	let { adapter, offeringId, range, onselect, locale, labels }: Props = $props();

	const L = $derived({ ...defaultAvailabilityPickerLabels, ...labels });

	let loading = $state(true);
	let error = $state<string | null>(null);
	let slots = $state<Slot[]>([]);

	$effect(() => {
		// Re-run whenever offeringId or range changes
		void offeringId;
		void range;
		loadSlots();
	});

	async function loadSlots() {
		loading = true;
		error = null;
		try {
			const offering = await adapter.getOfferingById(offeringId);
			if (!offering) {
				error = L.offeringNotFound;
				return;
			}
			const existing = await adapter.getSlots(offeringId, range);
			const all = generateSlots(offering, existing, range);
			// Show only non-cancelled, non-full for picking
			slots = all.filter((s) => s.status !== 'cancelled');
		} catch (e) {
			error = e instanceof Error ? e.message : L.loadFailed;
		} finally {
			loading = false;
		}
	}

	function availableSpots(slot: Slot): number {
		return slot.availableSpots - slot.bookedSpots;
	}

	function formatDate(d: Date): string {
		return new Date(d).toLocaleDateString(locale, {
			weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
		});
	}

	function formatTime(d: Date): string {
		return new Date(d).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
	}
</script>

<div class="ap-root">
	{#if loading}
		<p class="ap-loading">{L.loading}</p>
	{:else if error}
		<p class="ap-error">{error}</p>
	{:else if slots.length === 0}
		<p class="ap-empty">{L.empty}</p>
	{:else}
		<ul class="ap-list" role="list">
			{#each slots as slot (slot.id)}
				<li class="ap-item ap-item--{slot.status}">
					<button
						class="ap-row"
						onclick={() => onselect?.(slot)}
						disabled={slot.status === 'full' || slot.status === 'completed'}
						aria-label="{formatDate(slot.startTime)} {formatTime(slot.startTime)}, {L.nSpots(availableSpots(slot))}"
					>
						<span class="ap-date">{formatDate(slot.startTime)}</span>
						<span class="ap-time">{formatTime(slot.startTime)}</span>
						<span class="ap-spots">
							{#if slot.status === 'full'}
								{L.status.full}
							{:else}
								{L.nSpots(availableSpots(slot))}
							{/if}
						</span>
						<span class="ap-badge ap-badge--{slot.status}">{L.status[slot.status]}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.ap-root {
		font-family: var(--asini-font-sans, sans-serif);
		color: var(--asini-text, #111);
	}

	.ap-loading,
	.ap-error,
	.ap-empty {
		padding: 0.75rem 1rem;
		border-radius: var(--asini-radius-sm, 4px);
		font-size: 0.875rem;
	}

	.ap-loading {
		color: var(--asini-text-2, #555);
	}

	.ap-error {
		color: var(--asini-danger, #c00);
		background: color-mix(in srgb, var(--asini-danger, #c00) 10%, transparent);
	}

	.ap-empty {
		color: var(--asini-text-3, #999);
	}

	.ap-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.ap-item {
		border-radius: var(--asini-radius-sm, 4px);
		overflow: hidden;
	}

	.ap-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		width: 100%;
		padding: 0.75rem 1rem;
		background: var(--asini-surface, #f9f9f9);
		border: 1px solid var(--asini-border, #ddd);
		border-radius: var(--asini-radius-sm, 4px);
		cursor: pointer;
		font-family: inherit;
		font-size: 0.875rem;
		color: var(--asini-text, #111);
		text-align: left;
		transition: background 0.12s;
	}

	.ap-row:hover:not(:disabled) {
		background: var(--asini-surface-raised, #f0f0f0);
	}

	.ap-row:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.ap-date {
		flex: 1;
		font-weight: 500;
	}

	.ap-time {
		color: var(--asini-text-2, #555);
		white-space: nowrap;
	}

	.ap-spots {
		color: var(--asini-text-2, #555);
		white-space: nowrap;
		font-size: 0.8rem;
	}

	.ap-badge {
		padding: 0.2rem 0.5rem;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 600;
		white-space: nowrap;
	}

	.ap-badge--open {
		background: color-mix(in srgb, var(--asini-success, #009900) 15%, transparent);
		color: var(--asini-success, #009900);
	}

	.ap-badge--full {
		background: color-mix(in srgb, var(--asini-warning, #cc6600) 15%, transparent);
		color: var(--asini-warning, #cc6600);
	}

	.ap-badge--at_risk {
		background: color-mix(in srgb, var(--asini-warning, #cc6600) 15%, transparent);
		color: var(--asini-warning, #cc6600);
	}

	.ap-badge--completed {
		background: color-mix(in srgb, var(--asini-text-3, #999) 15%, transparent);
		color: var(--asini-text-3, #999);
	}

	.ap-badge--cancelled {
		background: color-mix(in srgb, var(--asini-danger, #c00) 15%, transparent);
		color: var(--asini-danger, #c00);
	}
</style>
