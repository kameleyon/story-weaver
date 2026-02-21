import { useState } from "react";
import { Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AdminLogEntry {
  id: string;
  created_at: string;
  event_type: string;
  category: string;
  message: string;
}

interface AdminGenerationLogsProps {
  logs: AdminLogEntry[];
}

export function AdminGenerationLogs({ logs }: AdminGenerationLogsProps) {
  const [showLogs, setShowLogs] = useState(false);

  if (logs.length === 0) return null;

  return (
    <div className="mt-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowLogs(!showLogs)}
        className="gap-2 text-xs text-muted-foreground"
      >
        <Terminal className="h-3.5 w-3.5" />
        {showLogs ? "Hide" : "Show"} Generation Logs ({logs.length})
      </Button>
      {showLogs && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-border/50 bg-background/80 p-3 font-mono text-xs space-y-1">
          {logs.map((log) => (
            <div key={log.id} className={cn(
              "flex gap-2",
              log.event_type === "error" && "text-destructive",
              log.event_type === "warning" && "text-amber-500 dark:text-amber-400",
            )}>
              <span className="text-muted-foreground whitespace-nowrap">
                {new Date(log.created_at).toLocaleTimeString()}
              </span>
              <span className="text-muted-foreground">[{log.category}]</span>
              <span>{log.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
