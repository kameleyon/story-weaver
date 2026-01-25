import { forwardRef, useImperativeHandle, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Doc2VideoWorkspace, WorkspaceHandle } from "./Doc2VideoWorkspace";
import { StorytellingWorkspace } from "./StorytellingWorkspace";

export const WorkspaceRouter = forwardRef<WorkspaceHandle>(function WorkspaceRouter(_, ref) {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode") || "doc2video";
  const projectId = searchParams.get("project");
  
  const doc2videoRef = useRef<WorkspaceHandle>(null);
  const storytellingRef = useRef<WorkspaceHandle>(null);

  useImperativeHandle(ref, () => ({
    resetWorkspace: () => {
      if (mode === "storytelling") {
        storytellingRef.current?.resetWorkspace();
      } else {
        doc2videoRef.current?.resetWorkspace();
      }
    },
    openProject: async (id: string) => {
      if (mode === "storytelling") {
        await storytellingRef.current?.openProject(id);
      } else {
        await doc2videoRef.current?.openProject(id);
      }
    },
  }));

  if (mode === "storytelling") {
    return <StorytellingWorkspace ref={storytellingRef} projectId={projectId} />;
  }

  return <Doc2VideoWorkspace ref={doc2videoRef} projectId={projectId} />;
});
