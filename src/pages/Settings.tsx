import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  User, 
  Key, 
  Bell, 
  Shield,
  Eye,
  EyeOff,
  Save,
  Loader2,
  Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ThemedLogo } from "@/components/ThemedLogo";
import { supabase } from "@/integrations/supabase/client";

export default function Settings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  // API Keys state
  const [geminiKey, setGeminiKey] = useState("");
  const [replicateKey, setReplicateKey] = useState("");
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showReplicateKey, setShowReplicateKey] = useState(false);
  const [isSavingKeys, setIsSavingKeys] = useState(false);
  const [isLoadingKeys, setIsLoadingKeys] = useState(true);
  const [keysSaved, setKeysSaved] = useState(false);

  // Password change state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Notification settings
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [projectUpdates, setProjectUpdates] = useState(true);
  const [marketingEmails, setMarketingEmails] = useState(false);

  // Load existing API keys on mount
  useEffect(() => {
    const loadApiKeys = async () => {
      if (!user) return;
      
      try {
        const { data, error } = await supabase
          .from("user_api_keys")
          .select("gemini_api_key, replicate_api_token")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          console.error("Error loading API keys:", error);
          return;
        }

        if (data) {
          setGeminiKey(data.gemini_api_key || "");
          setReplicateKey(data.replicate_api_token || "");
        }
      } catch (err) {
        console.error("Failed to load API keys:", err);
      } finally {
        setIsLoadingKeys(false);
      }
    };

    loadApiKeys();
  }, [user]);

  const handleSaveApiKeys = async () => {
    if (!user) return;
    
    setIsSavingKeys(true);
    
    try {
      // Check if record exists
      const { data: existing } = await supabase
        .from("user_api_keys")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        // Update existing record
        const { error } = await supabase
          .from("user_api_keys")
          .update({
            gemini_api_key: geminiKey || null,
            replicate_api_token: replicateKey || null,
          })
          .eq("user_id", user.id);

        if (error) throw error;
      } else {
        // Insert new record
        const { error } = await supabase
          .from("user_api_keys")
          .insert({
            user_id: user.id,
            gemini_api_key: geminiKey || null,
            replicate_api_token: replicateKey || null,
          });

        if (error) throw error;
      }

      setKeysSaved(true);
      toast({
        title: "API keys saved",
        description: "Your API keys have been securely stored.",
      });
      setTimeout(() => setKeysSaved(false), 2000);
    } catch (error) {
      console.error("Error saving API keys:", error);
      toast({
        title: "Error saving API keys",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSavingKeys(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast({
        title: "Missing fields",
        description: "Please fill in both password fields.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords match.",
        variant: "destructive",
      });
      return;
    }

    setIsChangingPassword(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast({
        title: "Password updated",
        description: "Your password has been changed successfully.",
      });
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      console.error("Error changing password:", error);
      toast({
        title: "Error updating password",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

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
            <ThemedLogo className="h-8 w-auto" />
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
          <p className="mt-1 text-muted-foreground">Manage your account and preferences</p>

          <Tabs defaultValue="account" className="mt-8">
            <TabsList className="grid w-full grid-cols-4 rounded-xl bg-muted/50 p-1">
              <TabsTrigger value="account" className="gap-2 rounded-lg data-[state=active]:bg-background">
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">Account</span>
              </TabsTrigger>
              <TabsTrigger value="api-keys" className="gap-2 rounded-lg data-[state=active]:bg-background">
                <Key className="h-4 w-4" />
                <span className="hidden sm:inline">API Keys</span>
              </TabsTrigger>
              <TabsTrigger value="notifications" className="gap-2 rounded-lg data-[state=active]:bg-background">
                <Bell className="h-4 w-4" />
                <span className="hidden sm:inline">Notifications</span>
              </TabsTrigger>
              <TabsTrigger value="security" className="gap-2 rounded-lg data-[state=active]:bg-background">
                <Shield className="h-4 w-4" />
                <span className="hidden sm:inline">Security</span>
              </TabsTrigger>
            </TabsList>

            {/* Account Tab */}
            <TabsContent value="account" className="mt-6">
              <Card className="border-border/50 bg-card/50">
                <CardHeader>
                  <CardTitle>Account Information</CardTitle>
                  <CardDescription>Update your account details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      value={user?.email || ""}
                      disabled
                      className="bg-muted/50"
                    />
                    <p className="text-xs text-muted-foreground">
                      Contact support to change your email address
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Display Name</Label>
                    <Input
                      placeholder="Enter your display name"
                      defaultValue={user?.email?.split("@")[0] || ""}
                    />
                  </div>
                  <Button className="rounded-full">Save Changes</Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* API Keys Tab */}
            <TabsContent value="api-keys" className="mt-6 space-y-6">
              <Card className="border-border/50 bg-card/50">
                <CardHeader>
                  <CardTitle>Google Gemini API</CardTitle>
                  <CardDescription>
                    Required for script generation and text-to-speech
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <div className="relative">
                      <Input
                        type={showGeminiKey ? "text" : "password"}
                        placeholder={isLoadingKeys ? "Loading..." : "Enter your Gemini API key"}
                        value={geminiKey}
                        onChange={(e) => setGeminiKey(e.target.value)}
                        className="pr-10"
                        disabled={isLoadingKeys}
                      />
                      <button
                        type="button"
                        onClick={() => setShowGeminiKey(!showGeminiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showGeminiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Get your API key from{" "}
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Google AI Studio
                    </a>
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border/50 bg-card/50">
                <CardHeader>
                  <CardTitle>Replicate API</CardTitle>
                  <CardDescription>
                    Required for AI image generation (Flux 1.1 Pro)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>API Token</Label>
                    <div className="relative">
                      <Input
                        type={showReplicateKey ? "text" : "password"}
                        placeholder={isLoadingKeys ? "Loading..." : "Enter your Replicate API token"}
                        value={replicateKey}
                        onChange={(e) => setReplicateKey(e.target.value)}
                        className="pr-10"
                        disabled={isLoadingKeys}
                      />
                      <button
                        type="button"
                        onClick={() => setShowReplicateKey(!showReplicateKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showReplicateKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Get your API token from{" "}
                    <a
                      href="https://replicate.com/account/api-tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Replicate Dashboard
                    </a>
                  </p>
                </CardContent>
              </Card>

              <Button 
                onClick={handleSaveApiKeys} 
                className="gap-2 rounded-full"
                disabled={isSavingKeys || isLoadingKeys}
              >
                {isSavingKeys ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : keysSaved ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {keysSaved ? "Saved" : "Save API Keys"}
              </Button>
            </TabsContent>

            {/* Notifications Tab */}
            <TabsContent value="notifications" className="mt-6">
              <Card className="border-border/50 bg-card/50">
                <CardHeader>
                  <CardTitle>Notification Preferences</CardTitle>
                  <CardDescription>Choose what updates you receive</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Email Notifications</p>
                      <p className="text-sm text-muted-foreground">
                        Receive email notifications for important updates
                      </p>
                    </div>
                    <Switch
                      checked={emailNotifications}
                      onCheckedChange={setEmailNotifications}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Project Updates</p>
                      <p className="text-sm text-muted-foreground">
                        Get notified when your videos are ready
                      </p>
                    </div>
                    <Switch
                      checked={projectUpdates}
                      onCheckedChange={setProjectUpdates}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Marketing Emails</p>
                      <p className="text-sm text-muted-foreground">
                        Receive tips, updates, and promotional content
                      </p>
                    </div>
                    <Switch
                      checked={marketingEmails}
                      onCheckedChange={setMarketingEmails}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Security Tab */}
            <TabsContent value="security" className="mt-6">
              <Card className="border-border/50 bg-card/50">
                <CardHeader>
                  <CardTitle>Security Settings</CardTitle>
                  <CardDescription>Manage your account security</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <Label>Change Password</Label>
                    <p className="text-sm text-muted-foreground">
                      Enter a new password to update your account security. Password must be at least 6 characters.
                    </p>
                    <Input 
                      type="password" 
                      placeholder="New password" 
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <Input 
                      type="password" 
                      placeholder="Confirm new password" 
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                  <Button 
                    className="gap-2 rounded-full"
                    onClick={handleChangePassword}
                    disabled={isChangingPassword || !newPassword || !confirmPassword}
                  >
                    {isChangingPassword ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Shield className="h-4 w-4" />
                    )}
                    {isChangingPassword ? "Updating..." : "Update Password"}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>
      </main>
    </div>
  );
}
