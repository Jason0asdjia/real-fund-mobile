"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  variant?: "primary" | "danger";
};

export function ConfirmModal({
  open,
  onClose,
  title,
  children,
  confirmText = "确认",
  cancelText = "取消",
  onConfirm,
  variant = "primary",
}: ConfirmModalProps) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("app-modal-open", open);
    return () => {
      document.body.classList.remove("app-modal-open");
    };
  }, [open]);

  if (!open) return null;

  const buttonVariant = variant === "danger" ? "destructive" : "primary";

  return (
    <div className="app-modal-backdrop" onClick={onClose}>
      <div className="app-modal-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="app-modal-sheet__grabber" />
        <div className="app-modal-sheet__header">
          <h3 className="m-0 text-base font-bold text-[#131b2e]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#53617a] hover:bg-slate-100"
            aria-label="关闭弹窗"
          >
            <X size={16} />
          </button>
        </div>
        <div className="app-modal-sheet__content">
          {children}
          <div className="mt-4 grid grid-cols-2 gap-2 pb-3">
            <Button variant="outline" onClick={onClose}>{cancelText}</Button>
            <Button variant={buttonVariant} onClick={onConfirm}>{confirmText}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
