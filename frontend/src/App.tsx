import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { DashboardPage } from './pages/DashboardPage';
import { EnquiryListPage } from './pages/EnquiryListPage';
import { EnquiryDetailPage } from './pages/EnquiryDetailPage';
import { TeamDashboardPage } from './pages/TeamDashboardPage';
import { PerformanceReportsPage } from './pages/PerformanceReportsPage';
import { SearchResultsPage } from './pages/SearchResultsPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { EmployeeProfilePage } from './pages/EmployeeProfilePage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ImportEnquiriesPage } from './pages/ImportEnquiriesPage';
import { UnauthorizedPage } from './pages/UnauthorizedPage';
import { Role } from './types/api.types';

const MANAGER_ROLES: Role[] = ['ADMIN', 'DGM', 'AGM', 'MANAGER'];

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public auth routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Unauthorized state route */}
          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          {/* Protected routes wrapped in CRM Layout shell */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="enquiries" element={<EnquiryListPage />} />
            <Route path="enquiries/:id" element={<EnquiryDetailPage />} />
            <Route path="search" element={<SearchResultsPage />} />
            <Route path="notifications" element={<NotificationsPage />} />

            {/* Manager+ Only Routes */}
            <Route
              path="team"
              element={
                <ProtectedRoute allowedRoles={MANAGER_ROLES}>
                  <TeamDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="team/:userId"
              element={
                <ProtectedRoute allowedRoles={MANAGER_ROLES}>
                  <EmployeeProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="reports"
              element={
                <ProtectedRoute allowedRoles={MANAGER_ROLES}>
                  <PerformanceReportsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="import"
              element={
                <ProtectedRoute allowedRoles={MANAGER_ROLES}>
                  <ImportEnquiriesPage />
                </ProtectedRoute>
              }
            />

            {/* Admin Only Routes */}
            <Route
              path="admin/users"
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <AdminUsersPage />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* Fallback route */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
