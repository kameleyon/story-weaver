import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AuthenticatedLayout } from "@/components/layout/AuthenticatedLayout";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import CreateWorkspace from "./pages/CreateWorkspace";
import Settings from "./pages/Settings";
import Usage from "./pages/Usage";
import Pricing from "./pages/Pricing";
import Projects from "./pages/Projects";
import VoiceLab from "./pages/VoiceLab";
import PublicShare from "./pages/PublicShare";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import AcceptableUse from "./pages/AcceptableUse";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
      <TooltipProvider>
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            {/* Public share page - no auth required */}
            <Route path="/share/:token" element={<PublicShare />} />
            {/* Main app - Dashboard */}
            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <Index />
                </ProtectedRoute>
              }
            />
            {/* Create workspace - Doc2Video or Storytelling */}
            <Route
              path="/app/create"
              element={
                <ProtectedRoute>
                  <CreateWorkspace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <AuthenticatedLayout>
                    <Settings />
                  </AuthenticatedLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/usage"
              element={
                <ProtectedRoute>
                  <AuthenticatedLayout>
                    <Usage />
                  </AuthenticatedLayout>
                </ProtectedRoute>
              }
            />
            <Route path="/pricing" element={<Pricing />} />
            <Route
              path="/projects"
              element={
                <ProtectedRoute>
                  <AuthenticatedLayout>
                    <Projects />
                  </AuthenticatedLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/voice-lab"
              element={
                <ProtectedRoute>
                  <VoiceLab />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <Admin />
                </ProtectedRoute>
              }
            />
            {/* Legal pages - public */}
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/acceptable-use" element={<AcceptableUse />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
