export type LeadPipelineStage =
  | "new"
  | "contacted"
  | "qualified"
  | "follow_up"
  | "offer_sent"
  | "converted"
  | "lost";

export interface Lead {
  id: string;
  leadName: string;
  organizationName?: string;
  contactPerson: string;
  phone: string;
  whatsappNumber: string;
  email?: string;
  city: string;
  address?: string;
  leadSource: "field_visit" | "referral" | "direct_inquiry" | "marketing" | "other";
  interestedCategoryId?: string;
  interestedCategoryName?: string;
  assignedEmployeeId: string;
  assignedEmployeeName: string;
  status: LeadPipelineStage;
  estimatedPotentialPkr: number;
  notes?: string;
  nextFollowUpDate?: string;
  createdAt: string;
  lastContactedAt?: string;
}

export interface CustomerVisit {
  id: string;
  customerId?: string;
  customerName: string;
  leadId?: string;
  organizationType: "pharmacy" | "clinic" | "distributor" | "hospital";
  contactPerson: string;
  employeeId: string;
  employeeName: string;
  visitDate: string;
  visitNotes: string;
  productsDiscussed: string[];
  productInterestLevel: "high" | "medium" | "low" | "none";
  ordersOrLeadsGenerated?: string;
  competitorProducts?: string;
  competitorOffers?: string;
  ourPromotionalOffersDiscussed?: string;
  customerFeedback?: string;
  followUpDate?: string;
  followUpNotes?: string;
  createdAt: string;
}
