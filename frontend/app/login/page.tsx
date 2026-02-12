"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { authApi, loginApi } from "@/lib/api";
import { toast } from "sonner";
import { useTranslations } from "@/hooks/use-translations";

export default function LoginPage() {
  const tAuth = useTranslations("auth");
  const t = useTranslations("login");
  const [tab, setTab] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPassword2, setRegPassword2] = useState("");
  const router = useRouter();
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();

  // 如果已认证，重定向到首页
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.push("/");
    }
  }, [authLoading, isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const result = await loginApi.login(username, password);

      if (result.data) {
        await login(result.data.access_token, result.data.refresh_token ?? null);
        router.push("/");
      } else {
        setError(result.error || t("loginFailed"));
      }
    } catch {
      setError(t("networkError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const u = regUsername.trim();
    if (!u) {
      setError(t("usernameRequired"));
      setIsLoading(false);
      return;
    }
    if (u.length < 3) {
      setError(t("usernameMinLength"));
      setIsLoading(false);
      return;
    }
    if ((regPassword || "").length < 6) {
      setError(t("passwordMinLength"));
      setIsLoading(false);
      return;
    }
    if (regPassword !== regPassword2) {
      setError(t("passwordMismatch"));
      setIsLoading(false);
      return;
    }

    try {
      const resp = await authApi.register({
        username: u,
        password: regPassword,
        email: regEmail.trim() || undefined,
      });

      if (resp.data) {
        toast.success(t("registerSuccess"));
        setTab("login");
        setUsername(u);
        setPassword("");
        setRegPassword("");
        setRegPassword2("");
      } else {
        setError(resp.error || t("registerFailed"));
      }
    } catch {
      setError(t("networkError"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">Canvas</CardTitle>
          <CardDescription className="text-center">
            {t("description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "register")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">{tAuth("login")}</TabsTrigger>
              <TabsTrigger value="register">{t("register")}</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">{tAuth("username")}</Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder={t("usernamePlaceholder")}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{tAuth("password")}</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder={t("passwordPlaceholder")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                {error && (
                  <div className="flex items-center space-x-2 text-sm text-red-600 dark:text-red-400">
                    <AlertCircle className="h-4 w-4" />
                    <span>{error}</span>
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? t("loggingIn") : tAuth("login")}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register" className="mt-4">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reg-username">{tAuth("username")}</Label>
                  <Input
                    id="reg-username"
                    type="text"
                    placeholder={t("usernamePlaceholder")}
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    minLength={3}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-email">{t("emailOptional")}</Label>
                  <Input
                    id="reg-email"
                    type="email"
                    placeholder="name@example.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-password">{tAuth("password")}</Label>
                  <Input
                    id="reg-password"
                    type="password"
                    placeholder={t("passwordMinLengthHint")}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-password2">{t("confirmPassword")}</Label>
                  <Input
                    id="reg-password2"
                    type="password"
                    placeholder={t("confirmPasswordPlaceholder")}
                    value={regPassword2}
                    onChange={(e) => setRegPassword2(e.target.value)}
                    minLength={6}
                    required
                  />
                </div>
                {error && (
                  <div className="flex items-center space-x-2 text-sm text-red-600 dark:text-red-400">
                    <AlertCircle className="h-4 w-4" />
                    <span>{error}</span>
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? t("registering") : t("register")}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
