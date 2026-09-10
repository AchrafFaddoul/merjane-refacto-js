import {
	describe, it, expect, beforeEach, afterEach,
} from 'vitest';
import SqliteDatabase from 'better-sqlite3';
import {drizzle} from 'drizzle-orm/better-sqlite3';
import {DrizzleProductRepository} from './drizzle-product.repository.js';
import {CONFIG} from '@/configuration/index.js';
import * as schema from '@/db/schema.js';
import {type Database} from '@/db/type.js';
import {createProduct, daysFromNow} from '@/utils/test-utils/product-fixture.js';

describe('DrizzleProductRepository (SQLite)', () => {
	let database: Database;
	let repository: DrizzleProductRepository;
	let closeDatabase: () => void;

	beforeEach(() => {
		const sqlite = new SqliteDatabase(CONFIG.get('db').url);
		closeDatabase = () => sqlite.close();
		database = drizzle(sqlite, {schema});
		repository = new DrizzleProductRepository({db: database});
	});

	afterEach(() => {
		closeDatabase();
	});

	it('persists all product fields without changing another product', async () => {
		const originalProduct = createProduct();
		const unrelatedProduct = createProduct({id: 2, name: 'Another product'});
		await database.insert(schema.products).values([originalProduct, unrelatedProduct]);
		const updatedProduct = createProduct({
			name: 'Updated product',
			type: 'SEASONAL',
			available: 2,
			leadTime: 7,
			expiryDate: daysFromNow(30),
			seasonStartDate: daysFromNow(-1),
			seasonEndDate: daysFromNow(20),
		});

		await repository.update(updatedProduct);

		expect(await database.select().from(schema.products).orderBy(schema.products.id)).toEqual([
			updatedProduct, unrelatedProduct,
		]);
	});
});
