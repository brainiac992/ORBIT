import type { ReactNode } from 'react';

export function Modal({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[var(--surface-0)] rounded-2xl border border-[var(--border)] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4 animate-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h3 className="text-base font-semibold text-[var(--text-0)]">{title}</h3>
          <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text-0)] text-xl transition-colors">&times;</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export function FormField({ label, children, required }: { label: string; children: ReactNode; required?: boolean }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-medium text-[var(--text-2)] uppercase tracking-wider mb-1.5">
        {label}{required && <span className="text-red-400 ms-1">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputClass = 'w-full bg-[var(--surface-1)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-0)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--accent)] transition-colors';

export function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function TextArea({ ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClass} resize-none ${props.className ?? ''}`} />;
}

export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${props.className ?? ''}`}>{children}</select>;
}

export function Button({ variant = 'primary', children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  const styles = {
    primary: 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] shadow-lg shadow-indigo-500/20',
    secondary: 'bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] hover:bg-[var(--surface-2)] hover:border-[var(--border-hover)]',
    danger: 'bg-red-600 text-white hover:bg-red-500',
    ghost: 'text-[var(--text-2)] hover:text-[var(--text-0)] hover:bg-[var(--surface-1)]',
  };
  return (
    <button {...props} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed ${styles[variant]} ${props.className ?? ''}`}>
      {children}
    </button>
  );
}
