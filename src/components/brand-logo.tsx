import { cn } from "@/lib/utils";

type BrandLogoProps = {
  compact?: boolean;
  className?: string;
};

export function BrandLogo({ compact = false, className }: BrandLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <BrandMark className="size-9 shrink-0" />
      {!compact && (
        <span className="leading-none">
          <span className="block text-sm font-extrabold tracking-[-0.02em]">
            Calculadora
          </span>
          <span className="mt-1 block text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            de sueldo
          </span>
        </span>
      )}
    </span>
  );
}

function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 48 48"
      fill="none"
    >
      <rect width="48" height="48" rx="14" fill="var(--primary)" />
      <path
        d="M14 11.5h16.5a4 4 0 0 1 4 4V36l-4-2.5-4 2.5-4-2.5-4 2.5-4.5-2.75V11.5Z"
        fill="var(--primary-foreground)"
      />
      <path
        d="M19 19h10M19 24h6.5"
        stroke="var(--primary)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="m25.5 28.5 2.5 2 5-6"
        stroke="var(--primary)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
