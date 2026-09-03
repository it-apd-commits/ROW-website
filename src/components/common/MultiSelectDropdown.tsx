import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

interface MultiSelectDropdownProps {
    options: string[];
    selected: string[];
    onChange: (selected: string[]) => void;
    placeholder?: string;
    className?: string;
}

export function MultiSelectDropdown({ options, selected, onChange, placeholder = 'All', className = '' }: MultiSelectDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearchTerm('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = useMemo(
        () => options.filter(o => o.toLowerCase().includes(searchTerm.toLowerCase())),
        [options, searchTerm]
    );

    const toggleOption = (option: string) => {
        onChange(selected.includes(option) ? selected.filter(v => v !== option) : [...selected, option]);
    };

    const summary = selected.length === 0
        ? placeholder
        : selected.length === 1
            ? selected[0]
            : `${selected.length} selected`;

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            <button
                type="button"
                onClick={() => setIsOpen(o => !o)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary flex items-center justify-between gap-2 text-left"
            >
                <span className={`truncate ${selected.length === 0 ? 'text-gray-500' : 'text-text-main'}`}>{summary}</span>
                <ChevronDown size={16} className="text-text-muted shrink-0" />
            </button>

            {isOpen && (
                <div className="absolute z-50 mt-1 w-full min-w-[220px] bg-surface border border-gray-100 rounded-lg shadow-xl overflow-hidden">
                    <div className="relative p-2 border-b border-gray-100">
                        <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            autoFocus
                            placeholder="Search..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-7 pr-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                    </div>
                    <div className="max-h-56 overflow-y-auto py-1">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map(option => (
                                <label
                                    key={option}
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-primary/5 cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected.includes(option)}
                                        onChange={() => toggleOption(option)}
                                        className="rounded border-gray-300 text-primary focus:ring-primary/30"
                                    />
                                    <span className="truncate">{option}</span>
                                </label>
                            ))
                        ) : (
                            <p className="px-3 py-4 text-sm text-gray-400 text-center">No matches</p>
                        )}
                    </div>
                    {selected.length > 0 && (
                        <div className="border-t border-gray-100 p-2 flex justify-between items-center">
                            <span className="text-xs text-gray-400">{selected.length} selected</span>
                            <button
                                type="button"
                                onClick={() => onChange([])}
                                className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                            >
                                <X size={12} /> Clear
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
