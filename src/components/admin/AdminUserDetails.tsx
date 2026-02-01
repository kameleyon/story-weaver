import { useEffect, useState } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, Calendar, CreditCard, Activity, Flag, Coins } from "lucide-react";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface UserDetails {
  user: {
    id: string;
    email: string;
    created_at: string;
    last_sign_in_at: string | null;
    email_confirmed_at: string | null;
  };
  profile: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  subscription: {
    plan_name: string;
    status: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  } | null;
  credits: {
    credits_balance: number;
    total_purchased: number;
    total_used: number;
  } | null;
  projectsCount: number;
  recentGenerations: Array<{
    id: string;
    status: string;
    created_at: string;
    completed_at: string | null;
  }>;
  flags: Array<{
    id: string;
    flag_type: string;
    reason: string;
    created_at: string;
    resolved_at: string | null;
  }>;
  recentTransactions: Array<{
    id: string;
    amount: number;
    transaction_type: string;
    description: string | null;
    created_at: string;
  }>;
}

interface AdminUserDetailsProps {
  userId: string;
}

export function AdminUserDetails({ userId }: AdminUserDetailsProps) {
  const { callAdminApi } = useAdminAuth();
  const [data, setData] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        setLoading(true);
        const result = await callAdminApi("user_details", { targetUserId: userId });
        setData(result);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load user details");
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [callAdminApi, userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">{error || "No data available"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* User Info */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Account Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{data.user.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Display Name</span>
              <span className="font-medium">{data.profile?.display_name || "Not set"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email Verified</span>
              <Badge variant={data.user.email_confirmed_at ? "default" : "secondary"}>
                {data.user.email_confirmed_at ? "Yes" : "No"}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{format(new Date(data.user.created_at), "PPp")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last Sign In</span>
              <span>
                {data.user.last_sign_in_at 
                  ? format(new Date(data.user.last_sign_in_at), "PPp")
                  : "Never"
                }
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Subscription
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plan</span>
              <Badge variant="default" className="capitalize">
                {data.subscription?.plan_name || "Free"}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant={data.subscription?.status === "active" ? "default" : "secondary"}>
                {data.subscription?.status || "No subscription"}
              </Badge>
            </div>
            {data.subscription?.current_period_end && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Renewal</span>
                <span>{format(new Date(data.subscription.current_period_end), "PP")}</span>
              </div>
            )}
            {data.subscription?.cancel_at_period_end && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cancels At</span>
                <Badge variant="destructive">Period End</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Credits & Activity */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Coins className="h-4 w-4" />
              Credits
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Balance</span>
              <span className="font-bold text-lg">{data.credits?.credits_balance || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Purchased</span>
              <span>{data.credits?.total_purchased || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Used</span>
              <span>{data.credits?.total_used || 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Projects</span>
              <span className="font-bold">{data.projectsCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Generations</span>
              <span className="font-bold">{data.recentGenerations?.length || 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Flag className="h-4 w-4" />
              Flags
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Flags</span>
              <span className="font-bold">{data.flags?.length || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Active Flags</span>
              <span className="font-bold text-destructive">
                {data.flags?.filter(f => !f.resolved_at).length || 0}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      {data.recentTransactions && data.recentTransactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentTransactions.slice(0, 10).map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>
                      <Badge variant={tx.transaction_type === "purchase" ? "default" : "secondary"}>
                        {tx.transaction_type}
                      </Badge>
                    </TableCell>
                    <TableCell className={tx.amount > 0 ? "text-green-500" : "text-red-500"}>
                      {tx.amount > 0 ? "+" : ""}{tx.amount}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{tx.description || "-"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(tx.created_at), "PP")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Flags */}
      {data.flags && data.flags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">User Flags</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.flags.map((flag) => (
                  <TableRow key={flag.id}>
                    <TableCell>
                      <Badge 
                        variant={
                          flag.flag_type === "banned" ? "destructive" :
                          flag.flag_type === "suspended" ? "destructive" :
                          flag.flag_type === "flagged" ? "default" : "secondary"
                        }
                      >
                        {flag.flag_type}
                      </Badge>
                    </TableCell>
                    <TableCell>{flag.reason}</TableCell>
                    <TableCell>
                      <Badge variant={flag.resolved_at ? "outline" : "destructive"}>
                        {flag.resolved_at ? "Resolved" : "Active"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(flag.created_at), "PP")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
