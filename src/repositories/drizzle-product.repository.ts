import {eq} from 'drizzle-orm';
import {products} from '@/db/schema.js';
import {type Database} from '@/db/type.js';
import {type Product} from '@/domain/product.js';
import {type ProductRepository} from '@/services/product-repository.port.js';

export class DrizzleProductRepository implements ProductRepository {
	private readonly db: Database;

	public constructor({db}: {db: Database}) {
		this.db = db;
	}

	public async update(product: Product): Promise<void> {
		await this.db.update(products).set(product).where(eq(products.id, product.id));
	}
}
