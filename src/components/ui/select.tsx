"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const triggerBase = [
  "flex h-9.5 w-full items-center justify-between gap-2 rounded-lg bg-white px-3 text-sm text-ink-900",
  "ring-1 ring-inset ring-ink-200 transition-[box-shadow,border-color] duration-150",
  "hover:ring-ink-300",
  "focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-0",
  "disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400",
  "aria-[invalid=true]:ring-rose-400 aria-[invalid=true]:focus:ring-rose-500",
  "data-[placeholder]:text-ink-400",
].join(" ");

type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

function optionsFromChildren(children: React.ReactNode): SelectOption[] {
  const options: SelectOption[] = [];

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<{ value?: string; disabled?: boolean; children?: React.ReactNode }>(
      child
    )) {
      return;
    }
    if (child.type !== "option") return;

    options.push({
      value: String(child.props.value ?? ""),
      label: String(child.props.children ?? "").trim() || String(child.props.value ?? ""),
      disabled: child.props.disabled,
    });
  });

  return options;
}

function placeholderFromOptions(options: SelectOption[]): string {
  const empty = options.find((option) => option.value === "");
  return empty?.label || "Selecione…";
}

function selectableOptions(options: SelectOption[]): SelectOption[] {
  return options.filter((option) => option.value !== "");
}

/** Select estilizado — substitui o `<select>` nativo em todo o painel. */
export const NativeSelect = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ComponentProps<typeof SelectPrimitive.Root>, "value" | "defaultValue" | "onValueChange"> & {
    name?: string;
    id?: string;
    invalid?: boolean;
    className?: string;
    value?: string;
    defaultValue?: string;
    onChange?: React.ChangeEventHandler<HTMLSelectElement>;
    children?: React.ReactNode;
  }
>(
  (
    {
      name,
      id,
      invalid,
      className,
      value,
      defaultValue,
      onChange,
      disabled,
      required,
      children,
      ...rootProps
    },
    ref
  ) => {
    const options = React.useMemo(() => optionsFromChildren(children), [children]);
    const placeholder = React.useMemo(() => placeholderFromOptions(options), [options]);
    const items = React.useMemo(() => selectableOptions(options), [options]);

    const isControlled = value !== undefined;
    const [uncontrolled, setUncontrolled] = React.useState(defaultValue ?? "");
    const selected = isControlled ? value : uncontrolled;

    const emitChange = React.useCallback(
      (next: string) => {
        if (!isControlled) setUncontrolled(next);
        onChange?.({
          target: { value: next },
          currentTarget: { value: next },
        } as React.ChangeEvent<HTMLSelectElement>);
      },
      [isControlled, onChange]
    );

    const label =
      items.find((option) => option.value === selected)?.label ??
      (selected ? selected : undefined);

    return (
      <>
        {name ? <input type="hidden" name={name} value={selected} required={required} /> : null}
        <SelectPrimitive.Root
          {...rootProps}
          value={selected || undefined}
          onValueChange={emitChange}
          disabled={disabled}
          required={required}
        >
          <SelectPrimitive.Trigger
            ref={ref}
            id={id}
            aria-invalid={invalid || undefined}
            className={cn(triggerBase, className)}
          >
            <SelectPrimitive.Value placeholder={placeholder}>{label}</SelectPrimitive.Value>
            <SelectPrimitive.Icon asChild>
              <ChevronDown className="size-4 shrink-0 text-ink-400" aria-hidden />
            </SelectPrimitive.Icon>
          </SelectPrimitive.Trigger>

          <SelectPrimitive.Portal>
            <SelectPrimitive.Content
              position="popper"
              sideOffset={6}
              className={cn(
                "z-[100] max-h-[min(320px,50vh)] overflow-hidden rounded-xl border border-ink-200 bg-white",
                "shadow-[var(--shadow-pop)]",
                "data-[state=open]:animate-[scale-in_0.14s_cubic-bezier(0.16,1,0.3,1)]"
              )}
            >
              <SelectPrimitive.Viewport className="p-1.5">
                {items.map((option) => (
                  <SelectPrimitive.Item
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    className={cn(
                      "relative flex cursor-pointer select-none items-center rounded-lg py-2 pl-8 pr-3 text-[13px] text-ink-800 outline-none",
                      "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
                      "data-[highlighted]:bg-brand-50 data-[highlighted]:text-brand-800",
                      "data-[state=checked]:font-medium data-[state=checked]:text-brand-700"
                    )}
                  >
                    <span className="absolute left-2.5 flex size-4 items-center justify-center">
                      <SelectPrimitive.ItemIndicator>
                        <Check className="size-3.5 text-brand-600" />
                      </SelectPrimitive.ItemIndicator>
                    </span>
                    <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.Viewport>
            </SelectPrimitive.Content>
          </SelectPrimitive.Portal>
        </SelectPrimitive.Root>
      </>
    );
  }
);
NativeSelect.displayName = "NativeSelect";
