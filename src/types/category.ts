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

export const INITIAL_DEFAULT_CATEGORIES: Omit<DynamicCategory, "createdAt" | "updatedAt">[] = [];
