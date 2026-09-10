/* eslint-disable @typescript-eslint/ban-types -- Nullable dates are part of the existing product data contract. */
export type Product = {
	id: number;
	name: string;
	// Unknown persisted types remain representable and are currently ignored.
	type: string;
	available: number;
	leadTime: number;
	expiryDate: Date | null;
	seasonStartDate: Date | null;
	seasonEndDate: Date | null;
};
