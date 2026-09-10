import {
	describe, it, expect, beforeEach,
} from 'vitest';
import {mockDeep, type DeepMockProxy} from 'vitest-mock-extended';
import {OrderService} from './order.service.js';
import {type ProductService} from './product.service.js';
import {type OrderRepository} from '@/services/order-repository.port.js';
import {createProduct} from '@/utils/test-utils/product-fixture.js';

describe('OrderService', () => {
	let orderRepository: DeepMockProxy<OrderRepository>;
	let productProcessor: DeepMockProxy<Pick<ProductService, 'processProduct'>>;
	let orderService: OrderService;

	beforeEach(() => {
		orderRepository = mockDeep<OrderRepository>();
		productProcessor = mockDeep<Pick<ProductService, 'processProduct'>>();
		productProcessor.processProduct.mockResolvedValue(undefined);
		orderService = new OrderService({orderRepository, ps: productProcessor});
	});

	it('loads the requested order, processes each product and returns its ID', async () => {
		const first = createProduct({id: 1});
		const second = createProduct({id: 2});
		orderRepository.findById.mockResolvedValue({id: 7, products: [first, second]});

		await expect(orderService.processOrder(7)).resolves.toEqual({orderId: 7});

		expect(orderRepository.findById.mock.calls).toEqual([[7]]);
		expect(productProcessor.processProduct.mock.calls).toEqual([[first], [second]]);
	});

	it('returns the ID of an empty order without processing products', async () => {
		orderRepository.findById.mockResolvedValue({id: 7, products: []});

		await expect(orderService.processOrder(7)).resolves.toEqual({orderId: 7});

		expect(productProcessor.processProduct).not.toHaveBeenCalled();
	});

	it('propagates an order lookup failure without processing products', async () => {
		const failure = new Error('Order lookup unavailable');
		orderRepository.findById.mockRejectedValueOnce(failure);

		await expect(orderService.processOrder(7)).rejects.toBe(failure);

		expect(productProcessor.processProduct).not.toHaveBeenCalled();
	});

	it('propagates a product failure and does not process later products', async () => {
		const first = createProduct({id: 1});
		const second = createProduct({id: 2});
		const third = createProduct({id: 3});
		orderRepository.findById.mockResolvedValue({id: 7, products: [first, second, third]});
		const failure = new Error('Product processing unavailable');
		productProcessor.processProduct.mockResolvedValueOnce(undefined).mockRejectedValueOnce(failure);

		await expect(orderService.processOrder(7)).rejects.toBe(failure);

		expect(productProcessor.processProduct.mock.calls).toEqual([[first], [second]]);
	});

	it('waits for the current product to finish before starting the next one', async () => {
		const first = createProduct({id: 1});
		const second = createProduct({id: 2});
		orderRepository.findById.mockResolvedValue({id: 7, products: [first, second]});
		let markFirstStarted: () => void = () => undefined;
		let finishFirst: () => void = () => undefined;
		const firstStarted = new Promise<void>(resolve => {
			markFirstStarted = resolve;
		});
		const firstFinished = new Promise<void>(resolve => {
			finishFirst = resolve;
		});
		productProcessor.processProduct.mockImplementationOnce(async () => {
			markFirstStarted();
			await firstFinished;
		});

		const processing = orderService.processOrder(7);
		await firstStarted;
		expect(productProcessor.processProduct.mock.calls).toEqual([[first]]);

		finishFirst();
		await expect(processing).resolves.toEqual({orderId: 7});
		expect(productProcessor.processProduct.mock.calls).toEqual([[first], [second]]);
	});
});
