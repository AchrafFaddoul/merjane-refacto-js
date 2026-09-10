import {
	describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';
import {mockDeep, type DeepMockProxy} from 'vitest-mock-extended';
import {type INotificationService} from '../notifications.port.js';
import {ProductService} from './product.service.js';
import {type Product} from '@/domain/product.js';
import {NOW, createProduct, daysFromNow} from '@/utils/test-utils/product-fixture.js';
import {InMemoryProductRepository} from '@/utils/test-utils/in-memory-product.repository.js';
import {productCases} from '@/utils/test-utils/product-cases.js';

describe('ProductService', () => {
	let notifications: DeepMockProxy<INotificationService>;
	let productService: ProductService;
	let productRepository: InMemoryProductRepository;

	beforeEach(() => {
		vi.useFakeTimers({toFake: ['Date']});
		vi.setSystemTime(NOW);
		notifications = mockDeep<INotificationService>();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it.each(productCases)('$scenario', async ({product: overrides, available, delay, outOfStock, expiration}) => {
		const product = createProduct(overrides);
		const unrelatedProduct = createProduct({id: 99, name: 'Not in this order'});
		const expectedProduct = {...product, available};
		givenProducts(product, unrelatedProduct);

		await productService.processProduct(product);

		expect(product).toEqual(expectedProduct);
		expect(productRepository.all()).toEqual([expectedProduct, unrelatedProduct]);
		expect(notifications.sendDelayNotification.mock.calls).toEqual(delay === undefined ? [] : [[delay, product.name]]);
		expect(notifications.sendOutOfStockNotification.mock.calls).toEqual(outOfStock ? [[product.name]] : []);
		expect(notifications.sendExpirationNotification.mock.calls).toEqual(expiration ? [[product.name, product.expiryDate]] : []);
	});

	it('updates the supplied lead time in memory and storage, and notifies only for the target product', async () => {
		const product = createProduct({available: 0, leadTime: 15});
		const unrelatedProduct = createProduct({id: 2, name: 'Another product'});
		const expectedProduct = {...product, leadTime: 7};
		givenProducts(product, unrelatedProduct);

		await productService.notifyDelay(7, product);

		expect(product).toEqual(expectedProduct);
		expect(productRepository.all()).toEqual([expectedProduct, unrelatedProduct]);
		expect(notifications.sendDelayNotification.mock.calls).toEqual([[7, product.name]]);
		expect(notifications.sendOutOfStockNotification).not.toHaveBeenCalled();
		expect(notifications.sendExpirationNotification).not.toHaveBeenCalled();
	});

	it('legacy: a delay notification failure propagates after the new lead time has been saved', async () => {
		const product = createProduct({available: 0, leadTime: 15});
		const expectedProduct = {...product, leadTime: 7};
		givenProducts(product);
		const failure = new Error('Notification unavailable');
		notifications.sendDelayNotification.mockImplementation(() => {
			throw failure;
		});

		await expect(productService.notifyDelay(7, product)).rejects.toBe(failure);

		expect(product).toEqual(expectedProduct);
		expect(productRepository.all()).toEqual([expectedProduct]);
		expect(notifications.sendDelayNotification.mock.calls).toEqual([[7, product.name]]);
		expect(notifications.sendOutOfStockNotification).not.toHaveBeenCalled();
		expect(notifications.sendExpirationNotification).not.toHaveBeenCalled();
	});

	it('propagates a persistence failure without sending a delay notification', async () => {
		const product = createProduct({available: 0, leadTime: 15});
		const originalProduct = {...product};
		givenProducts(product);
		const failure = new Error('Persistence unavailable');
		vi.spyOn(productRepository, 'update').mockRejectedValueOnce(failure);

		await expect(productService.notifyDelay(7, product)).rejects.toBe(failure);

		expect(product.leadTime).toBe(7);
		expect(productRepository.all()).toEqual([originalProduct]);
		expect(notifications.sendDelayNotification).not.toHaveBeenCalled();
		expect(notifications.sendOutOfStockNotification).not.toHaveBeenCalled();
		expect(notifications.sendExpirationNotification).not.toHaveBeenCalled();
	});

	it('handleExpiredProduct also sells unexpired stock when called directly', async () => {
		const product = createProduct({type: 'EXPIRABLE', expiryDate: daysFromNow(1)});
		const expectedProduct = {...product, available: 2};
		givenProducts(product);

		await productService.handleExpiredProduct(product);

		expect(product).toEqual(expectedProduct);
		expect(productRepository.all()).toEqual([expectedProduct]);
		expect(notifications.sendDelayNotification).not.toHaveBeenCalled();
		expect(notifications.sendOutOfStockNotification).not.toHaveBeenCalled();
		expect(notifications.sendExpirationNotification).not.toHaveBeenCalled();
	});

	function givenProducts(...products: Product[]) {
		productRepository = new InMemoryProductRepository(products);
		productService = new ProductService({ns: notifications, productRepository});
	}
});
