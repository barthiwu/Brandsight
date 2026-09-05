"use client";

import type { QuestionDefinition } from "@/lib/questions/config";
import { Input, Textarea, Select } from "@/components/ui/Field";

export function QuestionField({
  question,
  value,
  onChange,
}: {
  question: QuestionDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const common = {
    label: question.label,
    description: question.description,
    required: question.required,
    name: question.question_key,
  };

  switch (question.type) {
    case "textarea":
      return (
        <Textarea {...common} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      );
    case "select":
      return (
        <Select
          {...common}
          placeholder="Select one"
          options={question.options ?? []}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "number":
      return (
        <Input
          {...common}
          type="number"
          value={(value as number | string) ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      );
    case "url":
      return (
        <Input
          {...common}
          type="url"
          placeholder="https://"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "boolean":
      return (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-(--color-text)">
            {question.label}
            {question.required && <span className="text-(--color-danger)"> *</span>}
          </legend>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={question.question_key}
                checked={value === true}
                onChange={() => onChange(true)}
              />
              Yes
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={question.question_key}
                checked={value === false}
                onChange={() => onChange(false)}
              />
              No
            </label>
          </div>
        </fieldset>
      );
    case "multiselect":
      return (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-(--color-text)">
            {question.label}
            {question.required && <span className="text-(--color-danger)"> *</span>}
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(question.options ?? []).map((opt) => {
              const selected: string[] = Array.isArray(value) ? (value as string[]) : [];
              const checked = selected.includes(opt.value);
              return (
                <label key={opt.value} className="flex items-center gap-2 text-sm text-(--color-text)">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = checked ? selected.filter((v) => v !== opt.value) : [...selected, opt.value];
                      onChange(next);
                    }}
                    className="h-4 w-4 rounded border-(--color-border)"
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      );
    case "text":
    default:
      return (
        <Input {...common} type="text" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      );
  }
}
