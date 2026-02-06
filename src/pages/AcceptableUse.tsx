import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const AcceptableUse = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto px-4 py-12">
        <Link to="/">
          <Button variant="ghost" className="mb-8 gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Button>
        </Link>

        <h1 className="text-4xl font-bold mb-2">Acceptable Use Policy</h1>
        <p className="text-muted-foreground mb-8">Last updated: February 6, 2025</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Purpose</h2>
            <p className="text-muted-foreground leading-relaxed">
              This Acceptable Use Policy outlines the rules and guidelines for using MotionMax's AI-powered video 
              generation platform. By using our Service, you agree to comply with this policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Prohibited Content</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              You may not use MotionMax to create, generate, upload, or distribute content that:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li><strong className="text-foreground">Violence:</strong> Depicts, promotes, or glorifies violence, terrorism, or physical harm</li>
              <li><strong className="text-foreground">Hate Speech:</strong> Promotes hatred, discrimination, or violence against individuals or groups based on race, ethnicity, religion, gender, sexual orientation, disability, or other protected characteristics</li>
              <li><strong className="text-foreground">Sexual Content:</strong> Contains sexually explicit or pornographic material, including AI-generated NSFW content</li>
              <li><strong className="text-foreground">Child Safety:</strong> Depicts, promotes, or facilitates child exploitation or abuse in any form</li>
              <li><strong className="text-foreground">Illegal Activities:</strong> Promotes or facilitates illegal activities, including drug trafficking, weapons sales, or financial fraud</li>
              <li><strong className="text-foreground">Harassment:</strong> Harasses, bullies, intimidates, or threatens any individual</li>
              <li><strong className="text-foreground">Misinformation:</strong> Spreads false information intended to deceive or manipulate</li>
              <li><strong className="text-foreground">Impersonation:</strong> Falsely impersonates another person, organization, or entity</li>
              <li><strong className="text-foreground">Intellectual Property:</strong> Infringes on copyrights, trademarks, or other intellectual property rights</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. Prohibited Activities</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">You may not:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Attempt to bypass or circumvent our content moderation systems</li>
              <li>Use automated tools or scripts to access the Service without authorization</li>
              <li>Share your account credentials with others</li>
              <li>Create multiple accounts to evade bans or usage limits</li>
              <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
              <li>Use the Service to spam, phish, or conduct other malicious activities</li>
              <li>Interfere with or disrupt the Service or its infrastructure</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Voice Cloning Guidelines</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">When using our voice cloning feature, you must:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2">
              <li>Only clone voices for which you have explicit permission or ownership</li>
              <li>Not clone voices of public figures without proper authorization</li>
              <li>Not use cloned voices for fraud, impersonation, or deception</li>
              <li>Comply with all applicable laws regarding synthetic voice generation</li>
            </ul>
          </section>

          <section className="bg-destructive/10 border border-destructive/20 rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-destructive">5. Enforcement and Consequences</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              <strong className="text-foreground">MotionMax takes violations of this policy seriously. We employ both automated and manual 
              content moderation to detect policy violations.</strong>
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              <strong className="text-foreground">Consequences for violating this policy include:</strong>
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-2 mb-4">
              <li><strong className="text-foreground">Warning:</strong> First-time minor violations may result in a warning</li>
              <li><strong className="text-foreground">Content Removal:</strong> Violating content will be immediately removed</li>
              <li><strong className="text-foreground">Account Suspension:</strong> Temporary suspension of account access</li>
              <li><strong className="text-foreground">Permanent Ban:</strong> Severe or repeated violations will result in permanent account termination with no refund of credits or subscription fees</li>
              <li><strong className="text-foreground">Legal Action:</strong> We may report illegal activities to law enforcement and pursue legal action when appropriate</li>
            </ul>
            <div className="bg-background/50 rounded p-4 border border-border">
              <p className="text-foreground font-semibold mb-2">Zero-Tolerance Policy</p>
              <p className="text-muted-foreground text-sm">
                We maintain a zero-tolerance policy for content involving violence, child safety, and other severe 
                violations. Such violations will result in immediate and permanent account termination without 
                warning, and we will cooperate fully with law enforcement investigations.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Reporting Violations</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you encounter content or behavior that violates this policy, please report it immediately 
              to abuse@motionmax.io. We review all reports and take appropriate action.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Appeals</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you believe your account was suspended or terminated in error, you may submit an appeal 
              to appeals@motionmax.io. Appeals will be reviewed on a case-by-case basis, and decisions 
              are final at our sole discretion.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Changes to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Acceptable Use Policy at any time. Continued use of the Service after 
              changes are posted constitutes acceptance of the updated policy.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-border flex gap-4 text-sm text-muted-foreground">
          <Link to="/terms" className="hover:text-primary transition-colors">Terms of Service</Link>
          <span>•</span>
          <Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
        </div>
      </div>
    </div>
  );
};

export default AcceptableUse;
