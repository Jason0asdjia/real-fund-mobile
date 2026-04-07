"use client";

import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { ChevronDown } from "lucide-react";

type SelectOption = {
  value: string;
  label: string;
};

type TwSelectProps = {
  id?: string;
  value: string;
  options: SelectOption[];
  onValueChange: (value: string) => void;
  className?: string;
};

export function TwSelect({ id, value, options, onValueChange, className }: TwSelectProps) {
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <Listbox value={value} onChange={onValueChange}>
      <div className={`relative ${className || ""}`}>
        <ListboxButton
          id={id}
          className="flex h-8 w-full items-center justify-between rounded-md border border-[#d5dbea] bg-[#f8f9ff] px-2.5 text-left text-xs font-semibold text-[#24467c] outline-none transition-colors focus:border-[#b8c7ea] data-[open]:border-[#b8c7ea]"
        >
          <span className="truncate">{selected?.label}</span>
          <ChevronDown size={14} className="ml-2 shrink-0 text-[#6f7f9c]" />
        </ListboxButton>

        <ListboxOptions
          anchor="bottom start"
          className="z-30 mt-1 w-[var(--button-width)] rounded-md border border-[#d5dbea] bg-white p-1 shadow-lg outline-none"
        >
          {options.map((option) => (
            <ListboxOption
              key={option.value}
              value={option.value}
              className="cursor-pointer rounded px-2 py-1.5 text-xs font-semibold text-[#24467c] transition-colors data-[focus]:bg-[#f2f3ff]"
            >
              {option.label}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}
