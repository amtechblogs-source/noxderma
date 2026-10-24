export type BonusSchemeType =
  | "none"
  | "10_plus_1" // ~9.09% discount
  | "10_plus_2" // ~16.67% discount
  | "100_plus_10" // ~9.09% discount
  | "100_plus_15" // ~13.04% discount
  | "custom";

export interface PriceEstimatorInputs {
  // Product identity
  productName: string;
  packSize: string;
  unitOfMeasure: "pack" | "bottle" | "box" | "tube" | "ampoule";
  categoryId?: string;

  // Direct Product Costs (Per Pack)
  buyingCostPerUnit: number;
  packagingCostPerUnit: number;
  inwardFreightPerUnit: number;
  damageBufferPercent: number; // e.g. 2.5%

  // Sales Reps / Employees & Monthly Fixed Overheads
  employeeCount: number;
  salaryPerEmployee: number;
  fuelPerEmployee: number;
  dailyAllowancePerEmployee: number;
  officeAdminOverheads: number;
  expectedMonthlyVolume: number; // in units/packs

  // Pharma Field & Doctor Sampling
  doctorSamplingPercent: number; // e.g. 10%
  bonusSchemeType: BonusSchemeType;
  customBonusPercent: number;
  salesRepCommissionPerUnit: number;
  monthlyMarketingBudget: number;

  // Outward Logistics
  deliveryCostPerUnit: number;

  // Margins & Taxes
  noxdermaTargetMarginPercent: number; // e.g. 25%
  distributorMarginPercent: number; // e.g. 10%
  pharmacyMarginPercent: number; // e.g. 15%
  taxGstPercent: number; // e.g. 0% or 18%
}

export interface PriceEstimatorResults {
  // Per unit costs
  directCostPerUnit: number;
  overheadCostPerUnit: number;
  doctorSamplingCostPerUnit: number;
  fieldPromoCostPerUnit: number;
  deliveryCostPerUnit: number;
  totalLandedCostPerUnit: number; // True cost to Noxderma

  // Pricing Tiers
  distributorPrice: number; // DP
  effectiveDistributorPriceWithScheme: number;
  tradePrice: number; // TP
  retailPriceExTax: number;
  retailPriceFinalMrp: number; // MRP
  taxAmountPerUnit: number;

  // Profitability
  noxdermaNetProfitPerUnit: number;
  noxdermaMonthlyNetProfit: number;
  noxdermaGrossMarginPercent: number;

  // Break-even & Safety
  breakEvenVolumeUnits: number;
  breakEvenMonthlyRevenue: number;
  minimumFloorPrice: number;
  isVolumeBelowBreakEven: boolean;

  // Totals for Monthly P&L projection
  totalMonthlyRevenue: number;
  totalMonthlyExpenses: number;
  totalMonthlyDirectCosts: number;
  totalMonthlyFixedCosts: number;

  // Visualization Slices
  chartSlices: {
    name: string;
    value: number;
    color: string;
    percent: number;
  }[];
}
