import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id="fd-mark" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7A73FF" />
          <stop offset="0.55" stopColor="#635BFF" />
          <stop offset="1" stopColor="#00D4B1" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#fd-mark)" />
      <path
        d="M10 10.5h12M10 16h8.5M10 21.5h5.5"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="22.5" cy="21.5" r="2.6" fill="white" fillOpacity="0.9" />
    </svg>
  );
}

export function Logo({
  className,
  showWordmark = true,
  subtitle,
}: {
  className?: string;
  showWordmark?: boolean;
  subtitle?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      {showWordmark && (
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink-900">
            FlowDesk
          </span>
          {subtitle && (
            <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-ink-400">
              {subtitle}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
