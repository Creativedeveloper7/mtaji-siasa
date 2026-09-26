import { forwardRef, type ButtonHTMLAttributes } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-ink-inverse hover:bg-accent-hover shadow-glow font-medium",
  secondary:
    "bg-surface text-ink border border-border-strong hover:bg-surface-hover hover:border-border-strong",
  ghost: "bg-transparent text-ink-muted hover:text-ink hover:bg-surface",
  outline:
    "bg-transparent text-ink border border-border-strong hover:border-accent/50 hover:text-accent",
  danger: "bg-error/15 text-error border border-error/30 hover:bg-error/25",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-small gap-1.5 rounded-md",
  md: "h-11 px-5 text-small gap-2 rounded-md",
  lg: "h-12 px-6 text-body gap-2 rounded-md",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  href?: string;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      href,
      fullWidth,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const classes = cn(
      "inline-flex items-center justify-center transition-all duration-fast ease-premium",
      "disabled:pointer-events-none disabled:opacity-40",
      variants[variant],
      sizes[size],
      fullWidth && "w-full",
      className
    );

    if (href && !disabled) {
      const external = href.startsWith("http") || href.startsWith("mailto:");
      if (external) {
        return (
          <a href={href} className={classes} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
      }
      return (
        <Link href={href} className={classes}>
          {children}
        </Link>
      );
    }

    return (
      <button ref={ref} className={classes} disabled={disabled} {...props}>
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
