import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ThemeProvider } from "@/components/theme-provider";

const Index = lazy(() => import("./pages/Index"));
const Customers = lazy(() => import("./pages/Customers"));
const Clients = lazy(() => import("./pages/Clients"));
const AdminActivity = lazy(() => import("./pages/AdminActivity"));
const Archived = lazy(() => import("./pages/Archived"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Login = lazy(() => import("./pages/Login"));

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
  const canAccessCustomers = user?.role === "intake" || user?.role === "admin";
  if (!canAccessCustomers) return <Navigate to="/" replace />;
  return children;
}

function LoginRoute() {
  const { isAuthenticated, isAuthLoading, user } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from;
  const returnTo = from ? `${from.pathname || "/"}${from.search || ""}${from.hash || ""}` : "/";
  // Default redirect for intake users should be /customers
  const defaultRedirect = user?.role === 'intake' ? '/customers' : '/';
  const finalReturnTo = from ? returnTo : defaultRedirect;

  if (isAuthLoading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Restoring session...</div>;
  }
  if (isAuthenticated) return <Navigate to={finalReturnTo} replace />;
  return <Login />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="dafku-theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AuthProvider>
          <HashRouter>
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading...</div>}>
              <Routes>
                <Route path="/login" element={<LoginRoute />} />
                <Route path="/" element={<RequireAuth><Index /></RequireAuth>} />
                <Route path="/customers" element={<RequireAuth><RequireCustomersAccess><Customers /></RequireCustomersAccess></RequireAuth>} />
                <Route path="/clients" element={<RequireAuth><Clients /></RequireAuth>} />
                <Route path="/activity" element={<RequireAuth><AdminActivity /></RequireAuth>} />
                <Route path="/archived" element={<RequireAuth><Archived /></RequireAuth>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </HashRouter>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
