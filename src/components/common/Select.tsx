import type { SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectOption {
    value: string;
    label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    error?: string;
    hint?: string;
    options: SelectOption[];
}

export const Select = ({ label, error, hint, options, className = '', ...props }: SelectProps) => {
    return (
        <div className="flex flex-col gap-1 w-full">
            {label && <label className="text-sm font-medium text-text-main">{label}</label>}
            <div className="relative">
                <select
                    className={`w-full px-3 py-2.5 border rounded-lg appearance-none bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${error ? 'border-red-500' : 'border-gray-300'
                        } ${className}`}
                    {...props}
                >
                    <option value="" disabled>Select {label}</option>
                    {options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>
            {error && <span className="text-xs text-red-500">{error}</span>}
            {!error && hint && <span className="text-xs text-text-muted italic">{hint}</span>}
        </div>
    );
};
