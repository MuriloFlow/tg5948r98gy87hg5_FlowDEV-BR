import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/misc";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono-code",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "FlowDesk — Payment API & Billing",
    template: "%s · FlowDesk",
  },
  description:
    "Plataforma de cobrança recorrente, payment links e controle de acesso por inadimplência para projetos integrados.",
  applicationName: "FlowDesk",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${mono.variable} h-full`}>
      <body className="min-h-full antialiased">
        <TooltipProvider delayDuration={250} skipDelayDuration={400}>
          {children}
        </TooltipProvider>
        <Toaster
          position="bottom-right"
          closeButton
          richColors
          toastOptions={{
            classNames: {
              toast:
                "!rounded-xl !border !border-ink-200 !bg-white !text-ink-800 !shadow-[var(--shadow-pop)]",
              description: "!text-ink-500",
            },
          }}
        />
      </body>
    </html>
  );
}
