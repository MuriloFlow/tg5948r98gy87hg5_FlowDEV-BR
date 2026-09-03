import { PanelShell } from "@/components/panel/shell";
import { requireUser } from "@/lib/auth/guard";
import { permissionsFor } from "@/lib/auth/guard";
import { getNavCounters } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const counters = await getNavCounters();

  return (
    <PanelShell
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar_url: user.avatar_url,
      }}
      permissions={permissionsFor(user.role)}
      counters={counters}
    >
      {children}
    </PanelShell>
  );
}
