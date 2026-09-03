"use client";

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Slottable } from "@radix-ui/react-slot";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({
  className,
  align = "end",
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[200px] overflow-hidden rounded-xl border border-ink-200 bg-white p-1.5",
          "shadow-[var(--shadow-pop)]",
          "data-[state=open]:animate-[scale-in_0.14s_cubic-bezier(0.16,1,0.3,1)]",
          className
        )}
        {...props}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

export function MenuItem({
  className,
  destructive,
  icon,
  shortcut,
  asChild,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenu.Item> & {
  destructive?: boolean;
  icon?: React.ReactNode;
  shortcut?: string;
}) {
  const shortcutNode = shortcut ? (
    <span className="text-[11px] text-ink-400">{shortcut}</span>
  ) : null;

  return (
    <DropdownMenu.Item
      asChild={asChild}
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] outline-none",
        "transition-colors duration-100 [&_svg]:size-4 [&_svg]:shrink-0",
        destructive
          ? "text-rose-600 data-[highlighted]:bg-rose-50"
          : "text-ink-700 data-[highlighted]:bg-ink-100 data-[highlighted]:text-ink-900",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
        className
      )}
      {...props}
    >
      {icon}
      {/* Com `asChild` o Radix usa Slot, que exige um único filho: o Slottable
          marca qual deles recebe o ícone e o atalho como conteúdo interno. */}
      {asChild ? (
        <Slottable>{children}</Slottable>
      ) : (
        <span className="flex-1 truncate">{children}</span>
      )}
      {shortcutNode}
    </DropdownMenu.Item>
  );
}

export function MenuCheckboxItem({
  checked,
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenu.CheckboxItem>) {
  return (
    <DropdownMenu.CheckboxItem
      checked={checked}
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-lg py-2 pl-8 pr-2.5 text-[13px] text-ink-700 outline-none",
        "relative transition-colors duration-100 data-[highlighted]:bg-ink-100",
        className
      )}
      {...props}
    >
      <DropdownMenu.ItemIndicator className="absolute left-2.5">
        <Check className="size-3.5 text-brand-600" />
      </DropdownMenu.ItemIndicator>
      {children}
    </DropdownMenu.CheckboxItem>
  );
}

export function MenuSeparator({ className }: { className?: string }) {
  return <DropdownMenu.Separator className={cn("my-1.5 h-px bg-ink-200", className)} />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenu.Label className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
      {children}
    </DropdownMenu.Label>
  );
}
