import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  Zap, 
  Video,
  Clock,
  TrendingUp,
  Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ThemeToggle } from "@/components/ThemeToggle";
import audiomaxLogo from "@/assets/audiomax-logo.png";

// Mock usage data
const usageData = {
  videosCreated: 12,
  videosLimit: 20,
  minutesGenerated: 45,
  minutesLimit: 60,
  currentPlan: "Free",
  billingCycle: "Monthly",
  renewalDate: "February 11, 2026",
};

const recentActivity = [
  { id: 1, title: "Product Demo Video", duration: "3:24", date: "Today" },
  { id: 2, title: "Tutorial Series Ep.1", duration: "5:12", date: "Yesterday" },
  { id: 3, title: "Marketing Pitch", duration: "2:45", date: "2 days ago" },
  { id: 4, title: "Onboarding Guide", duration: "4:30", date: "3 days ago" },
];

export default function Usage() {
  const navigate = useNavigate();

  const videosPercentage = (usageData.videosCreated / usageData.videosLimit) * 100;
  const minutesPercentage = (usageData.minutesGenerated / usageData.minutesLimit) * 100;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/30 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/app")}
              className="rounded-full"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <img src={audiomaxLogo} alt="AudioMax" className="h-8 w-auto" />
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Usage & Billing</h1>
          <p className="mt-1 text-muted-foreground">Monitor your usage and manage your subscription</p>

          {/* Current Plan */}
          <Card className="mt-8 border-border/50 bg-gradient-to-br from-primary/10 to-transparent">
            <CardContent className="flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm text-muted-foreground">Current Plan</p>
                <p className="text-2xl font-bold text-foreground">{usageData.currentPlan}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Renews on {usageData.renewalDate}
                </p>
              </div>
              <Button className="gap-2 rounded-full bg-primary">
                <Zap className="h-4 w-4" />
                Upgrade Plan
              </Button>
            </CardContent>
          </Card>

          {/* Usage Stats */}
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Video className="h-4 w-4 text-primary" />
                  Videos Created
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <span className="text-3xl font-bold">{usageData.videosCreated}</span>
                  <span className="text-sm text-muted-foreground">/ {usageData.videosLimit}</span>
                </div>
                <Progress value={videosPercentage} className="mt-3 h-2" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {usageData.videosLimit - usageData.videosCreated} videos remaining this month
                </p>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-4 w-4 text-primary" />
                  Minutes Generated
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <span className="text-3xl font-bold">{usageData.minutesGenerated}</span>
                  <span className="text-sm text-muted-foreground">/ {usageData.minutesLimit} min</span>
                </div>
                <Progress value={minutesPercentage} className="mt-3 h-2" />
                <p className="mt-2 text-xs text-muted-foreground">
                  {usageData.minutesLimit - usageData.minutesGenerated} minutes remaining this month
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card className="mt-6 border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Recent Activity
              </CardTitle>
              <CardDescription>Your recently created videos</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between rounded-lg border border-border/30 bg-muted/20 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Video className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{activity.title}</p>
                        <p className="text-sm text-muted-foreground">{activity.duration}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      {activity.date}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Billing History */}
          <Card className="mt-6 border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle>Billing History</CardTitle>
              <CardDescription>View your past invoices</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No billing history available. You're on the free plan.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
