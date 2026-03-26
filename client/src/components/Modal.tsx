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
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-lg border border-[var(--border)] w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xl">&times;</button>
        </div>
        <div className="px-6 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}

export function FormField({ label, children, required }: { label: string; children: ReactNode; required?: boolean }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-1">
        {label}{required && <span className="text-red-500 ms-1">*</span>}
      </label>
      {children}
    </div>
  );
}

export function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm ${props.className ?? ''}`} />;
}

export function TextArea({ ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm resize-none ${props.className ?? ''}`} />;
}

export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm ${props.className ?? ''}`}>{children}</select>;
}

export function Button({ variant = 'primary', children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const styles = {
    primary: 'bg-[var(--accent)] text-white hover:bg-blue-700',
    secondary: 'bg-white border border-[var(--border)] text-[var(--text-primary)] hover:bg-gray-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };
  return (
    <button {...props} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${styles[variant]} ${props.className ?? ''}`}>
      {children}
    </button>
  );
}
