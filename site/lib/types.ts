import type { Models } from "appwrite";

export type Company = Models.Row & {
  name: string; legalName?: string; taxNumber?: string; website?: string; industry?: string;
  status: string; ownerUserId?: string; billingEmail?: string; phone?: string; billingAddress?: string;
  invoiceFooter?: string; isOwnCompany?: boolean;
  currency: string; paymentTermsDays: number; notes?: string; tags?: string[];
};

export type Contact = Models.Row & {
  companyId: string; firstName: string; lastName?: string; displayName: string;
  jobTitle?: string; email?: string; phone?: string; isPrimary: boolean; status: string; notes?: string;
};

export type Interest = Models.Row & {
  companyId: string; primaryContactId?: string; title: string; description?: string;
  source?: string; status: string; ownerUserId: string; estimatedValueMinor: number;
  currency: string; probability: number; nextActionAt?: string; expectedCloseDate?: string;
  convertedProjectId?: string;
};

export type Activity = Models.Row & {
  entityType: string; entityId: string; companyId?: string; contactId?: string;
  activityType: string; direction?: string; subject: string; body?: string;
  occurredAt: string; nextActionAt?: string; assignedToUserId?: string; outcome?: string;
};

export type Project = Models.Row & {
  companyId: string; interestId?: string; projectNumber: string; name: string;
  description?: string; status: string; ownerUserId: string; currency: string; contractValueMinor: number;
};

export type Section = "dashboard" | "companies" | "contacts" | "pipeline" | "projects" | "finance" | "settings";
