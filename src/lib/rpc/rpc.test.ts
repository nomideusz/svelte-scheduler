import { describe, expect, it } from 'vitest';
import { createSchedulerHandler, PUBLIC_SCHEDULER_METHODS } from './handler.js';
import { createFetchAdapter } from './client.js';
import { createMemoryAdapter } from '../adapters/memory.js';
import { BookingError } from '../core/booking.js';
import type { Offering, Slot } from '../core/types.js';

function makeOffering(): Omit<Offering, 'id'> {
	return {
		name: 'Morning Flow',
		description: '',
		duration: 60,
		capacity: 5,
		minCapacity: 1,
		maxCapacity: 5,
		languages: ['pl'],
		categories: [],
		includedItems: [],
		requirements: [],
		images: [],
		isPublic: true,
		status: 'active',
		pricing: { model: 'per_person', basePrice: 45, currency: 'PLN', guidePaysProcessingFee: true },
		cancellationPolicy: {
			id: 'flexible',
			name: 'Flexible',
			description: '',
			rules: [{ hoursBeforeTour: 0, refundPercentage: 0, description: '' }],
		},
		scheduleRules: [],
	};
}

const makeSlot = (offeringId: string): Omit<Slot, 'id'> => ({
	offeringId,
	startTime: new Date('2030-06-01T10:00:00Z'),
	endTime: new Date('2030-06-01T11:00:00Z'),
	availableSpots: 5,
	bookedSpots: 0,
	status: 'open',
	isGenerated: false,
});

/** handler mounted on a fake fetch — full client↔server roundtrip in-process. */
function wire(opts?: Parameters<typeof createSchedulerHandler<{ user?: string }>>[1], ctx: { user?: string } = {}) {
	const server = createMemoryAdapter();
	const handle = createSchedulerHandler<{ user?: string }>(server, opts);
	const client = createFetchAdapter({
		fetch: (input, init) => handle(new Request(new URL(String(input), 'http://t'), init), ctx),
	});
	return { server, client };
}

describe('scheduler rpc', () => {
	it('roundtrips the guest flow with real Date revival', async () => {
		const { server, client } = wire();
		const offering = await server.createOffering(makeOffering());
		await server.createSlot(makeSlot(offering.id));

		const range = { start: new Date('2030-05-01'), end: new Date('2030-07-01') };
		const slots = await client.getSlots(offering.id, range);
		expect(slots).toHaveLength(1);
		expect(slots[0].startTime).toBeInstanceOf(Date);
		expect(slots[0].startTime.toISOString()).toBe('2030-06-01T10:00:00.000Z');

		const booking = await client.createBooking({
			offeringId: offering.id,
			slotId: slots[0].id,
			guest: { name: 'A', email: 'a@x.pl' },
			participants: 2,
			priceBreakdown: { basePrice: 90, groupDiscount: 0, addonsTotal: 0, processingFee: 0, totalAmount: 90, guideReceives: 90, guidePaysProcessingFee: true } as never,
			totalAmount: 90,
			currency: 'PLN',
			status: 'confirmed',
			paymentStatus: 'pending',
			attendanceStatus: 'not_arrived',
		});
		expect(booking.bookingReference).toMatch(/^BK-/);
		// createdAt must STAY a string — the wire only revives marked Dates
		expect(typeof booking.createdAt).toBe('string');

		const fetched = await client.getBookingByReference(booking.bookingReference);
		expect(fetched?.id).toBe(booking.id);
		expect(await client.getBookingByReference('BK-NOPE0000')).toBeUndefined();
	});

	it('non-public methods 403 without authorize, pass with it', async () => {
		const { server, client } = wire();
		const offering = await server.createOffering(makeOffering());
		const slot = await server.createSlot(makeSlot(offering.id));
		await expect(client.cancelSlot(slot.id, 'guide')).rejects.toThrow(/403/);

		const authed = wire({ authorize: ({ ctx }) => ctx.user === 'owner' }, { user: 'owner' });
		const o2 = await authed.server.createOffering(makeOffering());
		const s2 = await authed.server.createSlot(makeSlot(o2.id));
		expect((await authed.client.cancelSlot(s2.id, 'guide')).status).toBe('cancelled');
	});

	it('domain errors rethrow client-side as BookingError with their code', async () => {
		const server = createMemoryAdapter();
		const throwing = {
			...server,
			createBooking: async () => {
				throw new BookingError('Not enough capacity', 'OVER_CAPACITY');
			},
		};
		const handle = createSchedulerHandler(throwing);
		const client = createFetchAdapter({
			fetch: (input, init) => handle(new Request(new URL(String(input), 'http://t'), init), undefined as void),
		});
		const err = await client
			.createBooking({} as never)
			.then(() => null)
			.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(BookingError);
		expect((err as BookingError).code).toBe('OVER_CAPACITY');
	});

	it('rejects junk: unknown method, bad args, invalid JSON', async () => {
		const handle = createSchedulerHandler(createMemoryAdapter());
		const post = (body: string) =>
			handle(new Request('http://t/api/scheduler', { method: 'POST', body }), undefined as void);
		expect((await post('{"method":"evil","args":[]}')).status).toBe(400);
		expect((await post('{"method":"getSlots","args":"x"}')).status).toBe(400);
		expect((await post('not json')).status).toBe(400);
		expect(PUBLIC_SCHEDULER_METHODS).not.toContain('updateBookingStatus');
	});
});
