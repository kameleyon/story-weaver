import { useRef } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { Workspace, WorkspaceHandle } from "@/components/workspace/Workspace";

const Index = () => {
  const workspaceRef = useRef<WorkspaceHandle>(null);

  const handleNewProject = () => {
    workspaceRef.current?.resetWorkspace();
  };

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex min-h-screen w-full">
        <AppSidebar onNewProject={handleNewProject} />
        <main className="flex-1">
          <Workspace ref={workspaceRef} />
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Index;
