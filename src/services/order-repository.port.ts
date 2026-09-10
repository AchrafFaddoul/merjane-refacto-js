import {type Order} from '@/domain/order.js';

export type OrderRepository = {
	findById(orderId: number): Promise<Order | undefined>;
};
