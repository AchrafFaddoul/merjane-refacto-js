/* eslint-disable no-await-in-loop -- Preserve sequential writes and notifications on partial failure. */
import {type ProductService} from './product.service.js';
import {type OrderRepository} from '@/services/order-repository.port.js';
import {type ProductRepository} from '@/services/product-repository.port.js';

export class OrderService {
	private readonly orderRepository: OrderRepository;
	private readonly productRepository: ProductRepository;
	private readonly productService: ProductService;

	public constructor({orderRepository, productRepository, ps}: {
		orderRepository: OrderRepository;
		productRepository: ProductRepository;
		ps: ProductService;
	}) {
		this.orderRepository = orderRepository;
		this.productRepository = productRepository;
		this.productService = ps;
	}

	public async processOrder(orderId: number): Promise<{orderId: number}> {
		const order = (await this.orderRepository.findById(orderId))!;
		const {products: productList} = order;

		for (const product of productList) {
			switch (product.type) {
				case 'NORMAL': {
					if (product.available > 0) {
						product.available -= 1;
						await this.productRepository.update(product);
					} else if (product.leadTime > 0) {
						await this.productService.notifyDelay(product.leadTime, product);
					}

					break;
				}

				case 'SEASONAL': {
					const currentDate = new Date();
					if (currentDate > product.seasonStartDate! && currentDate < product.seasonEndDate! && product.available > 0) {
						product.available -= 1;
						await this.productRepository.update(product);
					} else {
						await this.productService.handleSeasonalProduct(product);
					}

					break;
				}

				case 'EXPIRABLE': {
					const currentDate = new Date();
					if (product.available > 0 && product.expiryDate! > currentDate) {
						product.available -= 1;
						await this.productRepository.update(product);
					} else {
						await this.productService.handleExpiredProduct(product);
					}

					break;
				}

				default: {
					// Unknown types are currently ignored; their handling is unspecified.
					break;
				}
			}
		}

		return {orderId: order.id};
	}
}
