import { Suspense, lazy, useState, useEffect, useCallback, useRef, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ThemeProvider } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

const Index = lazy(() => import("./pages/Index"));
const Customers = lazy(() => import("./pages/Customers"));
const Clients = lazy(() => import("./pages/Clients"));
const Calendar = lazy(() => import("./pages/Calendar"));
const AdminActivity = lazy(() => import("./pages/AdminActivity"));
const Archived = lazy(() => import("./pages/Archived"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Login = lazy(() => import("./pages/Login"));
const Invoices = lazy(() => import("./pages/Invoices"));
const ClientPortal = lazy(() => import("./pages/ClientPortal"));
const StaffManagement = lazy(() => import("./pages/StaffManagement"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-sm text-muted-foreground p-8 text-center">
          <p className="text-destructive font-medium">Something went wrong loading this page.</p>
          <p className="text-xs opacity-70 max-w-sm break-all">{this.state.error?.message}</p>
          <button
            className="text-xs underline"
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
          >Reload page</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient();

function RequireAuth({ children }: { children: JSX.Element }) {
  const { isAuthenticated, isAuthLoading } = useAuth();
  const location = useLocation();
  if (isAuthLoading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Restoring session...</div>;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

function RequireCustomersAccess({ children }: { children: JSX.Element }) {
  const { user, isAuthLoading } = useAuth();
  if (isAuthLoading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Restoring session...</div>;
  }
  const canAccessCustomers = user?.role === "lawyer" || user?.role === "admin";
  if (!canAccessCustomers) return <Navigate to="/" replace />;
  return children;
}

function LoginRoute() {
  const { isAuthenticated, isAuthLoading, user } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from;
  const returnTo = from ? `${from.pathname || "/"}${from.search || ""}${from.hash || ""}` : "/";
  // All users go to home page by default
  const finalReturnTo = from ? returnTo : '/';

  if (isAuthLoading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Restoring session...</div>;
  }
  if (isAuthenticated) return <Navigate to={finalReturnTo} replace />;
  return <Login />;
}

const TIMEOUT_MS = 30 * 60 * 1000;
const WARNING_BEFORE_MS = 2 * 60 * 1000;

function SessionTimeoutWatcher() {
  const { isAuthenticated, logout } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    setShowWarning(false);
    warningTimerRef.current = setTimeout(() => setShowWarning(true), TIMEOUT_MS - WARNING_BEFORE_MS);
    timerRef.current = setTimeout(() => { logout(); }, TIMEOUT_MS);
  }, [logout]);

  useEffect(() => {
    if (!isAuthenticated) { setShowWarning(false); return; }
    resetTimer();
    const events = ["mousedown", "keydown", "touchstart", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [isAuthenticated, resetTimer]);

  if (!showWarning || !isAuthenticated) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
      <div className="bg-background border rounded-lg shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
        <h2 className="text-base font-semibold">Session expiring soon</h2>
        <p className="text-sm text-muted-foreground">
          You have been inactive for a while. You will be logged out in 2 minutes.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={() => logout()}>Log out now</Button>
          <Button size="sm" onClick={resetTimer}>Stay logged in</Button>
        </div>
      </div>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="dafku-theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <HashRouter>
            <SessionTimeoutWatcher />
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading...</div>}>
              <ErrorBoundary>
              <Routes>
                <Route path="/login" element={<LoginRoute />} />
                <Route path="/" element={<RequireAuth><Index /></RequireAuth>} />
                <Route path="/customer-cases" element={<Navigate to="/customers" replace />} />
                <Route path="/customers" element={<RequireAuth><RequireCustomersAccess><Customers /></RequireCustomersAccess></RequireAuth>} />
                <Route path="/clients" element={<RequireAuth><Clients /></RequireAuth>} />
                <Route path="/calendar" element={<RequireAuth><Calendar /></RequireAuth>} />
                <Route path="/activity" element={<RequireAuth><AdminActivity /></RequireAuth>} />
                <Route path="/archived" element={<RequireAuth><Archived /></RequireAuth>} />
                <Route path="/invoices" element={<RequireAuth><Invoices /></RequireAuth>} />
                <Route path="/staff" element={<RequireAuth><StaffManagement /></RequireAuth>} />
                <Route path="/portal/:token" element={<ClientPortal />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
              </ErrorBoundary>
            </Suspense>
          </HashRouter>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
