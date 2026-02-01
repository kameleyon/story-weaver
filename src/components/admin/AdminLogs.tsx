import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Loader2, FileText, RefreshCw, ChevronLeft, ChevronRight, Shield, User, Flag, Settings } from "lucide-react";
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
  resolve_flag: Flag,
  update_user: User,
  update_role: Shield,
  update_settings: Settings,
};

const ACTION_COLORS: Record<string, string> = {
  create_flag: "bg-orange-500/10 text-orange-500",
  resolve_flag: "bg-green-500/10 text-green-500",
  update_user: "bg-blue-500/10 text-blue-500",
  update_role: "bg-purple-500/10 text-purple-500",
  update_settings: "bg-slate-500/10 text-slate-500",
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
    const color = ACTION_COLORS[action] || "bg-muted text-muted-foreground";
    return (
      <Badge className={`gap-1 ${color}`}>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activity Log</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.logs && data.logs.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target Type</TableHead>
                    <TableHead>Target ID</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {format(new Date(log.created_at), "PPpp")}
                      </TableCell>
                      <TableCell>{getActionBadge(log.action)}</TableCell>
                      <TableCell className="capitalize">{log.target_type}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.target_id ? (
                          <span className="truncate max-w-[150px] block" title={log.target_id}>
                            {log.target_id.substring(0, 8)}...
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        {log.details ? (
                          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-w-[200px]">
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

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Page {page} • {data.total} total logs
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => p + 1)}
                    disabled={!data.logs || data.logs.length < 50}
                  >
                    Next
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
