import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw, Shield, Activity, AlertCircle, AlertTriangle, Info, Zap, CheckCircle, Pause, Play, Terminal } from "lucide-react";
import { format } from "date-fns";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";

interface UnifiedLog {
  id: string;
  created_at: string;
  category: "admin_action" | "user_activity" | "system_error" | "system_warning" | "system_info";
  event_type: string;
  message: string;
  user_id: string | null;
  details: Record<string, unknown> | null;
  target_id?: string | null;
  target_type?: string;
  generation_id?: string | null;
  project_id?: string | null;
}

interface LogsResponse {
  logs: UnifiedLog[];
  total: number;
  page: number;
  limit: number;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; prefix: string }> = {
  admin_action: { label: "ADMIN", icon: Shield, color: "text-primary", prefix: "[ADMIN]" },
  user_activity: { label: "USER", icon: Activity, color: "text-[hsl(170,55%,65%)]", prefix: "[USER]" },
  system_error: { label: "ERROR", icon: AlertCircle, color: "text-destructive", prefix: "[ERROR]" },
  system_warning: { label: "WARN", icon: AlertTriangle, color: "text-yellow-500", prefix: "[WARN]" },
  system_info: { label: "INFO", icon: Info, color: "text-muted-foreground", prefix: "[INFO]" },
};

export function AdminLogs() {
  const { callAdminApi } = useAdminAuth();
  const [logs, setLogs] = useState<UnifiedLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isPaused, setIsPaused] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const result = await callAdminApi("admin_logs", { page: 1, limit: 200, category: categoryFilter }) as LogsResponse;
      setLogs(result.logs || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, [callAdminApi, categoryFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (isPaused) return;

    const channel = supabase
      .channel('admin-logs-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'system_logs' },
        (payload) => {
          const newLog = payload.new as {
            id: string;
            created_at: string;
            category: string;
            event_type: string;
            message: string;
            user_id: string | null;
            details: Record<string, unknown> | null;
            generation_id?: string | null;
            project_id?: string | null;
          };
          
          // Transform to unified format
          const unifiedLog: UnifiedLog = {
            id: newLog.id,
            created_at: newLog.created_at,
            category: newLog.category as UnifiedLog['category'],
            event_type: newLog.event_type,
            message: newLog.message,
            user_id: newLog.user_id,
            details: newLog.details,
            generation_id: newLog.generation_id,
            project_id: newLog.project_id,
          };

          // Apply category filter
          if (categoryFilter === "all" || unifiedLog.category === categoryFilter) {
            setLogs(prev => [unifiedLog, ...prev].slice(0, 500));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_logs' },
        (payload) => {
          const newLog = payload.new as {
            id: string;
            created_at: string;
            action: string;
            admin_id: string;
            target_type: string;
            target_id: string | null;
            details: Record<string, unknown> | null;
          };
          
          const unifiedLog: UnifiedLog = {
            id: newLog.id,
            created_at: newLog.created_at,
            category: "admin_action",
            event_type: newLog.action,
            message: `${newLog.action.replace(/_/g, " ")} on ${newLog.target_type}`,
            user_id: newLog.admin_id,
            details: newLog.details,
            target_id: newLog.target_id,
            target_type: newLog.target_type,
          };

          if (categoryFilter === "all" || categoryFilter === "admin_action") {
            setLogs(prev => [unifiedLog, ...prev].slice(0, 500));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isPaused, categoryFilter]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScrollRef.current && terminalRef.current) {
      terminalRef.current.scrollTop = 0;
    }
  }, [logs]);

  const formatTimestamp = (timestamp: string) => {
    return format(new Date(timestamp), "HH:mm:ss.SSS");
  };

  const formatDate = (timestamp: string) => {
    return format(new Date(timestamp), "yyyy-MM-dd");
  };

  const getLogColor = (category: string) => {
    return CATEGORY_CONFIG[category]?.color || "text-muted-foreground";
  };

  const getLogPrefix = (category: string) => {
    return CATEGORY_CONFIG[category]?.prefix || "[LOG]";
  };

  const formatDetails = (details: Record<string, unknown> | null) => {
    if (!details) return null;
    return JSON.stringify(details, null, 2);
  };

  const filteredLogs = categoryFilter === "all" 
    ? logs 
    : logs.filter(log => log.category === categoryFilter);

  const getCategoryCount = (category: string) => {
    return logs.filter(log => log.category === category).length;
  };

  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-muted-foreground">{error}</p>
        <Button onClick={fetchLogs} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="flex items-center gap-3">
          <Terminal className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-2xl font-bold">Live System Logs</h2>
            <p className="text-muted-foreground text-sm">
              {filteredLogs.length} entries • {isPaused ? "Paused" : "Streaming"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ({logs.length})</SelectItem>
              <SelectItem value="admin_action">Admin ({getCategoryCount("admin_action")})</SelectItem>
              <SelectItem value="user_activity">User ({getCategoryCount("user_activity")})</SelectItem>
              <SelectItem value="system_error">Errors ({getCategoryCount("system_error")})</SelectItem>
              <SelectItem value="system_warning">Warnings ({getCategoryCount("system_warning")})</SelectItem>
              <SelectItem value="system_info">Info ({getCategoryCount("system_info")})</SelectItem>
            </SelectContent>
          </Select>
          
          <Button 
            onClick={() => setIsPaused(!isPaused)} 
            variant="outline" 
            size="sm"
            className={isPaused ? "border-yellow-500 text-yellow-500" : "border-primary text-primary"}
          >
            {isPaused ? <Play className="h-4 w-4 mr-1" /> : <Pause className="h-4 w-4 mr-1" />}
            {isPaused ? "Resume" : "Pause"}
          </Button>
          
          <Button onClick={fetchLogs} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Category Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        <Badge variant="outline" className="gap-1 border-primary text-primary">
          <Shield className="h-3 w-3" /> Admin
        </Badge>
        <Badge variant="outline" className="gap-1 border-[hsl(170,55%,65%)] text-[hsl(170,55%,65%)]">
          <Activity className="h-3 w-3" /> User
        </Badge>
        <Badge variant="outline" className="gap-1 border-destructive text-destructive">
          <AlertCircle className="h-3 w-3" /> Error
        </Badge>
        <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-500">
          <AlertTriangle className="h-3 w-3" /> Warning
        </Badge>
        <Badge variant="outline" className="gap-1 border-muted-foreground text-muted-foreground">
          <Info className="h-3 w-3" /> Info
        </Badge>
      </div>

      {/* Terminal Log Viewer */}
      <div 
        ref={terminalRef}
        className="bg-black/90 border border-border rounded-lg overflow-hidden"
        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
      >
        {/* Terminal Header */}
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/20 border-b border-border">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-destructive/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-primary/80" />
          </div>
          <span className="text-xs text-muted-foreground ml-2">motionmax-system-logs</span>
          {!isPaused && (
            <span className="ml-auto flex items-center gap-1 text-xs text-primary">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              LIVE
            </span>
          )}
        </div>

        {/* Log Content */}
        <div className="h-[600px] overflow-y-auto p-4 space-y-1">
          {filteredLogs.length === 0 ? (
            <div className="text-muted-foreground text-center py-8">
              <Terminal className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>No logs to display</p>
              <p className="text-xs mt-1">Logs will appear here as events occur</p>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div 
                key={log.id}
                className="group hover:bg-white/5 rounded px-2 py-1 cursor-pointer transition-colors"
                onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
              >
                {/* Main Log Line */}
                <div className="flex items-start gap-2 text-sm">
                  <span className="text-muted-foreground/60 shrink-0">
                    {formatDate(log.created_at)}
                  </span>
                  <span className="text-muted-foreground shrink-0">
                    {formatTimestamp(log.created_at)}
                  </span>
                  <span className={`shrink-0 font-medium ${getLogColor(log.category)}`}>
                    {getLogPrefix(log.category)}
                  </span>
                  <span className="text-foreground/90 break-all">
                    {log.message}
                  </span>
                </div>

                {/* Expanded Details */}
                {expandedLog === log.id && log.details && (
                  <div className="mt-2 ml-[180px] pl-4 border-l-2 border-primary/30">
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                      {formatDetails(log.details)}
                    </pre>
                    {log.generation_id && (
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        Generation: {log.generation_id}
                      </p>
                    )}
                    {log.project_id && (
                      <p className="text-xs text-muted-foreground/70">
                        Project: {log.project_id}
                      </p>
                    )}
                    {log.user_id && (
                      <p className="text-xs text-muted-foreground/70">
                        User: {log.user_id}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Terminal Footer */}
        <div className="px-4 py-2 bg-muted/10 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>Click on a log entry to expand details</span>
          <span>{filteredLogs.length} entries</span>
        </div>
      </div>
    </div>
  );
}
