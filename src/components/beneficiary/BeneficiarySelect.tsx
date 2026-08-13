import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import { Search, User, Loader2, X, WifiOff } from 'lucide-react';
import { Card } from '@/components/common/Card';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';

interface Beneficiary {
    id: string;
    name: string;
    file_number: string | null;
    _isOffline?: boolean;
}

interface BeneficiarySelectProps {
    onSelect: (beneficiary: Beneficiary) => void;
    selectedId?: string;
    selectedFileNumber?: string | null;
    placeholder?: string;
    required?: boolean;
}

export function BeneficiarySelect({ onSelect, selectedId, selectedFileNumber, placeholder = "Select Beneficiary (File No / Name)", required = false }: BeneficiarySelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState<Beneficiary[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedBeneficiary, setSelectedBeneficiary] = useState<Beneficiary | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Initial fetch if selectedId or selectedFileNumber is provided
    useEffect(() => {
        if ((selectedId || selectedFileNumber) && !selectedBeneficiary) {
            const fetchSelected = async () => {
                // Try Supabase first
                let query = supabase.from('beneficiaries').select('id, name, file_number');
                if (selectedId) {
                    query = query.eq('id', selectedId);
                } else if (selectedFileNumber) {
                    query = query.eq('file_number', selectedFileNumber);
                }
                const { data, error } = await query.maybeSingle();
                if (!error && data) {
                    setSelectedBeneficiary(data);
                    setSearchTerm(`${data.file_number || 'N/A'} - ${data.name}`);
                    return;
                }

                // Fallback: check Dexie (all sync statuses — covers pending and cached synced records)
                const offline = await db.beneficiaries
                    .filter(b =>
                        b.offline_token === selectedId ||
                        b.offline_token === selectedFileNumber ||
                        (b.file_number != null && b.file_number === selectedFileNumber)
                    )
                    .first();
                if (offline) {
                    const b: Beneficiary = {
                        id: offline.offline_token,
                        name: offline.name,
                        file_number: offline.file_number ?? offline.offline_token,
                        _isOffline: offline.sync_status !== 'synced',
                    };
                    setSelectedBeneficiary(b);
                    setSearchTerm(`${b.file_number || 'N/A'} - ${b.name}`);
                }
            };
            fetchSelected();
        }
    }, [selectedId, selectedFileNumber, selectedBeneficiary]);

    const searchBeneficiaries = useCallback(async (term: string) => {
        if (!term || term.length < 2) {
            setResults([]);
            return;
        }

        setIsLoading(true);
        const lower = term.toLowerCase();
        const isCurrentlyOnline = navigator.onLine;

        // Run Supabase and Dexie searches independently so a Supabase failure
        // never prevents offline/local results from appearing.
        const supabaseSearch = isCurrentlyOnline
            ? Promise.resolve(
                supabase
                    .from('beneficiaries')
                    .select('id, name, file_number')
                    // Use PostgREST `*` wildcard — avoids URL percent-encoding issues
                    // that occur when `%` is used directly in .or() filter strings.
                    .or(`name.ilike.*${term}*,file_number.ilike.*${term}*`)
                    .limit(10)
              ).catch(() => ({ data: [] as Beneficiary[], error: null }))
            : Promise.resolve({ data: [] as Beneficiary[], error: null });

        // Always scan all Dexie records regardless of online status.
        // The previous approach only scanned pending/failed when online, which meant
        // server-pulled records (sync_status: 'synced') were invisible whenever
        // navigator.onLine was true — even with no actual internet (e.g. WiFi at camp).
        const dexieSearch = db.beneficiaries
            .toArray()
            .then(all =>
                all.filter(b =>
                    b.name.toLowerCase().includes(lower) ||
                    (b.offline_token ?? '').toLowerCase().includes(lower) ||
                    (b.file_number != null && b.file_number.toLowerCase().includes(lower))
                )
            )
            .catch(() => []);

        const [supabaseResult, dexieRecords] = await Promise.all([supabaseSearch, dexieSearch]);

        const onlineResults: Beneficiary[] = (supabaseResult.data ?? []) as Beneficiary[];

        // Exclude Dexie records whose server UUID already appears in Supabase results
        // so the same beneficiary never shows twice in the dropdown.
        const supabaseIds = new Set(onlineResults.map(r => r.id));
        const offlineResults: Beneficiary[] = dexieRecords
            .filter(b => !supabaseIds.has(b.id ?? ''))
            .slice(0, 10)
            .map(b => ({
                // Synced records carry the real server UUID in b.id — use it so service
                // entries link to the correct server record after sync.
                id: b.sync_status === 'synced' ? (b.id ?? b.offline_token) : b.offline_token,
                name: b.name,
                file_number: b.file_number ?? b.offline_token,
                _isOffline: b.sync_status !== 'synced',
            }));

        setResults([...onlineResults, ...offlineResults]);
        setIsLoading(false);
    }, []);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (isOpen && searchTerm !== (selectedBeneficiary ? `${selectedBeneficiary.file_number || 'N/A'} - ${selectedBeneficiary.name}` : '')) {
                searchBeneficiaries(searchTerm);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchTerm, searchBeneficiaries, isOpen, selectedBeneficiary]);

    // Live cross-device sync: while the dropdown is open with an active search,
    // refresh results as soon as another device inserts/updates a beneficiary —
    // otherwise a record created elsewhere only appears after retyping.
    useRealtimeSync({
        tables: 'beneficiaries',
        onChange: () => searchBeneficiaries(searchTerm),
        enabled: isOpen && searchTerm.length >= 2,
    });

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (b: Beneficiary) => {
        setSelectedBeneficiary(b);
        setSearchTerm(`${b.file_number || 'N/A'} - ${b.name}`);
        setIsOpen(false);
        onSelect(b);
    };

    const clearSelection = () => {
        setSelectedBeneficiary(null);
        setSearchTerm('');
        setResults([]);
    };

    return (
        <div className="relative w-full" ref={dropdownRef}>
            <label className="text-sm font-semibold text-text-main mb-1.5 block">
                {placeholder}{required && <span className="text-red-500"> *</span>}
            </label>
            <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <Search size={18} />
                </div>
                <input
                    type="text"
                    className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white"
                    placeholder="Search by File Number or Name..."
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                />
                {(searchTerm || selectedBeneficiary) && (
                    <button
                        onClick={clearSelection}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>

            {isOpen && (searchTerm.length >= 2 || results.length > 0) && (
                <Card className="absolute z-50 w-full mt-2 shadow-xl border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="max-h-64 overflow-y-auto">
                        {isLoading ? (
                            <div className="p-4 flex items-center justify-center gap-2 text-text-muted text-sm">
                                <Loader2 size={16} className="animate-spin text-primary" />
                                Searching records...
                            </div>
                        ) : results.length > 0 ? (
                            <div className="divide-y divide-gray-50">
                                {results.map((b) => (
                                    <button
                                        key={b._isOffline ? `offline-${b.id}` : b.id}
                                        className="w-full px-4 py-3 flex items-start gap-3 hover:bg-primary/5 text-left transition-colors group"
                                        onClick={() => handleSelect(b)}
                                    >
                                        <div className={`p-2 rounded-lg transition-colors ${b._isOffline ? 'bg-amber-50 text-amber-500 group-hover:bg-amber-100' : 'bg-gray-50 text-gray-400 group-hover:bg-primary/10 group-hover:text-primary'}`}>
                                            {b._isOffline ? <WifiOff size={18} /> : <User size={18} />}
                                        </div>
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-sm font-bold text-gray-900 group-hover:text-primary transition-colors">
                                                {b.file_number || 'N/A'} - {b.name}
                                            </span>
                                            {b._isOffline ? (
                                                <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200 uppercase tracking-wider self-start">
                                                    Pending Sync
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-gray-400">
                                                    Click to select this beneficiary
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        ) : searchTerm.length >= 2 ? (
                            <div className="p-8 text-center">
                                <Search size={32} className="mx-auto text-gray-200 mb-2" />
                                <p className="text-sm text-text-muted">No beneficiaries found for "{searchTerm}"</p>
                            </div>
                        ) : null}
                    </div>
                </Card>
            )}
        </div>
    );
}
