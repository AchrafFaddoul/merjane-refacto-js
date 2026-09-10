import {type INotificationService} from '../notifications.port.js';
import {type ProductRepository} from '../product-repository.port.js';
import {type Product} from '@/domain/product.js';

export class ProductService {
	private readonly ns: INotificationService;
	private readonly productRepository: ProductRepository;

	public constructor({ns, productRepository}: {ns: INotificationService; productRepository: ProductRepository}) {
		this.ns = ns;
		this.productRepository = productRepository;
	}

	public async notifyDelay(leadTime: number, p: Product): Promise<void> {
		p.leadTime = leadTime;
		await this.productRepository.update(p);
		this.ns.sendDelayNotification(leadTime, p.name);
	}

	public async handleSeasonalProduct(p: Product): Promise<void> {
		const currentDate = new Date();
		const d = 1000 * 60 * 60 * 24;
		if (new Date(currentDate.getTime() + (p.leadTime * d)) > p.seasonEndDate!) {
			this.ns.sendOutOfStockNotification(p.name);
			p.available = 0;
			await this.productRepository.update(p);
		} else if (p.seasonStartDate! > currentDate) {
			this.ns.sendOutOfStockNotification(p.name);
			await this.productRepository.update(p);
		} else {
			await this.notifyDelay(p.leadTime, p);
		}
	}

	public async handleExpiredProduct(p: Product): Promise<void> {
		const currentDate = new Date();
		if (p.available > 0 && p.expiryDate! > currentDate) {
			p.available -= 1;
			await this.productRepository.update(p);
		} else {
			this.ns.sendExpirationNotification(p.name, p.expiryDate!);
			p.available = 0;
			await this.productRepository.update(p);
		}
	}
}
