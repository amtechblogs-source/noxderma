export interface ProductImage {
  id: string;
  url: string;
  provider: "imagekit" | "local_blob";
  fileId?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  isPrimary: boolean;
  uploadedAt: string;
}

export interface Product {
  id: string;
  sku: string;
  barcode?: string;
  name: string;
  genericName?: string;
  brand: string;
  manufacturerId: string;
  manufacturerName: string;
  categoryId: string;
  categoryName: string;
  description?: string;
  packSize: string; // e.g. "Pack of 30 tablets"
  unitOfMeasure: "pack" | "bottle" | "box" | "tube" | "ampoule";
  unitsPerPack: number; // e.g. 30
  reorderThreshold: number;
  requiresBatchTracking: boolean;
  images: ProductImage[];
  status: "active" | "discontinued" | "draft";
  marketingText?: string;
  createdAt: string;
  updatedAt: string;
}

// Strictly protected - visible only to Admin and authorized billing roles, NOT warehouse staff
export interface ProductPricing {
  productId: string;
  purchaseCostPerPack: number; // in PKR minor units or decimals
  tradePricePerPack: number; // wholesale price for distributors/pharmacies
  distributorPricePerPack?: number;
  mrpPerPack: number; // Maximum Retail Price
  taxPercentage: number;
  discountMaxPercentage: number;
  updatedAt: string;
}
