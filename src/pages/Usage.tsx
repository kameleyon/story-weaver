import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { 
  ArrowLeft, 
  Zap, 
  Video,
  Clock,
  TrendingUp,
  Calendar,
  CreditCard,
  Receipt,
  Crown,
  ExternalLink,
  Plus,
  DollarSign
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ThemedLogo } from "@/components/ThemedLogo";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow, format, startOfMonth, endOfMonth } from "date-fns";

// Plan limits configuration
const planLimits = {
  free: { videos: 5, label: "Freemium", color: "bg-muted" },
  premium: { videos: 50, label: "Premium", color: "bg-primary/20" },
  pro: { videos: 200, label: "Pro", color: "bg-primary/30" },
  platinum: { videos: Infinity, label: "Platinum", color: "bg-primary/40" },
};

export default function Usage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Fetch usage data from generations table
  const { data: usageData, isLoading: isLoadingUsage } = useQuery({
    queryKey: ["usage-stats", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);

      // Get generations for current billing cycle
      const { data: generations, error } = await supabase
        .from("generations")
        .select("id, created_at, status")
        .eq("user_id", user.id)
        .gte("created_at", monthStart.toISOString())
        .lte("created_at", monthEnd.toISOString());

      if (error) throw error;

      const completedGenerations = generations?.filter(g => g.status === "completed") || [];
      
      return {
        videosCreated: completedGenerations.length,
        totalGenerations: generations?.length || 0,
        billingStart: monthStart,
        billingEnd: monthEnd,
      };
    },
    enabled: !!user?.id,
  });

  // Fetch recent activity
  const { data: recentActivity = [], isLoading: isLoadingActivity } = useQuery({
    queryKey: ["recent-activity", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from("generations")
        .select(`
          id,
          created_at,
          status,
          project:projects(title)
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Mock plan data (will be replaced with Stripe integration)
  const currentPlan = "free";
  const planInfo = planLimits[currentPlan as keyof typeof planLimits];
  const videosLimit = planInfo.videos;
  const videosCreated = usageData?.videosCreated || 0;
  const videosPercentage = videosLimit === Infinity ? 0 : (videosCreated / videosLimit) * 100;

  // Calculate next billing date (end of current month for free users)
  const renewalDate = usageData?.billingEnd 
    ? format(usageData.billingEnd, "MMMM d, yyyy")
    : format(endOfMonth(new Date()), "MMMM d, yyyy");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/30 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 sm:h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/app")}
              className="rounded-full h-8 w-8 sm:h-9 sm:w-9"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <ThemedLogo className="h-6 sm:h-8 w-auto" />
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Usage & Billing</h1>
          <p className="mt-1 text-sm text-muted-foreground">Monitor your usage and manage your subscription</p>

          {/* Current Plan */}
          <Card className="mt-6 sm:mt-8 border-border/50 bg-gradient-to-br from-primary/10 to-transparent shadow-sm">
            <CardContent className="flex flex-col items-start justify-between gap-4 p-4 sm:p-6 sm:flex-row sm:items-center">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20">
                  <Crown className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xl sm:text-2xl font-bold text-foreground">{planInfo.label}</p>
                    <Badge variant="secondary" className="text-xs">Current</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Resets on {renewalDate}
                  </p>
                </div>
              </div>
              <Button 
                className="gap-2 rounded-full bg-primary w-full sm:w-auto"
                onClick={() => navigate("/pricing")}
              >
                <Zap className="h-4 w-4" />
                Upgrade Plan
              </Button>
            </CardContent>
          </Card>

          {/* Usage Stats */}
          <div className="mt-4 sm:mt-6 grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2">
            <Card className="border-border/50 bg-card/50 shadow-sm">
              <CardHeader className="pb-2 px-4 sm:px-6 pt-4 sm:pt-6">
                <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                  <Video className="h-4 w-4 text-primary" />
                  Videos This Cycle
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
                <div className="flex items-end justify-between">
                  <span className="text-2xl sm:text-3xl font-bold">
                    {isLoadingUsage ? "..." : videosCreated}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    / {videosLimit === Infinity ? "∞" : videosLimit}
                  </span>
                </div>
                <Progress value={videosPercentage} className="mt-3 h-2" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {videosLimit === Infinity 
                    ? "Unlimited videos with your plan" 
                    : `${videosLimit - videosCreated} videos remaining this cycle`}
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/50 shadow-sm">
              <CardHeader className="pb-2 px-4 sm:px-6 pt-4 sm:pt-6">
                <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                  <DollarSign className="h-4 w-4 text-primary" />
                  Credits Available
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
                <div className="flex items-end justify-between">
                  <span className="text-2xl sm:text-3xl font-bold">0</span>
                  <span className="text-sm text-muted-foreground">bonus credits</span>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-3 w-full gap-2 text-xs"
                  onClick={() => navigate("/pricing")}
                >
                  <Plus className="h-3 w-3" />
                  Buy Credits
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  Credits never expire and stack with your plan
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Billing Section */}
          <Card className="mt-4 sm:mt-6 border-border/50 bg-card/50 shadow-sm">
            <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <CreditCard className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                Billing & Payment
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">Manage your payment methods and billing</CardDescription>
            </CardHeader>
            <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
              <div className="rounded-lg border border-dashed border-border/50 bg-muted/20 p-4 sm:p-6 text-center">
                <CreditCard className="h-8 w-8 sm:h-10 sm:w-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm font-medium text-foreground">No payment method on file</p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  Add a payment method to upgrade your plan or purchase credits
                </p>
                <Button 
                  variant="outline" 
                  className="mt-4 gap-2 rounded-full text-sm"
                  onClick={() => {
                    // TODO: Integrate Stripe customer portal
                    navigate("/pricing");
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Add Payment Method
                </Button>
              </div>

              {/* Quick actions */}
              <div className="mt-4 sm:mt-6 grid gap-3 grid-cols-1 sm:grid-cols-2">
                <Button 
                  variant="ghost" 
                  className="justify-start gap-2 h-auto py-3 text-sm"
                  onClick={() => navigate("/pricing")}
                >
                  <Zap className="h-4 w-4 text-primary" />
                  <div className="text-left">
                    <p className="font-medium">Change Plan</p>
                    <p className="text-xs text-muted-foreground">Upgrade or downgrade</p>
                  </div>
                  <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
                </Button>
                <Button 
                  variant="ghost" 
                  className="justify-start gap-2 h-auto py-3 text-sm"
                  disabled
                >
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  <div className="text-left">
                    <p className="font-medium">View Invoices</p>
                    <p className="text-xs text-muted-foreground">Download past invoices</p>
                  </div>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="mt-4 sm:mt-6 border-border/50 bg-card/50 shadow-sm">
            <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                Recent Activity
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">Your recent video generations</CardDescription>
            </CardHeader>
            <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
              {isLoadingActivity ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Loading activity...
                </div>
              ) : recentActivity.length === 0 ? (
                <div className="py-8 text-center">
                  <Video className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No activity yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Your video generations will appear here
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentActivity.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 p-3 sm:p-4"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                          <Video className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {(activity.project as any)?.title || "Untitled Video"}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge 
                              variant="secondary" 
                              className={`text-[10px] ${
                                activity.status === "completed" 
                                  ? "bg-primary/20 text-primary" 
                                  : activity.status === "failed"
                                    ? "bg-destructive/20 text-destructive"
                                    : "bg-muted"
                              }`}
                            >
                              {activity.status}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground shrink-0">
                        <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
                        <span className="hidden sm:inline">
                          {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                        </span>
                        <span className="sm:hidden">
                          {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true }).replace(" ago", "")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Billing History */}
          <Card className="mt-4 sm:mt-6 border-border/50 bg-card/50 shadow-sm">
            <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Receipt className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                Billing History
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">View your past invoices</CardDescription>
            </CardHeader>
            <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
              <div className="py-6 text-center">
                <Receipt className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No billing history available
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  You're on the free plan. Upgrade to see invoices here.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
