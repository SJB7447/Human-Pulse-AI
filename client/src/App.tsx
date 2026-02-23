import { lazy, Suspense } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HueBot } from "@/components/HueBot";
import { GlobalScrollTop } from "@/components/GlobalScrollTop";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

const Home = lazy(() => import("@/pages/home"));
const EmotionPage = lazy(() => import("@/pages/emotion"));
const MyPage = lazy(() => import("@/pages/mypage"));
const JournalistPage = lazy(() => import("@/pages/journalist"));
const AdminPage = lazy(() => import("@/pages/admin"));
const LoginPage = lazy(() => import("@/pages/login"));
const CommunityPage = lazy(() => import("@/pages/community"));
const PricingPage = lazy(() => import("@/pages/pricing"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const NotFound = lazy(() => import("@/pages/not-found"));

function Router() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/emotion/:type" component={EmotionPage} />
        <Route path="/mypage" component={MyPage} />
        <Route path="/community" component={CommunityPage} />
        <Route path="/pricing" component={PricingPage} />
        <Route path="/settings">
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        </Route>
        <Route path="/journalist">
          <ProtectedRoute>
            <JournalistPage />
          </ProtectedRoute>
        </Route>
        <Route path="/reporter">
          <ProtectedRoute>
            <JournalistPage />
          </ProtectedRoute>
        </Route>
        <Route path="/admin">
          <ProtectedRoute>
            <AdminPage />
          </ProtectedRoute>
        </Route>
        <Route path="/login" component={LoginPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  const [location] = useLocation();
  const isAdminRoute = location.startsWith("/admin");
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
        {isAdminRoute ? <GlobalScrollTop adminDock /> : <GlobalScrollTop />}
        {!isAdminRoute && <HueBot />}
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

