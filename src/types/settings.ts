export interface BusinessSettings {
  id: string;
  legalName: string;
  brandName: string;
  businessLogoUrl: string;
  appLogoUrl: string;
  invoiceLogoUrl: string;
  faviconUrl: string;
  colorTheme?: string;
  address: string;
  website: string;
  contactPhone: string;
  whatsappNumber: string;
  email: string;
  currency: string; // Initially "PKR"
  currencySymbol: string; // "₨"
  timezone: string; // Initially "Asia/Karachi"
  dateFormat: string; // "dd/MM/yyyy"
  numberFormat: string; // "en-PK"
  invoicePrefix: string; // e.g. "NXD"
  invoiceFooter: string;
  paymentInstructions: string;
  defaultCreditTermsDays: number; // 30
  defaultDeliverySettings: {
    standardCharge: number;
    freeDeliveryThreshold: number;
  };
  lowStockThresholdDefault: number; // 10
  nearExpiryWarningDays: number[]; // [90, 60, 30]
  expiryBlockingPolicy: "block_sale" | "warn_admin_override";
  samplePolicy: "expense_at_cost" | "zero_revenue";
  damagedStockPolicy: "write_off_loss";
  taxRateDefault: number; // in percent
  updatedAt: string;
  updatedBy: string;
}

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  id: "primary",
  legalName: "Noxderma Pharmaceuticals Ltd.",
  brandName: "Noxderma Pharma",
  businessLogoUrl: "/brand/logo.svg",
  appLogoUrl: "/brand/logo.svg",
  invoiceLogoUrl: "/brand/invoice-logo.svg",
  faviconUrl: "/favicon.ico",
  address: "Plot 42, Industrial Area, Sector 7, Karachi, Pakistan",
  website: "https://noxderma.web.app",
  contactPhone: "+92 300 1234567",
  whatsappNumber: "+92 300 1234567",
  email: "info@noxderma.com",
  currency: "PKR",
  currencySymbol: "₨",
  timezone: "Asia/Karachi",
  dateFormat: "dd/MM/yyyy",
  numberFormat: "en-PK",
  invoicePrefix: "NXD",
  invoiceFooter: "Thank you for partnering with Noxderma. Quality healthcare distributed with integrity.",
  paymentInstructions: "Bank: Meezan Bank | A/C Title: Noxderma Pharma | IBAN: PK00MEZN0001234567890123",
  defaultCreditTermsDays: 30,
  defaultDeliverySettings: {
    standardCharge: 250,
    freeDeliveryThreshold: 5000,
  },
  lowStockThresholdDefault: 15,
  nearExpiryWarningDays: [90, 60, 30],
  expiryBlockingPolicy: "block_sale",
  samplePolicy: "expense_at_cost",
  damagedStockPolicy: "write_off_loss",
  taxRateDefault: 0,
  updatedAt: new Date().toISOString(),
  updatedBy: "system",
};
