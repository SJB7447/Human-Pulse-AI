import { lazy, Suspense, useEffect, useState } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GlobalScrollTop } from "@/components/GlobalScrollTop";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useEmotionStore, type User } from "@/lib/store";
import { getSupabase } from "@/services/supabaseClient";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";

const HueBot = lazy(() => import("@/components/HueBot").then((module) => ({ default: module.HueBot })));
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
          <ProtectedRoute allowedRoles={["journalist", "admin"]}>
            <JournalistPage />
          </ProtectedRoute>
        </Route>
        <Route path="/reporter">
          <ProtectedRoute allowedRoles={["journalist", "admin"]}>
            <JournalistPage />
          </ProtectedRoute>
        </Route>
        <Route path="/admin">
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminPage />
          </ProtectedRoute>
        </Route>
        <Route path="/login" component={LoginPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function AuthBootstrap() {
  const { user, setUser } = useEmotionStore();

  useEffect(() => {
    const supabase = getSupabase();
    let cancelled = false;

    const syncFromSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        const isDemoUser = String(user?.id || "").startsWith("demo-");
        if (!cancelled && user && !isDemoUser) {
          setUser(null);
        }
        return;
      }

      let role: User["role"] =
        (session.user.user_metadata?.role as User["role"]) || "general";

      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single();
        const profileRole = String(profile?.role || "").trim().toLowerCase();
        if (profileRole === "admin" || profileRole === "journalist" || profileRole === "general") {
          role = profileRole;
        }
      } catch {
        // Keep metadata/default role if profile lookup fails.
      }

      if (cancelled) return;

      if (!user || user.id !== session.user.id || user.role !== role || user.email !== (session.user.email || undefined)) {
        setUser({
          id: session.user.id,
          email: session.user.email || undefined,
          name: session.user.user_metadata?.name || session.user.user_metadata?.full_name || undefined,
          role,
        });
      }
    };

    void syncFromSession();

    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      void syncFromSession();
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [setUser, user]);

  return null;
}

function App() {
  const [location] = useLocation();
  const [shouldLoadHueBot, setShouldLoadHueBot] = useState(false);
  const isAdminRoute = location.startsWith("/admin");
  const isJournalistRoute = location.startsWith("/journalist") || location.startsWith("/reporter");
  const hideHueBot = isAdminRoute || isJournalistRoute;

  useEffect(() => {
    if (hideHueBot) {
      setShouldLoadHueBot(false);
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;
    const win = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const enableHueBot = () => {
      if (!cancelled) setShouldLoadHueBot(true);
    };

    if (typeof win.requestIdleCallback === "function") {
      const idleId = win.requestIdleCallback(enableHueBot, { timeout: 2000 });
      return () => {
        cancelled = true;
        if (typeof win.cancelIdleCallback === "function") {
          win.cancelIdleCallback(idleId);
        }
      };
    }

    timeoutId = window.setTimeout(enableHueBot, 1200);
    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [hideHueBot]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthBootstrap />
        <Toaster />
        <Router />
        {isAdminRoute ? <GlobalScrollTop adminDock /> : <GlobalScrollTop />}
        {!hideHueBot && shouldLoadHueBot ? (
          <Suspense fallback={null}>
            <HueBot />
          </Suspense>
        ) : null}
        <PWAInstallBanner />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

