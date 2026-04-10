"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { isSupabaseConfigured, supabase } from "@/lib/supabase-client";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  authLoading: boolean;
  authError: string | null;
  isConfigured: boolean;
  signInWithGitHub: () => Promise<{ ok: boolean; message?: string }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const isDevNoAuth = process.env.NODE_ENV !== "production";
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (isDevNoAuth) {
      setAuthLoading(false);
      setAuthError(null);
      setSession(null);
      setUser(null);
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      setAuthLoading(false);
      setAuthError(null);
      setSession(null);
      setUser(null);
      return;
    }

    let alive = true;
    setAuthLoading(true);
    setAuthError(null);

    const loadingTimeout = window.setTimeout(() => {
      if (!alive) return;
      setAuthLoading(false);
      setAuthError("用户状态加载超时，请检查 Supabase 地址、匿名密钥和网络连接");
    }, 8000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!alive) return;
      window.clearTimeout(loadingTimeout);
      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);
      setAuthLoading(false);
      setAuthError(null);
    });

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!alive) return;
        window.clearTimeout(loadingTimeout);
        if (error) {
          setAuthLoading(false);
          setAuthError(error.message || "无法获取 Supabase 会话");
          return;
        }
        setSession(data.session ?? null);
        setUser(data.session?.user ?? null);
        setAuthLoading(false);
        setAuthError(null);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        window.clearTimeout(loadingTimeout);
        setAuthLoading(false);
        setAuthError(error instanceof Error ? error.message : "无法获取 Supabase 会话");
      });

    return () => {
      alive = false;
      window.clearTimeout(loadingTimeout);
      subscription.unsubscribe();
    };
  }, [isDevNoAuth]);

  const signInWithGitHub = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      return { ok: false, message: "Supabase 环境变量未配置" };
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: typeof window !== "undefined" ? `${window.location.origin}/portfolio` : undefined,
      },
    });

    if (error) {
      return { ok: false, message: error.message || "GitHub 登录失败" };
    }

    return { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return;
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      authLoading,
      authError,
      isConfigured: isSupabaseConfigured,
      signInWithGitHub,
      signOut,
    }),
    [authError, authLoading, session, signInWithGitHub, signOut, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
