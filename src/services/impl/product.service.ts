import {type INotificationService} from '../notifications.port.js';
import {type ProductRepository} from '../product-repository.port.js';
import {type Product} from '@/domain/product.js';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export class ProductService {
	private readonly notifications: INotificationService;
	private readonly productRepository: ProductRepository;

	public constructor({ns, productRepository}: {ns: INotificationService; productRepository: ProductRepository}) {
		this.notifications = ns;
		this.productRepository = productRepository;
	}

	public async processProduct(product: Product): Promise<void> {
		switch (product.type) {
			case 'NORMAL': {
				if (product.available > 0) {
					await this.decrementStock(product);
				} else if (product.leadTime > 0) {
					await this.notifyDelay(product.leadTime, product);
				}

				break;
			}

			case 'SEASONAL': {
				const currentDate = new Date();
				if (currentDate > product.seasonStartDate! && currentDate < product.seasonEndDate! && product.available > 0) {
					await this.decrementStock(product);
					break;
				}

				await this.handleSeasonalProduct(product);
				break;
			}

			case 'EXPIRABLE': {
				await this.handleExpiredProduct(product);
				break;
			}

			default: {
				// Unknown types are currently ignored; their handling is unspecified.
				break;
			}
		}
	}

	public async notifyDelay(leadTime: number, product: Product): Promise<void> {
		product.leadTime = leadTime;
		await this.productRepository.update(product);
		this.notifications.sendDelayNotification(leadTime, product.name);
	}

	public async handleSeasonalProduct(product: Product): Promise<void> {
		const currentDate = new Date();
		const replenishmentDate = new Date(currentDate.getTime() + (product.leadTime * DAY_IN_MS));

		if (replenishmentDate > product.seasonEndDate!) {
			this.notifications.sendOutOfStockNotification(product.name);
			product.available = 0;
			await this.productRepository.update(product);
		} else if (product.seasonStartDate! > currentDate) {
			this.notifications.sendOutOfStockNotification(product.name);
			await this.productRepository.update(product);
		} else {
			await this.notifyDelay(product.leadTime, product);
		}
	}

	public async handleExpiredProduct(product: Product): Promise<void> {
		const currentDate = new Date();
		if (product.available > 0 && product.expiryDate! > currentDate) {
			await this.decrementStock(product);
		} else {
			this.notifications.sendExpirationNotification(product.name, product.expiryDate!);
			product.available = 0;
			await this.productRepository.update(product);
		}
	}

	private async decrementStock(product: Product): Promise<void> {
		product.available -= 1;
		await this.productRepository.update(product);
	}
}
