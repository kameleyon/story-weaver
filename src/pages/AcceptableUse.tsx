import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemedLogo } from "@/components/ThemedLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function AcceptableUse() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/30 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 sm:h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <ThemedLogo className="h-8 sm:h-10 w-auto" />
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8 sm:py-12 prose dark:prose-invert prose-sm sm:prose-base">
        <h1>Acceptable Use Policy</h1>
        <p className="text-muted-foreground">Last updated: February 19, 2026</p>

        <h2>1. Purpose</h2>
        <p>
          This policy outlines prohibited uses of the MotionMax platform to ensure a safe and lawful
          environment for all users.
        </p>

        <h2>2. Prohibited Content</h2>
        <p>You may not use the Platform to create, distribute, or store content that:</p>
        <ul>
          <li>Is illegal, harmful, threatening, abusive, harassing, defamatory, or obscene</li>
          <li>Promotes violence, discrimination, or hatred against any individual or group</li>
          <li>Contains child sexual abuse material (CSAM) or exploits minors in any way</li>
          <li>Infringes on intellectual property rights of others</li>
          <li>Contains malware, viruses, or other harmful code</li>
          <li>Impersonates another person or entity without authorization</li>
          <li>Constitutes spam, phishing, or social engineering attacks</li>
        </ul>

        <h2>3. Prohibited Activities</h2>
        <p>You may not:</p>
        <ul>
          <li>Attempt to gain unauthorized access to the Platform or other users' accounts</li>
          <li>Use the Platform to conduct fraud or deceptive practices</li>
          <li>Reverse engineer, decompile, or attempt to extract the source code of the Platform</li>
          <li>Use automated tools to scrape, crawl, or extract data from the Platform without authorization</li>
          <li>Circumvent usage limits, billing, or access controls</li>
          <li>Resell or redistribute the service without authorization</li>
          <li>Use the Platform in a way that could damage, disable, or impair its functionality</li>
        </ul>

        <h2>4. Voice Cloning Restrictions</h2>
        <p>When using the voice cloning feature, you must:</p>
        <ul>
          <li>Only clone voices for which you have explicit consent from the voice owner</li>
          <li>Not use cloned voices to create misleading or deceptive content</li>
          <li>Not use cloned voices to impersonate public figures for harmful purposes</li>
          <li>Comply with all applicable laws regarding synthetic voice content</li>
        </ul>

        <h2>5. Enforcement</h2>
        <p>
          Violations of this policy may result in immediate action including but not limited to:
        </p>
        <ul>
          <li>Content removal</li>
          <li>Temporary suspension of access</li>
          <li>Permanent account termination</li>
          <li>Forfeiture of remaining credits and subscription time</li>
          <li>Reporting to law enforcement where required</li>
        </ul>

        <h2>6. Reporting Violations</h2>
        <p>
          If you encounter content or behavior that violates this policy, please report it through
          the Platform's support channels. All reports are reviewed and investigated promptly.
        </p>

        <h2>7. Changes</h2>
        <p>
          We may update this policy as needed. Continued use of the Platform after changes
          constitutes acceptance of the updated policy.
        </p>
      </main>
    </div>
  );
}
