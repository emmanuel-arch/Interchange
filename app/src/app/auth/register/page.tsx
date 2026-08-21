"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrendingUp, AlertCircle, CheckCircle, Loader2 } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    investmentRange: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (form.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          password: form.password,
          investmentRange: form.investmentRange,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="container flex h-screen w-screen flex-col items-center justify-center">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px] text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle className="h-8 w-8 text-emerald-500" />
          </div>
          <h2 className="text-xl font-heading font-bold">
            Application Submitted
          </h2>
          <p className="text-sm text-muted-foreground">
            Your investor application has been received. Our team will review
            your details and reach out within 24-48 hours.
          </p>
          <Button onClick={() => router.push("/auth/login")}>
            Back to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container grid h-screen w-screen flex-col items-center justify-center lg:max-w-none lg:grid-cols-2 lg:px-0">
      <Link
        href="/auth/login"
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "absolute right-4 top-4 md:right-8 md:top-8"
        )}
      >
        Login
      </Link>

      <div className="hidden h-full bg-muted lg:block" />

      <div className="lg:p-8">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[400px]">
          <div className="flex flex-col space-y-2 text-center">
            <TrendingUp className="mx-auto h-6 w-6 text-gold-500" />
            <h1 className="text-2xl font-heading font-semibold tracking-tight">
              Investor Application
            </h1>
            <p className="text-sm text-muted-foreground">
              Apply to join GoldStrike&apos;s managed gold trading pool
            </p>
          </div>

          <div className="grid gap-6">
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4">
                {error && (
                  <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {error}
                  </div>
                )}

                <div className="grid gap-1">
                  <label className="text-sm font-medium" htmlFor="name">
                    Full Name
                  </label>
                  <Input
                    id="name"
                    placeholder="John Doe"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    disabled={loading}
                    required
                  />
                </div>

                <div className="grid gap-1">
                  <label className="text-sm font-medium" htmlFor="email">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    autoCapitalize="none"
                    autoComplete="email"
                    disabled={loading}
                    required
                  />
                </div>

                <div className="grid gap-1">
                  <label className="text-sm font-medium" htmlFor="phone">
                    Phone Number
                  </label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="0712345678"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    disabled={loading}
                    required
                  />
                </div>

                <div className="grid gap-1">
                  <label className="text-sm font-medium" htmlFor="investmentRange">
                    Investment Range (USD)
                  </label>
                  <select
                    id="investmentRange"
                    value={form.investmentRange}
                    onChange={(e) =>
                      setForm({ ...form, investmentRange: e.target.value })
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    required
                  >
                    <option value="">Select range...</option>
                    <option value="500-2000">$500 - $2,000</option>
                    <option value="2000-5000">$2,000 - $5,000</option>
                    <option value="5000-10000">$5,000 - $10,000</option>
                    <option value="10000-25000">$10,000 - $25,000</option>
                    <option value="25000+">$25,000+</option>
                  </select>
                </div>

                <div className="grid gap-1">
                  <label className="text-sm font-medium" htmlFor="password">
                    Password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Min. 8 characters"
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    disabled={loading}
                    required
                    minLength={8}
                  />
                </div>

                <div className="grid gap-1">
                  <label className="text-sm font-medium" htmlFor="confirmPassword">
                    Confirm Password
                  </label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm password"
                    value={form.confirmPassword}
                    onChange={(e) =>
                      setForm({ ...form, confirmPassword: e.target.value })
                    }
                    disabled={loading}
                    required
                  />
                </div>

                <Button disabled={loading}>
                  {loading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Submit Application
                </Button>
              </div>
            </form>
          </div>

          <p className="px-8 text-center text-sm text-muted-foreground">
            By clicking continue, you agree to our{" "}
            <Link
              href="/terms"
              className="hover:text-gold-500 underline underline-offset-4"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              className="hover:text-gold-500 underline underline-offset-4"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
