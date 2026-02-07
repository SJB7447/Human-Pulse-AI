import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/home";
import EmotionPage from "@/pages/emotion";
import MyPage from "@/pages/mypage";
import JournalistPage from "@/pages/journalist";
import AdminPage from "@/pages/admin";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";
import { PulseBot } from "@/components/PulseBot";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";


function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/emotion/:type" component={EmotionPage} />
      <Route path="/mypage" component={MyPage} />
      <Route path="/journalist">
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
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
        <PulseBot />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;