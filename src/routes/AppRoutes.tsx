/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { Loader2 } from 'lucide-react';
import { ProtectedRoute } from './ProtectedRoute';
import { RouteGuard } from './RouteGuard';
import { DefaultRedirect } from './DefaultRedirect';

const LoginPage = lazy(() => import('../pages/auth/Login').then(m => ({ default: m.LoginPage })));
const UpdatePasswordPage = lazy(() => import('../pages/auth/UpdatePassword').then(m => ({ default: m.UpdatePasswordPage })));
const AuthCallbackPage = lazy(() => import('../pages/auth/AuthCallback').then(m => ({ default: m.AuthCallbackPage })));
const DashboardPage = lazy(() => import('../pages/dashboard/Dashboard').then(m => ({ default: m.DashboardPage })));
const CalendarPage = lazy(() => import('../pages/calendar/Calendar').then(m => ({ default: m.CalendarPage })));
const LiveBusTrackingPage = lazy(() => import('../pages/tracking/LiveBusTracking').then(m => ({ default: m.LiveBusTrackingPage })));
const TripEntryPage = lazy(() => import('../pages/tracking/TripEntry').then(m => ({ default: m.TripEntryPage })));
const TripHistoryPage = lazy(() => import('../pages/tracking/TripHistory').then(m => ({ default: m.TripHistoryPage })));
const AddBeneficiaryPage = lazy(() => import('../pages/beneficiary/AddBeneficiary').then(m => ({ default: m.AddBeneficiaryPage })));
const EditBeneficiaryPage = lazy(() => import('../pages/beneficiary/EditBeneficiary').then(m => ({ default: m.EditBeneficiaryPage })));
const BeneficiaryListPage = lazy(() => import('../pages/beneficiary/BeneficiaryList').then(m => ({ default: m.BeneficiaryListPage })));
const BeneficiaryProfilePage = lazy(() => import('../pages/beneficiary/BeneficiaryProfile').then(m => ({ default: m.BeneficiaryProfilePage })));
const ServiceEntryPage = lazy(() => import('../pages/services/ServiceEntry').then(m => ({ default: m.ServiceEntryPage })));
const ServiceHistoryPage = lazy(() => import('../pages/services/ServiceHistory').then(m => ({ default: m.ServiceHistoryPage })));
const ReportsPage = lazy(() => import('../pages/reports/Reports').then(m => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('../pages/settings/Settings').then(m => ({ default: m.SettingsPage })));
const SyncDashboardPage = lazy(() => import('../pages/admin/SyncDashboard').then(m => ({ default: m.SyncDashboardPage })));
const AdminControlPage = lazy(() => import('../pages/admin/AdminControl').then(m => ({ default: m.AdminControlPage })));
const TokenManagementPage = lazy(() => import('../pages/tokens/TokenManagement').then(m => ({ default: m.TokenManagementPage })));
const AssessmentEntryPage = lazy(() => import('../pages/assessment/AssessmentEntry').then(m => ({ default: m.AssessmentEntryPage })));
const AssessmentHistoryPage = lazy(() => import('../pages/assessment/AssessmentHistory').then(m => ({ default: m.AssessmentHistoryPage })));
const AssessmentViewPage = lazy(() => import('../pages/assessment/AssessmentView').then(m => ({ default: m.AssessmentViewPage })));
const ExerciseManagementPage = lazy(() => import('../pages/exercises/ExerciseManagement').then(m => ({ default: m.ExerciseManagementPage })));
const NotFoundPage = lazy(() => import('../pages/NotFound').then(m => ({ default: m.NotFoundPage })));

function PageLoader() {
    return (
        <div className="flex justify-center items-center min-h-[400px]">
            <Loader2 className="animate-spin text-primary" size={40} />
        </div>
    );
}

function Lazy({ children }: { children: React.ReactNode }) {
    return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

export const router = createBrowserRouter([
    {
        path: '/login',
        element: <Lazy><LoginPage /></Lazy>,
    },
    {
        path: '/update-password',
        element: <Lazy><UpdatePasswordPage /></Lazy>,
    },
    {
        path: '/auth/callback',
        element: <Lazy><AuthCallbackPage /></Lazy>,
    },
    {
        path: '/',
        element: <ProtectedRoute />,
        errorElement: <Lazy><NotFoundPage /></Lazy>,
        children: [
            {
                element: <AppLayout />,
                children: [
                    { index: true, element: <DefaultRedirect /> },

                    {
                        element: <RouteGuard page="dashboard" />,
                        children: [
                            { path: 'dashboard', element: <Lazy><DashboardPage /></Lazy> },
                            { path: 'calendar', element: <Lazy><CalendarPage /></Lazy> },
                        ],
                    },

                    {
                        element: <RouteGuard page="tracking" />,
                        children: [
                            { path: 'tracking', element: <Lazy><LiveBusTrackingPage /></Lazy> },
                            { path: 'tracking/history', element: <Lazy><TripHistoryPage /></Lazy> },
                        ],
                    },
                    {
                        element: <RouteGuard page="tracking" requires="create" />,
                        children: [
                            { path: 'tracking/add-trip', element: <Lazy><TripEntryPage /></Lazy> },
                        ],
                    },
                    {
                        element: <RouteGuard page="tracking" requires="edit" />,
                        children: [
                            { path: 'tracking/edit-trip/:id', element: <Lazy><TripEntryPage /></Lazy> },
                        ],
                    },

                    {
                        element: <RouteGuard page="beneficiary" />,
                        children: [
                            { path: 'beneficiary/list', element: <Lazy><BeneficiaryListPage /></Lazy> },
                            { path: 'beneficiary/:id', element: <Lazy><BeneficiaryProfilePage /></Lazy> },
                        ],
                    },
                    {
                        element: <RouteGuard page="beneficiary" requires="create" />,
                        children: [
                            { path: 'beneficiary/add', element: <Lazy><AddBeneficiaryPage /></Lazy> },
                        ],
                    },
                    {
                        element: <RouteGuard page="beneficiary" requires="edit" />,
                        children: [
                            { path: 'beneficiary/edit/:id', element: <Lazy><EditBeneficiaryPage /></Lazy> },
                        ],
                    },

                    {
                        element: <RouteGuard page="services" />,
                        children: [
                            { path: 'services/history', element: <Lazy><ServiceHistoryPage /></Lazy> },
                        ],
                    },
                    {
                        element: <RouteGuard page="services" requires="create" />,
                        children: [
                            { path: 'services/new', element: <Lazy><ServiceEntryPage /></Lazy> },
                        ],
                    },
                    {
                        element: <RouteGuard page="services" requires="edit" />,
                        children: [
                            { path: 'services/edit/:id', element: <Lazy><ServiceEntryPage /></Lazy> },
                        ],
                    },

                    {
                        element: <RouteGuard page="assessments" />,
                        children: [
                            { path: 'assessments/history', element: <Lazy><AssessmentHistoryPage /></Lazy> },
                            { path: 'assessments/view/:patientId', element: <Lazy><AssessmentViewPage /></Lazy> },
                        ],
                    },
                    {
                        element: <RouteGuard page="assessments" requires="create" />,
                        children: [
                            { path: 'assessments/new', element: <Lazy><AssessmentEntryPage /></Lazy> },
                        ],
                    },
                    {
                        element: <RouteGuard page="assessments" requires="edit" />,
                        children: [
                            { path: 'assessments/edit/:patientId', element: <Lazy><AssessmentEntryPage /></Lazy> },
                        ],
                    },

                    {
                        element: <RouteGuard page="exercises" />,
                        children: [
                            { path: 'exercises/manage', element: <Lazy><ExerciseManagementPage /></Lazy> },
                        ],
                    },
                    {
                        element: <RouteGuard page="reports" />,
                        children: [
                            { path: 'reports', element: <Lazy><ReportsPage /></Lazy> },
                        ],
                    },
                    {
                        element: <RouteGuard page="settings" />,
                        children: [
                            { path: 'settings', element: <Lazy><SettingsPage /></Lazy> },
                        ],
                    },
                    {
                        element: <RouteGuard page="admin" />,
                        children: [
                            { path: 'admin/control', element: <Lazy><AdminControlPage /></Lazy> },
                            { path: 'sync', element: <Lazy><SyncDashboardPage /></Lazy> },
                        ],
                    },
                    {
                        element: <RouteGuard page="tokens" />,
                        children: [
                            { path: 'token-management', element: <Lazy><TokenManagementPage /></Lazy> },
                        ],
                    },
                ]
            }
        ],
    },
]);
