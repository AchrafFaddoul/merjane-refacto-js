/* eslint-disable no-await-in-loop -- Preserve sequential writes and notifications on partial failure. */
import {eq} from 'drizzle-orm';
import {type ProductService} from './product.service.js';
import {orders, products} from '@/db/schema.js';
import {type Database} from '@/db/type.js';

export class OrderService {
	private readonly db: Database;
	private readonly productService: ProductService;

	public constructor({db, ps}: {db: Database; ps: ProductService}) {
		this.db = db;
		this.productService = ps;
	}

	public async processOrder(orderId: number): Promise<{orderId: number}> {
		const order = (await this.db.query.orders.findFirst({
			where: eq(orders.id, orderId),
			with: {
				products: {
					columns: {},
					with: {
						product: true,
					},
				},
			},
		}))!;
		console.log(order);
		const {products: productList} = order;

		for (const {product} of productList) {
			switch (product.type) {
				case 'NORMAL': {
					if (product.available > 0) {
						product.available -= 1;
						await this.db.update(products).set(product).where(eq(products.id, product.id));
					} else if (product.leadTime > 0) {
						await this.productService.notifyDelay(product.leadTime, product);
					}

					break;
				}

				case 'SEASONAL': {
					const currentDate = new Date();
					if (currentDate > product.seasonStartDate! && currentDate < product.seasonEndDate! && product.available > 0) {
						product.available -= 1;
						await this.db.update(products).set(product).where(eq(products.id, product.id));
					} else {
						await this.productService.handleSeasonalProduct(product);
					}

					break;
				}

				case 'EXPIRABLE': {
					const currentDate = new Date();
					if (product.available > 0 && product.expiryDate! > currentDate) {
						product.available -= 1;
						await this.db.update(products).set(product).where(eq(products.id, product.id));
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
