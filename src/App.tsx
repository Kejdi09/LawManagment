import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Index from "./pages/Index";
import Customers from "./pages/Customers";
import Clients from "./pages/Clients";
import AdminActivity from "./pages/AdminActivity";
import Archived from "./pages/Archived";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import { AuthProvider, useAuth } from "@/lib/auth-context";


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
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route path="/" element={<RequireAuth><Index /></RequireAuth>} />
            <Route path="/customers" element={<RequireAuth><Customers /></RequireAuth>} />
            <Route path="/clients" element={<RequireAuth><Clients /></RequireAuth>} />
            <Route path="/activity" element={<RequireAuth><AdminActivity /></RequireAuth>} />
            <Route path="/archived" element={<RequireAuth><Archived /></RequireAuth>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </HashRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
