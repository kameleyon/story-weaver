import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import Dashboard from "./Dashboard";

const Index = () => {
  const handleNewProject = () => {
    // Navigate handled by sidebar
  };

  const handleOpenProject = (_projectId: string) => {
    // Navigate handled by sidebar
  };

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen w-full overflow-hidden">
        <AppSidebar onNewProject={handleNewProject} onOpenProject={handleOpenProject} />
        <main className="flex-1 min-w-0 overflow-hidden">
          <Dashboard />
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Index;
