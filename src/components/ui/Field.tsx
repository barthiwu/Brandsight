import { forwardRef } from "react";
import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from "react";

const baseInputClasses =
  "w-full rounded-lg border border-(--color-border) bg-white px-3.5 py-2.5 text-sm text-(--color-text) placeholder:text-(--color-text-secondary) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--color-blue) disabled:bg-slate-50 disabled:text-slate-400";

interface FieldWrapperProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  description?: string;
  error?: string;
  children: ReactNode;
}

export function FieldWrapper({ label, htmlFor, required, description, error, children }: FieldWrapperProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-(--color-text)">
        {label}
        {required && (
          <span className="text-(--color-danger)" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>
      {description && <p className="text-xs text-(--color-text-secondary)">{description}</p>}
      {children}
      {error && (
        <p role="alert" className="text-xs font-medium text-(--color-danger)">
          {error}
        </p>
      )}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  description?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, description, id, required, className = "", ...props }, ref) => {
    const fieldId = id ?? props.name ?? label;
    return (
      <FieldWrapper label={label} htmlFor={fieldId} required={required} description={description} error={error}>
        <input
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={!!error}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          className={`${baseInputClasses} ${error ? "border-(--color-danger)" : ""} ${className}`}
          {...props}
        />
      </FieldWrapper>
    );
  }
);
Input.displayName = "Input";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  description?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, description, id, required, className = "", rows = 4, ...props }, ref) => {
    const fieldId = id ?? props.name ?? label;
    return (
      <FieldWrapper label={label} htmlFor={fieldId} required={required} description={description} error={error}>
        <textarea
          ref={ref}
          id={fieldId}
          rows={rows}
          required={required}
          aria-invalid={!!error}
          className={`${baseInputClasses} resize-y ${error ? "border-(--color-danger)" : ""} ${className}`}
          {...props}
        />
      </FieldWrapper>
    );
  }
);
Textarea.displayName = "Textarea";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  description?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, description, id, required, options, placeholder, className = "", ...props }, ref) => {
    const fieldId = id ?? props.name ?? label;
    return (
      <FieldWrapper label={label} htmlFor={fieldId} required={required} description={description} error={error}>
        <select
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={!!error}
          className={`${baseInputClasses} ${error ? "border-(--color-danger)" : ""} ${className}`}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </FieldWrapper>
    );
  }
);
Select.displayName = "Select";
