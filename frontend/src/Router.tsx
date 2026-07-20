import { Route, Routes } from 'react-router';
import App from './App';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { DocumentPage } from './pages/DocumentPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/auth/reset" element={<ResetPasswordPage />} />
      <Route path="/app" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/app/documents/:documentId" element={<ProtectedRoute><DocumentPage /></ProtectedRoute>} />
      <Route path="*" element={<App />} />
    </Routes>
  );
}
