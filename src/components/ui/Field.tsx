"use client";

import { forwardRef, useState } from "react";
import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from "react";

const baseInputClasses =
  "w-full rounded-lg border border-(--color-border) bg-(--color-surface) px-3.5 py-2.5 text-sm text-(--color-text) placeholder:text-(--color-text-secondary) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--color-blue) disabled:bg-(--color-bg) disabled:text-(--color-text-secondary)";

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
  ({ label, error, description, id, required, type, className = "", ...props }, ref) => {
    const fieldId = id ?? props.name ?? label;
    // Every password field in the app (login, signup, reset-password) goes
    // through this one shared component, so the show/hide toggle is added
    // here rather than in each form — it covers every current password
    // field and any future one automatically, with no per-form wiring.
    const isPassword = type === "password";
    const [revealed, setRevealed] = useState(false);

    const inputEl = (
      <input
        ref={ref}
        id={fieldId}
        type={isPassword ? (revealed ? "text" : "password") : type}
        required={required}
        aria-invalid={!!error}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        className={`${baseInputClasses} ${isPassword ? "pr-11" : ""} ${error ? "border-(--color-danger)" : ""} ${className}`}
        {...props}
      />
    );

    return (
      <FieldWrapper label={label} htmlFor={fieldId} required={required} description={description} error={error}>
        {isPassword ? (
          <div className="relative">
            {inputEl}
            <button
              type="button"
              onClick={() => setRevealed((prev) => !prev)}
              disabled={props.disabled}
              aria-label={revealed ? "Hide password" : "Show password"}
              title={revealed ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-(--color-text-secondary) hover:text-(--color-text) disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--color-blue)"
            >
              {revealed ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        ) : (
          inputEl
        )}
      </FieldWrapper>
    );
  }
);
Input.displayName = "Input";

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M17.94 17.94A10.94 10.94 0 0112 19c-7 0-11-7-11-7a18.5 18.5 0 015.06-5.94M9.9 4.24A10.94 10.94 0 0112 4c7 0 11 7 11 7a18.5 18.5 0 01-2.16 3.19M14.12 14.12a3 3 0 11-4.24-4.24"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

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
