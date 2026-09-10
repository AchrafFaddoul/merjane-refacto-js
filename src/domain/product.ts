/* eslint-disable @typescript-eslint/ban-types -- Existing product data uses null for missing dates. */
export type Product = {
	id: number;
	name: string;
	// The database also accepts unrecognized type values.
	type: string;
	available: number;
	leadTime: number;
	expiryDate: Date | null;
	seasonStartDate: Date | null;
	seasonEndDate: Date | null;
};
