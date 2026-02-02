import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { RefreshCw, Filter, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminAuth } from "@/hooks/useAdminAuth";

interface ApiCallLog {
  id: string;
  generation_id: string | null;
  user_id: string;
  provider: string;
  model: string;
  status: string;
  queue_time_ms: number | null;
  running_time_ms: number | null;
  total_duration_ms: number | null;
  cost: number | null;
  error_message: string | null;
  created_at: string;
}

interface ApiCallsResponse {
  logs: ApiCallLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function AdminApiCalls() {
  const { callAdminApi } = useAdminAuth();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-api-calls", page, statusFilter, providerFilter],
    queryFn: async () => {
      const result = await callAdminApi("api_calls_list", {
        page,
        limit: 50,
        status: statusFilter === "all" ? undefined : statusFilter,
        provider: providerFilter === "all" ? undefined : providerFilter,
      });
      return result as ApiCallsResponse;
    },
  });

  const formatDuration = (ms: number | null) => {
    if (ms === null || ms === undefined) return "-";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatCost = (cost: number | null) => {
    if (cost === null || cost === undefined || cost === 0) return "-";
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "succeeded":
        return (
          <Badge variant="outline" className="text-[#49cdbf] border-[#49cdbf] text-xs">
            <CheckCircle className="h-3 w-3 mr-1" />
            Succeeded
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="outline" className="text-destructive border-destructive text-xs">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      case "running":
        return (
          <Badge variant="outline" className="text-primary border-primary text-xs">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Running
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground text-xs">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  const getProviderColor = (provider: string) => {
    // Use teal theme shades for all providers per admin UI spec
    switch (provider.toLowerCase()) {
      case "openrouter":
        return "text-primary"; // Main teal
      case "replicate":
        return "text-[hsl(170,55%,65%)]"; // Lighter teal
      case "hypereal":
        return "text-[hsl(170,55%,40%)]"; // Darker teal
      case "google_tts":
        return "text-[hsl(170,30%,50%)]"; // Muted teal
      case "elevenlabs":
        return "text-[hsl(170,45%,55%)]"; // Mid teal
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-card border shadow-sm">
        <CardHeader className="py-3 px-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Filter className="h-4 w-4 text-[#49cdbf]" />
              API Call Logs
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[120px] h-8 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="succeeded">Succeeded</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger className="w-[120px] h-8 text-xs">
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Providers</SelectItem>
                  <SelectItem value="openrouter">OpenRouter</SelectItem>
                  <SelectItem value="replicate">Replicate</SelectItem>
                  <SelectItem value="hypereal">Hypereal</SelectItem>
                  <SelectItem value="google_tts">Google TTS</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="h-8 text-xs"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              {data && (
                <span className="text-xs text-muted-foreground">
                  Last updated: {format(new Date(), "MMM dd HH:mm:ss")}
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : !data?.logs?.length ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No API calls logged yet. API calls will appear here once the generate-video edge function is updated to log them.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="py-2 px-2">Status</TableHead>
                    <TableHead className="py-2 px-2">ID</TableHead>
                    <TableHead className="py-2 px-2">Provider / Model</TableHead>
                    <TableHead className="py-2 px-2 text-right">Queued</TableHead>
                    <TableHead className="py-2 px-2 text-right">Running</TableHead>
                    <TableHead className="py-2 px-2 text-right">Total</TableHead>
                    <TableHead className="py-2 px-2 text-right">Cost</TableHead>
                    <TableHead className="py-2 px-2 text-right">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.logs.map((log) => (
                    <TableRow key={log.id} className="text-xs">
                      <TableCell className="py-2 px-2">
                        {getStatusBadge(log.status)}
                      </TableCell>
                      <TableCell className="py-2 px-2 font-mono text-[10px] text-muted-foreground">
                        {log.id.slice(0, 8)}...
                      </TableCell>
                      <TableCell className="py-2 px-2">
                        <div className="flex flex-col">
                          <span className={`font-medium ${getProviderColor(log.provider)}`}>
                            {log.provider}
                          </span>
                          <span className="text-muted-foreground truncate max-w-[200px]">
                            {log.model}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2 px-2 text-right text-muted-foreground">
                        {formatDuration(log.queue_time_ms)}
                      </TableCell>
                      <TableCell className="py-2 px-2 text-right text-muted-foreground">
                        {formatDuration(log.running_time_ms)}
                      </TableCell>
                      <TableCell className="py-2 px-2 text-right font-medium">
                        {formatDuration(log.total_duration_ms)}
                      </TableCell>
                      <TableCell className="py-2 px-2 text-right">
                        <span className={log.cost && log.cost > 0 ? "text-primary font-medium" : "text-muted-foreground"}>
                          {formatCost(log.cost)}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 px-2 text-right text-muted-foreground whitespace-nowrap">
                        {format(new Date(log.created_at), "MMM dd HH:mm:ss")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between p-3 border-t">
              <span className="text-xs text-muted-foreground">
                Page {data.page} of {data.totalPages} ({data.total} total)
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="h-7 text-xs"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                  disabled={page === data.totalPages}
                  className="h-7 text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
