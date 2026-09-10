import {relations} from 'drizzle-orm';
import {
	text, integer, sqliteTable, primaryKey,
} from 'drizzle-orm/sqlite-core';

export const products = sqliteTable('products', {
	id: integer('id').notNull().primaryKey(),
	leadTime: integer('lead_time').notNull(),
	available: integer('available').notNull(),
	type: text('type').notNull(),
	name: text('name').notNull(),
	expiryDate: integer('expiry_date', {mode: 'timestamp_ms'}),
	seasonStartDate: integer('season_start_date', {mode: 'timestamp_ms'}),
	seasonEndDate: integer('season_end_date', {mode: 'timestamp_ms'}),
});

export type Product = typeof products.$inferSelect;
export type ProductInsert = typeof products.$inferInsert;

export const orders = sqliteTable('orders', {
	id: integer('id').notNull().primaryKey(),
});

export type Order = typeof orders.$inferSelect;
export type OrderInsert = typeof orders.$inferInsert;

export const ordersToProducts = sqliteTable('orders_to_products', {
	orderId: integer('order_id').references(() => orders.id).notNull(),
	productId: integer('product_id').references(() => products.id).notNull(),
}, t => ({
	pk: primaryKey({columns: [t.orderId, t.productId]}),
}));

export const productsRelations = relations(products, ({many}) => ({
	orders: many(ordersToProducts),
}));

export const ordersRelations = relations(orders, ({many}) => ({
	products: many(ordersToProducts),
}));

export const ordersToProductsRelations = relations(ordersToProducts, ({one}) => ({
	product: one(products, {
		fields: [ordersToProducts.productId],
		references: [products.id],
	}),
	order: one(orders, {
		fields: [ordersToProducts.orderId],
		references: [orders.id],
	}),
}));
