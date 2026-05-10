interface TabsProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

export function Tabs<T extends string>({ value, options, onChange }: TabsProps<T>) {
  return (
    <div className="flex w-full rounded-xl border border-line-subtle bg-bg-surface p-1">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`flex-1 rounded-lg px-3 py-1.5 text-body font-medium transition-colors ${
            value === option.value
              ? 'bg-accent-primary/15 text-accent-primary'
              : 'text-ink-secondary hover:text-ink-primary'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
