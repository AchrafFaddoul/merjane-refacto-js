import {NOW, daysFromNow} from './product-fixture.js';
import {type Product} from '@/domain/product.js';

type ProductCase = {
	scenario: string;
	product: Partial<Product>;
	available: number;
	delay?: number;
	outOfStock?: boolean;
	expiration?: boolean;
};

export const seasonalProduct: Partial<Product> = {
	type: 'SEASONAL',
	seasonStartDate: daysFromNow(-10),
	seasonEndDate: daysFromNow(10),
};

// Legacy cases document current production behavior, not approved business rules.
export const productCases: ProductCase[] = [
	{
		scenario: 'NORMAL: sells one unit from stock',
		product: {},
		available: 2,
	},
	{
		scenario: 'NORMAL: sells the last unit without announcing a delay',
		product: {available: 1},
		available: 0,
	},
	{
		scenario: 'NORMAL: announces replenishment when empty',
		product: {available: 0},
		available: 0,
		delay: 5,
	},
	{
		scenario: 'legacy NORMAL: no notification for zero lead time',
		product: {available: 0, leadTime: 0},
		available: 0,
	},
	{
		scenario: 'legacy NORMAL: no notification for negative lead time',
		product: {available: 0, leadTime: -1},
		available: 0,
	},
	{
		scenario: 'legacy NORMAL: negative stock stays unchanged and announces delay',
		product: {available: -1},
		available: -1,
		delay: 5,
	},
	{
		scenario: 'SEASONAL: sells in-stock product during its season',
		product: seasonalProduct,
		available: 2,
	},
	{
		scenario: 'SEASONAL: sells the last unit during its season',
		product: {...seasonalProduct, available: 1},
		available: 0,
	},
	{
		scenario: 'SEASONAL: existing stock can sell even if replenishment would be too late',
		product: {...seasonalProduct, leadTime: 15},
		available: 2,
	},
	{
		scenario: 'SEASONAL: announces delay when replenishment is within season',
		product: {...seasonalProduct, available: 0},
		available: 0,
		delay: 5,
	},
	{
		scenario: 'SEASONAL: replenishment exactly at season end is allowed',
		product: {...seasonalProduct, available: 0, leadTime: 10},
		available: 0,
		delay: 10,
	},
	{
		scenario: 'SEASONAL: replenishment one millisecond beyond season end is unavailable',
		product: {
			...seasonalProduct, available: 0, leadTime: 10, seasonEndDate: new Date(daysFromNow(10).getTime() - 1),
		},
		available: 0,
		outOfStock: true,
	},
	{
		scenario: 'SEASONAL: before the season, notifies unavailability and keeps stock',
		product: {...seasonalProduct, seasonStartDate: daysFromNow(1)},
		available: 3,
		outOfStock: true,
	},
	{
		scenario: 'SEASONAL: empty before the season, notifies unavailability',
		product: {...seasonalProduct, available: 0, seasonStartDate: daysFromNow(1)},
		available: 0,
		outOfStock: true,
	},
	{
		scenario: 'SEASONAL: after the season, notifies unavailability and clears stock',
		product: {...seasonalProduct, seasonEndDate: daysFromNow(-1)},
		available: 0,
		outOfStock: true,
	},
	{
		scenario: 'legacy SEASONAL: exactly at season start, announces delay and keeps stock',
		product: {...seasonalProduct, seasonStartDate: NOW},
		available: 3,
		delay: 5,
	},
	{
		scenario: 'SEASONAL: one millisecond inside season start, sells from stock',
		product: {...seasonalProduct, seasonStartDate: new Date(NOW.getTime() - 1)},
		available: 2,
	},
	{
		scenario: 'SEASONAL: one millisecond before season end, sells from stock',
		product: {...seasonalProduct, seasonEndDate: new Date(NOW.getTime() + 1)},
		available: 2,
	},
	{
		scenario: 'SEASONAL: exactly at season end with positive lead time, clears stock',
		product: {...seasonalProduct, seasonEndDate: NOW},
		available: 0,
		outOfStock: true,
	},
	{
		scenario: 'legacy SEASONAL: exactly at season end with zero lead time, announces zero delay',
		product: {...seasonalProduct, seasonEndDate: NOW, leadTime: 0},
		available: 3,
		delay: 0,
	},
	{
		scenario: 'EXPIRABLE: sells from stock before expiration',
		product: {type: 'EXPIRABLE', expiryDate: daysFromNow(1)},
		available: 2,
	},
	{
		scenario: 'EXPIRABLE: sells the last unit before expiration',
		product: {type: 'EXPIRABLE', available: 1, expiryDate: daysFromNow(1)},
		available: 0,
	},
	{
		scenario: 'EXPIRABLE: one millisecond before expiration, can still sell',
		product: {type: 'EXPIRABLE', expiryDate: new Date(NOW.getTime() + 1)},
		available: 2,
	},
	{
		scenario: 'EXPIRABLE: after expiration, clears stock and notifies',
		product: {type: 'EXPIRABLE', expiryDate: new Date(NOW.getTime() - 1)},
		available: 0,
		expiration: true,
	},
	{
		scenario: 'legacy EXPIRABLE: exactly at expiration, clears stock and notifies',
		product: {type: 'EXPIRABLE', expiryDate: NOW},
		available: 0,
		expiration: true,
	},
	{
		scenario: 'legacy EXPIRABLE: unexpired but empty, sends an expiration notification',
		product: {type: 'EXPIRABLE', available: 0, expiryDate: daysFromNow(1)},
		available: 0,
		expiration: true,
	},
	{
		scenario: 'EXPIRABLE: already empty and expired, still sends an expiration notification',
		product: {type: 'EXPIRABLE', available: 0, expiryDate: daysFromNow(-1)},
		available: 0,
		expiration: true,
	},
	{
		scenario: 'legacy: unknown product type is ignored',
		product: {type: 'UNKNOWN'},
		available: 3,
	},
];
