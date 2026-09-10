import {type Product} from '@/domain/product.js';
import {type ProductRepository} from '@/services/product-repository.port.js';

export class InMemoryProductRepository implements ProductRepository {
	private readonly products = new Map<number, Product>();

	public constructor(products: Product[] = []) {
		for (const product of products) {
			this.products.set(product.id, structuredClone(product));
		}
	}

	public async update(product: Product): Promise<void> {
		if (this.products.has(product.id)) {
			// Input mutations must not change stored state without an update.
			this.products.set(product.id, structuredClone(product));
		}
	}

	public all(): Product[] {
		return structuredClone([...this.products.values()]);
	}
}
