"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "destructive" | "outline";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
};

const variantStyle: Record<ButtonVariant, React.CSSProperties> = {
  primary: { backgroundColor: "#00193c", color: "#fff" },
  destructive: { backgroundColor: "#ba1a1a", color: "#fff" },
  outline: { backgroundColor: "#fff", borderColor: "#d5dbea", color: "#131b2e", borderWidth: 1, borderStyle: "solid" },
};

export function Button({ variant = "primary", className, style, children, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-10 items-center justify-center rounded-lg px-3 text-sm font-semibold disabled:opacity-60 ${className ?? ""}`}
      style={{ ...variantStyle[variant], ...style }}
      {...props}
    >
      {children}
    </button>
  );
}
