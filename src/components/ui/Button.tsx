import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-(--color-blue) text-white hover:bg-(--color-blue-hover) disabled:bg-slate-300",
  secondary:
    "bg-(--color-surface) text-(--color-text) border border-(--color-border) hover:bg-(--color-bg) disabled:text-(--color-text-secondary)",
  ghost: "bg-transparent text-(--color-text) hover:bg-(--color-bg) disabled:text-(--color-text-secondary)",
  danger: "bg-(--color-danger) text-white hover:bg-red-700 disabled:bg-red-200",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "text-sm px-3 py-1.5 rounded-md",
  md: "text-sm px-4 py-2.5 rounded-lg",
  lg: "text-base px-6 py-3 rounded-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", isLoading, className = "", children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-blue) ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
        aria-busy={isLoading || undefined}
        {...props}
      >
        {isLoading && (
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
