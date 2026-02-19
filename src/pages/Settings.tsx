import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { 
  User, 
  Shield,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ThemedLogo } from "@/components/ThemedLogo";
import { supabase } from "@/integrations/supabase/client";
import { validatePassword } from "@/lib/passwordValidation";
import { PasswordStrengthIndicator } from "@/components/settings/PasswordStrengthIndicator";
import { DeleteAccountDialog } from "@/components/settings/DeleteAccountDialog";

export default function Settings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Display name state
  const [displayName, setDisplayName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  // Email change state
  const [newEmail, setNewEmail] = useState("");
  const [isChangingEmail, setIsChangingEmail] = useState(false);

  // Password change state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Fetch profile on mount
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.id) return;
      
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .single();
      
      if (data?.display_name) {
        setDisplayName(data.display_name);
      } else {
        setDisplayName(user.email?.split("@")[0] || "");
      }
    };
    
    fetchProfile();
  }, [user]);

  const handleSaveDisplayName = async () => {
    if (!user?.id || !displayName.trim()) {
      toast({
        title: "Missing name",
        description: "Please enter a display name.",
        variant: "destructive",
      });
      return;
    }

    setIsSavingName(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .upsert({
          user_id: user.id,
          display_name: displayName.trim(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (error) throw error;

      // Invalidate profile query so Dashboard updates
      queryClient.invalidateQueries({ queryKey: ["user-profile", user.id] });

      toast({
        title: "Profile updated",
        description: "Your display name has been saved.",
      });
    } catch (error: any) {
      console.error("Error saving display name:", error);
      toast({
        title: "Error saving profile",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSavingName(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!newEmail.trim()) {
      toast({
        title: "Missing email",
        description: "Please enter a new email address.",
        variant: "destructive",
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    setIsChangingEmail(true);

    try {
      const { error } = await supabase.auth.updateUser({
        email: newEmail,
      });

      if (error) throw error;

      toast({
        title: "Confirmation email sent",
        description: "Please check your new email address to confirm the change.",
      });
      setNewEmail("");
    } catch (error: any) {
      console.error("Error changing email:", error);
      toast({
        title: "Error updating email",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsChangingEmail(false);
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

    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      toast({
        title: "Weak password",
        description: validation.error,
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
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Header */}
      <header className="sticky top-0 z-50 grid h-14 sm:h-16 grid-cols-3 items-center border-b border-border/30 bg-background/80 px-4 sm:px-6 backdrop-blur-sm">
        <div className="flex items-center justify-start gap-2">
          <SidebarTrigger />
          <ThemedLogo className="hidden lg:block h-10 w-auto" />
        </div>
        <div className="flex justify-center lg:hidden">
          <ThemedLogo className="h-10 w-auto" />
        </div>
        <div className="flex items-center justify-end">
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your account and preferences</p>

          <Tabs defaultValue="account" className="mt-6 sm:mt-8">
            <TabsList className="grid w-full grid-cols-2 rounded-xl bg-muted/50 p-1">
              <TabsTrigger value="account" className="gap-2 rounded-lg data-[state=active]:bg-background">
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">Account</span>
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
                    <Label>Display Name</Label>
                    <Input
                      placeholder="Enter your display name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                    />
                  </div>
                  <Button 
                    onClick={handleSaveDisplayName}
                    disabled={isSavingName}
                    className="gap-2 rounded-full"
                  >
                    {isSavingName && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save Changes
                  </Button>

                  <div className="border-t border-border/50 pt-6 mt-6">
                    <Label>Current Email</Label>
                    <Input
                      value={user?.email || ""}
                      disabled
                      className="bg-muted/50 mt-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      To change your email, enter a new one below
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>New Email Address</Label>
                    <Input
                      type="email"
                      placeholder="Enter new email address"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                    />
                  </div>
                  <Button 
                    onClick={handleChangeEmail}
                    disabled={isChangingEmail}
                    variant="outline"
                    className="gap-2 rounded-full"
                  >
                    {isChangingEmail && <Loader2 className="h-4 w-4 animate-spin" />}
                    Update Email
                  </Button>
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
                    <PasswordStrengthIndicator password={newPassword} />
                    <Input 
                      type="password" 
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                    <Button 
                      onClick={handleChangePassword}
                      disabled={isChangingPassword}
                      className="gap-2 rounded-full"
                    >
                      {isChangingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
                      Update Password
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Danger Zone */}
          <div className="mt-8 sm:mt-10">
            <Card className="border-destructive/30 bg-destructive/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  Danger Zone
                </CardTitle>
                <CardDescription>
                  Permanently delete your account and all associated data. This action cannot be undone.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DeleteAccountDialog />
              </CardContent>
            </Card>
          </div>
        </motion.div>
        </div>
      </main>
    </div>
  );
}
