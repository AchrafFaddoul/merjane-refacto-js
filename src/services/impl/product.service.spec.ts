import {
	describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';
import {mockDeep, type DeepMockProxy} from 'vitest-mock-extended';
import {type INotificationService} from '../notifications.port.js';
import {createDatabaseMock, cleanUp} from '../../utils/test-utils/database-tools.ts.js';
import {ProductService} from './product.service.js';
import {products} from '@/db/schema.js';
import {type Database} from '@/db/type.js';
import {NOW, createProduct, daysFromNow} from '@/utils/test-utils/product-fixture.js';

// This existing suite uses real SQLite despite running under test:unit.
describe('ProductService characterization (SQLite)', () => {
	let notifications: DeepMockProxy<INotificationService>;
	let productService: ProductService;
	let database: Database;
	let databaseName: string;
	let closeDatabase: () => void;

	beforeEach(async () => {
		vi.useFakeTimers({toFake: ['Date']});
		vi.setSystemTime(NOW);
		({databaseMock: database, databaseName, close: closeDatabase} = await createDatabaseMock());
		notifications = mockDeep<INotificationService>();
		productService = new ProductService({ns: notifications, db: database});
	});

	afterEach(async () => {
		closeDatabase();
		await cleanUp(databaseName);
		vi.useRealTimers();
	});

	it('updates the supplied lead time in memory and storage, and notifies only for the target product', async () => {
		const product = createProduct({available: 0, leadTime: 15});
		const unrelatedProduct = createProduct({id: 2, name: 'Another product'});
		const expectedProduct = {...product, leadTime: 7};
		await database.insert(products).values([product, unrelatedProduct]);

		await productService.notifyDelay(7, product);

		expect(product).toEqual(expectedProduct);
		expect(await database.select().from(products).orderBy(products.id)).toEqual([
			expectedProduct, unrelatedProduct,
		]);
		expect(notifications.sendDelayNotification.mock.calls).toEqual([[7, product.name]]);
		expect(notifications.sendOutOfStockNotification).not.toHaveBeenCalled();
		expect(notifications.sendExpirationNotification).not.toHaveBeenCalled();
	});

	it('legacy: a delay notification failure propagates after the new lead time has been saved', async () => {
		const product = createProduct({available: 0, leadTime: 15});
		const expectedProduct = {...product, leadTime: 7};
		await database.insert(products).values(product);
		const failure = new Error('Notification unavailable');
		notifications.sendDelayNotification.mockImplementation(() => {
			throw failure;
		});

		await expect(productService.notifyDelay(7, product)).rejects.toBe(failure);

		expect(product).toEqual(expectedProduct);
		expect(await database.select().from(products)).toEqual([expectedProduct]);
		expect(notifications.sendDelayNotification.mock.calls).toEqual([[7, product.name]]);
		expect(notifications.sendOutOfStockNotification).not.toHaveBeenCalled();
		expect(notifications.sendExpirationNotification).not.toHaveBeenCalled();
	});

	it('handleExpiredProduct also sells unexpired stock when called directly', async () => {
		const product = createProduct({type: 'EXPIRABLE', expiryDate: daysFromNow(1)});
		const expectedProduct = {...product, available: 2};
		await database.insert(products).values(product);

		await productService.handleExpiredProduct(product);

		expect(product).toEqual(expectedProduct);
		expect(await database.select().from(products)).toEqual([expectedProduct]);
		expect(notifications.sendDelayNotification).not.toHaveBeenCalled();
		expect(notifications.sendOutOfStockNotification).not.toHaveBeenCalled();
		expect(notifications.sendExpirationNotification).not.toHaveBeenCalled();
	});
});
