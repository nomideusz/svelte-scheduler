<script lang="ts">
	import { createMemoryAdapter } from '$lib/adapters/memory.js';
	import BookingFlow from '$lib/components/BookingFlow.svelte';
	import CancelFlow from '$lib/components/CancelFlow.svelte';
	import AvailabilityPicker from '$lib/components/AvailabilityPicker.svelte';
	import GroupManifest from '$lib/components/GroupManifest.svelte';
	import type { Booking, Slot } from '$lib/core/types.js';

	// ─── Seed data ────────────────────────────────────────

	const now = new Date();
	function d(offsetDays: number, hours = 10): Date {
		const dt = new Date(now);
		dt.setDate(dt.getDate() + offsetDays);
		dt.setHours(hours, 0, 0, 0);
		return dt;
	}

	const adapter = createMemoryAdapter({
		offerings: [
			{
				id: 'tour-1',
				name: 'City Walking Tour',
				description: 'Explore the old town on foot.',
				duration: 120,
				capacity: 12,
				minCapacity: 2,
				maxCapacity: 12,
				languages: ['en', 'pl'],
				location: 'Market Square',
				categories: ['walking', 'history'],
				includedItems: ['Guide', 'Map'],
				requirements: ['Comfortable shoes'],
				images: [],
				isPublic: true,
				status: 'active',
				pricing: {
					model: 'per_person',
					basePrice: 2500,
					currency: 'PLN',
					guidePaysProcessingFee: false,
				},
				cancellationPolicy: {
					id: 'flexible',
					name: 'Flexible',
					description: 'Full refund up to 24h before.',
					rules: [
						{ hoursBeforeTour: 24, refundPercentage: 100, description: 'Full refund > 24h' },
						{ hoursBeforeTour: 0, refundPercentage: 0, description: 'No refund < 24h' },
					],
				},
				scheduleRules: [
					{
						id: 'rule-1',
						pattern: 'weekly',
						daysOfWeek: [2, 4, 6],
						startTime: '10:00',
						endTime: '12:00',
						validFrom: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
						timezone: 'Europe/Warsaw',
					},
				],
			},
			{
				id: 'tour-2',
				name: 'Kayak River Tour',
				description: 'Paddle through scenic waterways.',
				duration: 180,
				capacity: 8,
				minCapacity: 2,
				maxCapacity: 8,
				languages: ['en'],
				location: 'River Dock',
				categories: ['outdoor', 'adventure'],
				includedItems: ['Kayak', 'Life vest', 'Instructor'],
				requirements: ['Basic swimming ability'],
				images: [],
				isPublic: true,
				status: 'active',
				pricing: {
					model: 'per_person',
					basePrice: 5500,
					currency: 'PLN',
					guidePaysProcessingFee: true,
				},
				cancellationPolicy: {
					id: 'moderate',
					name: 'Moderate',
					description: 'Full refund 48h+, 50% refund 24–48h.',
					rules: [
						{ hoursBeforeTour: 48, refundPercentage: 100, description: 'Full refund > 48h' },
						{ hoursBeforeTour: 24, refundPercentage: 50, description: '50% refund 24–48h' },
						{ hoursBeforeTour: 0, refundPercentage: 0, description: 'No refund < 24h' },
					],
				},
				scheduleRules: [
					{
						id: 'rule-2',
						pattern: 'weekly',
						daysOfWeek: [3, 6],
						startTime: '09:00',
						endTime: '12:00',
						validFrom: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
						timezone: 'Europe/Warsaw',
					},
				],
			},
		],
		slots: [
			{
				id: 'slot-1',
				offeringId: 'tour-1',
				startTime: d(1),
				endTime: d(1, 12),
				availableSpots: 12,
				bookedSpots: 2,
				status: 'open',
				isGenerated: false,
			},
			{
				id: 'slot-2',
				offeringId: 'tour-1',
				startTime: d(3),
				endTime: d(3, 12),
				availableSpots: 12,
				bookedSpots: 0,
				status: 'open',
				isGenerated: false,
			},
			{
				id: 'slot-3',
				offeringId: 'tour-2',
				startTime: d(2, 9),
				endTime: d(2, 12),
				availableSpots: 8,
				bookedSpots: 3,
				status: 'open',
				isGenerated: false,
			},
		],
		bookings: [
			{
				id: 'booking-existing',
				bookingReference: 'BK-DEMO0001',
				offeringId: 'tour-1',
				slotId: 'slot-1',
				guest: { name: 'Anna Kowalska', email: 'anna@example.com', phone: '+48 600 000 001' },
				participants: 2,
				priceBreakdown: {
					basePrice: 5000, groupDiscount: 0, discountedBase: 5000, addonsTotal: 0,
					subtotal: 5000, processingFee: 145, totalAmount: 5145,
					guideReceives: 5000, guidePaysProcessingFee: false, errors: [],
				},
				totalAmount: 5145,
				currency: 'PLN',
				status: 'confirmed',
				paymentStatus: 'paid',
				attendanceStatus: 'not_arrived',
				createdAt: new Date(now.getTime() - 86_400_000).toISOString(),
			},
		],
	});

	// ─── Demo state ───────────────────────────────────────

	let activeDemo = $state<'booking' | 'cancel' | 'availability' | 'manifest'>('availability');
	let selectedSlotId = $state<string | null>(null);
	let selectedSlot = $state<Slot | undefined>(undefined);
	let completedBookingId = $state<string | null>(null);
	let cancelTarget = $state('booking-existing');
	const pickerRange = { start: now, end: d(14) };

	function handleSlotSelect(slot: Slot) {
		selectedSlotId = slot.id;
		selectedSlot = slot;
		activeDemo = 'booking';
	}

	function handleBooked(booking: Booking) {
		completedBookingId = booking.id;
		cancelTarget = booking.id;
	}

	function handleCancelled() {
		// switch back to availability view after cancellation
		activeDemo = 'availability';
	}
</script>

<svelte:head>
	<title>@nomideusz/svelte-scheduler — booking &amp; scheduling for Svelte 5</title>
	<meta
		name="description"
		content="Booking and scheduling logic for Svelte 5 — offerings, slots, availability, holds, pricing and cancellation policies, with headless components over a pluggable adapter."
	/>
</svelte:head>


<div class="demo-root">
	<h1>@nomideusz/svelte-scheduler — Component Demo</h1>

	<nav class="demo-nav">
		<button class:active={activeDemo === 'availability'} onclick={() => activeDemo = 'availability'}>
			AvailabilityPicker
		</button>
		<button class:active={activeDemo === 'booking'} onclick={() => activeDemo = 'booking'}>
			BookingFlow
		</button>
		<button class:active={activeDemo === 'cancel'} onclick={() => activeDemo = 'cancel'}>
			CancelFlow
		</button>
		<button class:active={activeDemo === 'manifest'} onclick={() => activeDemo = 'manifest'}>
			GroupManifest
		</button>
	</nav>

	<main class="demo-main">

		{#if activeDemo === 'availability'}
			<section class="demo-section">
				<h2>AvailabilityPicker — City Walking Tour</h2>
				<p class="demo-hint">Click a slot row to open BookingFlow.</p>
				<AvailabilityPicker
					{adapter}
					offeringId="tour-1"
					range={pickerRange}
					onselect={handleSlotSelect}
				/>
				<h2 style="margin-top:2rem">AvailabilityPicker — Kayak River Tour</h2>
				<AvailabilityPicker
					{adapter}
					offeringId="tour-2"
					range={pickerRange}
					onselect={handleSlotSelect}
				/>
			</section>

		{:else if activeDemo === 'booking'}
			<section class="demo-section">
				<h2>BookingFlow</h2>
				{#if selectedSlotId}
					<BookingFlow
						{adapter}
						slotId={selectedSlotId}
						initialSlot={selectedSlot}
						onbooked={handleBooked}
						oncancelled={() => activeDemo = 'availability'}
					/>
				{:else}
					<p class="demo-hint">Select a slot from AvailabilityPicker, or use a hardcoded slot:</p>
					<button class="demo-btn" onclick={() => selectedSlotId = 'slot-2'}>
						Load slot-2 (City Walking, +3 days)
					</button>
				{/if}
			</section>

		{:else if activeDemo === 'cancel'}
			<section class="demo-section">
				<h2>CancelFlow</h2>
				<p class="demo-hint">
					Cancelling: <code>{cancelTarget}</code>
					{#if completedBookingId}
						<button class="demo-btn-sm" onclick={() => cancelTarget = completedBookingId!}>
							Use last booking
						</button>
					{/if}
					<button class="demo-btn-sm" onclick={() => cancelTarget = 'booking-existing'}>
						Use demo booking
					</button>
				</p>
				{#key cancelTarget}
					<CancelFlow
						{adapter}
						bookingId={cancelTarget}
						cancelledBy="guest"
						oncancelled={handleCancelled}
						onaborted={() => activeDemo = 'availability'}
					/>
				{/key}
			</section>

		{:else if activeDemo === 'manifest'}
			<section class="demo-section">
				<h2>GroupManifest — slot-1 (City Walking, +1 day)</h2>
				<GroupManifest {adapter} slotId="slot-1" />
			</section>
		{/if}
	</main>
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: system-ui, sans-serif;
		background: #f8f8f8;
		color: #111;

		--asini-bg: #fff;
		--asini-surface: #f5f5f5;
		--asini-surface-raised: #ebebeb;
		--asini-border: #ddd;
		--asini-border-strong: #bbb;
		--asini-text: #111;
		--asini-text-2: #555;
		--asini-text-3: #999;
		--asini-accent: #0066cc;
		--asini-accent-muted: #cce0ff;
		--asini-success: #1a7f37;
		--asini-warning: #9a6700;
		--asini-danger: #cf222e;
		--asini-info: #0550ae;
		--asini-font-sans: system-ui, sans-serif;
		--asini-font-mono: ui-monospace, monospace;
		--asini-radius: 8px;
		--asini-radius-sm: 4px;
	}

	.demo-root {
		max-width: 860px;
		margin: 0 auto;
		padding: 2rem 1rem;
	}

	h1 {
		font-size: 1.4rem;
		margin-bottom: 1.5rem;
	}

	.demo-nav {
		display: flex;
		gap: 0.25rem;
		flex-wrap: wrap;
		margin-bottom: 1.5rem;
	}

	.demo-nav button {
		padding: 0.4rem 0.9rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		background: #fff;
		cursor: pointer;
		font-size: 0.875rem;
	}

	.demo-nav button.active {
		background: #0066cc;
		color: #fff;
		border-color: #0066cc;
	}

	.demo-main {
		background: #fff;
		border: 1px solid #ddd;
		border-radius: 8px;
		padding: 1.5rem;
	}

	.demo-section h2 {
		margin: 0 0 0.75rem;
		font-size: 1.05rem;
	}

	.demo-hint {
		font-size: 0.875rem;
		color: #555;
		margin-bottom: 0.75rem;
	}

	.demo-btn {
		padding: 0.4rem 0.9rem;
		border: 1px solid #0066cc;
		border-radius: 4px;
		background: #0066cc;
		color: #fff;
		cursor: pointer;
		font-size: 0.875rem;
	}

	.demo-btn-sm {
		padding: 0.2rem 0.5rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		background: #f5f5f5;
		cursor: pointer;
		font-size: 0.8rem;
		margin-left: 0.5rem;
	}

	code {
		font-family: monospace;
		font-size: 0.875rem;
		background: #f5f5f5;
		padding: 0.1rem 0.3rem;
		border-radius: 3px;
	}
</style>
