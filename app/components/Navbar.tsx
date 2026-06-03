"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import { LogOut, Trophy, LayoutDashboard, Shield, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { absolutizeAvatarUrl } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  // Do not show Navbar on auth pages
  if (!user || pathname === "/login" || pathname === "/register") {
    return null;
  }

  const navItems = [
    { name: "Лобби", href: "/", icon: LayoutDashboard },
    { name: "Персонажи", href: "/characters", icon: Users },
    { name: "Таблица лидеров", href: "/leaderboard", icon: Trophy },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo and Main Nav */}
        <div className="flex items-center gap-6 md:gap-10">
          <Link href="/" className="flex items-center space-x-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_10px_rgba(255,255,255,0.1)]">
              <Shield className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-wider text-foreground font-sans">
              ARCSEAL
            </span>
          </Link>
          <nav className="hidden md:flex space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User dropdown & actions */}
        <div className="flex items-center gap-4">
          {/* Mobile navigation links (icons only) */}
          <nav className="flex md:hidden space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.name}
                  className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </Link>
              );
            })}
          </nav>

          <span className="hidden sm:inline-block h-6 w-px bg-border" />

          {/* User Profile Dropdown Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 group cursor-pointer focus:outline-none">
                <Avatar className="h-9 w-9 border border-border transition-transform group-hover:scale-105">
                  <AvatarImage src={absolutizeAvatarUrl(user.avatar_url) || ""} alt={user.display_name} />
                  <AvatarFallback className="bg-muted text-muted-foreground font-bold">
                    {user.display_name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden md:flex flex-col text-left">
                  <span className="text-sm font-semibold leading-none text-foreground group-hover:text-foreground/80">
                    {user.display_name}
                  </span>
                  <span className="text-xs leading-none text-muted-foreground font-mono mt-1">
                    {user.elo} ELO
                  </span>
                </div>
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56 bg-card border border-border">
              <DropdownMenuLabel className="flex flex-col gap-1 p-2">
                <span className="text-sm font-bold text-foreground">{user.display_name}</span>
                <span className="text-xs text-muted-foreground font-mono">@{user.username} • {user.elo} ELO</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem onClick={logout} variant="destructive" className="cursor-pointer text-destructive focus:bg-destructive/10">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Выйти из аккаунта</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
