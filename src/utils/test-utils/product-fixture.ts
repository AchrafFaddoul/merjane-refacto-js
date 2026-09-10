import {type Product} from '@/domain/product.js';

export const NOW = new Date('2026-09-10T12:00:00.000Z');
export const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function daysFromNow(days: number): Date {
	return new Date(NOW.getTime() + (days * DAY_IN_MS));
}

export function createProduct(overrides: Partial<Product> = {}): Product {
	return {
		id: 1,
		name: 'Test product',
		type: 'NORMAL',
		available: 3,
		leadTime: 5,
		expiryDate: null,
		seasonStartDate: null,
		seasonEndDate: null,
		...overrides,
	};
}
