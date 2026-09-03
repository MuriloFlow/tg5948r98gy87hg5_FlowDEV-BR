"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

const SIZES = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
} as const;

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: keyof typeof SIZES;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Impede fechar clicando fora — útil enquanto uma ação está em andamento. */
  locked?: boolean;
  icon?: React.ReactNode;
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  children,
  footer,
  locked,
  icon,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={locked ? undefined : onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-ink-900/25 backdrop-blur-[2px]",
            "data-[state=open]:animate-[fade-in_0.2s_ease-out]"
          )}
        />
        <Dialog.Content
          onInteractOutside={(e) => locked && e.preventDefault()}
          onEscapeKeyDown={(e) => locked && e.preventDefault()}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2",
            "rounded-2xl border border-ink-200 bg-white shadow-[var(--shadow-pop)]",
            "flex max-h-[calc(100dvh-3rem)] flex-col overflow-hidden",
            "data-[state=open]:animate-[scale-in_0.18s_cubic-bezier(0.16,1,0.3,1)]",
            SIZES[size]
          )}
        >
          <div className="flex items-start gap-3 border-b border-ink-200/70 px-5 py-4">
            {icon && (
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 [&_svg]:size-4.5">
                {icon}
              </span>
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <Dialog.Title className="text-[15px] font-semibold tracking-[-0.01em] text-ink-900">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="text-[13px] leading-relaxed text-ink-500">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="iconSm" aria-label="Fechar" disabled={locked}>
                <X />
              </Button>
            </Dialog.Close>
          </div>

          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

          {footer && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-200/70 bg-ink-50/50 px-5 py-3.5">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive,
  loading,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  children?: React.ReactNode;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      locked={loading}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            loading={loading}
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children ?? (
        <p className="text-sm leading-relaxed text-ink-600">
          Esta ação será registrada na auditoria do sistema.
        </p>
      )}
    </Modal>
  );
}

/** Painel lateral (drawer) para detalhes sem sair da listagem. */
export function SidePanel({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = "max-w-xl",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-900/25 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_0.2s_ease-out]" />
        <Dialog.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-ink-200 bg-white shadow-[var(--shadow-pop)]",
            "data-[state=open]:animate-[slide-in-right_0.26s_cubic-bezier(0.16,1,0.3,1)]",
            width
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-ink-200/70 px-5 py-4">
            <div className="min-w-0 space-y-1">
              <Dialog.Title className="truncate text-[15px] font-semibold text-ink-900">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="text-[13px] text-ink-500">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="iconSm" aria-label="Fechar">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-ink-200/70 bg-ink-50/50 px-5 py-3.5">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
