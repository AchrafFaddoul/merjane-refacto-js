import {eq} from 'drizzle-orm';
import {orders} from '@/db/schema.js';
import {type Database} from '@/db/type.js';
import {type Order} from '@/domain/order.js';
import {type OrderRepository} from '@/services/order-repository.port.js';

export class DrizzleOrderRepository implements OrderRepository {
	private readonly db: Database;

	public constructor({db}: {db: Database}) {
		this.db = db;
	}

	public async findById(orderId: number): Promise<Order | undefined> {
		const order = await this.db.query.orders.findFirst({
			where: eq(orders.id, orderId),
			with: {
				products: {
					columns: {},
					with: {
						product: true,
					},
				},
			},
		});

		if (!order) {
			return undefined;
		}

		return {
			id: order.id,
			products: order.products.map(({product}) => product),
		};
	}
}
