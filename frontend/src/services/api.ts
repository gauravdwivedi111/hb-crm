import {
  AuthResponseData,
  DashboardMeData,
  User,
  Enquiry,
  EnquiryListResponse,
  EnquiriesQueryParams,
  CreateEnquiryPayload,
  UpdateEnquiryPayload,
  ChangeStatusPayload,
  CreateFollowupPayload,
  Followup,
  FollowupStatus,
  SubordinateMetrics,
  Quotation,
  Attachment,
  CreateQuotationPayload,
  TransitionQuotationPayload,
  UploadAttachmentPayload,
  DownloadAttachmentResponse,
  UserPerformanceMetrics,
  PerformanceReportQueryParams,
  SearchResultItem,
  AdminUser,
  CreateUserPayload,
  ListUsersQueryParams,
  UserProfileData,
  AppNotification,
  NotificationsListResponse,
  NotificationsQueryParams,
  ImportEnquiriesResult,
  SystemSettings,
} from '../types/api.types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

// In-memory access token storage (never localStorage or sessionStorage)
let inMemoryAccessToken: string | null = null;

export const setAccessToken = (token: string | null): void => {
  inMemoryAccessToken = token;
};

export const getAccessToken = (): string | null => inMemoryAccessToken;

// Synchronization callbacks for React AuthContext
type TokenUpdateCallback = (token: string | null, user?: User) => void;
type AuthFailureCallback = () => void;

let onTokenUpdate: TokenUpdateCallback | null = null;
let onAuthFailure: AuthFailureCallback | null = null;

export const registerAuthCallbacks = (
  tokenCallback: TokenUpdateCallback | null,
  failureCallback: AuthFailureCallback | null,
): void => {
  onTokenUpdate = tokenCallback;
  onAuthFailure = failureCallback;
};

interface ApiResponse<T> {
  status: 'success' | 'error';
  data: T;
  message?: string;
}

interface RequestConfig extends RequestInit {
  _retry?: boolean;
}

// In-flight refresh promise to deduplicate concurrent 401 retries
let activeRefreshPromise: Promise<AuthResponseData> | null = null;

export async function request<T>(endpoint: string, options: RequestConfig = {}): Promise<T> {
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Attach in-memory access token if present
  if (inMemoryAccessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemoryAccessToken}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include', // Sends httpOnly refresh token cookie
    });
  } catch (networkErr) {
    throw new Error(
      `Network connection failed: ${networkErr instanceof Error ? networkErr.message : String(networkErr)}`,
    );
  }

  // Handle 401: attempt token refresh once, then retry
  const isAuthEndpoint = endpoint.startsWith('/auth/login') || endpoint.startsWith('/auth/refresh');
  if (response.status === 401 && !options._retry && !isAuthEndpoint) {
    options._retry = true;

    try {
      if (!activeRefreshPromise) {
        activeRefreshPromise = (async (): Promise<AuthResponseData> => {
          const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          });

          if (!refreshRes.ok) {
            throw new Error(`Token refresh failed with status ${refreshRes.status}`);
          }

          const refreshJson = (await refreshRes.json()) as ApiResponse<AuthResponseData>;
          if (refreshJson.status !== 'success' || !refreshJson.data?.accessToken) {
            throw new Error(refreshJson.message || 'Failed to refresh authentication session');
          }

          return refreshJson.data;
        })().finally(() => {
          activeRefreshPromise = null;
        });
      }

      const refreshedAuth = await activeRefreshPromise;
      setAccessToken(refreshedAuth.accessToken);

      if (onTokenUpdate) {
        onTokenUpdate(refreshedAuth.accessToken, refreshedAuth.user);
      }

      // Retry original request with the fresh token
      headers.set('Authorization', `Bearer ${refreshedAuth.accessToken}`);
      const retryRes = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include',
      });

      const retryJson = (await retryRes.json()) as ApiResponse<T>;
      if (!retryRes.ok || retryJson.status === 'error') {
        throw new Error(retryJson.message || `Request failed with status ${retryRes.status}`);
      }

      return retryJson.data;
    } catch (refreshError) {
      // Refresh failed or revoked: clear in-memory token, invoke failure callback, and redirect
      setAccessToken(null);
      if (onAuthFailure) {
        onAuthFailure();
      }
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      throw refreshError;
    }
  }

  const responseJson = (await response.json()) as ApiResponse<T>;

  if (!response.ok || responseJson.status === 'error') {
    throw new Error(responseJson.message || `Request failed with status ${response.status}`);
  }

  return responseJson.data;
}

export const api = {
  // Authentication methods
  auth: {
    async login(email: string, password: string): Promise<AuthResponseData> {
      return request<AuthResponseData>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
    },

    async refresh(): Promise<AuthResponseData> {
      return request<AuthResponseData>('/auth/refresh', {
        method: 'POST',
      });
    },

    async logout(): Promise<{ message?: string }> {
      return request<{ message?: string }>('/auth/logout', {
        method: 'POST',
      });
    },

    async forgotPassword(email: string): Promise<{ message: string }> {
      return request<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
    },

    async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
      return request<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
    },
  },

  // Dashboard methods
  dashboard: {
    async getMyDashboard(): Promise<DashboardMeData> {
      return request<DashboardMeData>('/dashboard/me');
    },

    async getTeamDashboard(managerId?: string): Promise<SubordinateMetrics[]> {
      const endpoint = managerId ? `/dashboard/team?managerId=${encodeURIComponent(managerId)}` : '/dashboard/team';
      return request<SubordinateMetrics[]>(endpoint);
    },
  },

  async getMyDashboard(): Promise<DashboardMeData> {
    return request<DashboardMeData>('/dashboard/me');
  },

  // Enquiry methods
  enquiries: {
    async list(params: EnquiriesQueryParams = {}): Promise<EnquiryListResponse> {
      const searchParams = new URLSearchParams();
      if (params.page) searchParams.set('page', String(params.page));
      if (params.limit) searchParams.set('limit', String(params.limit));
      if (params.status) searchParams.set('status', params.status);
      if (params.priority) searchParams.set('priority', params.priority);
      if (params.assignedToId) searchParams.set('assignedToId', params.assignedToId);
      if (params.search && params.search.trim()) searchParams.set('search', params.search.trim());

      const queryStr = searchParams.toString();
      const endpoint = queryStr ? `/enquiries?${queryStr}` : '/enquiries';
      return request<EnquiryListResponse>(endpoint);
    },

    async getById(id: string): Promise<Enquiry> {
      const res = await request<{ enquiry: Enquiry }>(`/enquiries/${encodeURIComponent(id)}`);
      return res.enquiry;
    },

    async create(payload: CreateEnquiryPayload): Promise<Enquiry> {
      const res = await request<{ enquiry: Enquiry }>('/enquiries', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return res.enquiry;
    },

    async update(id: string, payload: UpdateEnquiryPayload): Promise<Enquiry> {
      const res = await request<{ enquiry: Enquiry }>(`/enquiries/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      return res.enquiry;
    },

    async changeStatus(id: string, payload: ChangeStatusPayload): Promise<Enquiry> {
      const res = await request<{ enquiry: Enquiry }>(`/enquiries/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      return res.enquiry;
    },

    async assign(id: string, assignedToId: string): Promise<Enquiry> {
      const res = await request<{ enquiry: Enquiry }>(`/enquiries/${encodeURIComponent(id)}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({ assignedToId }),
      });
      return res.enquiry;
    },
  },

  // Follow-up methods
  followups: {
    async create(payload: CreateFollowupPayload): Promise<Followup> {
      const res = await request<{ followup: Followup }>('/followups', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return res.followup;
    },

    async complete(id: string): Promise<{ completed: Followup; nextFollowup: Followup | null }> {
      return request<{ completed: Followup; nextFollowup: Followup | null }>(
        `/followups/${encodeURIComponent(id)}/complete`,
        { method: 'PATCH' },
      );
    },

    async reassign(id: string, assignedToId: string): Promise<Followup> {
      const res = await request<{ followup: Followup }>(
        `/followups/${encodeURIComponent(id)}/reassign`,
        {
          method: 'PATCH',
          body: JSON.stringify({ assignedToId }),
        },
      );
      return res.followup;
    },

    async list(params: {
      page?: number;
      limit?: number;
      status?: FollowupStatus;
      dueBefore?: string;
      dueAfter?: string;
      enquiryId?: string;
      customerId?: string;
      assignedToId?: string;
    } = {}): Promise<{ followups: Followup[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
      const sp = new URLSearchParams();
      if (params.page) sp.set('page', String(params.page));
      if (params.limit) sp.set('limit', String(params.limit));
      if (params.status) sp.set('status', params.status);
      if (params.dueBefore) sp.set('dueBefore', params.dueBefore);
      if (params.dueAfter) sp.set('dueAfter', params.dueAfter);
      if (params.enquiryId) sp.set('enquiryId', params.enquiryId);
      if (params.customerId) sp.set('customerId', params.customerId);
      if (params.assignedToId) sp.set('assignedToId', params.assignedToId);
      const qs = sp.toString();
      return request<{ followups: Followup[]; meta: { total: number; page: number; limit: number; totalPages: number } }>(
        qs ? `/followups?${qs}` : '/followups',
      );
    },
  },

  // Quotation methods
  quotations: {
    async create(enquiryId: string, payload: CreateQuotationPayload): Promise<Quotation> {
      return request<Quotation>(`/enquiries/${encodeURIComponent(enquiryId)}/quotations`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    async transitionStatus(
      quotationId: string,
      payload: TransitionQuotationPayload,
    ): Promise<Quotation> {
      return request<Quotation>(`/quotations/${encodeURIComponent(quotationId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
  },

  // Attachment methods
  attachments: {
    upload(payload: UploadAttachmentPayload): Promise<Attachment> {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append('file', payload.file);
        if (payload.enquiryId) {
          formData.append('enquiryId', payload.enquiryId);
        }
        if (payload.customerId) {
          formData.append('customerId', payload.customerId);
        }

        xhr.open('POST', `${API_BASE_URL}/attachments`);
        xhr.withCredentials = true;

        const token = getAccessToken();
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }

        if (xhr.upload && payload.onProgress) {
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percent = Math.round((event.loaded / event.total) * 100);
              payload.onProgress!(percent);
            }
          };
        }

        xhr.onload = () => {
          try {
            const res = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(res.data);
            } else {
              reject(new Error(res.message || `Upload failed with status ${xhr.status}`));
            }
          } catch {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        };

        xhr.onerror = () => {
          reject(new Error('Network error during file upload.'));
        };

        xhr.send(formData);
      });
    },

    async getDownloadUrl(attachmentId: string): Promise<DownloadAttachmentResponse> {
      return request<DownloadAttachmentResponse>(
        `/attachments/${encodeURIComponent(attachmentId)}/download`,
      );
    },

    async delete(attachmentId: string): Promise<{ deleted: boolean; attachmentId: string }> {
      return request<{ deleted: boolean; attachmentId: string }>(
        `/attachments/${encodeURIComponent(attachmentId)}`,
        {
          method: 'DELETE',
        },
      );
    },
  },

  // Performance Reports methods
  reports: {
    async getPerformance(
      params: PerformanceReportQueryParams = {},
    ): Promise<UserPerformanceMetrics[]> {
      const searchParams = new URLSearchParams();
      if (params.startDate) searchParams.set('startDate', params.startDate);
      if (params.endDate) searchParams.set('endDate', params.endDate);
      if (params.userId) searchParams.set('userId', params.userId);

      const qs = searchParams.toString();
      const endpoint = qs ? `/reports/performance?${qs}` : '/reports/performance';
      return request<UserPerformanceMetrics[]>(endpoint);
    },
  },

  // Global search methods
  search: {
    async query(q: string): Promise<SearchResultItem[]> {
      if (!q || !q.trim()) return [];
      return request<SearchResultItem[]>(`/search?q=${encodeURIComponent(q.trim())}`);
    },
  },

  // Admin User Management methods
  users: {
    async list(params: ListUsersQueryParams = {}): Promise<AdminUser[]> {
      const searchParams = new URLSearchParams();
      if (params.role) searchParams.set('role', params.role);
      if (params.isActive !== undefined) searchParams.set('isActive', String(params.isActive));

      const qs = searchParams.toString();
      const endpoint = qs ? `/users?${qs}` : '/users';
      return request<AdminUser[]>(endpoint);
    },

    async create(payload: CreateUserPayload): Promise<User> {
      const res = await request<{ user: User }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return res.user;
    },

    async setStatus(id: string, isActive: boolean): Promise<AdminUser> {
      return request<AdminUser>(`/users/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      });
    },

    async getProfile(userId: string): Promise<UserProfileData> {
      return request<UserProfileData>(`/users/${encodeURIComponent(userId)}/profile`);
    },

    async listEmployees(): Promise<Pick<AdminUser, 'id' | 'name' | 'email'>[]> {
      return request<Pick<AdminUser, 'id' | 'name' | 'email'>[]>('/users/employees');
    },
  },

  // In-app Notifications methods
  notifications: {
    async list(params: NotificationsQueryParams = {}): Promise<NotificationsListResponse> {
      const searchParams = new URLSearchParams();
      if (params.page) searchParams.set('page', String(params.page));
      if (params.limit) searchParams.set('limit', String(params.limit));
      if (params.unreadOnly !== undefined) searchParams.set('unreadOnly', String(params.unreadOnly));

      const qs = searchParams.toString();
      const endpoint = qs ? `/notifications?${qs}` : '/notifications';
      return request<NotificationsListResponse>(endpoint);
    },

    async markRead(id: string): Promise<{ notification: AppNotification }> {
      return request<{ notification: AppNotification }>(
        `/notifications/${encodeURIComponent(id)}/read`,
        {
          method: 'PATCH',
        },
      );
    },

    async markAllRead(): Promise<{ markedCount: number }> {
      return request<{ markedCount: number }>('/notifications/read-all', {
        method: 'PATCH',
      });
    },
  },

  // Bulk CSV Import methods (Manager+ only)
  import: {
    async enquiries(file: File): Promise<ImportEnquiriesResult> {
      const formData = new FormData();
      formData.append('file', file);
      return request<ImportEnquiriesResult>('/import/enquiries', {
        method: 'POST',
        body: formData,
      });
    },
  },

  // System Configuration methods (Admin-only settings, authenticated status check)
  settings: {
    async get(): Promise<SystemSettings> {
      return request<SystemSettings>('/settings');
    },

    async update(payload: { allowEmployeeReassignment: boolean }): Promise<SystemSettings> {
      return request<SystemSettings>('/settings', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },

    async getForwardingStatus(): Promise<{ allowEmployeeReassignment: boolean }> {
      return request<{ allowEmployeeReassignment: boolean }>('/settings/forwarding-status');
    },
  },
};

export default api;
