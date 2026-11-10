import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './state/auth';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { SalePage } from './pages/SalePage';
import { OrderPage } from './pages/OrderPage';
import { ItemsPage } from './pages/ItemsPage';
import { CataloguePage } from './pages/CataloguePage';
import { PartiesPage } from './pages/PartiesPage';
import { PurchaseDetailPage, PurchaseListPage, PurchaseNewPage } from './pages/PurchasePage';
import { JobWorkDetailPage, JobWorkListPage, JobWorkNewPage } from './pages/JobWorkPage';
import { StockPage } from './pages/StockPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { AgentsPage } from './pages/AgentsPage';
import { ReportsPage } from './pages/ReportsPage';
import { TeamPage } from './pages/TeamPage';
import { FactoriesPage } from './pages/FactoriesPage';
import { useEffect } from 'react';
import { syncPending } from './lib/sync';

function Protected({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="login-page muted">Opening…</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  const { session, online } = useAuth();

  useEffect(() => {
    if (!session || !online) return;
    void syncPending(session);
    const onFocus = () => void syncPending(session);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [session, online]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Protected><HomePage /></Protected>} />
      <Route path="/sale/:orderId?" element={<Protected><SalePage /></Protected>} />
      <Route path="/order/:orderId" element={<Protected><OrderPage /></Protected>} />
      <Route path="/items" element={<Protected><ItemsPage /></Protected>} />
      <Route path="/catalogue" element={<Protected><CataloguePage /></Protected>} />
      <Route path="/parties" element={<Protected><PartiesPage /></Protected>} />
      <Route path="/purchase" element={<Protected><PurchaseListPage /></Protected>} />
      <Route path="/purchase/new" element={<Protected><PurchaseNewPage /></Protected>} />
      <Route path="/purchase/:id" element={<Protected><PurchaseDetailPage /></Protected>} />
      <Route path="/jobwork" element={<Protected><JobWorkListPage /></Protected>} />
      <Route path="/jobwork/new" element={<Protected><JobWorkNewPage /></Protected>} />
      <Route path="/jobwork/:id" element={<Protected><JobWorkDetailPage /></Protected>} />
      <Route path="/stock" element={<Protected><StockPage /></Protected>} />
      <Route path="/payments" element={<Protected><PaymentsPage /></Protected>} />
      <Route path="/agents" element={<Protected><AgentsPage /></Protected>} />
      <Route path="/reports" element={<Protected><ReportsPage /></Protected>} />
      <Route path="/team" element={<Protected><TeamPage /></Protected>} />
      <Route path="/factories" element={<Protected><FactoriesPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
