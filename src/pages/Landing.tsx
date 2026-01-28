import { motion } from "framer-motion";
import { FileText, Volume2, Headphones, ArrowRight, Check, X, Sparkles, Zap, Crown, Building2, CircleUserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";
import featuresBackground from "@/assets/features-bg.png";
import audiomaxLogo from "@/assets/audiomax-logo-full.png";
import motionMaxHeroLogo from "@/assets/motionmax-hero-logo.png";
import heroPromoVideo from "@/assets/hero-promo.mp4";
import heroVideoPoster from "@/assets/hero-video-poster.png";

const features = [
  {
    title: "Document to Video",
    description: "Transform your documents and text into engaging narrated videos with AI-generated visuals.",
    icon: FileText,
  },
  {
    title: "Natural Voiceovers",
    description: "Create professional audio with natural-sounding AI voices that bring your content to life.",
    icon: Volume2,
  },
  {
    title: "Audio Storytelling",
    description: "Turn your ideas into immersive audio experiences with custom illustrations and animations.",
    icon: Headphones,
  },
];

const pricingPlans = [
  {
    name: "Free",
    icon: Sparkles,
    price: "$0",
    description: "Get started with basic features",
    features: [
      { text: "5 credits/month", included: true },
      { text: "Short videos only (<2 min)", included: true },
      { text: "720p quality", included: true },
      { text: "5 basic visual styles", included: true },
      { text: "Landscape format only", included: true },
      { text: "Watermark on exports", included: true },
      { text: "Voice cloning", included: false },
      { text: "Infographics", included: false },
    ],
    buttonText: "Get Started",
    buttonVariant: "outline" as const,
    popular: false,
  },
  {
    name: "Starter",
    icon: Zap,
    price: "$14.99",
    description: "Hobbyists & social creators",
    features: [
      { text: "30 credits/month", included: true },
      { text: "Short + Brief videos", included: true },
      { text: "1080p quality", included: true },
      { text: "10 visual styles", included: true },
      { text: "All formats (16:9, 9:16, 1:1)", included: true },
      { text: "Standard narration voices", included: true },
      { text: "No watermark", included: true },
      { text: "Email support (48h)", included: true },
    ],
    buttonText: "Upgrade to Starter",
    buttonVariant: "outline" as const,
    popular: false,
  },
  {
    name: "Creator",
    icon: Crown,
    price: "$39.99",
    description: "Content creators & small biz",
    features: [
      { text: "100 credits/month", included: true },
      { text: "All video lengths", included: true },
      { text: "1080p quality", included: true },
      { text: "All 13 styles + Custom", included: true },
      { text: "Full narration + voice effects", included: true },
      { text: "1 voice clone", included: true },
      { text: "50 infographics/month", included: true },
      { text: "Priority support (24h)", included: true },
    ],
    buttonText: "Upgrade to Creator",
    buttonVariant: "default" as const,
    popular: true,
  },
  {
    name: "Professional",
    icon: Building2,
    price: "$89.99",
    description: "Agencies & marketing teams",
    features: [
      { text: "300 credits/month", included: true },
      { text: "4K quality", included: true },
      { text: "All styles + premium effects", included: true },
      { text: "Full narration + multilingual", included: true },
      { text: "3 voice clones", included: true },
      { text: "Unlimited infographics", included: true },
      { text: "API access (5K requests/mo)", included: true },
      { text: "Priority support (12h)", included: true },
    ],
    buttonText: "Upgrade to Professional",
    buttonVariant: "default" as const,
    popular: false,
  },
];

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(185,30%,95%)] via-[hsl(185,25%,97%)] to-[hsl(180,20%,98%)] dark:bg-none dark:bg-background">
      {/* Navigation with frosted glass effect */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/70 backdrop-blur-md border-b border-border/30">
        <div className="mx-auto flex h-16 sm:h-20 max-w-6xl items-center justify-between px-6 sm:px-8">
          {/* Logo */}
          <a href="/" className="flex items-center">
            <img src={audiomaxLogo} alt="AudioMax" className="h-8 sm:h-10 w-auto" />
          </a>
          
          {/* Nav Links */}
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Features
            </a>
            <a href="#pricing" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Pricing
            </a>
            <a href="#about" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              About
            </a>
          </nav>
          
          {/* Right Actions */}
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {/* Mobile: Profile icon */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden rounded-full h-9 w-9"
              onClick={() => navigate("/auth")}
            >
              <CircleUserRound className="h-5 w-5" />
            </Button>
            {/* Desktop: Get Started button */}
            <Button
              className="hidden md:flex rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
              onClick={() => navigate("/auth")}
            >
              Get Started
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center pt-32 md:pt-40 xl:pt-16">
        <div className="mx-auto max-w-7xl px-6 sm:px-8 w-full pb-16 md:pb-24">
          <div className="flex flex-col xl:grid xl:grid-cols-2 gap-8 xl:gap-16 items-center">
            {/* Left Content */}
            {/* Left Content */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="max-w-2xl text-center xl:text-left"
            >
              <img 
                src={motionMaxHeroLogo} 
                alt="MotionMax" 
                className="w-full max-w-sm sm:max-w-md md:max-w-lg xl:max-w-xl mx-auto xl:mx-0"
              />
              
              <p className="mt-8 text-3xl sm:text-4xl md:text-5xl font-medium leading-tight uppercase tracking-wide text-foreground/85">
                Turn Text Into Engaging Visual Contents.
              </p>
              
              <Button
                size="lg"
                className="mt-10 rounded-lg bg-primary px-10 py-7 text-lg font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                onClick={() => navigate("/auth")}
              >
                Try for Free
              </Button>
            </motion.div>

            {/* Right Illustration - Hero Video */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="w-full max-w-2xl"
            >
              <video
                src={heroPromoVideo}
                className="w-full rounded-2xl shadow-2xl"
                controls
                preload="metadata"
                poster={heroVideoPoster}
              >
                Your browser does not support the video tag.
              </video>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Why AudioMax Section */}
      <section 
        id="features" 
        className="py-24 sm:py-32 relative overflow-hidden"
        style={{
          backgroundImage: `url(${featuresBackground})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Overlay for better text readability */}
        <div className="absolute inset-0 bg-primary/75" />
        <div className="mx-auto max-w-6xl px-6 sm:px-8 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
              Why AudioMax?
            </h2>
            <p className="mt-4 text-lg text-white/80 max-w-2xl mx-auto">
              From idea to polished content in minutes. Our AI handles the heavy lifting so you can focus on your message.
            </p>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-3">
            {features.map((feature, index) => {
              const IconComponent = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="text-center p-6 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 shadow-lg"
                >
                  <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
                    <IconComponent className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-white/80 leading-relaxed">
                    {feature.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 sm:py-32 border-t border-border/30">
        <div className="mx-auto max-w-7xl px-6 sm:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Start free, upgrade when you need more.
            </p>
          </motion.div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {pricingPlans.map((plan, index) => {
              const IconComponent = plan.icon;
              return (
                <motion.div
                  key={plan.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className={`rounded-2xl border ${plan.popular ? 'border-2 border-primary' : 'border-border/50'} bg-card p-6 relative flex flex-col`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                        Most Popular
                      </span>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <IconComponent className="h-4 w-4 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                  </div>
                  
                  <p className="text-sm text-muted-foreground mb-4">{plan.description}</p>
                  
                  <div className="mb-6">
                    <span className="text-3xl font-bold text-foreground">{plan.price}</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                  
                  <ul className="space-y-2.5 text-sm mb-6 flex-1">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2">
                        {feature.included ? (
                          <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                        )}
                        <span className={feature.included ? 'text-muted-foreground' : 'text-muted-foreground/50'}>
                          {feature.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                  
                  <Button
                    variant={plan.buttonVariant}
                    className="w-full"
                    onClick={() => navigate("/auth")}
                  >
                    {plan.buttonText}
                  </Button>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Simple CTA Section */}
      <section className="py-24 sm:py-32 border-t border-border/30">
        <div className="mx-auto max-w-3xl px-6 sm:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              Ready to get started?
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Create your first video in minutes. No credit card required.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                size="lg"
                className="rounded-lg bg-primary px-8 py-6 text-base font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                onClick={() => navigate("/auth")}
              >
                Start Creating Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => navigate("/pricing")}
              >
                View Pricing
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* About Us Section */}
      <section id="about" className="py-20 sm:py-24 border-t border-border/30 bg-muted/30">
        <div className="mx-auto max-w-4xl px-6 sm:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center space-y-6"
          >
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              About AudioMax
            </h2>
            <p className="text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              AudioMax is an AI-powered content creation platform designed to transform the way you produce visual and audio content. 
              Our mission is to empower creators, educators, and businesses with intuitive tools that turn ideas into professional-quality 
              videos and audio experiences in minutes—not hours.
            </p>
            <p className="text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              Built by a passionate team of engineers and creatives, AudioMax leverages cutting-edge AI to handle the heavy lifting, 
              so you can focus on what matters most: your message.
            </p>
            <div className="pt-4">
              <p className="text-sm text-muted-foreground">
                Have questions? Reach out to us at{" "}
                <a 
                  href="mailto:support@audiomax.ai" 
                  className="text-primary hover:underline font-medium"
                >
                  support@audiomax.ai
                </a>
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 py-10">
        <div className="mx-auto flex max-w-6xl flex-col sm:flex-row items-center justify-between gap-4 px-6 sm:px-8">
          <img src={audiomaxLogo} alt="AudioMax" className="h-10 w-auto" />
          <p className="text-sm text-muted-foreground">
            © 2025 AudioMax. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
