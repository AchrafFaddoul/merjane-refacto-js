import {type Product} from './product.js';

export type Order = {
	id: number;
	products: Product[];
};
