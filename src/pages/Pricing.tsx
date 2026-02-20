import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  Check, 
  Zap, 
  Crown,
  Gem,
  Building2,
  Sparkles,
  Plus,
  Loader2,
  Info,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ThemedLogo } from "@/components/ThemedLogo";
import { cn } from "@/lib/utils";
import { useSubscription, STRIPE_PLANS, CREDIT_PACKS } from "@/hooks/useSubscription";
import { PLAN_LIMITS } from "@/lib/planLimits";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const plans = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    yearlyPrice: "$0",
    period: "/month",
    description: "Get started with basic features",
    icon: Sparkles,
    features: [
      `${PLAN_LIMITS.free.creditsPerMonth} credits/month`,
      "Short videos only (<2 min)",
      "720p quality",
      "5 basic visual styles",
      "Landscape format only",
      "No narration (silent/captions)",
      "Watermark on exports",
    ],
    excluded: [
      "Voice cloning",
      "Infographics",
      "Brand mark",
    ],
    cta: "Current Plan",
    popular: false,
    priceId: null,
  },
  {
    id: "starter",
    name: "Starter",
    price: "$14.99",
    yearlyPrice: "$11.99",
    period: "/month",
    description: "Hobbyists & social creators",
    icon: Zap,
    features: [
      `${PLAN_LIMITS.starter.creditsPerMonth} credits/month`,
      "Short + Brief videos",
      "1080p quality",
      "10 visual styles",
      "All formats (16:9, 9:16, 1:1)",
      "Standard narration voices",
      "10 infographics/month",
      "No watermark",
      "Email support (48h)",
    ],
    excluded: [
      "Voice cloning",
      "Brand mark",
    ],
    cta: "Upgrade to Starter",
    popular: false,
    priceId: STRIPE_PLANS.starter.monthly.priceId,
  },
  {
    id: "creator",
    name: "Creator",
    price: "$39.99",
    yearlyPrice: "$31.99",
    period: "/month",
    description: "Content creators & small biz",
    icon: Crown,
    features: [
      `${PLAN_LIMITS.creator.creditsPerMonth} credits/month`,
      "All video lengths",
      "1080p quality",
      "All 13 styles + Custom",
      "All formats",
      "Full narration + voice effects",
      "1 voice clone",
      "50 infographics/month",
      "Brand mark",
      "Basic analytics",
      "Priority support (24h)",
    ],
    excluded: [],
    cta: "Upgrade to Creator",
    popular: true,
    priceId: STRIPE_PLANS.creator.monthly.priceId,
  },
  {
    id: "professional",
    name: "Professional",
    price: "$89.99",
    yearlyPrice: "$71.99",
    period: "/month",
    description: "Agencies & marketing teams",
    icon: Gem,
    features: [
      `${PLAN_LIMITS.professional.creditsPerMonth} credits/month`,
      "All video lengths",
      "4K quality",
      "All styles + premium effects",
      "Full narration + multilingual",
      "3 voice clones",
      "Unlimited infographics",
      "Full brand kit",
      "Advanced analytics",
      "Batch export",
      "3 team seats",
      "Priority support (12h)",
    ],
    excluded: [],
    cta: "Upgrade to Professional",
    popular: false,
    priceId: STRIPE_PLANS.professional.monthly.priceId,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    yearlyPrice: "Custom",
    period: "",
    description: "Large organizations",
    icon: Building2,
    features: [
      "Unlimited credits (fair use)",
      "4K+ quality (up to 8K)",
      "Custom style development",
      "Custom voice training",
      "Unlimited voice clones",
      "White-label solution",
      "Unlimited API access",
      "Unlimited team seats",
      "SSO/SAML integration",
      "On-premise available",
      "Custom SLA guarantee",
      "Dedicated manager",
      "24/7 premium support",
      "Onboarding training",
    ],
    excluded: [],
    cta: "Contact Sales",
    popular: false,
    priceId: null,
  },
];

const creditPackages = [
  { credits: 15 as const, price: "$11.99", perCredit: "$0.80", priceId: CREDIT_PACKS[15].priceId },
  { credits: 50 as const, price: "$34.99", perCredit: "$0.70", priceId: CREDIT_PACKS[50].priceId },
  { credits: 150 as const, price: "$89.99", perCredit: "$0.60", popular: true, priceId: CREDIT_PACKS[150].priceId },
  { credits: 500 as const, price: "$249.99", perCredit: "$0.50", bestValue: true, priceId: CREDIT_PACKS[500].priceId },
];

// Credit usage info
const creditInfo = [
  { type: "Short Video (<2 min)", credits: 1 },
  { type: "Brief Video (<5 min)", credits: 2 },
  { type: "Presentation (<10 min)", credits: 4 },
  { type: "Infographic", credits: 1 },
];

export default function Pricing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { plan: currentPlan, createCheckout, openCustomerPortal, isLoading: isLoadingSub } = useSubscription();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [loadingCredits, setLoadingCredits] = useState<number | null>(null);
  const [showDowngradeDialog, setShowDowngradeDialog] = useState(false);

  const handleDowngrade = async () => {
    try {
      setLoadingPlan("free");
      setShowDowngradeDialog(false);
      await openCustomerPortal();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to open billing portal",
        variant: "destructive",
      });
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleSubscribe = async (planId: string, priceId: string | null) => {
    if (!priceId) return;
    
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to subscribe to a plan",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }

    try {
      setLoadingPlan(planId);
      await createCheckout(priceId, "subscription");
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start checkout",
        variant: "destructive",
      });
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleBuyCredits = async (credits: 15 | 50 | 150 | 500, priceId: string) => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to purchase credits",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }

    try {
      setLoadingCredits(credits);
      await createCheckout(priceId, "payment");
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start checkout",
        variant: "destructive",
      });
    } finally {
      setLoadingCredits(null);
    }
  };

  const getPlanCta = (plan: typeof plans[0]) => {
    if (plan.id === currentPlan) {
      return "Current Plan";
    }
    if (plan.id === "free" && currentPlan !== "free") {
      return "Downgrade to Free";
    }
    return plan.cta;
  };

  const isPlanDisabled = (plan: typeof plans[0]) => {
    if (plan.id === "free") return currentPlan === "free";
    if (plan.id === currentPlan) return true;
    if (plan.id === "enterprise") return false;
    return false;
  };

  const getDisplayPrice = (plan: typeof plans[0]) => {
    if (plan.price === "Custom") return plan.price;
    if (billingCycle === "yearly" && plan.yearlyPrice !== "$0") {
      return plan.yearlyPrice;
    }
    return plan.price;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/30 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(-1)}
              className="rounded-full"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <ThemedLogo className="h-7 sm:h-8 w-auto" />
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Hero */}
          <div className="text-center mb-8 sm:mb-12">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-foreground">
              Choose Your Plan
            </h1>
            <p className="mt-2 sm:mt-3 text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
              Start free and scale as you grow. All plans include core features with images and narration.
            </p>

            {/* Billing Toggle */}
            <div className="mt-6 sm:mt-8 inline-flex items-center gap-3 rounded-full bg-muted/50 p-1">
              <button
                onClick={() => setBillingCycle("monthly")}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-all",
                  billingCycle === "monthly" 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle("yearly")}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2",
                  billingCycle === "yearly" 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Yearly
                <Badge variant="secondary" className="text-xs">Save 20%</Badge>
              </button>
            </div>
          </div>

          {/* Pricing Cards */}
          <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {plans.map((plan, index) => {
              const Icon = plan.icon;
              const isCurrentPlan = plan.id === currentPlan;
              const isDisabled = isPlanDisabled(plan);
              const isLoading = loadingPlan === plan.id;
              
              return (
                <motion.div
                  key={plan.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card
                    className={cn(
                      "relative h-full border-border/50 bg-card/50 shadow-sm transition-all hover:shadow-md flex flex-col",
                      plan.popular && "border-primary/50 bg-gradient-to-b from-primary/5 to-transparent",
                      isCurrentPlan && "ring-2 ring-primary"
                    )}
                  >
                    {plan.popular && !isCurrentPlan && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                      </div>
                    )}
                    {isCurrentPlan && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-primary text-primary-foreground">Your Plan</Badge>
                      </div>
                    )}
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg",
                          plan.popular || isCurrentPlan ? "bg-primary/20" : "bg-muted"
                        )}>
                          <Icon className={cn(
                            "h-4 w-4",
                            plan.popular || isCurrentPlan ? "text-primary" : "text-muted-foreground"
                          )} />
                        </div>
                        <CardTitle className="text-base sm:text-lg">{plan.name}</CardTitle>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl sm:text-3xl font-bold">
                          {getDisplayPrice(plan)}
                        </span>
                        {plan.period && (
                          <span className="text-sm text-muted-foreground">
                            {plan.period}
                          </span>
                        )}
                      </div>
                      {billingCycle === "yearly" && plan.price !== "$0" && plan.price !== "Custom" && (
                        <p className="text-xs text-muted-foreground">
                          Billed yearly (${(parseFloat(plan.yearlyPrice.replace("$", "")) * 12).toFixed(0)}/yr)
                        </p>
                      )}
                      <CardDescription className="text-xs sm:text-sm">{plan.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 flex-1 flex flex-col">
                      <ul className="space-y-1.5 flex-1">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-2 text-xs">
                            <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                            <span className="text-muted-foreground">{feature}</span>
                          </li>
                        ))}
                        {plan.excluded.map((feature) => (
                          <li key={feature} className="flex items-start gap-2 text-xs">
                            <X className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 mt-0.5" />
                            <span className="text-muted-foreground/50 line-through">{feature}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="pt-2">
                        <Button
                          className={cn(
                            "w-full rounded-full text-sm",
                            plan.popular || isCurrentPlan
                              ? "bg-primary text-primary-foreground" 
                              : isDisabled 
                                ? "bg-muted text-muted-foreground cursor-not-allowed"
                                : "bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
                          )}
                          disabled={isDisabled || isLoading}
                          onClick={() => {
                            if (plan.id === "enterprise") {
                              window.open("mailto:support@motionmax.io?subject=Enterprise%20Inquiry", "_blank");
                            } else if (plan.id === "free" && currentPlan !== "free") {
                              setShowDowngradeDialog(true);
                            } else if (plan.priceId) {
                              handleSubscribe(plan.id, plan.priceId);
                            }
                          }}
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              Processing...
                            </>
                          ) : (
                            getPlanCta(plan)
                          )}
                        </Button>
                      </div>
                      {plan.id === "free" && currentPlan !== "free" && (
                        <div className="flex items-start gap-1.5 p-2 rounded-md bg-muted/50">
                          <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            When downgrading, you keep remaining credits until billing period ends. No refunds.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          {/* Credit System Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-10 sm:mt-14"
          >
            <div className="text-center mb-6">
              <h2 className="text-lg sm:text-xl font-semibold text-foreground">
                How Credits Work
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Each content type uses a different amount of credits
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3 max-w-2xl mx-auto">
              {creditInfo.map((item) => (
                <div
                  key={item.type}
                  className="flex items-center gap-2 px-3 py-2 rounded-full bg-muted/50 border border-border/50"
                >
                  <span className="text-xs text-muted-foreground">{item.type}</span>
                  <Badge variant="secondary" className="text-xs">
                    {item.credits} {item.credits === 1 ? "credit" : "credits"}
                  </Badge>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Credit Top-Up Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-10 sm:mt-14"
          >
            <div className="text-center mb-6 sm:mb-8">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center justify-center gap-2">
                <Plus className="h-5 w-5 text-primary" />
                Credit Top-Up Packs
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Need more credits? Purchase additional packs anytime. Credits never expire.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Available for Starter tier and above
              </p>
            </div>

            <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4 max-w-3xl mx-auto">
              {creditPackages.map((pkg, index) => {
                const isLoading = loadingCredits === pkg.credits;
                const canBuy = currentPlan !== "free";
                
                return (
                  <motion.div
                    key={pkg.credits}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.6 + index * 0.05 }}
                  >
                    <Card
                      className={cn(
                        "relative border-border/50 bg-card/50 shadow-sm transition-all hover:shadow-md",
                        canBuy && "cursor-pointer hover:border-primary/50",
                        !canBuy && "opacity-60",
                        pkg.popular && "border-primary/50 ring-1 ring-primary/20",
                        pkg.bestValue && "border-primary ring-2 ring-primary/30"
                      )}
                      onClick={() => canBuy && !isLoading && handleBuyCredits(pkg.credits, pkg.priceId)}
                    >
                      {pkg.popular && (
                        <div className="absolute -top-2 right-2">
                          <Badge variant="secondary" className="text-[10px]">Popular</Badge>
                        </div>
                      )}
                      {pkg.bestValue && (
                        <div className="absolute -top-2 right-2">
                          <Badge className="bg-primary text-primary-foreground text-[10px]">Best Value</Badge>
                        </div>
                      )}
                      <CardContent className="p-4 text-center">
                        {isLoading ? (
                          <div className="py-4 flex flex-col items-center gap-2">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            <span className="text-sm text-muted-foreground">Processing...</span>
                          </div>
                        ) : (
                          <>
                            <div className="text-2xl sm:text-3xl font-bold text-foreground">
                              {pkg.credits}
                            </div>
                            <div className="text-xs text-muted-foreground">credits</div>
                            <div className="mt-2 text-lg font-semibold text-foreground">
                              {pkg.price}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {pkg.perCredit}/credit
                            </div>
                            {!canBuy && (
                              <p className="mt-2 text-[10px] text-muted-foreground">
                                Upgrade to Starter+
                              </p>
                            )}
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          {/* FAQ Link */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="text-center mt-10 sm:mt-14"
          >
            <p className="text-sm text-muted-foreground">
              Have questions? Check our{" "}
              <a href="mailto:support@motionmax.io" className="text-primary hover:underline">
                FAQ
              </a>{" "}
              or{" "}
              <a href="mailto:support@motionmax.io" className="text-primary hover:underline">
                contact support
              </a>
            </p>
          </motion.div>
        </motion.div>
      </main>

      {/* Downgrade Confirmation Dialog */}
      <AlertDialog open={showDowngradeDialog} onOpenChange={setShowDowngradeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Downgrade to Free Plan?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                When you downgrade, you'll keep your remaining credits and access until your current billing period ends or credits run out, whichever comes first.
              </p>
              <p className="font-medium text-foreground">
                No refunds will be provided for unused subscription time.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDowngrade}>
              Proceed to Billing Portal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
