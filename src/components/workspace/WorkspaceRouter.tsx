import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Doc2VideoWorkspace, WorkspaceHandle } from "./Doc2VideoWorkspace";
import { StorytellingWorkspace } from "./StorytellingWorkspace";
import { SmartFlowWorkspace } from "./SmartFlowWorkspace";
import { CinematicWorkspace } from "./CinematicWorkspace";

type WorkspaceMode = "doc2video" | "storytelling" | "smartflow" | "cinematic";

const modeForProjectType = (projectType?: string | null): WorkspaceMode => {
  switch (projectType) {
    case "storytelling":
      return "storytelling";
    case "smartflow":
      return "smartflow";
    case "cinematic":
      return "cinematic";
    default:
      return "doc2video";
  }
};

export const WorkspaceRouter = forwardRef<WorkspaceHandle>(function WorkspaceRouter(_, ref) {
  const [searchParams, setSearchParams] = useSearchParams();
  const modeParam = (searchParams.get("mode") as WorkspaceMode | null) ?? null;
  const mode: WorkspaceMode = modeParam || "doc2video";
  const projectId = searchParams.get("project");

  const doc2videoRef = useRef<WorkspaceHandle>(null);
  const storytellingRef = useRef<WorkspaceHandle>(null);
  const smartflowRef = useRef<WorkspaceHandle>(null);
  const cinematicRef = useRef<WorkspaceHandle>(null);

  // Note: No useEffect to re-query project_type here.
  // The openProject() imperative handle already sets the correct mode via a single DB query.
  // The workspace's own loadProject() handles loading — no double round-trip needed.

  useImperativeHandle(ref, () => ({
    resetWorkspace: () => {
      if (mode === "storytelling") {
        storytellingRef.current?.resetWorkspace();
      } else if (mode === "smartflow") {
        smartflowRef.current?.resetWorkspace();
      } else if (mode === "cinematic") {
        cinematicRef.current?.resetWorkspace();
      } else {
        doc2videoRef.current?.resetWorkspace();
      }
    },
    openProject: async (id: string) => {
      // Navigate to the correct mode for the project's type; the mounted workspace
      // will load the project via the `project` query param.
      const { data } = await supabase
        .from("projects")
        .select("project_type")
        .eq("id", id)
        .maybeSingle();

      const desiredMode = modeForProjectType(data?.project_type);
      const next = new URLSearchParams(searchParams);
      next.set("project", id);
      next.set("mode", desiredMode);
      setSearchParams(next, { replace: false });
    },
  }));

  if (mode === "storytelling") {
    return <StorytellingWorkspace ref={storytellingRef} projectId={projectId} />;
  }

  if (mode === "smartflow") {
    return <SmartFlowWorkspace ref={smartflowRef} projectId={projectId} />;
  }

  if (mode === "cinematic") {
    return <CinematicWorkspace ref={cinematicRef} projectId={projectId} />;
  }

  return <Doc2VideoWorkspace ref={doc2videoRef} projectId={projectId} />;
});
