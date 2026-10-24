import { CouponManagerView } from "@/features/marketing/CouponManagerView";

export const metadata = {
  title: "Customer Discount & Coupon Code Generator | Noxderma ERP",
  description: "Generate promotional discount vouchers, assign to pharmacies and clinics, dispatch WhatsApp cards, and sync with noxderma.com developers.",
};

export default function CouponsPage() {
  return <CouponManagerView />;
}
