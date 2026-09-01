import { useState, useEffect, useRef } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    LogOut,
    Search,
    User,
    X
} from 'lucide-react';
import { SidebarMenu } from '../navigation/SidebarMenu';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';

interface SidebarProps {
    collapsed: boolean;
    onToggleCollapse: () => void;
    mobileOpen: boolean;
    onMobileClose: () => void;
}

interface SidebarContentProps {
    collapsed: boolean;
    mobileOpen: boolean;
    onMobileClose: () => void;
    onToggleCollapse: () => void;
    logout: () => Promise<void>;
    userInitials: string;
    userEmail: string;
    userName: string;
}

function SidebarContent({ collapsed, mobileOpen, onMobileClose, onToggleCollapse, logout, userInitials, userEmail, userName }: SidebarContentProps) {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<{ id: string; name: string; file_number: string }[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);
    const latestQueryRef = useRef('');

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsSearching(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSearch = async (rawQuery: string) => {
        setSearchQuery(rawQuery);
        latestQueryRef.current = rawQuery;
        const query = rawQuery.trim();
        if (query.length < 2) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }

        try {
            // Run file-number and name matches as separate queries, each with
            // their own limit, so a file number match (e.g. "MCB...") always
            // gets a reserved slot instead of competing with name matches inside
            // a single capped .or() query — with no ORDER BY, Postgres can fill
            // all 5 slots with name matches before a specific file number is
            // ever considered, making it look like file-number search is broken.
            const [fileNumberResult, nameResult] = await Promise.all([
                supabase.from('beneficiaries').select('id, name, file_number').ilike('file_number', `%${query}%`).limit(5),
                supabase.from('beneficiaries').select('id, name, file_number').ilike('name', `%${query}%`).limit(5),
            ]);

            if (fileNumberResult.error) throw fileNumberResult.error;
            if (nameResult.error) throw nameResult.error;

            // Ignore stale responses from earlier, slower queries
            if (latestQueryRef.current !== rawQuery) return;

            const seen = new Set<string>();
            const merged = [...(fileNumberResult.data || []), ...(nameResult.data || [])].filter(b => {
                if (seen.has(b.id)) return false;
                seen.add(b.id);
                return true;
            });

            setSearchResults(merged.slice(0, 8));
            setIsSearching(true);
        } catch (err) {
            console.error('Search error:', err);
        }
    };

    return (
        <div className="flex flex-col h-full bg-surface">
            <div className={`h-16 flex items-center border-b border-gray-100 ${collapsed ? 'justify-center' : 'px-6 justify-between'}`}>
                {!collapsed && <span className="font-bold text-2xl text-primary tracking-tight">ROW</span>}
                {/* Mobile close button */}
                <button className="md:hidden p-2 text-text-muted" onClick={onMobileClose}>
                    <ChevronLeft size={20} />
                </button>
            </div>

            {/* Global Search Section */}
            {!collapsed && (
                <div className="px-4 py-4 relative" ref={searchRef}>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
                        <input
                            type="text"
                            placeholder="Search Patient / File No..."
                            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                            value={searchQuery}
                            onChange={(e) => handleSearch(e.target.value)}
                            onFocus={() => searchQuery.length >= 2 && setIsSearching(true)}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => { setSearchQuery(''); setSearchResults([]); setIsSearching(false); }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Search Results Dropdown */}
                    {isSearching && searchResults.length > 0 && (
                        <div className="absolute left-4 right-4 mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            {searchResults.map((b) => (
                                <button
                                    key={b.id}
                                    onClick={() => {
                                        navigate(`/beneficiary/${b.id}`);
                                        setIsSearching(false);
                                        setSearchQuery('');
                                        if (mobileOpen) onMobileClose();
                                    }}
                                    className="w-full text-left px-4 py-3 hover:bg-primary/5 flex items-center gap-3 border-b border-gray-50 last:border-0 transition-colors"
                                >
                                    <div className="p-2 bg-gray-100 rounded-lg text-gray-500">
                                        <User size={14} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-text-main truncate">{b.name}</p>
                                        <div className="flex items-center gap-2">
                                            <p className="text-[10px] text-text-muted font-black uppercase tracking-widest">{b.file_number || 'No File No'}</p>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {collapsed && (
                <div className="flex justify-center py-4">
                    <button
                        onClick={() => onToggleCollapse()}
                        className="p-2 bg-gray-50 rounded-xl text-text-muted hover:text-primary transition-colors"
                    >
                        <Search size={20} />
                    </button>
                </div>
            )}

            <SidebarMenu collapsed={collapsed} mobileOpen={mobileOpen} onMobileClose={onMobileClose} />

            <div className="p-4 border-t border-gray-100">
                {/* Collapse Toggle (Desktop Only) */}
                {!mobileOpen && (
                    <button
                        onClick={onToggleCollapse}
                        className="hidden md:flex w-full items-center justify-center p-2 text-text-muted hover:bg-gray-50 rounded-lg mb-2"
                    >
                        {collapsed ? <ChevronRight size={20} /> : <div className="flex items-center w-full"><ChevronLeft size={20} /><span className="ml-2 text-sm">Collapse</span></div>}
                    </button>
                )}

                <button
                    onClick={() => logout()}
                    className={`flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer w-full text-left ${collapsed ? 'justify-center' : ''}`}
                >
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                        {userInitials}
                    </div>
                    {!collapsed && (
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text-main truncate">{userName}</p>
                            <p className="text-xs text-text-muted truncate">{userEmail}</p>
                        </div>
                    )}
                    {!collapsed && <LogOut size={16} className="text-text-muted hover:text-red-500 ml-auto" />}
                </button>
            </div>
        </div>
    );
}

export function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onMobileClose }: SidebarProps) {
    const { logout, user, profile } = useAuth();

    const userName = profile?.full_name || user?.email?.split('@')[0] || 'User';
    const userEmail = user?.email || '';
    const userInitials = (profile?.full_name
        ? profile.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
        : (user?.email?.[0] || 'U').toUpperCase()
    );

    // Mobile overlay styles
    const mobileClasses = mobileOpen
        ? "absolute inset-y-0 left-0 z-30 translate-x-0 w-64 shadow-xl"
        : "absolute inset-y-0 left-0 z-30 -translate-x-full w-64";

    // Desktop styles
    const desktopClasses = `hidden md:flex flex-col bg-surface border-r border-gray-200 h-full transition-all duration-300 ease-in-out ${collapsed ? "w-20" : "w-64"}`;

    return (
        <>
            {/* Mobile Overlay Backdrop */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-20 md:hidden"
                    onClick={onMobileClose}
                />
            )}

            {/* Mobile Sidebar */}
            <aside className={`md:hidden ${mobileClasses} transition-transform duration-300 ease-in-out`}>
                <SidebarContent
                    collapsed={collapsed}
                    mobileOpen={mobileOpen}
                    onMobileClose={onMobileClose}
                    onToggleCollapse={onToggleCollapse}
                    logout={logout}
                    userInitials={userInitials}
                    userEmail={userEmail}
                    userName={userName}
                />
            </aside>

            {/* Desktop Sidebar */}
            <aside className={desktopClasses}>
                <SidebarContent
                    collapsed={collapsed}
                    mobileOpen={mobileOpen}
                    onMobileClose={onMobileClose}
                    onToggleCollapse={onToggleCollapse}
                    logout={logout}
                    userInitials={userInitials}
                    userEmail={userEmail}
                    userName={userName}
                />
            </aside>
        </>
    );
}
