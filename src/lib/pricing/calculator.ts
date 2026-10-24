import type { PriceEstimatorInputs, PriceEstimatorResults, BonusSchemeType } from "@/types";

export function getSchemeDiscountPercent(type: BonusSchemeType, customPercent: number = 0): number {
  switch (type) {
    case "10_plus_1":
      return (1 / 11) * 100; // 9.09%
    case "10_plus_2":
      return (2 / 12) * 100; // 16.67%
    case "100_plus_10":
      return (10 / 110) * 100; // 9.09%
    case "100_plus_15":
      return (15 / 115) * 100; // 13.04%
    case "custom":
      return Math.max(0, Math.min(100, customPercent || 0));
    case "none":
    default:
      return 0;
  }
}

export function calculatePriceEstimate(inputs: PriceEstimatorInputs): PriceEstimatorResults {
  const volume = Math.max(1, Number(inputs.expectedMonthlyVolume) || 1000);

  // 1. Direct Manufacturing & Inward Costs
  const rawDirect =
    (Number(inputs.buyingCostPerUnit) || 0) +
    (Number(inputs.packagingCostPerUnit) || 0) +
    (Number(inputs.inwardFreightPerUnit) || 0);
  const damageBufferMultiplier = 1 + (Number(inputs.damageBufferPercent) || 0) / 100;
  const directCostPerUnit = rawDirect * damageBufferMultiplier;

  // 2. Sales Reps, Staff, Fuel & Fixed Monthly Overheads
  const employeeCount = Math.max(0, Number(inputs.employeeCount) || 0);
  const salaryPerEmp = Math.max(0, Number(inputs.salaryPerEmployee) || 0);
  const fuelPerEmp = Math.max(0, Number(inputs.fuelPerEmployee) || 0);
  const daPerEmp = Math.max(0, Number(inputs.dailyAllowancePerEmployee) || 0);
  const officeAdmin = Math.max(0, Number(inputs.officeAdminOverheads) || 0);

  const totalMonthlyEmployeeExpenses = employeeCount * (salaryPerEmp + fuelPerEmp + daPerEmp);
  const totalMonthlyFixedOverheads = totalMonthlyEmployeeExpenses + officeAdmin;
  const overheadCostPerUnit = totalMonthlyFixedOverheads / volume;

  // 3. Pharma Doctor Sampling & Marketing
  const samplingPercent = Math.max(0, Number(inputs.doctorSamplingPercent) || 0);
  const doctorSamplingCostPerUnit = directCostPerUnit * (samplingPercent / 100);

  const marketingMonthly = Math.max(0, Number(inputs.monthlyMarketingBudget) || 0);
  const marketingPerUnit = marketingMonthly / volume;
  const salesRepCommission = Math.max(0, Number(inputs.salesRepCommissionPerUnit) || 0);
  const fieldPromoCostPerUnit = marketingPerUnit + salesRepCommission;

  // 4. Outward Delivery / Courier
  const deliveryCostPerUnit = Math.max(0, Number(inputs.deliveryCostPerUnit) || 0);

  // 5. Total Landed Cost (True Cost to Noxderma)
  const totalLandedCostPerUnit =
    directCostPerUnit +
    overheadCostPerUnit +
    doctorSamplingCostPerUnit +
    fieldPromoCostPerUnit +
    deliveryCostPerUnit;

  // 6. Pricing Tiers
  const targetMarginPercent = Math.max(0, Math.min(85, Number(inputs.noxdermaTargetMarginPercent) || 25));
  const distributorMarginPercent = Math.max(0, Math.min(85, Number(inputs.distributorMarginPercent) || 10));
  const pharmacyMarginPercent = Math.max(0, Math.min(85, Number(inputs.pharmacyMarginPercent) || 15));
  const gstPercent = Math.max(0, Number(inputs.taxGstPercent) || 0);

  // Formula: DP = Cost / (1 - Margin%)
  const marginDivisor = 1 - targetMarginPercent / 100;
  const distributorPrice = marginDivisor > 0 ? totalLandedCostPerUnit / marginDivisor : totalLandedCostPerUnit;

  // Effective DP after bonus scheme deduction
  const schemeDiscountPercent = getSchemeDiscountPercent(inputs.bonusSchemeType, inputs.customBonusPercent);
  const effectiveDistributorPriceWithScheme = distributorPrice * (1 - schemeDiscountPercent / 100);

  // Trade Price (Price to Pharmacy)
  const distMarginDivisor = 1 - distributorMarginPercent / 100;
  const tradePrice = distMarginDivisor > 0 ? distributorPrice / distMarginDivisor : distributorPrice;

  // Maximum Retail Price (MRP)
  const pharmMarginDivisor = 1 - pharmacyMarginPercent / 100;
  const retailPriceExTax = pharmMarginDivisor > 0 ? tradePrice / pharmMarginDivisor : tradePrice;
  const taxAmountPerUnit = retailPriceExTax * (gstPercent / 100);
  const retailPriceFinalMrp = retailPriceExTax + taxAmountPerUnit;

  // 7. Profitability
  const noxdermaNetProfitPerUnit = distributorPrice - totalLandedCostPerUnit;
  const noxdermaMonthlyNetProfit = noxdermaNetProfitPerUnit * volume;
  const noxdermaGrossMarginPercent = distributorPrice > 0 ? (noxdermaNetProfitPerUnit / distributorPrice) * 100 : 0;

  // 8. Break-even Analysis
  // Variable cost = Direct + Sampling + Delivery + Sales Commission
  const variableCostPerUnit =
    directCostPerUnit + doctorSamplingCostPerUnit + deliveryCostPerUnit + salesRepCommission;
  const contributionMarginPerUnit = distributorPrice - variableCostPerUnit;
  const fixedMonthlyCosts = totalMonthlyFixedOverheads + marketingMonthly;

  const breakEvenVolumeUnits =
    contributionMarginPerUnit > 0 ? Math.ceil(fixedMonthlyCosts / contributionMarginPerUnit) : 0;
  const breakEvenMonthlyRevenue = breakEvenVolumeUnits * distributorPrice;
  const isVolumeBelowBreakEven = volume < breakEvenVolumeUnits;

  // 9. Totals for Monthly Projections
  const totalMonthlyRevenue = distributorPrice * volume;
  const totalMonthlyDirectCosts = directCostPerUnit * volume;
  const totalMonthlyExpenses = totalLandedCostPerUnit * volume;

  // 10. Visualization Slices (based on MRP breakdown)
  const totalMrp = Math.max(1, retailPriceFinalMrp);
  const distCut = tradePrice - distributorPrice;
  const pharmCut = retailPriceExTax - tradePrice;

  const chartSlices = [
    {
      name: "Direct Product (Factory & Pack)",
      value: Math.round(directCostPerUnit),
      color: "#0d9488", // Teal 600
      percent: Math.round((directCostPerUnit / totalMrp) * 100),
    },
    {
      name: "Field Team, Fuel & Overheads",
      value: Math.round(overheadCostPerUnit),
      color: "#f59e0b", // Amber 500
      percent: Math.round((overheadCostPerUnit / totalMrp) * 100),
    },
    {
      name: "Doctor Samples & Field Marketing",
      value: Math.round(doctorSamplingCostPerUnit + fieldPromoCostPerUnit + deliveryCostPerUnit),
      color: "#8b5cf6", // Purple 500
      percent: Math.round(((doctorSamplingCostPerUnit + fieldPromoCostPerUnit + deliveryCostPerUnit) / totalMrp) * 100),
    },
    {
      name: "Noxderma Net Profit",
      value: Math.round(Math.max(0, noxdermaNetProfitPerUnit)),
      color: "#10b981", // Emerald 500
      percent: Math.round((Math.max(0, noxdermaNetProfitPerUnit) / totalMrp) * 100),
    },
    {
      name: "Distributor & Pharmacy Margins",
      value: Math.round(distCut + pharmCut),
      color: "#3b82f6", // Blue 500
      percent: Math.round(((distCut + pharmCut) / totalMrp) * 100),
    },
    ...(gstPercent > 0
      ? [
          {
            name: "GST / Sales Tax",
            value: Math.round(taxAmountPerUnit),
            color: "#ef4444", // Red 500
            percent: Math.round((taxAmountPerUnit / totalMrp) * 100),
          },
        ]
      : []),
  ];

  return {
    directCostPerUnit,
    overheadCostPerUnit,
    doctorSamplingCostPerUnit,
    fieldPromoCostPerUnit,
    deliveryCostPerUnit,
    totalLandedCostPerUnit,
    distributorPrice,
    effectiveDistributorPriceWithScheme,
    tradePrice,
    retailPriceExTax,
    retailPriceFinalMrp,
    taxAmountPerUnit,
    noxdermaNetProfitPerUnit,
    noxdermaMonthlyNetProfit,
    noxdermaGrossMarginPercent,
    breakEvenVolumeUnits,
    breakEvenMonthlyRevenue,
    minimumFloorPrice: totalLandedCostPerUnit,
    isVolumeBelowBreakEven,
    totalMonthlyRevenue,
    totalMonthlyExpenses,
    totalMonthlyDirectCosts,
    totalMonthlyFixedCosts: fixedMonthlyCosts,
    chartSlices,
  };
}

export const ESTIMATOR_PRESETS: {
  id: string;
  title: string;
  description: string;
  inputs: PriceEstimatorInputs;
}[] = [
  {
    id: "derma_serum",
    title: "Dermatology Serum / Cream (High Margin)",
    description: "Cosmeceutical 30ml/50g with high doctor sampling & branding",
    inputs: {
      productName: "Noxderma Glow Vitamin-C Serum 30ml",
      packSize: "30ml Dropper Bottle",
      unitOfMeasure: "bottle",
      buyingCostPerUnit: 280,
      packagingCostPerUnit: 45,
      inwardFreightPerUnit: 12,
      damageBufferPercent: 2.5,
      employeeCount: 4,
      salaryPerEmployee: 42000,
      fuelPerEmployee: 16000,
      dailyAllowancePerEmployee: 7000,
      officeAdminOverheads: 45000,
      expectedMonthlyVolume: 1500,
      doctorSamplingPercent: 12,
      bonusSchemeType: "10_plus_1",
      customBonusPercent: 0,
      salesRepCommissionPerUnit: 25,
      monthlyMarketingBudget: 35000,
      deliveryCostPerUnit: 15,
      noxdermaTargetMarginPercent: 32,
      distributorMarginPercent: 10,
      pharmacyMarginPercent: 16,
      taxGstPercent: 0,
    },
  },
  {
    id: "oral_tablets",
    title: "Oral Tablets / Capsules (High Volume Pharma)",
    description: "Blister packs of 30s/20s, high monthly turnover",
    inputs: {
      productName: "Noxderma Dermacare 50mg Tablets",
      packSize: "Alu-Alu Pack of 30 Tablets",
      unitOfMeasure: "pack",
      buyingCostPerUnit: 160,
      packagingCostPerUnit: 25,
      inwardFreightPerUnit: 8,
      damageBufferPercent: 2,
      employeeCount: 5,
      salaryPerEmployee: 40000,
      fuelPerEmployee: 15000,
      dailyAllowancePerEmployee: 6000,
      officeAdminOverheads: 50000,
      expectedMonthlyVolume: 3500,
      doctorSamplingPercent: 8,
      bonusSchemeType: "100_plus_10",
      customBonusPercent: 0,
      salesRepCommissionPerUnit: 12,
      monthlyMarketingBudget: 25000,
      deliveryCostPerUnit: 10,
      noxdermaTargetMarginPercent: 24,
      distributorMarginPercent: 9,
      pharmacyMarginPercent: 15,
      taxGstPercent: 0,
    },
  },
  {
    id: "syrup_suspension",
    title: "Syrup / Suspension (Heavy Packaging & Freight)",
    description: "Glass/PET bottles with measuring cup, higher transport cost",
    inputs: {
      productName: "Noxderma SkinClear Syrup 120ml",
      packSize: "120ml Amber PET Bottle with Box",
      unitOfMeasure: "bottle",
      buyingCostPerUnit: 195,
      packagingCostPerUnit: 35,
      inwardFreightPerUnit: 18,
      damageBufferPercent: 3,
      employeeCount: 4,
      salaryPerEmployee: 40000,
      fuelPerEmployee: 15000,
      dailyAllowancePerEmployee: 6000,
      officeAdminOverheads: 40000,
      expectedMonthlyVolume: 2000,
      doctorSamplingPercent: 10,
      bonusSchemeType: "none",
      customBonusPercent: 0,
      salesRepCommissionPerUnit: 15,
      monthlyMarketingBudget: 20000,
      deliveryCostPerUnit: 20,
      noxdermaTargetMarginPercent: 28,
      distributorMarginPercent: 10,
      pharmacyMarginPercent: 15,
      taxGstPercent: 0,
    },
  },
  {
    id: "d2c_ecommerce",
    title: "Direct Online / E-Commerce (Courier & Ads Heavy)",
    description: "Direct to consumer sales with COD and digital ads",
    inputs: {
      productName: "Noxderma Sunscreen SPF 60 Gel 50ml",
      packSize: "50ml Tube in Mono-Carton",
      unitOfMeasure: "tube",
      buyingCostPerUnit: 310,
      packagingCostPerUnit: 50,
      inwardFreightPerUnit: 15,
      damageBufferPercent: 2.5,
      employeeCount: 2,
      salaryPerEmployee: 45000,
      fuelPerEmployee: 5000,
      dailyAllowancePerEmployee: 0,
      officeAdminOverheads: 30000,
      expectedMonthlyVolume: 1200,
      doctorSamplingPercent: 0,
      bonusSchemeType: "none",
      customBonusPercent: 0,
      salesRepCommissionPerUnit: 0,
      monthlyMarketingBudget: 85000, // Meta / Google ads
      deliveryCostPerUnit: 180, // Courier + COD charges
      noxdermaTargetMarginPercent: 38,
      distributorMarginPercent: 0,
      pharmacyMarginPercent: 0,
      taxGstPercent: 0,
    },
  },
];
