import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Loader2, Search, ChevronLeft, ChevronRight, Eye, AlertTriangle, DollarSign } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AdminUserDetails } from "./AdminUserDetails";
import { format } from "date-fns";

interface CostBreakdown {
  openrouter: number;
  replicate: number;
  hypereal: number;
  googleTts: number;
  total: number;
}

interface Subscriber {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  lastSignIn: string | null;
  plan: string;
  status: string;
  creditsBalance: number;
  totalPurchased: number;
  totalUsed: number;
  generationCount: number;
  flagCount: number;
  costs?: CostBreakdown;
}

interface SubscribersResponse {
  users: Subscriber[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function AdminSubscribers() {
  const { callAdminApi } = useAdminAuth();
  const [data, setData] = useState<SubscribersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const fetchSubscribers = useCallback(async () => {
    try {
      setLoading(true);
      const result = await callAdminApi("subscribers_list", { page, search, limit: 20 });
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subscribers");
    } finally {
      setLoading(false);
    }
  }, [callAdminApi, page, search]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchSubscribers();
    }, 300);

    return () => clearTimeout(debounce);
  }, [fetchSubscribers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchSubscribers();
  };

  const getPlanBadge = (plan: string) => {
    const variants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
      free: "secondary",
      starter: "default",
      creator: "default",
      professional: "default",
      enterprise: "default",
    };
    return (
      <Badge variant={variants[plan] || "outline"} className="capitalize">
        {plan}
      </Badge>
    );
  };

  const formatCost = (cost: number | undefined) => {
    if (cost === undefined || cost === null) return "$0.00";
    return `$${cost.toFixed(4)}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <h2 className="text-2xl font-bold">Subscribers</h2>
          <p className="text-muted-foreground">
            {data?.total || 0} total users
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by email or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      </div>

      <Card className="shadow-sm overflow-hidden">
        <CardHeader>
          <CardTitle className="text-lg">User List</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-destructive">{error}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead className="text-center">Credits</TableHead>
                      <TableHead className="text-center">Generations</TableHead>
                      <TableHead className="text-center">Flags</TableHead>
                      <TableHead>
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3 text-primary" />
                          <span>API Costs</span>
                        </div>
                      </TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={user.avatarUrl || undefined} />
                              <AvatarFallback>
                                {user.displayName?.charAt(0)?.toUpperCase() || "U"}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium">{user.displayName}</div>
                              <div className="text-sm text-muted-foreground">{user.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{getPlanBadge(user.plan)}</TableCell>
                        <TableCell className="text-center">
                          <span className="font-medium">{user.creditsBalance}</span>
                          <span className="text-muted-foreground text-sm"> / {user.totalPurchased}</span>
                        </TableCell>
                        <TableCell className="text-center font-medium">{user.generationCount}</TableCell>
                        <TableCell className="text-center">
                          {user.flagCount > 0 ? (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {user.flagCount}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {user.costs ? (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-auto py-1 px-2 text-left">
                                  <div className="flex flex-col items-start">
                                    <span className="font-medium text-primary">
                                      {formatCost(user.costs.total)}
                                    </span>
                                    <span className="text-xs text-muted-foreground">View breakdown</span>
                                  </div>
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-md">
                                <DialogHeader>
                                  <DialogTitle>Cost Breakdown for {user.displayName}</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 rounded-lg bg-card border border-primary/20 shadow-sm">
                                      <p className="text-sm text-muted-foreground">OpenRouter</p>
                                      <p className="text-xl font-bold text-primary">{formatCost(user.costs.openrouter)}</p>
                                    </div>
                                    <div className="p-4 rounded-lg bg-card border border-primary/20 shadow-sm">
                                      <p className="text-sm text-muted-foreground">Replicate</p>
                                      <p className="text-xl font-bold text-[hsl(170,55%,40%)]">{formatCost(user.costs.replicate)}</p>
                                    </div>
                                    <div className="p-4 rounded-lg bg-card border border-primary/20 shadow-sm">
                                      <p className="text-sm text-muted-foreground">Hypereal</p>
                                      <p className="text-xl font-bold text-[hsl(170,40%,45%)]">{formatCost(user.costs.hypereal)}</p>
                                    </div>
                                    <div className="p-4 rounded-lg bg-card border border-primary/20 shadow-sm">
                                      <p className="text-sm text-muted-foreground">Google TTS</p>
                                      <p className="text-xl font-bold text-[hsl(170,55%,45%)]">{formatCost(user.costs.googleTts)}</p>
                                    </div>
                                  </div>
                                  <div className="p-4 rounded-lg bg-primary/10 border border-primary/30 shadow-sm">
                                    <p className="text-sm text-muted-foreground">Total Cost</p>
                                    <p className="text-2xl font-bold text-primary">{formatCost(user.costs.total)}</p>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          ) : (
                            <span className="text-muted-foreground text-sm">$0.00</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(user.createdAt), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedUserId(user.id)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle>User Details</DialogTitle>
                              </DialogHeader>
                              <AdminUserDetails userId={user.id} />
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {data && data.totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t px-4 sm:px-0">
                  <p className="text-sm text-muted-foreground">
                    Showing {((page - 1) * data.limit) + 1} to {Math.min(page * data.limit, data.total)} of {data.total}
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
                      onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                      disabled={page === data.totalPages}
                    >
                      <span className="hidden sm:inline">Next</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
