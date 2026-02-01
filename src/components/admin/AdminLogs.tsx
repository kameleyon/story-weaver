import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Loader2, FileText, RefreshCw, ChevronLeft, ChevronRight, Shield, User, Flag, Settings, AlertCircle, CheckCircle, Info, Activity, AlertTriangle, Zap } from "lucide-react";
import { format } from "date-fns";

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

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  admin_action: { label: "Admin", icon: Shield, color: "bg-primary/10 text-primary border-l-2 border-l-primary" },
  user_activity: { label: "User", icon: Activity, color: "bg-muted text-muted-foreground border-l-2 border-l-muted-foreground" },
  system_error: { label: "Error", icon: AlertCircle, color: "bg-muted text-muted-foreground border-l-2 border-l-muted-foreground" },
  system_warning: { label: "Warning", icon: AlertTriangle, color: "bg-muted text-muted-foreground border-l-2 border-l-muted-foreground" },
  system_info: { label: "Info", icon: Info, color: "bg-primary/10 text-primary border-l-2 border-l-primary" },
};

const EVENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  create_flag: Flag,
  resolve_flag: CheckCircle,
  update_user: User,
  update_role: Shield,
  update_settings: Settings,
  generation_started: Zap,
  generation_completed: CheckCircle,
  generation_failed: AlertCircle,
  project_created: FileText,
  project_deleted: AlertTriangle,
};

export function AdminLogs() {
  const { callAdminApi } = useAdminAuth();
  const [data, setData] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const result = await callAdminApi("admin_logs", { page, limit: 50, category: categoryFilter });
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, [callAdminApi, page, categoryFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const getCategoryBadge = (log: UnifiedLog) => {
    const config = CATEGORY_CONFIG[log.category] || CATEGORY_CONFIG.system_info;
    const EventIcon = EVENT_ICONS[log.event_type] || config.icon;
    
    return (
      <Badge className={`gap-1 ${config.color}`}>
        <EventIcon className="h-3 w-3" />
        {config.label}
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
        <p className="text-muted-foreground">{error}</p>
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
          <h2 className="text-2xl font-bold">System Logs</h2>
          <p className="text-muted-foreground">
            {data?.total || 0} logged events
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="admin_action">Admin</SelectItem>
              <SelectItem value="user_activity">User Activity</SelectItem>
              <SelectItem value="system_error">Errors</SelectItem>
              <SelectItem value="system_warning">Warnings</SelectItem>
              <SelectItem value="system_info">Info</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={fetchLogs} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <span className="text-muted-foreground">Admin Actions</span>
        </div>
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">User Activity</span>
        </div>
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">System Errors</span>
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
                      <TableHead className="min-w-[100px]">Category</TableHead>
                      <TableHead className="min-w-[120px]">Event</TableHead>
                      <TableHead className="min-w-[200px]">Message</TableHead>
                      <TableHead className="min-w-[100px]">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                          {format(new Date(log.created_at), "PP p")}
                        </TableCell>
                        <TableCell>{getCategoryBadge(log)}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {log.event_type.replace(/_/g, " ")}
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate" title={log.message}>
                          {log.message}
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
              <p>No logs found</p>
              <p className="text-sm mt-1">System activity will appear here as events occur</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
