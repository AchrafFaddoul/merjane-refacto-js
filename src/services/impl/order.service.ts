import {type ProductService} from './product.service.js';
import {type OrderRepository} from '@/services/order-repository.port.js';

type ProductProcessor = Pick<ProductService, 'processProduct'>;

export class OrderService {
	private readonly orderRepository: OrderRepository;
	private readonly productService: ProductProcessor;

	public constructor({orderRepository, ps}: {
		orderRepository: OrderRepository;
		ps: ProductProcessor;
	}) {
		this.orderRepository = orderRepository;
		this.productService = ps;
	}

	public async processOrder(orderId: number): Promise<{orderId: number}> {
		// Missing orders still fail with the existing error.
		const order = (await this.orderRepository.findById(orderId))!;
		const {products: productList} = order;

		for (const product of productList) {
			// Process sequentially so a failure stops later products.
			// eslint-disable-next-line no-await-in-loop
			await this.productService.processProduct(product);
		}

		return {orderId: order.id};
	}
}
