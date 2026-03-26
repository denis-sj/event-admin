import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useEffect } from 'react';
import { useAuthStore } from '../../stores/auth.store';
import { Spinner } from '../ui';
import { AdminLayout } from './AdminLayout';
import { LoginPage } from './LoginPage';
import { RegisterPage } from './RegisterPage';
import { EventList } from './EventList';
import { EventForm } from './EventForm';
import { EventDashboard } from './EventDashboard';
import { CriteriaManager } from './CriteriaManager';
import { TaskManager } from './TaskManager';
import { TeamManager } from './TeamManager';
import { ImportWizard } from './ImportWizard';
import { JuryManager } from './JuryManager';
import { PresentationControl } from './PresentationControl';
import { ResultsTable } from './ResultsTable';
import { DiplomaSettings } from './DiplomaSettings';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const initialized = useAuthStore((s) => s.initialized);
  if (!initialized) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function GuestGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const initialized = useAuthStore((s) => s.initialized);
  if (!initialized) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function AdminApp() {
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <BrowserRouter basename="/admin">
      <Toaster position="top-right" />
      <Routes>
        <Route path="/login" element={<GuestGuard><LoginPage /></GuestGuard>} />
        <Route path="/register" element={<GuestGuard><RegisterPage /></GuestGuard>} />

        <Route element={<AuthGuard><AdminLayout /></AuthGuard>}>
          <Route index element={<EventList />} />
          <Route path="events/new" element={<EventForm />} />
          <Route path="events/:eventId/edit" element={<EventForm />} />
          <Route path="events/:eventId" element={<EventDashboard />} />
          <Route path="events/:eventId/criteria" element={<CriteriaManager />} />
          <Route path="events/:eventId/tasks" element={<TaskManager />} />
          <Route path="events/:eventId/teams" element={<TeamManager />} />
          <Route path="events/:eventId/import" element={<ImportWizard />} />
          <Route path="events/:eventId/jury" element={<JuryManager />} />
          <Route path="events/:eventId/presentation" element={<PresentationControl />} />
          <Route path="events/:eventId/results" element={<ResultsTable />} />
          <Route path="events/:eventId/diplomas" element={<DiplomaSettings />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
