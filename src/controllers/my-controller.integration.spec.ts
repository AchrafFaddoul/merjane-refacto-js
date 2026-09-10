import process from 'node:process';
import {
	describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';
import {type FastifyInstance} from 'fastify';
import supertest from 'supertest';
import {eq, sql} from 'drizzle-orm';
import {type DeepMockProxy, mockDeep} from 'vitest-mock-extended';
import {asValue} from 'awilix';
import {type INotificationService} from '@/services/notifications.port.js';
import {
	type Product,
	products,
	orders,
	ordersToProducts,
} from '@/db/schema.js';
import {type Database} from '@/db/type.js';
import {buildFastify} from '@/fastify.js';
import {NOW, daysFromNow, createProduct} from '@/utils/test-utils/product-fixture.js';

type ProductCase = {
	scenario: string;
	product: Partial<Product>;
	available: number;
	delay?: number;
	outOfStock?: boolean;
	expiration?: boolean;
};

const seasonalProduct: Partial<Product> = {
	type: 'SEASONAL',
	seasonStartDate: daysFromNow(-10),
	seasonEndDate: daysFromNow(10),
};

// Legacy cases document current production behavior, not approved business rules.
const productCases: ProductCase[] = [
	{
		scenario: 'NORMAL: sells one unit from stock',
		product: {},
		available: 2,
	},
	{
		scenario: 'NORMAL: sells the last unit without announcing a delay',
		product: {available: 1},
		available: 0,
	},
	{
		scenario: 'NORMAL: announces replenishment when empty',
		product: {available: 0},
		available: 0,
		delay: 5,
	},
	{
		scenario: 'legacy NORMAL: no notification for zero lead time',
		product: {available: 0, leadTime: 0},
		available: 0,
	},
	{
		scenario: 'legacy NORMAL: no notification for negative lead time',
		product: {available: 0, leadTime: -1},
		available: 0,
	},
	{
		scenario: 'legacy NORMAL: negative stock stays unchanged and announces delay',
		product: {available: -1},
		available: -1,
		delay: 5,
	},
	{
		scenario: 'SEASONAL: sells in-stock product during its season',
		product: seasonalProduct,
		available: 2,
	},
	{
		scenario: 'SEASONAL: sells the last unit during its season',
		product: {...seasonalProduct, available: 1},
		available: 0,
	},
	{
		scenario: 'SEASONAL: existing stock can sell even if replenishment would be too late',
		product: {...seasonalProduct, leadTime: 15},
		available: 2,
	},
	{
		scenario: 'SEASONAL: announces delay when replenishment is within season',
		product: {...seasonalProduct, available: 0},
		available: 0,
		delay: 5,
	},
	{
		scenario: 'SEASONAL: replenishment exactly at season end is allowed',
		product: {...seasonalProduct, available: 0, leadTime: 10},
		available: 0,
		delay: 10,
	},
	{
		scenario: 'SEASONAL: replenishment one millisecond beyond season end is unavailable',
		product: {
			...seasonalProduct, available: 0, leadTime: 10, seasonEndDate: new Date(daysFromNow(10).getTime() - 1),
		},
		available: 0,
		outOfStock: true,
	},
	{
		scenario: 'SEASONAL: before the season, notifies unavailability and keeps stock',
		product: {...seasonalProduct, seasonStartDate: daysFromNow(1)},
		available: 3,
		outOfStock: true,
	},
	{
		scenario: 'SEASONAL: empty before the season, notifies unavailability',
		product: {...seasonalProduct, available: 0, seasonStartDate: daysFromNow(1)},
		available: 0,
		outOfStock: true,
	},
	{
		scenario: 'SEASONAL: after the season, notifies unavailability and clears stock',
		product: {...seasonalProduct, seasonEndDate: daysFromNow(-1)},
		available: 0,
		outOfStock: true,
	},
	{
		scenario: 'legacy SEASONAL: exactly at season start, announces delay and keeps stock',
		product: {...seasonalProduct, seasonStartDate: NOW},
		available: 3,
		delay: 5,
	},
	{
		scenario: 'SEASONAL: one millisecond inside season start, sells from stock',
		product: {...seasonalProduct, seasonStartDate: new Date(NOW.getTime() - 1)},
		available: 2,
	},
	{
		scenario: 'SEASONAL: one millisecond before season end, sells from stock',
		product: {...seasonalProduct, seasonEndDate: new Date(NOW.getTime() + 1)},
		available: 2,
	},
	{
		scenario: 'SEASONAL: exactly at season end with positive lead time, clears stock',
		product: {...seasonalProduct, seasonEndDate: NOW},
		available: 0,
		outOfStock: true,
	},
	{
		scenario: 'legacy SEASONAL: exactly at season end with zero lead time, announces zero delay',
		product: {...seasonalProduct, seasonEndDate: NOW, leadTime: 0},
		available: 3,
		delay: 0,
	},
	{
		scenario: 'EXPIRABLE: sells from stock before expiration',
		product: {type: 'EXPIRABLE', expiryDate: daysFromNow(1)},
		available: 2,
	},
	{
		scenario: 'EXPIRABLE: sells the last unit before expiration',
		product: {type: 'EXPIRABLE', available: 1, expiryDate: daysFromNow(1)},
		available: 0,
	},
	{
		scenario: 'EXPIRABLE: one millisecond before expiration, can still sell',
		product: {type: 'EXPIRABLE', expiryDate: new Date(NOW.getTime() + 1)},
		available: 2,
	},
	{
		scenario: 'EXPIRABLE: after expiration, clears stock and notifies',
		product: {type: 'EXPIRABLE', expiryDate: new Date(NOW.getTime() - 1)},
		available: 0,
		expiration: true,
	},
	{
		scenario: 'legacy EXPIRABLE: exactly at expiration, clears stock and notifies',
		product: {type: 'EXPIRABLE', expiryDate: NOW},
		available: 0,
		expiration: true,
	},
	{
		scenario: 'legacy EXPIRABLE: unexpired but empty, sends an expiration notification',
		product: {type: 'EXPIRABLE', available: 0, expiryDate: daysFromNow(1)},
		available: 0,
		expiration: true,
	},
	{
		scenario: 'EXPIRABLE: already empty and expired, still sends an expiration notification',
		product: {type: 'EXPIRABLE', available: 0, expiryDate: daysFromNow(-1)},
		available: 0,
		expiration: true,
	},
	{
		scenario: 'legacy: unknown product type is ignored',
		product: {type: 'UNKNOWN'},
		available: 3,
	},
];

describe('Process order characterization (HTTP, services and SQLite)', () => {
	let fastify: FastifyInstance;
	let database: Database;
	let notifications: DeepMockProxy<INotificationService>;
	let originalSignalListeners: Map<NodeJS.Signals, NodeJS.SignalsListener[]>;

	beforeEach(async () => {
		// Keep network and database timers real; only freeze the business clock.
		vi.useFakeTimers({toFake: ['Date']});
		vi.setSystemTime(NOW);
		originalSignalListeners = new Map([
			['SIGINT', process.listeners('SIGINT')],
			['SIGTERM', process.listeners('SIGTERM')],
		]);
		notifications = mockDeep<INotificationService>();
		fastify = await buildFastify();
		fastify.diContainer.register({ns: asValue<INotificationService>(notifications)});
		await fastify.ready();
		database = fastify.database;
	});

	afterEach(async () => {
		await fastify.close();
		vi.useRealTimers();
		// Each app instance installs shutdown listeners; release only this test's listeners.
		for (const [signal, originalListeners] of originalSignalListeners) {
			for (const listener of process.listeners(signal)) {
				if (!originalListeners.includes(listener)) {
					process.removeListener(signal, listener);
				}
			}
		}
	});

	it.each(productCases)('$scenario', async ({product: overrides, available, delay, outOfStock, expiration}) => {
		const product = createProduct(overrides);
		const unrelatedProduct = createProduct({id: 99, name: 'Not in this order'});
		const orderId = createOrder([product]);
		await database.insert(products).values(unrelatedProduct);

		await supertest(fastify.server)
			.post(`/orders/${orderId}/processOrder`)
			.expect(200)
			.expect('Content-Type', /application\/json/)
			.expect({orderId});

		expect(await database.select().from(products).orderBy(products.id)).toEqual([
			{...product, available},
			unrelatedProduct,
		]);
		expect(notifications.sendDelayNotification.mock.calls).toEqual(delay === undefined ? [] : [[delay, product.name]]);
		expect(notifications.sendOutOfStockNotification.mock.calls).toEqual(outOfStock ? [[product.name]] : []);
		expect(notifications.sendExpirationNotification.mock.calls).toEqual(expiration ? [[product.name, product.expiryDate]] : []);
	});

	it('processes a mixed order and persists each product outcome', async () => {
		const orderedProducts = [
			createProduct({id: 1, name: 'Cable'}),
			createProduct({id: 2, name: 'Dongle', available: 0}),
			createProduct({
				id: 3, name: 'Butter', type: 'EXPIRABLE', expiryDate: daysFromNow(1),
			}),
			createProduct({
				id: 4, name: 'Milk', type: 'EXPIRABLE', expiryDate: daysFromNow(-1),
			}),
			createProduct({...seasonalProduct, id: 5, name: 'Watermelon'}),
			createProduct({
				...seasonalProduct, id: 6, name: 'Grapes', seasonStartDate: daysFromNow(1),
			}),
		];
		const orderId = createOrder(orderedProducts);

		await supertest(fastify.server).post(`/orders/${orderId}/processOrder`).expect(200).expect({orderId});

		const expectedStock = [2, 0, 2, 0, 2, 3];
		expect(await database.select().from(products).orderBy(products.id)).toEqual(
			orderedProducts.map((product, index) => ({...product, available: expectedStock[index]})),
		);
		expect(await database.query.orders.findFirst({where: eq(orders.id, orderId)})).toEqual({id: orderId});
		expect(await database.select().from(ordersToProducts).orderBy(ordersToProducts.productId)).toEqual(
			orderedProducts.map(product => ({orderId, productId: product.id})),
		);
		expect(notifications.sendDelayNotification.mock.calls).toEqual([[5, 'Dongle']]);
		expect(notifications.sendOutOfStockNotification.mock.calls).toEqual([['Grapes']]);
		expect(notifications.sendExpirationNotification.mock.calls).toEqual([['Milk', daysFromNow(-1)]]);
	});

	it('accepts an empty order without changing stock or notifying', async () => {
		const product = createProduct();
		await database.insert(products).values(product);
		const orderId = createOrder([]);

		await supertest(fastify.server).post(`/orders/${orderId}/processOrder`).expect(200).expect({orderId});

		expect(await database.select().from(products)).toEqual([product]);
		expectNoNotifications();
	});

	it('rejects a nonnumeric order ID with 400 and no side effects', async () => {
		const product = createProduct();
		createOrder([product]);

		await supertest(fastify.server).post('/orders/not-a-number/processOrder').expect(400);

		expect(await database.select().from(products)).toEqual([product]);
		expectNoNotifications();
	});

	it('legacy: a missing order returns 500 and leaves existing products untouched', async () => {
		const product = createProduct();
		createOrder([product]);

		const response = await supertest(fastify.server).post('/orders/999/processOrder').expect(500);

		expect(response.body).toMatchObject({statusCode: 500, error: 'Internal Server Error'});
		expect(await database.select().from(products)).toEqual([product]);
		expectNoNotifications();
	});

	it('legacy: processing the same order twice decrements its stock twice', async () => {
		const product = createProduct();
		const orderId = createOrder([product]);

		await supertest(fastify.server).post(`/orders/${orderId}/processOrder`).expect(200).expect({orderId});
		await supertest(fastify.server).post(`/orders/${orderId}/processOrder`).expect(200).expect({orderId});

		expect(await database.select().from(products)).toEqual([{...product, available: 1}]);
		expectNoNotifications();
	});

	it('legacy: a database failure keeps earlier writes, stops the order and prevents the delay notification', async () => {
		const first = createProduct({id: 1});
		const failing = createProduct({id: 2, available: 0});
		const last = createProduct({id: 3});
		const orderId = createOrder([first, failing, last]);
		rejectUpdatesToProduct(failing.id);

		await supertest(fastify.server).post(`/orders/${orderId}/processOrder`).expect(500);

		expect(await database.select().from(products).orderBy(products.id)).toEqual([
			{...first, available: 2}, failing, last,
		]);
		expectNoNotifications();
	});

	it('legacy: an expiration notification failure keeps earlier writes and prevents clearing the expired stock', async () => {
		const first = createProduct({id: 1});
		const expired = createProduct({id: 2, type: 'EXPIRABLE', expiryDate: daysFromNow(-1)});
		const last = createProduct({id: 3});
		const orderId = createOrder([first, expired, last]);
		notifications.sendExpirationNotification.mockImplementation(() => {
			throw new Error('Notification unavailable');
		});

		await supertest(fastify.server).post(`/orders/${orderId}/processOrder`).expect(500);

		expect(await database.select().from(products).orderBy(products.id)).toEqual([
			{...first, available: 2}, expired, last,
		]);
		expect(notifications.sendExpirationNotification.mock.calls).toEqual([[expired.name, expired.expiryDate]]);
		expect(notifications.sendDelayNotification).not.toHaveBeenCalled();
		expect(notifications.sendOutOfStockNotification).not.toHaveBeenCalled();
	});

	it.each([
		{type: 'SEASONAL', product: {...seasonalProduct, seasonEndDate: daysFromNow(-1)}, expiration: false},
		{type: 'EXPIRABLE', product: {type: 'EXPIRABLE', expiryDate: daysFromNow(-1)}, expiration: true},
	])('legacy: $type unavailability is notified before a failing stock update', async ({product: overrides, expiration}) => {
		const product = createProduct(overrides);
		const orderId = createOrder([product]);
		rejectUpdatesToProduct(product.id);

		await supertest(fastify.server).post(`/orders/${orderId}/processOrder`).expect(500);

		expect(await database.select().from(products)).toEqual([product]);
		expect(notifications.sendDelayNotification).not.toHaveBeenCalled();
		expect(notifications.sendOutOfStockNotification.mock.calls).toEqual(expiration ? [] : [[product.name]]);
		expect(notifications.sendExpirationNotification.mock.calls).toEqual(expiration ? [[product.name, product.expiryDate]] : []);
	});

	function createOrder(orderedProducts: Product[]): number {
		return database.transaction(tx => {
			const order = tx.insert(orders).values({}).returning().get();
			if (orderedProducts.length > 0) {
				tx.insert(products).values(orderedProducts).run();
				tx.insert(ordersToProducts).values(orderedProducts.map(product => ({orderId: order.id, productId: product.id}))).run();
			}

			return order.id;
		});
	}

	function rejectUpdatesToProduct(productId: number) {
		// A real SQLite failure avoids coupling the test to Drizzle's query-builder calls.
		database.run(sql`
			CREATE TRIGGER reject_product_update BEFORE UPDATE ON products
			WHEN OLD.id = ${sql.raw(String(productId))}
			BEGIN SELECT RAISE(ABORT, 'Product update failed'); END
		`);
	}

	function expectNoNotifications() {
		expect(notifications.sendDelayNotification).not.toHaveBeenCalled();
		expect(notifications.sendOutOfStockNotification).not.toHaveBeenCalled();
		expect(notifications.sendExpirationNotification).not.toHaveBeenCalled();
	}
});
