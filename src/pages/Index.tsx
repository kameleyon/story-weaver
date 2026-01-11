import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { Workspace } from "@/components/workspace/Workspace";

const Index = () => {
  const handleNewProject = () => {
    // This would reset the workspace - handled by Workspace component
    window.location.reload();
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar onNewProject={handleNewProject} />
        <main className="flex-1">
          <Workspace />
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Index;
