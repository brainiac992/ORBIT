export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <span className="absolute inset-y-0 start-3 flex items-center pointer-events-none text-[var(--text-3)] text-sm">
        &#128269;
      </span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[var(--surface-1)] border border-[var(--border)] rounded-xl ps-8 pe-8 py-2 text-sm text-[var(--text-0)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--accent)] transition-colors"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute inset-y-0 end-2 flex items-center text-[var(--text-3)] hover:text-[var(--text-0)] px-1 text-xs"
          aria-label="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  );
}
