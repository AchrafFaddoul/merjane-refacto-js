import {type Product} from '@/domain/product.js';

export type ProductRepository = {
	update(product: Product): Promise<void>;
};
