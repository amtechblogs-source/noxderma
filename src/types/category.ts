export interface DynamicCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  displayOrder: number;
  active: boolean;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export const INITIAL_DEFAULT_CATEGORIES: Omit<DynamicCategory, "createdAt" | "updatedAt">[] = [
  {
    id: "cat_pharmacy",
    name: "Pharmacy & Prescriptions",
    slug: "pharmacy",
    description: "Therapeutic medications, antibiotics, and clinical formulations",
    displayOrder: 1,
    active: true,
    productCount: 0,
  },
  {
    id: "cat_cosmetics",
    name: "Cosmeceuticals & Skincare",
    slug: "cosmeceuticals",
    description: "Dermatological creams, serums, and clinical skincare",
    displayOrder: 2,
    active: true,
    productCount: 0,
  },
  {
    id: "cat_supplements",
    name: "Nutraceuticals & Supplements",
    slug: "supplements",
    description: "Vitamins, dietary supplements, and wellness boosters",
    displayOrder: 3,
    active: true,
    productCount: 0,
  },
];
