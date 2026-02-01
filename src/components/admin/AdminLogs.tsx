import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Loader2, FileText, RefreshCw, ChevronLeft, ChevronRight, Shield, User, Flag, Settings, AlertCircle, CheckCircle, Info } from "lucide-react";
import { format } from "date-fns";

interface AdminLog {
  id: string;
  admin_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface LogsResponse {
  logs: AdminLog[];
  total: number;
  page: number;
  limit: number;
}

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  create_flag: Flag,
  resolve_flag: CheckCircle,
  update_user: User,
  update_role: Shield,
  update_settings: Settings,
  error: AlertCircle,
  warning: AlertCircle,
  info: Info,
};

// Teal-based color scheme with severity differentiation
const ACTION_COLORS: Record<string, string> = {
  // Success actions (teal variants)
  resolve_flag: "bg-primary/10 text-primary",
  update_settings: "bg-[hsl(170,55%,45%)]/10 text-[hsl(170,55%,40%)]",
  
  // Warning actions (amber/orange for caution)
  create_flag: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  
  // Error actions (red for critical)
  error: "bg-red-500/10 text-red-500",
  delete_user: "bg-red-500/10 text-red-500",
  ban_user: "bg-red-500/10 text-red-500",
  
  // Info actions (teal variants)
  update_user: "bg-[hsl(170,40%,50%)]/10 text-[hsl(170,40%,45%)]",
  update_role: "bg-[hsl(170,55%,50%)]/10 text-[hsl(170,55%,45%)]",
  info: "bg-primary/10 text-primary",
  
  // Default
  default: "bg-muted text-muted-foreground",
};

// Get severity level for logs
const getLogSeverity = (action: string): "info" | "warning" | "error" | "success" => {
  if (["resolve_flag", "update_settings"].includes(action)) return "success";
  if (["create_flag", "suspend_user"].includes(action)) return "warning";
  if (["error", "delete_user", "ban_user"].includes(action)) return "error";
  return "info";
};

export function AdminLogs() {
  const { callAdminApi } = useAdminAuth();
  const [data, setData] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const result = await callAdminApi("admin_logs", { page, limit: 50 });
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, [callAdminApi, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const getActionBadge = (action: string) => {
    const Icon = ACTION_ICONS[action] || FileText;
    const color = ACTION_COLORS[action] || ACTION_COLORS.default;
    const severity = getLogSeverity(action);
    
    // Add a subtle left border indicator based on severity
    const borderClass = {
      success: "border-l-2 border-l-primary",
      warning: "border-l-2 border-l-amber-500",
      error: "border-l-2 border-l-red-500",
      info: "border-l-2 border-l-[hsl(170,55%,50%)]",
    }[severity];
    
    return (
      <Badge className={`gap-1 ${color} ${borderClass}`}>
        <Icon className="h-3 w-3" />
        {action.replace(/_/g, " ")}
      </Badge>
    );
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-destructive">{error}</p>
        <Button onClick={fetchLogs} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <h2 className="text-2xl font-bold">Admin Activity Logs</h2>
          <p className="text-muted-foreground">
            {data?.total || 0} logged actions
          </p>
        </div>

        <Button onClick={fetchLogs} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Legend for log severity */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary" />
          <span className="text-muted-foreground">Success</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[hsl(170,55%,50%)]" />
          <span className="text-muted-foreground">Info</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-500" />
          <span className="text-muted-foreground">Warning</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-muted-foreground">Error</span>
        </div>
      </div>

      <Card className="shadow-sm overflow-hidden">
        <CardHeader>
          <CardTitle className="text-lg">Activity Log</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {data?.logs && data.logs.length > 0 ? (
            <>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[120px]">Timestamp</TableHead>
                    <TableHead className="min-w-[100px]">Action</TableHead>
                    <TableHead className="min-w-[80px]">Target</TableHead>
                    <TableHead className="min-w-[100px]">Target ID</TableHead>
                    <TableHead className="min-w-[150px]">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                        {format(new Date(log.created_at), "PP p")}
                      </TableCell>
                      <TableCell>{getActionBadge(log.action)}</TableCell>
                      <TableCell className="capitalize text-sm">{log.target_type}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.target_id ? (
                          <span className="truncate max-w-[100px] block" title={log.target_id}>
                            {log.target_id.substring(0, 8)}...
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="max-w-[150px]">
                        {log.details ? (
                          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-w-[150px]">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>

              {/* Pagination */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t px-4 sm:px-0">
                <p className="text-sm text-muted-foreground">
                  Page {page} • {data.total} logs
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">Previous</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => p + 1)}
                    disabled={!data.logs || data.logs.length < 50}
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No admin activity logged yet</p>
              <p className="text-sm mt-1">Actions performed in the admin panel will appear here</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
