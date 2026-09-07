import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
}

export const Input = ({ label, error, className = '', ...props }: InputProps) => {
    return (
        <div className="flex flex-col gap-1">
            {label && (
                <label className="text-sm font-medium text-text-main">
                    {label}{props.required && <span className="text-red-500"> *</span>}
                </label>
            )}
            <input
                className={`px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${error ? 'border-red-500' : 'border-gray-300'
                    } ${className}`}
                {...props}
            />
            {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
    );
};
