"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
}

function normalizeTag(tag: string): string {
  const stripped = tag.replace(/^[#＃]+/, "").trim();
  const compacted = stripped.replace(/\s+/g, " ");
  const limited = compacted.slice(0, 24);
  return limited;
}

export function TagInput({ value = [], onChange, placeholder, maxTags = 10 }: TagInputProps) {
  const [inputValue, setInputValue] = useState("");

  const addTag = (tag: string) => {
    const normalized = normalizeTag(tag);
    if (!normalized || value.length >= maxTags) {
      setInputValue("");
      return;
    }
    const exists = value.some((item) => item.toLowerCase() === normalized.toLowerCase());
    if (exists) {
      setInputValue("");
      return;
    }
    onChange([...value, normalized]);
    setInputValue("");
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === "," || event.key === "Tab") {
      event.preventDefault();
      addTag(inputValue);
    } else if (event.key === "Backspace" && !inputValue && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const handleBlur = () => {
    if (inputValue) {
      addTag(inputValue);
    }
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((item) => item !== tag));
  };

  return (
    <div className="rounded-2xl border border-border/70 bg-muted/30 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary shadow-sm"
          >
            {tag}
            <button
              type="button"
              aria-label="移除标签"
              className="rounded-full p-0.5 text-primary/70 transition-colors hover:text-destructive"
              onClick={() => removeTag(tag)}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {value.length < maxTags && (
          <input
            type="text"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder={value.length === 0 ? placeholder : undefined}
            className={cn(
              "min-w-[120px] flex-1 border-none bg-transparent text-sm text-foreground outline-none",
              "placeholder:text-muted-foreground"
            )}
          />
        )}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        已添加 {value.length}/{maxTags} 个标签
      </div>
    </div>
  );
}
