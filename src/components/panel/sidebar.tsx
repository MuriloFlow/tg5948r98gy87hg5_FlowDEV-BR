"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { Logo, LogoMark } from "@/components/brand/logo";
import { Tooltip } from "@/components/ui/misc";
import { NAVIGATION, type NavCounters } from "@/lib/navigation";
import type { Permission } from "@/lib/auth/guard";
import { cn } from "@/lib/utils";

export function Sidebar({
  permissions,
  counters,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onMobileClose,
}: {
  permissions: Permission[];
  counters: NavCounters;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const pathname = usePathname();

  React.useEffect(() => {
    onMobileClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const groups = React.useMemo(
    () =>
      NAVIGATION.map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => !item.permission || permissions.includes(item.permission)
        ),
      })).filter((group) => group.items.length > 0),
    [permissions]
  );

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink-900/25 backdrop-blur-[2px] animate-fade-in lg:hidden"
          onClick={onMobileClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-ink-200 bg-white",
          "transition-[width,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          collapsed ? "w-[68px]" : "w-[248px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div
          className={cn(
            "flex h-14 shrink-0 items-center border-b border-ink-200/70",
            collapsed ? "justify-center px-2" : "justify-between px-4"
          )}
        >
          <Link href="/dashboard" className="flex min-w-0 items-center">
            {collapsed ? <LogoMark className="size-7" /> : <Logo />}
          </Link>
          {!collapsed && (
            <button
              type="button"
              onClick={onMobileClose}
              className="rounded-md p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 lg:hidden"
              aria-label="Fechar menu"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <nav className="scrollbar-thin flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-3">
          {groups.map((group) => (
            <div key={group.label} className="mb-4 last:mb-0">
              {!collapsed ? (
                <p className="mb-1 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.11em] text-ink-400">
                  {group.label}
                </p>
              ) : (
                <div className="mx-2 mb-2 h-px bg-ink-200" />
              )}

              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const badge = item.badgeKey ? counters[item.badgeKey] : 0;
                  const Icon = item.icon;
                  const alert = item.badgeKey === "overdue" || item.badgeKey === "blocked";

                  const link = (
                    <Link
                      href={item.href}
                      className={cn(
                        "group relative flex items-center gap-2.5 rounded-lg text-[13px] font-medium",
                        "transition-colors duration-150",
                        collapsed ? "justify-center px-0 py-2" : "px-2.5 py-2",
                        active
                          ? "bg-brand-50 text-brand-700"
                          : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                      )}
                    >
                      {active && (
                        <span
                          className="absolute left-0 top-1/2 h-4.5 w-0.5 -translate-y-1/2 rounded-r-full bg-brand-500"
                          aria-hidden
                        />
                      )}
                      <Icon
                        className={cn(
                          "size-4 shrink-0 transition-colors",
                          active ? "text-brand-600" : "text-ink-400 group-hover:text-ink-600"
                        )}
                      />
                      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                      {!collapsed && badge > 0 && (
                        <span
                          className={cn(
                            "min-w-[18px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold tabular",
                            alert ? "bg-rose-100 text-rose-700" : "bg-brand-100 text-brand-700"
                          )}
                        >
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                      {collapsed && badge > 0 && (
                        <span
                          className={cn(
                            "absolute right-1.5 top-1.5 size-1.5 rounded-full",
                            alert ? "bg-rose-500" : "bg-brand-500"
                          )}
                        />
                      )}
                    </Link>
                  );

                  return (
                    <li key={item.href}>
                      {collapsed ? (
                        <Tooltip content={item.label} side="right">
                          {link}
                        </Tooltip>
                      ) : (
                        link
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-ink-200/70 p-2.5">
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={cn(
              "hidden w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] font-medium text-ink-500",
              "transition-colors hover:bg-ink-100 hover:text-ink-800 lg:flex",
              collapsed && "justify-center px-0"
            )}
          >
            {collapsed ? (
              <ChevronsRight className="size-4" />
            ) : (
              <>
                <ChevronsLeft className="size-4" />
                Recolher menu
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
