import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Headphones, Presentation, Mic, ArrowRight, Play, Check, Zap, Crown, Gem, Building2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ThemedLogo } from "@/components/ThemedLogo";
import { cn } from "@/lib/utils";

const features = [
  {
    title: "NotebookLM-Style Video",
    description: "Text → Video",
    icon: FileText,
  },
  {
    title: "Audio Storytelling",
    description: "Audio → Visuals",
    icon: Headphones,
  },
  {
    title: "Slide Deck Narrator",
    description: "Slides → Narrated Video",
    icon: Presentation,
  },
  {
    title: "Voice Cloning",
    description: "Your Voice → AI Narrator",
    icon: Mic,
  },
];

const pricingPlans = [
  {
    name: "Freemium",
    price: "$0",
    description: "Get started free",
    icon: Sparkles,
    features: ["5 videos/month", "720p quality", "Basic styles"],
    popular: false,
  },
  {
    name: "Premium",
    price: "$7.99",
    description: "For creators",
    icon: Zap,
    features: ["50 videos/month", "1080p quality", "All styles", "No watermark"],
    popular: false,
  },
  {
    name: "Pro",
    price: "$34.99",
    description: "For professionals",
    icon: Crown,
    features: ["200 videos/month", "4K quality", "API access", "Priority support"],
    popular: true,
  },
  {
    name: "Platinum",
    price: "$99.99",
    description: "For agencies",
    icon: Gem,
    features: ["Unlimited videos", "White-label", "Dedicated manager"],
    popular: false,
  },
  {
    name: "Enterprise",
    price: "Custom",
    description: "Tailored solutions",
    icon: Building2,
    features: ["Custom pricing", "On-premise option", "SSO integration"],
    popular: false,
  },
];

export default function Landing() {
  const [currentFeature, setCurrentFeature] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentFeature((prev) => (prev + 1) % features.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/30 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 sm:h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            {/* Logo removed from header - appears in hero section */}
          </div>
          <nav className="hidden items-center gap-6 lg:gap-8 md:flex">
            <a href="#features" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Features
            </a>
            <a href="#how-it-works" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              How It Works
            </a>
            <a href="#pricing" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Pricing
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              variant="ghost"
              className="text-sm font-medium hidden sm:inline-flex"
              onClick={() => navigate("/auth")}
            >
              Log In
            </Button>
            <Button
              className="rounded-full bg-primary px-4 sm:px-5 text-sm font-medium text-primary-foreground"
              onClick={() => navigate("/auth")}
            >
              <span className="hidden sm:inline">Get Started</span>
              <span className="sm:hidden">Start</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden pt-14 sm:pt-16">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-primary/3 to-transparent" />
        
        {/* Floating elements */}
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            className="absolute -top-20 -right-20 h-64 sm:h-96 w-64 sm:w-96 rounded-full bg-primary/10 blur-3xl"
            animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.6, 0.4] }}
            transition={{ duration: 8, repeat: Infinity }}
          />
          <motion.div
            className="absolute -bottom-20 -left-20 h-64 sm:h-96 w-64 sm:w-96 rounded-full bg-accent/10 blur-3xl"
            animate={{ scale: [1.2, 1, 1.2], opacity: [0.4, 0.6, 0.4] }}
            transition={{ duration: 8, repeat: Infinity, delay: 2 }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 text-center">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-8 sm:mb-10 flex justify-center"
          >
            <ThemedLogo className="h-16 sm:h-20 md:h-24 w-auto" />
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground"
          >
            Turn Your Knowledge
            <br />
            <span className="text-primary">into Cinema.</span>
          </motion.h1>

          {/* Sub-headline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto mt-4 sm:mt-6 max-w-2xl text-base sm:text-lg md:text-xl text-muted-foreground"
          >
            Upload documents, text, or images. Get a fully narrated, illustrated video in minutes.
          </motion.p>

          {/* Animated Feature Slider */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-8 sm:mt-10"
          >
            <div className="mx-auto flex h-14 sm:h-16 max-w-xs sm:max-w-md items-center justify-center rounded-2xl border border-border/50 bg-card/50 px-4 sm:px-6 backdrop-blur-sm shadow-sm">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentFeature}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center gap-3"
                >
                  {(() => {
                    const IconComponent = features[currentFeature].icon;
                    return (
                      <>
                        <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-primary/10">
                          <IconComponent className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                        </div>
                        <div className="text-left">
                          <p className="font-semibold text-foreground text-sm sm:text-base">
                            {features[currentFeature].title}
                          </p>
                          <p className="text-xs sm:text-sm text-muted-foreground">
                            {features[currentFeature].description}
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Feature indicators */}
            <div className="mt-4 flex justify-center gap-2">
              {features.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentFeature(index)}
                  className={`h-1.5 rounded-full transition-all ${
                    index === currentFeature
                      ? "w-6 bg-primary"
                      : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                  }`}
                />
              ))}
            </div>
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-8 sm:mt-10 flex flex-col items-center gap-3 sm:gap-4 sm:flex-row sm:justify-center"
          >
            <Button
              size="lg"
              className="group gap-2 rounded-full bg-primary px-6 sm:px-8 py-5 sm:py-6 text-sm sm:text-base font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-md hover:shadow-primary/30 w-full sm:w-auto"
              onClick={() => navigate("/auth")}
            >
              Start Creating Free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="gap-2 rounded-full px-6 sm:px-8 py-5 sm:py-6 text-sm sm:text-base font-medium text-muted-foreground hover:text-foreground"
            >
              <Play className="h-4 w-4" />
              Watch Demo
            </Button>
          </motion.div>

          {/* Trust indicators */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mt-6 sm:mt-8 text-xs sm:text-sm text-muted-foreground/60"
          >
            No credit card required · Free tier available · Create your first video in 2 minutes
          </motion.p>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="border-t border-border/30 bg-muted/30 py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-foreground">
              How It Works
            </h2>
            <p className="mt-3 sm:mt-4 text-base sm:text-lg text-muted-foreground">
              Three simple steps to transform your content
            </p>
          </motion.div>

          <div className="mt-12 sm:mt-16 grid gap-6 sm:gap-8 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Upload Your Content",
                description: "Paste text, upload documents, or add images. We support PDFs, Word docs, and more.",
              },
              {
                step: "02",
                title: "Choose Your Style",
                description: "Select from multiple visual styles and customize the format, length, and narration.",
              },
              {
                step: "03",
                title: "Generate & Share",
                description: "Our AI creates a professional video with narration, visuals, and transitions.",
              },
            ].map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="relative rounded-2xl border border-border/50 bg-card p-6 sm:p-8 shadow-sm"
              >
                <span className="text-3xl sm:text-4xl font-bold text-accent/70">{item.step}</span>
                <h3 className="mt-3 sm:mt-4 text-base sm:text-lg font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm sm:text-base text-muted-foreground">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-foreground">
              Powerful Features
            </h2>
            <p className="mt-3 sm:mt-4 text-base sm:text-lg text-muted-foreground">
              Everything you need to create stunning video content
            </p>
          </motion.div>

          <div className="mt-12 sm:mt-16 grid gap-4 sm:gap-6 sm:grid-cols-2">
            {features.map((feature, index) => {
              const IconComponent = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="flex gap-4 rounded-2xl border border-border/50 bg-card p-5 sm:p-6 shadow-sm"
                >
                  <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <IconComponent className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-sm sm:text-base">{feature.title}</h3>
                    <p className="mt-1 text-xs sm:text-sm text-muted-foreground">{feature.description}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="border-t border-border/30 bg-muted/30 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-foreground">
              Simple, Transparent Pricing
            </h2>
            <p className="mt-3 sm:mt-4 text-base sm:text-lg text-muted-foreground">
              Start free and scale as you grow
            </p>
          </motion.div>

          <div className="mt-10 sm:mt-16 grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {pricingPlans.map((plan, index) => {
              const Icon = plan.icon;
              return (
                <motion.div
                  key={plan.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card
                    className={cn(
                      "relative h-full border-border/50 bg-card/50 shadow-sm transition-all hover:shadow-md",
                      plan.popular && "border-primary/50 bg-gradient-to-b from-primary/5 to-transparent"
                    )}
                  >
                    {plan.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-primary text-primary-foreground text-xs">Popular</Badge>
                      </div>
                    )}
                    <CardHeader className="pb-3 sm:pb-4">
                      <div className="flex items-center gap-2 mb-1 sm:mb-2">
                        <div className={cn(
                          "flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg",
                          plan.popular ? "bg-primary/20" : "bg-muted"
                        )}>
                          <Icon className={cn(
                            "h-3.5 w-3.5 sm:h-4 sm:w-4",
                            plan.popular ? "text-primary" : "text-muted-foreground"
                          )} />
                        </div>
                        <CardTitle className="text-sm sm:text-base">{plan.name}</CardTitle>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl sm:text-2xl font-bold">{plan.price}</span>
                        {plan.price !== "Custom" && <span className="text-xs text-muted-foreground">/mo</span>}
                      </div>
                      <CardDescription className="text-xs">{plan.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 sm:space-y-4">
                      <ul className="space-y-1.5 sm:space-y-2">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-2 text-xs">
                            <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                            <span className="text-muted-foreground">{feature}</span>
                          </li>
                        ))}
                      </ul>
                      <Button
                        className={cn(
                          "w-full rounded-full text-xs sm:text-sm",
                          plan.popular 
                            ? "bg-primary text-primary-foreground" 
                            : "bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
                        )}
                        onClick={() => navigate(plan.name === "Enterprise" ? "/pricing" : "/auth")}
                      >
                        {plan.name === "Enterprise" ? "Contact Sales" : "Get Started"}
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mt-8 sm:mt-10 text-center"
          >
            <Button
              variant="ghost"
              className="gap-2 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => navigate("/pricing")}
            >
              View full pricing details
              <ArrowRight className="h-4 w-4" />
            </Button>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-border/30 bg-gradient-to-b from-primary/5 to-transparent py-16 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-foreground">
              Ready to Create Your First Video?
            </h2>
            <p className="mt-3 sm:mt-4 text-base sm:text-lg text-muted-foreground">
              Join thousands of creators using AudioMax to turn their ideas into stunning videos.
            </p>
            <Button
              size="lg"
              className="mt-6 sm:mt-8 gap-2 rounded-full bg-primary px-6 sm:px-8 py-5 sm:py-6 text-sm sm:text-base font-semibold text-primary-foreground shadow-sm shadow-primary/20"
              onClick={() => navigate("/auth")}
            >
              Start Creating Free
              <ArrowRight className="h-4 w-4" />
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 py-8 sm:py-12">
        <div className="mx-auto flex max-w-6xl flex-col sm:flex-row items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2 opacity-60">
            <ThemedLogo className="h-6 sm:h-8 w-auto" />
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground/60">
            © 2024 AudioMax. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
