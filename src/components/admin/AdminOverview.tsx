import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Users, CreditCard, Activity, Flag, Coins, Archive, Loader2 } from "lucide-react";

interface DashboardStats {
  totalUsers: number;
  subscriberCount: number;
  activeSubscriptions: number;
  totalGenerations: number;
  activeGenerations: number;
  archivedGenerations: number;
  activeFlags: number;
  creditPurchases: number;
}

export function AdminOverview() {
  const { callAdminApi } = useAdminAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const data = await callAdminApi("dashboard_stats");
        setStats(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stats");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [callAdminApi]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  // Teal palette shades
  const tealShades = {
    primary: "text-primary", // #49cdbf
    light: "text-[hsl(170,55%,65%)]", // Lighter teal
    dark: "text-[hsl(170,55%,40%)]", // Darker teal
    muted: "text-[hsl(170,30%,50%)]", // Muted teal
  };

  const statCards = [
    {
      title: "Total Users",
      value: stats?.totalUsers || 0,
      description: "Registered accounts",
      icon: Users,
      color: tealShades.primary,
      bgColor: "bg-primary/10",
    },
    {
      title: "Active Subscribers",
      value: stats?.subscriberCount || 0,
      description: "Paid subscriptions",
      icon: CreditCard,
      color: tealShades.light,
      bgColor: "bg-primary/15",
    },
    {
      title: "Total Generations",
      value: stats?.totalGenerations || 0,
      description: `${stats?.activeGenerations || 0} active, ${stats?.archivedGenerations || 0} deleted`,
      icon: Activity,
      color: tealShades.dark,
      bgColor: "bg-primary/20",
    },
    {
      title: "Active Flags",
      value: stats?.activeFlags || 0,
      description: "Unresolved issues",
      icon: Flag,
      color: stats?.activeFlags ? "text-red-500" : "text-muted-foreground",
      bgColor: stats?.activeFlags ? "bg-red-500/10" : "bg-muted/50",
    },
    {
      title: "Credit Purchases",
      value: stats?.creditPurchases || 0,
      description: "Total transactions",
      icon: Coins,
      color: tealShades.muted,
      bgColor: "bg-primary/10",
    },
    {
      title: "Archived Generations",
      value: stats?.archivedGenerations || 0,
      description: "Deleted by users",
      icon: Archive,
      color: "text-muted-foreground",
      bgColor: "bg-muted/50",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Dashboard Overview</h2>
        <p className="text-muted-foreground">Real-time platform statistics and metrics</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value.toLocaleString()}</div>
              <CardDescription>{stat.description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Status Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Subscription Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Free Users</span>
                <span className="font-medium">{(stats?.totalUsers || 0) - (stats?.subscriberCount || 0)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Paid Subscribers</span>
                <span className="font-medium text-primary">{stats?.subscriberCount || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Conversion Rate</span>
                <span className="font-medium">
                  {stats?.totalUsers 
                    ? ((stats.subscriberCount / stats.totalUsers) * 100).toFixed(1) 
                    : 0}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Generation Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Active Generations</span>
                <span className="font-medium text-primary">{stats?.activeGenerations || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Deleted Generations</span>
                <span className="font-medium text-muted-foreground">{stats?.archivedGenerations || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Retention Rate</span>
                <span className="font-medium">
                  {stats?.totalGenerations 
                    ? ((stats.activeGenerations / stats.totalGenerations) * 100).toFixed(1) 
                    : 0}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
