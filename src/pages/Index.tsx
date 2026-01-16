import { useRef } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { Workspace, WorkspaceHandle } from "@/components/workspace/Workspace";

const Index = () => {
  const workspaceRef = useRef<WorkspaceHandle>(null);

  const handleNewProject = () => {
    workspaceRef.current?.resetWorkspace();
  };

  const handleOpenProject = (projectId: string) => {
    void workspaceRef.current?.openProject(projectId);
  };

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen w-full overflow-hidden">
        <AppSidebar onNewProject={handleNewProject} onOpenProject={handleOpenProject} />
        <main className="flex-1 min-w-0 overflow-hidden">
          <Workspace ref={workspaceRef} />
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Index;
