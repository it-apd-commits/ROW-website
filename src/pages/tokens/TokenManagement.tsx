import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { DailyTokenService, type DailyToken } from '@/services/dailyTokenService';
import { findOrCreateBeneficiary, type BeneficiaryCandidate } from '@/services/beneficiaryService';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { nameMatchesSearch } from '@/utils/fuzzySearch';
import {
    Users,
    UserPlus,
    Search,
    Printer,
    RefreshCw,
    CheckCircle,
    XCircle,
    Download,
} from 'lucide-react';

interface Beneficiary {
    id: string;
    name: string;
    mobile_no: string;
    district: string;
    city: string;
}

const formatLocalDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function TokenManagementPage() {
    const { role } = useAuth();
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
    const [selectedBen, setSelectedBen] = useState<Beneficiary | null>(null);

    // Modal State
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [generatedToken, setGeneratedToken] = useState<DailyToken | null>(null);

    // Candidate confirmation modal (when name matches existing beneficiaries)
    const [candidateMatches, setCandidateMatches] = useState<BeneficiaryCandidate[]>([]);
    const [showCandidateModal, setShowCandidateModal] = useState(false);

    const getTodayStr = () => formatLocalDate(new Date());

    const getTimeStr = () => {
        const d = new Date();
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    // Form State
    const [formData, setFormData] = useState({
        beneficiaryName: '',
        phone: '',
        center: '',
        date: getTodayStr(),
        time: getTimeStr()
    });

    const [filterDate, setFilterDate] = useState(getTodayStr());
    const [filterCenter, setFilterCenter] = useState('All Centers');
    const [availableCenters, setAvailableCenters] = useState<string[]>([]);
    const [isShowingAll, setIsShowingAll] = useState(false);
    const [viewMode, setViewMode] = useState<'Day' | 'Month'>('Day');

    const [tokens, setTokens] = useState<DailyToken[]>([]);
    const [dailyStats, setDailyStats] = useState({
        total: 0,
        waiting: 0,
        completed: 0
    });

    // Determine if user can change center
    const canChangeCenter = role === 'Admin';

    // Scheduled locations from monthly_schedules
    const [scheduledLocations, setScheduledLocations] = useState<string[]>([]);

    const fetchCenters = useCallback(async () => {
        try {
            const dateObj = new Date(filterDate);
            if (isNaN(dateObj.getTime())) return;

            const year = dateObj.getFullYear();
            const month = dateObj.getMonth() + 1; // 1-indexed for DB

            // Fetch scheduled locations from monthly_schedules
            const { data: schedules } = await supabase
                .from('monthly_schedules')
                .select('location_name')
                .eq('month', month)
                .eq('year', year)
                .eq('is_active', true);

            if (schedules) {
                const uniqueMap = new Map<string, string>();
                schedules.forEach(s => {
                    const name = s.location_name?.trim();
                    if (name && !uniqueMap.has(name.toLowerCase())) {
                        uniqueMap.set(name.toLowerCase(), name);
                    }
                });
                const sorted = Array.from(uniqueMap.values()).sort();
                setScheduledLocations(sorted);

                // Auto-select first scheduled location if center is empty
                if (!formData.center && sorted.length > 0) {
                    setFormData(prev => ({ ...prev, center: sorted[0] }));
                }
            }

            // Also fetch centers already used in tokens this month (for filter dropdown)
            const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
            const lastDay = formatLocalDate(new Date(year, month, 0));

            const { data: tokenCenters } = await supabase
                .from('tokens')
                .select('center_name')
                .gte('date', firstDay)
                .lte('date', lastDay);

            if (tokenCenters) {
                const uniqueMap = new Map<string, string>();
                tokenCenters.forEach(t => {
                    const name = t.center_name?.trim();
                    if (name && !uniqueMap.has(name.toLowerCase())) {
                        uniqueMap.set(name.toLowerCase(), name);
                    }
                });
                setAvailableCenters(Array.from(uniqueMap.values()).sort());
            }
        } catch (err) {
            console.error('Error fetching centers:', err);
        }
    }, [filterDate, formData.center]);

    const fetchTokens = useCallback(async () => {
        try {
            let data;
            if (isShowingAll) {
                data = await DailyTokenService.getAllTokens();
            } else {
                // Build dynamic query
                let query = supabase.from('tokens').select('*');

                const dateObj = new Date(filterDate);
                const year = dateObj.getFullYear();
                const month = dateObj.getMonth();

                if (viewMode === 'Month') {
                    const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
                    const lastDay = formatLocalDate(new Date(year, month + 1, 0));
                    query = query.gte('date', firstDay).lte('date', lastDay);
                } else {
                    query = query.eq('date', filterDate);
                }

                if (filterCenter !== 'All Centers') {
                    query = query.eq('center_name', filterCenter);
                }

                const { data: result, error } = await query
                    .order('date', { ascending: false })
                    .order('sequence_number', { ascending: false });

                if (error) throw error;
                data = result;
            }
            setTokens(data || []);

            // Calculate stats
            const stats = {
                total: data?.length || 0,
                waiting: data?.filter(t => t.status === 'Waiting').length || 0,
                completed: data?.filter(t => t.status === 'Completed').length || 0
            };
            setDailyStats(stats);
        } catch (err) {
            console.error('Error fetching tokens:', err);
        }
    }, [filterCenter, filterDate, isShowingAll, viewMode]);

    useEffect(() => {
        // Initial Fetch
        fetchTokens();
        fetchCenters();

        // Fallback poll in case the Realtime channel below misses an event
        // (e.g. a brief disconnect) — Realtime is the primary refresh path.
        const interval = setInterval(fetchTokens, 30000);
        return () => clearInterval(interval);
    }, [fetchTokens, fetchCenters]);

    // Live cross-device sync: another device generating/updating a token
    // shows up in the queue within ~1s instead of waiting for the 30s poll.
    useRealtimeSync({
        tables: 'tokens',
        onChange: fetchTokens,
    });

    const handleSearch = useCallback(async (query: string) => {
        setSearchQuery(query);
        if (query.length < 2) {
            setBeneficiaries([]);
            return;
        }

        // Widen with a short name prefix so typo'd names (e.g. "Adib" for
        // "Adeeb") still surface candidates, then trim back to real matches
        // with the fuzzy filter below.
        const prefix = query.slice(0, Math.min(2, query.length));
        const { data, error } = await supabase
            .from('beneficiaries')
            .select('id, name, mobile_no, district, city')
            .or(`name.ilike.%${query}%,mobile_no.ilike.%${query}%,name.ilike.${prefix}%`)
            .limit(20);

        if (!error && data) {
            const matches = data
                .filter(b => nameMatchesSearch(b.name, query) || (b.mobile_no ?? '').includes(query))
                .slice(0, 5);
            setBeneficiaries(matches);
        }
    }, []);

    // Live cross-device sync: refresh the beneficiary search dropdown while
    // it's open so a beneficiary registered on another device is findable
    // immediately, not just after the next keystroke.
    useRealtimeSync({
        tables: 'beneficiaries',
        onChange: () => handleSearch(searchQuery),
        enabled: searchQuery.length >= 2,
    });

    const selectBeneficiary = (b: Beneficiary) => {
        setSelectedBen(b);
        setFormData(prev => ({
            ...prev,
            beneficiaryName: b.name,
            phone: b.mobile_no || '',
        }));
        setBeneficiaries([]);
        setSearchQuery('');
    };

    const createTokenForBeneficiary = async (beneficiaryId: string, beneficiaryName: string, phone: string) => {
        const newToken = await DailyTokenService.createToken({
            center_name: formData.center,
            beneficiary_name: beneficiaryName,
            beneficiary_id: beneficiaryId,
            phone_number: phone,
            date: formData.date,
            time: formData.time
        });

        if (newToken) {
            if (filterDate === formData.date && (filterCenter === 'All Centers' || filterCenter === formData.center)) {
                await fetchTokens();
            }
            fetchCenters();

            setFormData(prev => ({
                ...prev,
                beneficiaryName: '',
                phone: '',
                time: getTimeStr()
            }));
            setSelectedBen(null);

            setGeneratedToken(newToken);
            setShowSuccessModal(true);
        }
    };

    const handleGenerate = async (forceCreate = false) => {
        if (!formData.center) {
            alert('Please select a scheduled area (center)');
            return;
        }
        if (!formData.beneficiaryName) {
            alert('Please enter a beneficiary name');
            return;
        }

        setLoading(true);
        try {
            // If staff already picked a beneficiary from the search dropdown,
            // skip matching entirely and use that id.
            if (selectedBen && !forceCreate) {
                await createTokenForBeneficiary(selectedBen.id, selectedBen.name, formData.phone);
                return;
            }

            const result = await findOrCreateBeneficiary({
                name: formData.beneficiaryName,
                phone: formData.phone,
                city: formData.center,
                forceCreate,
            });

            if (result.matchType === 'needs_confirmation' && result.candidates) {
                setCandidateMatches(result.candidates);
                setShowCandidateModal(true);
                return;
            }

            if (result.beneficiary) {
                await createTokenForBeneficiary(
                    result.beneficiary.id,
                    result.beneficiary.name,
                    formData.phone || result.beneficiary.mobile_no || ''
                );
            }
        } catch (err) {
            console.error(err);
            alert('Error generating token. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const confirmCandidate = async (candidate: BeneficiaryCandidate) => {
        setShowCandidateModal(false);
        setCandidateMatches([]);
        setLoading(true);
        try {
            await createTokenForBeneficiary(
                candidate.id,
                candidate.name,
                formData.phone || candidate.mobile_no || ''
            );
        } catch (err) {
            console.error(err);
            alert('Error generating token. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const createAsNewAnyway = async () => {
        setShowCandidateModal(false);
        setCandidateMatches([]);
        await handleGenerate(true);
    };

    const printToken = (token: DailyToken) => {
        const printWindow = window.open('', '_blank', 'width=400,height=600');
        if (!printWindow) {
            alert('Please allow popups to print the token.');
            return;
        }

        const html = `
            <html>
            <head>
                <title>Print Token</title>
                <style>
                    body { font-family: sans-serif; text-align: center; padding: 15px; color: #333; margin: 0; }
                    .receipt-header { position: relative; text-align: center; margin-bottom: 15px; min-height: 100px; padding-right: 70px; }
                    .org-name { font-size: 13px; font-weight: bold; margin-bottom: 4px; line-height: 1.2; text-align: center; }
                    .org-address { font-size: 9px; color: #666; margin-bottom: 6px; line-height: 1.3; text-align: center; }
                    .brand-name { font-size: 13px; font-weight: bold; color: #0d9488; margin-bottom: 10px; text-align: center; }
                    .logo-img { position: absolute; top: 0; right: 0; width: 65px; height: auto; }
                    .center-name { font-size: 14px; border-top: 1px dashed #ccc; padding-top: 10px; margin-bottom: 15px; text-align: center; font-weight: bold; }
                    .token-no { font-size: 44px; font-weight: bold; margin: 5px 0; border: 3px solid #000; padding: 10px 20px; display: inline-block; font-family: 'Courier New', monospace; background: #fff; }
                    .details { text-align: left; margin: 15px auto; width: 95%; font-size: 13px; line-height: 1.5; border-top: 1px solid #eee; padding-top: 10px; }
                    .footer { margin-top: 25px; font-style: italic; font-size: 11px; color: #666; }
                    @media print {
                        @page { margin: 0; size: 80mm auto; }
                        body { padding: 5mm; }
                        .print-btn { display: none; }
                    }
                    .print-btn {
                        margin-top: 15px;
                        padding: 8px 16px;
                        background: #0d9488;
                        color: #fff;
                        border: none;
                        cursor: pointer;
                        font-size: 14px;
                        border-radius: 6px;
                        font-weight: bold;
                    }
                </style>
            </head>
            <body>
                <div class="receipt-header">
                    <div class="org-name">THE ASSOCIATION OF PEOPLE WITH DISABILITY</div>
                    <div class="org-address">6th Cross Road, Horamavu Agara Road, Off, Hutchins Rd, St Thomas Town, Lingarajapuram, Bengaluru, Karnataka 560084</div>
                    <div class="brand-name">REHAB ON WHEELS</div>
                    <img src="/logo.jpg" class="logo-img" onerror="this.style.display='none'" />
                </div>
                
                <div class="center-name">Center: ${token.center_name}</div>
                
                <div class="token-no">${token.token_number}</div>
                
                <div class="details">
                    <div><strong>Date:</strong> ${token.date}</div>
                    <div><strong>Time:</strong> ${token.time ? token.time.split('.')[0] : '-'}</div>
                    <div style="margin-top: 8px; border-top: 1px dashed #eee; padding-top: 8px;">
                        <div><strong>Name:</strong> ${token.beneficiary_name}</div>
                        <div><strong>Phone:</strong> ${token.phone_number || '-'}</div>
                    </div>
                </div>

                <div class="footer">Please wait for your turn</div>
                
                <button class="print-btn" onclick="window.print()">Print Slip</button>

                <script>
                    setTimeout(function() {
                        // Optional: window.print();
                    }, 500);
                </script>
            </body>
            </html>
        `;

        printWindow.document.write(html);
        printWindow.document.close();
    };

    const handleDownload = (token: DailyToken) => {
        const text = `
----------------------------
  REHAB ON WHEELS (ROW)
----------------------------
Center: ${token.center_name}
Token No: ${token.token_number}
Date: ${token.date}
Time: ${token.time}
Name: ${token.beneficiary_name}
Phone: ${token.phone_number || '-'}
----------------------------
        `;
        const element = document.createElement("a");
        const file = new Blob([text], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = `Token-${token.token_number}.txt`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    const updateStatus = async (id: string, status: 'Waiting' | 'Completed' | 'Skipped') => {
        await DailyTokenService.updateStatus(id, status);
        fetchTokens();
    };

    const currentServing = tokens
        .filter(t => t.status === 'Waiting')
        .reduce<DailyToken | undefined>((min, t) => (!min || t.sequence_number < min.sequence_number ? t : min), undefined);

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900">Token Management</h1>
                <p className="text-gray-500">Manage daily tokens and queue</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-w-0">
                {/* 1. Generation Form */}
                <div className="lg:col-span-1 space-y-6 min-w-0">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h2 className="text-xl font-semibold mb-4 text-primary flex items-center gap-2">
                            <RefreshCw size={20} /> Generate Token
                        </h2>

                        <div className="space-y-4">
                            {/* Center Selection — from scheduled areas */}
                            <div>
                                <label className="block text-sm font-medium mb-1">Center Name</label>
                                <select
                                    className={`w-full p-2 border rounded-lg outline-none transition-all ${canChangeCenter
                                        ? 'focus:ring-2 focus:ring-primary/20 focus:border-primary'
                                        : 'bg-gray-100 cursor-not-allowed'
                                        }`}
                                    value={formData.center}
                                    onChange={(e) => setFormData({ ...formData, center: e.target.value })}
                                    disabled={!canChangeCenter}
                                >
                                    <option value="" disabled>Select Scheduled Area</option>
                                    {scheduledLocations.map(loc => (
                                        <option key={loc} value={loc}>{loc}</option>
                                    ))}
                                </select>
                                {scheduledLocations.length === 0 && (
                                    <p className="text-[10px] text-amber-500 mt-1">
                                        No areas scheduled this month. Upload a schedule first.
                                    </p>
                                )}
                                {scheduledLocations.length > 0 && (
                                    <p className="text-[10px] text-gray-400 mt-1 italic">
                                        {scheduledLocations.length} area{scheduledLocations.length !== 1 ? 's' : ''} scheduled this month
                                    </p>
                                )}
                            </div>

                            {/* Beneficiary Search/Select */}
                            <div className="relative">
                                <label className="block text-sm font-medium mb-1">Beneficiary Name *</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        className="w-full p-2 border rounded-lg pr-8"
                                        placeholder="Search or Enter Name"
                                        value={formData.beneficiaryName} // Bind to form data, allows manual edit
                                        onChange={(e) => {
                                            setFormData({ ...formData, beneficiaryName: e.target.value });
                                            handleSearch(e.target.value);
                                        }}
                                    />
                                    <Search className="absolute right-2 top-2.5 text-gray-400" size={16} />
                                </div>
                                {beneficiaries.length > 0 && searchQuery.length >= 2 && (
                                    <div className="absolute z-10 w-full bg-white border rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                                        {beneficiaries.map(b => (
                                            <div
                                                key={b.id}
                                                className="p-2 hover:bg-gray-50 cursor-pointer text-sm"
                                                onClick={() => selectBeneficiary(b)}
                                            >
                                                <div className="font-medium">{b.name}</div>
                                                <div className="text-xs text-gray-500">{b.mobile_no} | {b.city}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Phone */}
                            <div>
                                <label className="block text-sm font-medium mb-1">Phone Number</label>
                                <input
                                    type="text"
                                    className="w-full p-2 border rounded-lg"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                />
                            </div>

                            {/* Date and Time */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="min-w-0">
                                    <label className="block text-sm font-medium mb-1">Date</label>
                                    <input
                                        type="date"
                                        className="w-full min-w-0 p-2 border rounded-lg text-sm"
                                        value={formData.date}
                                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                    />
                                </div>
                                <div className="min-w-0">
                                    <label className="block text-sm font-medium mb-1">Time</label>
                                    <input
                                        type="time"
                                        className="w-full min-w-0 p-2 border rounded-lg text-sm"
                                        value={formData.time}
                                        onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                                    />
                                </div>
                            </div>

                            <button
                                onClick={() => handleGenerate()}
                                disabled={loading}
                                className="w-full bg-primary text-white py-2 rounded-lg hover:bg-primary-dark transition-colors flex items-center justify-center gap-2"
                            >
                                {loading ? 'Generating...' : 'Generate & Print'}
                            </button>

                            <Link
                                to="/beneficiary/add"
                                className="w-full mt-3 border border-primary text-primary py-2 rounded-lg hover:bg-primary hover:text-white transition-colors flex items-center justify-center gap-2"
                            >
                                <UserPlus size={16} />
                                Add Beneficiary
                            </Link>
                        </div>
                    </div>

                    {/* Dashboard Stats */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 text-center">
                            <div className="text-3xl font-bold text-gray-900">{dailyStats.total}</div>
                            <div className="text-[10px] text-gray-500 uppercase font-bold text-center">
                                Total {isShowingAll ? '(Recent 100)' : (viewMode === 'Month' ? '(Month)' : '(Day)')}
                            </div>
                        </div>
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 text-center leading-tight">
                            <div className="text-3xl font-bold text-orange-500">{dailyStats.waiting}</div>
                            <div className="text-[10px] text-gray-500 uppercase font-bold">Waiting</div>
                        </div>
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 text-center leading-tight">
                            <div className="text-3xl font-bold text-green-600">{dailyStats.completed}</div>
                            <div className="text-[10px] text-gray-500 uppercase font-bold">Completed</div>
                        </div>
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 text-center relative overflow-hidden">
                            {/* Current Serving Highlight */}
                            <div className="absolute top-0 left-0 w-full h-1 bg-primary animate-pulse"></div>
                            <div className="text-2xl font-bold text-primary truncate">
                                {currentServing ? currentServing.token_number : '--'}
                            </div>
                            <div className="text-xs text-gray-500 uppercase font-semibold">Now Serving</div>
                        </div>
                    </div>
                </div>

                {/* 2. Live Queue List */}
                <div className="lg:col-span-2 min-w-0">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-full min-w-0">
                        <div className="p-4 border-b border-gray-100 flex flex-wrap gap-4 justify-between items-center bg-gray-50/50">
                            <div className="flex flex-wrap items-center gap-4">
                                <h2 className="text-lg font-semibold flex items-center gap-2">
                                    <Users size={20} className="text-primary" /> Live Queue
                                </h2>
                                {!isShowingAll ? (
                                    <div className="flex flex-wrap gap-2">
                                        <div className="flex border rounded-lg overflow-hidden h-9">
                                            <button
                                                onClick={() => setViewMode('Day')}
                                                className={`px-3 text-xs font-bold ${viewMode === 'Day' ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                            >
                                                Day
                                            </button>
                                            <button
                                                onClick={() => setViewMode('Month')}
                                                className={`px-3 text-xs font-bold border-l ${viewMode === 'Month' ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                            >
                                                Month
                                            </button>
                                        </div>
                                        <input
                                            type="date"
                                            className="p-1 border rounded-lg bg-white text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none h-9"
                                            value={filterDate}
                                            onChange={(e) => setFilterDate(e.target.value)}
                                        />
                                        <select
                                            className="p-1 border rounded-lg bg-white text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none h-9 min-w-[140px]"
                                            value={filterCenter}
                                            onChange={(e) => setFilterCenter(e.target.value)}
                                        >
                                            <option value="All Centers">
                                                All Centers ({availableCenters.length})
                                            </option>
                                            {availableCenters.map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                    </div>
                                ) : (
                                    <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-full uppercase tracking-wider">
                                        Global Recent View (100)
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsShowingAll(!isShowingAll)}
                                    className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all border ${isShowingAll
                                        ? 'bg-primary text-white border-primary shadow-md'
                                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                        }`}
                                >
                                    {isShowingAll ? 'Show Filtered' : 'All Tokens'}
                                </button>
                                <button
                                    onClick={fetchTokens}
                                    className="p-2 hover:bg-white rounded-full text-gray-500 shadow-sm border bg-white"
                                    title="Refresh"
                                >
                                    <RefreshCw size={16} />
                                </button>
                            </div>
                        </div>

                        <div className="overflow-x-auto flex-1 p-0 min-w-0">
                            <table className="w-full text-left text-sm min-w-[420px]">
                                <thead className="bg-gray-50 text-gray-500 font-medium">
                                    <tr>
                                        <th className="p-3">Token</th>
                                        <th className="p-3">Name</th>
                                        {(filterCenter === 'All Centers' || viewMode === 'Month') && (
                                            <th className="p-3">Center</th>
                                        )}
                                        <th className="p-3">Time</th>
                                        <th className="p-3">Status</th>
                                        <th className="p-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {tokens.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="p-8 text-center text-gray-400">
                                                No tokens found for this {viewMode.toLowerCase()} {filterCenter !== 'All Centers' ? `at ${filterCenter}` : 'across all centers'}.
                                            </td>
                                        </tr>
                                    ) : (
                                        tokens.map((token) => (
                                            <tr key={token.id} className={`hover:bg-gray-50 ${token.status === 'Completed' ? 'bg-gray-50 opacity-60' : ''}`}>
                                                <td className="p-3 font-mono font-bold text-primary">
                                                    {token.token_number}
                                                </td>
                                                <td className="p-3 font-medium">
                                                    {token.beneficiary_name}
                                                    <div className="text-xs text-gray-400">{token.phone_number}</div>
                                                </td>
                                                {(filterCenter === 'All Centers' || viewMode === 'Month') && (
                                                    <td className="p-3 truncate max-w-[120px]">
                                                        <span className="text-xs px-2 py-1 bg-gray-100 rounded-md font-medium text-gray-600">
                                                            {token.center_name}
                                                        </span>
                                                    </td>
                                                )}
                                                <td className="p-3 text-gray-500">
                                                    {token.time ? token.time.substring(0, 5) : '-'}
                                                </td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold
                                                        ${token.status === 'Waiting' ? 'bg-orange-100 text-orange-700' :
                                                            token.status === 'Completed' ? 'bg-green-100 text-green-700' :
                                                                'bg-red-100 text-red-700'
                                                        }
                                                    `}>
                                                        {token.status}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            onClick={() => printToken(token)}
                                                            className="p-1 text-gray-400 hover:text-gray-700"
                                                            title="Print"
                                                        >
                                                            <Printer size={16} />
                                                        </button>

                                                        {token.status === 'Waiting' && (
                                                            <>
                                                                <button
                                                                    onClick={() => updateStatus(token.id, 'Completed')}
                                                                    className="p-1 text-green-400 hover:text-green-700"
                                                                    title="Mark Completed"
                                                                >
                                                                    <CheckCircle size={16} />
                                                                </button>
                                                                <button
                                                                    onClick={() => updateStatus(token.id, 'Skipped')}
                                                                    className="p-1 text-red-400 hover:text-red-700"
                                                                    title="Skip"
                                                                >
                                                                    <XCircle size={16} />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Candidate Confirmation Modal */}
            {showCandidateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
                        <div className="p-6 border-b">
                            <h2 className="text-lg font-bold text-gray-900">Possible Match Found</h2>
                            <p className="text-sm text-gray-500 mt-1">
                                We found existing beneficiaries with a similar name. Is this the same person?
                            </p>
                        </div>
                        <div className="p-4 max-h-80 overflow-y-auto space-y-2">
                            {candidateMatches.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => confirmCandidate(c)}
                                    className="w-full text-left p-3 border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors"
                                >
                                    <div className="font-semibold text-gray-900">{c.name}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                        {c.mobile_no || 'No phone'} · {c.city || c.district || '—'}
                                    </div>
                                </button>
                            ))}
                        </div>
                        <div className="p-4 border-t bg-gray-50 flex gap-2">
                            <button
                                onClick={() => { setShowCandidateModal(false); setCandidateMatches([]); }}
                                className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-white"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={createAsNewAnyway}
                                className="flex-1 py-2 rounded-lg bg-primary text-white font-semibold hover:bg-primary-dark"
                            >
                                None of these — Create New
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Success Modal */}
            {showSuccessModal && generatedToken && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="bg-primary p-8 text-center text-white">
                            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-white/30">
                                <CheckCircle size={40} className="text-white" />
                            </div>
                            <h2 className="text-2xl font-black mb-1">Success!</h2>
                            <p className="text-white/80 text-sm">Token Generated Successfully</p>
                        </div>

                        <div className="p-8 text-center">
                            <p className="text-text-muted text-xs uppercase font-bold tracking-widest mb-2">
                                Official Token Number
                            </p>
                            <div className="text-5xl font-black text-primary mb-6 tabular-nums">
                                #{generatedToken.token_number}
                            </div>

                            <div className="space-y-3">
                                <button
                                    onClick={() => setShowSuccessModal(false)}
                                    className="w-full bg-primary text-white py-4 rounded-xl text-lg font-bold hover:bg-primary-dark transition-colors"
                                >
                                    Go to List
                                </button>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => printToken(generatedToken)}
                                        className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold border-2 border-gray-200 hover:bg-gray-50 transition-colors text-gray-700"
                                    >
                                        <Printer size={18} /> Print Slip
                                    </button>
                                    <button
                                        onClick={() => handleDownload(generatedToken)}
                                        className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold border-2 border-gray-200 hover:bg-gray-50 transition-colors text-gray-700"
                                    >
                                        <Download size={18} /> Save Text
                                    </button>
                                </div>
                                <button
                                    onClick={() => setShowSuccessModal(false)}
                                    className="w-full text-text-muted hover:text-text-main font-semibold transition-colors py-2"
                                >
                                    Generate Another Token
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
