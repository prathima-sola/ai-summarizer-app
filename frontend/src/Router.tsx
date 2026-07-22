import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import App from './App';
import { ProtectedRoute } from './auth/ProtectedRoute';

const AuthPage = lazy(() => import('./pages/AuthPage').then((module) => ({ default: module.AuthPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const DocumentPage = lazy(() => import('./pages/DocumentPage').then((module) => ({ default: module.DocumentPage })));
const ComparePage = lazy(() => import('./pages/ComparePage').then((module) => ({ default: module.ComparePage })));
const PublicSharePage = lazy(() => import('./pages/PublicSharePage').then((module) => ({ default: module.PublicSharePage })));
const QualityPage = lazy(() => import('./pages/QualityPage').then((module) => ({ default: module.QualityPage })));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage').then((module) => ({ default: module.ResetPasswordPage })));
const DemoWorkspacePage = lazy(() => import('./pages/DemoWorkspacePage').then((module) => ({ default: module.DemoWorkspacePage })));

function RouteFallback() {
  return <main className="route-loader"><span /><p>Opening Briefly</p></main>;
}

export function AppRouter() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/auth/reset" element={<ResetPasswordPage />} />
        <Route path="/demo" element={<DemoWorkspacePage />} />
        <Route path="/app" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/app/documents/:documentId" element={<ProtectedRoute><DocumentPage /></ProtectedRoute>} />
        <Route path="/app/compare" element={<ProtectedRoute><ComparePage /></ProtectedRoute>} />
        <Route path="/app/comparisons/:comparisonId" element={<ProtectedRoute><ComparePage /></ProtectedRoute>} />
        <Route path="/app/quality" element={<ProtectedRoute><QualityPage /></ProtectedRoute>} />
        <Route path="/share/:token" element={<PublicSharePage />} />
        <Route path="*" element={<App />} />
      </Routes>
    </Suspense>
  );
}
