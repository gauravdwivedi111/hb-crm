export type Role = 'ADMIN' | 'DGM' | 'AGM' | 'MANAGER' | 'EMPLOYEE';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface AuthResponseData {
  accessToken: string;
  user: User;
}

export type EnquiryStatus =
  | 'NEW'
  | 'ASSIGNED'
  | 'CONTACTED'
  | 'FOLLOW_UP_REQUIRED'
  | 'QUOTATION_SENT'
  | 'NEGOTIATION'
  | 'CONVERTED'
  | 'LOST'
  | 'ON_HOLD';

export interface RecentlyContactedCustomer {
  customerId: string;
  customerName: string;
  companyName: string | null;
  phone: string;
  email?: string;
  lastContactedAt: string;
  enquiryId?: string;
  latestEnquiryId?: string;
  product: string | null;
}

export interface DashboardMeData {
  countsByStatus: Record<EnquiryStatus, number>;
  followups: {
    dueToday: number;
    overdue: number;
  };
  quotationsPendingResponse: number;
  performanceThisMonth: {
    converted: number;
    lost: number;
  };
  recentlyContactedCustomers: RecentlyContactedCustomer[];
}

export interface SubordinateMetrics {
  user: User;
  countsByStatus?: Record<EnquiryStatus, number>;
  statusCounts?: Record<EnquiryStatus, number>;
  followups: {
    dueToday: number;
    overdue: number;
  };
  quotationsPendingResponse: number;
  assignedCount: number;
  assignedThisMonth?: number;
  contactedCount: number;
  overdueCount?: number;
  convertedThisMonth: number;
  lostThisMonth?: number;
  conversionRateThisMonth: number;
}

export interface SearchResultItem {
  id: string;
  type: 'CUSTOMER' | 'ENQUIRY';
  title: string;
  subtitle: string | null;
  phone?: string | null;
  email?: string | null;
  score: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type FollowupFrequency = 'ONE_TIME' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

export type FollowupStatus = 'PENDING' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED';

export type ActivityType =
  | 'ENQUIRY_CREATED'
  | 'STATUS_CHANGED'
  | 'FOLLOWUP_SCHEDULED'
  | 'FOLLOWUP_COMPLETED'
  | 'FOLLOWUP_OVERDUE'
  | 'QUOTATION_SENT'
  | 'ATTACHMENT_UPLOADED'
  | 'ASSIGNED';

export type QuotationStatus =
  | 'CREATED'
  | 'SENT'
  | 'VIEWED'
  | 'REVISED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED';

export interface Customer {
  id: string;
  name: string;
  companyName: string | null;
  phone: string;
  email: string | null;
  location: string | null;
  notes: string | null;
  assignedToId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Activity {
  id: string;
  enquiryId: string;
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
  };
  type: ActivityType;
  description: string | null;
  previousStatus: EnquiryStatus | null;
  newStatus: EnquiryStatus | null;
  nextFollowupAt: string | null;
  createdAt: string;
}

export interface StatusHistory {
  id: string;
  enquiryId: string;
  oldStatus: EnquiryStatus;
  newStatus: EnquiryStatus;
  changedById: string;
  changedBy: {
    id: string;
    name: string;
    email: string;
    role: Role;
  };
  reason: string | null;
  createdAt: string;
}

export interface Quotation {
  id: string;
  enquiryId: string;
  createdById: string;
  createdBy?: {
    id: string;
    name: string;
    email: string;
    role?: Role;
  };
  status: QuotationStatus;
  amount: number | string | null;
  sentAt: string | null;
  respondedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  enquiryId: string | null;
  customerId: string | null;
  uploadedById: string;
  uploadedBy?: {
    id: string;
    name: string;
    email: string;
    role?: Role;
  };
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
}

export interface Followup {
  id: string;
  enquiryId: string | null;
  customerId: string | null;
  assignedToId: string;
  assignedTo?: {
    id: string;
    name: string;
    email: string;
    role: Role;
  };
  enquiry?: {
    id: string;
    product?: string | null;
    companyName?: string | null;
    assignedToId?: string | null;
  } | null;
  customer?: {
    id: string;
    name: string;
    companyName?: string | null;
    phone?: string;
  } | null;
  dueAt: string;
  status: FollowupStatus;
  purpose: string | null;
  frequency: FollowupFrequency;
  completedAt: string | null;
  createdAt: string;
}

export interface Enquiry {
  id: string;
  customerId: string;
  customer: Customer;
  companyName: string | null;
  phone: string;
  email: string | null;
  location: string | null;
  source: string | null;
  product: string | null;
  assignedToId: string | null;
  assignedTo: {
    id: string;
    name: string;
    email: string;
    role: Role;
  } | null;
  createdById: string;
  createdBy: {
    id: string;
    name: string;
    email: string;
    role: Role;
  };
  status: EnquiryStatus;
  priority: Priority;
  expectedValue: number | string | null;
  nextFollowupAt: string | null;
  lastContactedAt: string | null;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
  allowEmployeeReassignment?: boolean;
  activities?: Activity[];
  statusHistory?: StatusHistory[];
  quotations?: Quotation[];
  attachments?: Attachment[];
  followups?: Followup[];
}

export interface EnquiriesPaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface EnquiryListResponse {
  enquiries: Enquiry[];
  meta: EnquiriesPaginationMeta;
}

export interface EnquiriesQueryParams {
  page?: number;
  limit?: number;
  status?: EnquiryStatus;
  priority?: Priority;
  assignedToId?: string;
  search?: string;
}

export interface CreateEnquiryPayload {
  customerId?: string;
  customer?: {
    name: string;
    phone: string;
    email?: string | null;
    companyName?: string | null;
    location?: string | null;
    notes?: string | null;
  };
  companyName?: string;
  phone: string;
  email?: string;
  location?: string;
  source?: string;
  product?: string;
  priority?: Priority;
  expectedValue?: number | string;
  remarks?: string;
  assignedToId?: string;
}

export interface UpdateEnquiryPayload {
  phone?: string;
  email?: string | null;
  location?: string | null;
  source?: string | null;
  product?: string | null;
  priority?: Priority;
  expectedValue?: number | string | null;
  remarks?: string | null;
}

export interface ChangeStatusPayload {
  newStatus: EnquiryStatus;
  reason?: string;
}

export interface CreateFollowupPayload {
  enquiryId?: string;
  customerId?: string;
  dueAt: string;
  purpose?: string;
  frequency?: FollowupFrequency;
  assignedToId?: string;
}

export interface CreateQuotationPayload {
  amount?: number | string | null;
  notes?: string | null;
}

export interface TransitionQuotationPayload {
  status: QuotationStatus;
  notes?: string | null;
}

export interface UploadAttachmentPayload {
  file: File;
  enquiryId?: string;
  customerId?: string;
  onProgress?: (percent: number) => void;
}

export interface DownloadAttachmentResponse {
  downloadUrl: string;
  expiresIn: number;
  fileName: string;
  fileType: string;
  fileSize: number;
}

export interface UserPerformanceMetrics {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
  };
  enquiriesAssigned: number;
  contacted: number;
  followupsCompleted: number;
  followupsMissed: number;
  quotationsSent: number;
  converted: number;
  lost: number;
  conversionRate: number;
  avgTimeToFirstContactHours: number | null;
  avgTimeToConversionHours: number | null;
}

export interface PerformanceReportQueryParams {
  startDate?: string;
  endDate?: string;
  userId?: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  supervisorId: string | null;
  supervisor: {
    id: string;
    name: string;
    email: string;
    role: Role;
  } | null;
  failedLoginCount?: number;
  lockedUntil?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  role: Role;
  supervisorId?: string | null;
}

export interface ListUsersQueryParams {
  role?: Role;
  isActive?: boolean;
}

export interface UserProfileData {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    isActive: boolean;
    supervisorId: string | null;
    supervisor: {
      id: string;
      name: string;
      email: string;
      role: Role;
    } | null;
    createdAt: string;
  };
  countsByStatus: Record<EnquiryStatus, number>;
  followups: {
    dueToday: number;
    overdue: number;
  };
  quotationsPendingResponse: number;
  assignedCount: number;
  assignedThisMonth?: number;
  contactedCount: number;
  overdueCount?: number;
  convertedThisMonth: number;
  lostThisMonth: number;
  conversionRateThisMonth: number;
  performanceThisMonth: {
    converted: number;
    lost: number;
    conversionRate: number;
  };
  team?: SubordinateMetrics[];
}

export interface AppNotification {
  id: string;
  userId: string;
  type: string;
  message: string;
  relatedEnquiryId: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationsListResponse {
  notifications: AppNotification[];
  meta: {
    total: number;
    unreadCount: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface NotificationsQueryParams {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

export interface ImportRowError {
  row: number;
  reason: string;
}

export interface ImportEnquiriesResult {
  totalRows: number;
  imported: number;
  skipped: number;
  errors: ImportRowError[];
}

export interface SystemSettings {
  id: string;
  allowEmployeeReassignment: boolean;
  updatedAt: string;
}


