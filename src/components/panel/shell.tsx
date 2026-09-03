"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Book,
  ChevronRight,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  UserCog,
} from "lucide-react";
import { Sidebar } from "./sidebar";
import { CommandPalette } from "./command-palette";
import { NotificationsPopover } from "./notifications-popover";
import { Button } from "@/components/ui/button";
import { Avatar, Tooltip } from "@/components/ui/misc";
import { LiveDot } from "@/components/ui/badge";
import { Menu as DropMenu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { findNavItem, type NavCounters } from "@/lib/navigation";
import type { Permission } from "@/lib/auth/guard";
import { ADMIN_ROLE } from "@/lib/labels";
import type { AdminRole } from "@/lib/types";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "flowdesk:sidebar-collapsed";
const PULSE_INTERVAL = 10_000;

/**
 * A preferência de sidebar vive no localStorage, que é uma fonte externa ao
 * React. Ler por useSyncExternalStore evita o flash de hidratação sem precisar
 * de um efeito que sincronize estado.
 */
const sidebarPreference = {
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    sidebarPreference.listeners.add(listener);
    return () => {
      sidebarPreference.listeners.delete(listener);
    };
  },
  isCollapsed() {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  },
  toggle() {
    window.localStorage.setItem(STORAGE_KEY, sidebarPreference.isCollapsed() ? "0" : "1");
    sidebarPreference.listeners.forEach((listener) => listener());
  },
};

export interface ShellUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  avatar_url: string | null;
}

export function PanelShell({
  user,
  permissions,
  counters,
  children,
}: {
  user: ShellUser;
  permissions: Permission[];
  counters: NavCounters;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const collapsed = React.useSyncExternalStore(
    sidebarPreference.subscribe,
    sidebarPreference.isCollapsed,
    () => false
  );
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [live, setLive] = React.useState(true);

  const toggleCollapsed = React.useCallback(() => sidebarPreference.toggle(), []);

  // atalho global ⌘K / Ctrl+K
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // atualização em tempo real: consulta um "pulso" barato e só re-renderiza quando algo muda
  const lastPulse = React.useRef<string>("");
  React.useEffect(() => {
    if (!live) return;
    let cancelled = false;

    async function tick() {
      try {
        const response = await fetch("/api/admin/pulse", { cache: "no-store" });
        if (!response.ok) return;
        const { signature } = await response.json();
        if (cancelled) return;
        if (lastPulse.current && signature !== lastPulse.current) {
          router.refresh();
        }
        lastPulse.current = signature;
      } catch {
        /* offline: tentaremos de novo no próximo ciclo */
      }
    }

    void tick();
    const interval = setInterval(tick, PULSE_INTERVAL);
    const onFocus = () => void tick();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [live, router]);

  async function manualRefresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 650);
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const current = findNavItem(pathname);

  return (
    <div className="flex min-h-dvh">
      <Sidebar
        permissions={permissions}
        counters={counters}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col transition-[padding] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          collapsed ? "lg:pl-[68px]" : "lg:pl-[248px]"
        )}
      >
        {/* ------------------------------------------------------------ topbar */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-ink-200 bg-white/85 px-4 backdrop-blur-md sm:px-6">
          <Button
            variant="ghost"
            size="iconSm"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu />
          </Button>

          <nav className="hidden min-w-0 items-center gap-1.5 text-[13px] sm:flex" aria-label="Trilha">
            <Link href="/dashboard" className="text-ink-400 transition-colors hover:text-ink-700">
              FlowDesk
            </Link>
            {current && (
              <>
                <ChevronRight className="size-3.5 shrink-0 text-ink-300" />
                <span className="truncate font-medium text-ink-800">{current.label}</span>
              </>
            )}
          </nav>

          <div className="flex-1" />

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className={cn(
              "group flex h-8 items-center gap-2 rounded-lg border border-ink-200 bg-white px-2.5",
              "text-[13px] text-ink-400 transition-colors hover:border-ink-300 hover:text-ink-600",
              "w-9 justify-center sm:w-56 sm:justify-start md:w-64"
            )}
          >
            <Search className="size-4 shrink-0" />
            <span className="hidden flex-1 text-left sm:block">Buscar...</span>
            <kbd className="hidden rounded border border-ink-200 bg-ink-50 px-1.5 font-mono text-[10px] leading-4 sm:block">
              ⌘K
            </kbd>
          </button>

          <Tooltip content={live ? "Atualização automática ativa" : "Atualização automática pausada"}>
            <button
              type="button"
              onClick={() => setLive((v) => !v)}
              className="hidden items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px] font-medium text-ink-500 transition-colors hover:bg-ink-100 md:flex"
            >
              <LiveDot active={live} />
              {live ? "Ao vivo" : "Pausado"}
            </button>
          </Tooltip>

          <Tooltip content="Atualizar agora">
            <Button variant="ghost" size="iconSm" onClick={manualRefresh} aria-label="Atualizar">
              <RefreshCw className={cn(refreshing && "animate-spin")} />
            </Button>
          </Tooltip>

          <NotificationsPopover unread={counters.unreadNotifications} />

          <DropMenu>
            <MenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg p-0.5 pr-1 transition-colors hover:bg-ink-100"
                aria-label="Menu do usuário"
              >
                <Avatar name={user.name} src={user.avatar_url} size="sm" />
                <span className="hidden min-w-0 flex-col items-start leading-tight lg:flex">
                  <span className="max-w-[130px] truncate text-[12.5px] font-medium text-ink-800">
                    {user.name}
                  </span>
                  <span className="text-[10.5px] text-ink-400">{ADMIN_ROLE[user.role].label}</span>
                </span>
              </button>
            </MenuTrigger>
            <MenuContent className="min-w-[230px]">
              <div className="flex items-center gap-3 px-2.5 py-2">
                <Avatar name={user.name} src={user.avatar_url} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink-900">{user.name}</p>
                  <p className="truncate text-[11.5px] text-ink-500">{user.email}</p>
                </div>
              </div>
              <MenuSeparator />
              <MenuLabel>Conta</MenuLabel>
              <MenuItem icon={<UserCog />} asChild>
                <Link href="/configuracoes">Meu perfil</Link>
              </MenuItem>
              <MenuItem icon={<Settings />} asChild>
                <Link href="/configuracoes">Configurações</Link>
              </MenuItem>
              <MenuItem icon={<Book />} asChild>
                <Link href="/documentacao">Documentação da API</Link>
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Sparkles />} onSelect={() => setPaletteOpen(true)} shortcut="⌘K">
                Busca rápida
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={<LogOut />} destructive onSelect={() => void logout()}>
                Sair da conta
              </MenuItem>
            </MenuContent>
          </DropMenu>
        </header>

        {/* ------------------------------------------------------------- main */}
        <main className="surface-app min-h-0 flex-1">
          <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
