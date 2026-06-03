"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

export default function RegisterPage() {
  const { user, register } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validation states
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user) {
      router.push("/");
    }
  }, [user, router]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Username constraints
    if (username.length < 3 || username.length > 32) {
      newErrors.username = "Имя пользователя должно быть от 3 до 32 символов.";
    } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      newErrors.username = "Допускаются только латинские буквы, цифры и подчеркивание.";
    }

    // Display name constraints
    if (displayName.length < 2 || displayName.length > 50) {
      newErrors.displayName = "Отображаемое имя должно быть от 2 до 50 символов.";
    }

    // Email constraints
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = "Введите корректный адрес электронной почты.";
    }

    // Password constraints
    if (password.length < 8) {
      newErrors.password = "Пароль должен быть не менее 8 символов.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Пожалуйста, исправьте ошибки заполнения формы.");
      return;
    }

    setIsSubmitting(true);
    try {
      await register({
        username,
        display_name: displayName,
        email,
        password,
      });
      toast.success("Регистрация успешна! Входим в аккаунт...");
    } catch (err: any) {
      toast.error(err.message || "Ошибка регистрации. Проверьте введенные данные.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="flex flex-col gap-1">
            <CardTitle>Создать аккаунт</CardTitle>
            <CardDescription>
              Заполните форму ниже для регистрации в системе
            </CardDescription>
          </div>
          <CardAction>
            <Button variant="link" asChild className="px-0">
              <Link href="/login">Вход</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <form id="register-form" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-4">
              {/* Username */}
              <div className="grid gap-1">
                <Label htmlFor="username">Имя пользователя</Label>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={errors.username ? "border-destructive focus-visible:ring-destructive/30" : ""}
                  placeholder="Латинские буквы и подчеркивание"
                />
                {errors.username && <p className="text-xs text-destructive font-medium mt-0.5">{errors.username}</p>}
              </div>

              {/* Display Name */}
              <div className="grid gap-1">
                <Label htmlFor="displayName">Отображаемое имя</Label>
                <Input
                  id="displayName"
                  name="displayName"
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={errors.displayName ? "border-destructive focus-visible:ring-destructive/30" : ""}
                  placeholder="Имя на арене"
                />
                {errors.displayName && <p className="text-xs text-destructive font-medium mt-0.5">{errors.displayName}</p>}
              </div>

              {/* Email */}
              <div className="grid gap-1">
                <Label htmlFor="email">Электронная почта</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={errors.email ? "border-destructive focus-visible:ring-destructive/30" : ""}
                  placeholder="email@example.com"
                />
                {errors.email && <p className="text-xs text-destructive font-medium mt-0.5">{errors.email}</p>}
              </div>

              {/* Password */}
              <div className="grid gap-1">
                <Label htmlFor="password">Пароль</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`pr-10 ${errors.password ? "border-destructive focus-visible:ring-destructive/30" : ""}`}
                    placeholder="Не менее 8 символов"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-destructive font-medium mt-0.5">{errors.password}</p>}
              </div>
            </div>
          </form>
        </CardContent>
        <CardFooter className="flex-col gap-2">
          <Button
            type="submit"
            form="register-form"
            disabled={isSubmitting}
            className="w-full font-semibold"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Регистрация...
              </span>
            ) : (
              "Зарегистрироваться"
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
