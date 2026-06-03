"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";

export interface User {
  id: string;
  username: string;
  display_name: string;
  email: string;
  elo: number;
  games_played: number;
  wins: number;
  losses: number;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (userIn: any) => Promise<void>;
  logout: () => void;
  updateProfile: (profileUpdate: {
    display_name?: string;
    bio?: string | null;
    avatar_url?: string | null;
  }) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const router = useRouter();

  // Load and verify token on initial mount
  useEffect(() => {
    async function loadUser() {
      const storedToken = localStorage.getItem("token");
      if (storedToken) {
        setToken(storedToken);
        try {
          const res = await apiRequest("/users/me", { method: "GET" });
          if (res.ok) {
            const data = await res.json();
            setUser(data);
          } else {
             // Token invalid and refresh failed (handled by apiRequest interceptor)
             setToken(null);
          }
        } catch (err) {
          console.error("Failed to load user info:", err);
          setToken(null);
        }
      }
      setLoading(false);
    }
    loadUser();
  }, []);

  const login = async (username: string, password: string) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("username", username);
      formData.append("password", password);

      const res = await apiRequest("/auth/login", {
        method: "POST",
        formData: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Invalid login credentials.");
      }

      const data = await res.json();
      localStorage.setItem("token", data.access_token);
      setToken(data.access_token);
      setUser(data.user);
      router.push("/");
    } catch (err) {
      setLoading(false);
      throw err;
    }
    setLoading(false);
  };

  const register = async (userIn: any) => {
    setLoading(true);
    try {
      const res = await apiRequest("/auth/register", {
        method: "POST",
        json: userIn,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Registration failed.");
      }

      // Auto-login on successful registration
      await login(userIn.username, userIn.password);
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    router.push("/login");
  };

  const updateProfile = async (profileUpdate: {
    display_name?: string;
    bio?: string | null;
    avatar_url?: string | null;
  }) => {
    try {
      const res = await apiRequest("/users/me", {
        method: "PUT",
        json: profileUpdate,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Failed to update profile.");
      }

      const updatedUser = await res.json();
      setUser(updatedUser);
    } catch (err) {
      console.error("Profile update failed:", err);
      throw err;
    }
  };

  const refreshUser = async () => {
    if (!token) return;
    try {
      const res = await apiRequest("/users/me", { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      }
    } catch (err) {
      console.error("Refresh user failed:", err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        logout,
        updateProfile,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
