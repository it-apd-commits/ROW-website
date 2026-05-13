import { useState, useEffect } from 'react';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { type UserRole, type UserProfile } from '@/types/rbac';
import { Shield, Users, Activity, Lock, Search, Check, X, RefreshCw, Key, FileUp, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { ScheduleUpload } from '@/components/admin/ScheduleUpload';
import { ScheduleHistory } from '@/components/admin/ScheduleHistory';

interface AuditLog {
    id: string;
    created_at: string;
    action: string;
    details: Record<string, unknown>;
    user_id: string;
    profiles?: {
        full_name: string;
    };
}

export function AdminControlPage() {
    const { role, user } = useAuth();
    const [activeTab, setActiveTab] = useState<'users' | 'permissions' | 'logs' | 'schedule'>('users');
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [deleteModal, setDeleteModal] = useState<{ open: boolean; userId: string; userName: string; userEmail: string } | null>(null);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [logActionFilter, setLogActionFilter] = useState('');
    const [logFromDate, setLogFromDate] = useState('');
    const [logToDate, setLogToDate] = useState('');
    const [logPage, setLogPage] = useState(1);
    const [logsError, setLogsError] = useState<string | null>(null);
    const [logsLoading, setLogsLoading] = useState(false);

    useEffect(() => {
        if (role === 'Admin') fetchUsers();
        if (activeTab === 'logs' && role === 'Admin') fetchLogs();
    }, [role, activeTab]);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.from('profiles').select('*').order('full_name');
            if (error) throw error;
            setUsers(data || []);
        } catch (err) {
            console.error('Error fetching users:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchLogs = async () => {
        setLogsLoading(true);
        setLogsError(null);
        try {
            const { data, error } = await supabase
                .from('audit_logs')
                .select('*, profiles(full_name)')
                .order('created_at', { ascending: false })
                .limit(200);
            if (error) {
                setLogsError(error.message);
                return;
            }
            setLogs(data || []);
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unexpected error loading logs.';
            setLogsError(msg);
        } finally {
            setLogsLoading(false);
        }
    };

    const LOGS_PER_PAGE = 15;

    const ACTION_COLORS: Record<string, string> = {
        SIGNED_IN: 'bg-green-100 text-green-700',
        SIGNED_OUT: 'bg-gray-100 text-gray-600',
        BENEFICIARY_CREATED: 'bg-blue-100 text-blue-700',
        BENEFICIARY_UPDATED: 'bg-indigo-100 text-indigo-700',
        BENEFICIARY_DELETED: 'bg-red-100 text-red-700',
        BENEFICIARY_BULK_DELETED: 'bg-red-200 text-red-800',
        BENEFICIARY_REGISTRATION_COMPLETED: 'bg-teal-100 text-teal-700',
        SERVICE_ENTRY_CREATED: 'bg-purple-100 text-purple-700',
        SERVICE_ENTRY_UPDATED: 'bg-violet-100 text-violet-700',
        ASSESSMENT_INITIAL_SAVED: 'bg-amber-100 text-amber-700',
        ASSESSMENT_CLINICAL_SAVED: 'bg-orange-100 text-orange-700',
        ASSESSMENT_DELETED: 'bg-red-100 text-red-700',
        ROLE_CHANGE: 'bg-yellow-100 text-yellow-700',
        PASSWORD_RESET: 'bg-sky-100 text-sky-700',
        STATUS_CHANGE: 'bg-lime-100 text-lime-700',
        USER_DELETED: 'bg-red-200 text-red-800',
    };

    const renderDetails = (details: Record<string, unknown>): string => {
        const entries = Object.entries(details || {});
        if (entries.length === 0) return '—';
        return entries.map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' • ');
    };

    const uniqueActions = Array.from(new Set(logs.map(l => l.action))).sort();

    const filteredLogs = logs.filter(l => {
        if (logActionFilter && l.action !== logActionFilter) return false;
        if (logFromDate && l.created_at.slice(0, 10) < logFromDate) return false;
        if (logToDate && l.created_at.slice(0, 10) > logToDate) return false;
        return true;
    });

    const totalPages = Math.max(1, Math.ceil(filteredLogs.length / LOGS_PER_PAGE));
    const pagedLogs = filteredLogs.slice((logPage - 1) * LOGS_PER_PAGE, logPage * LOGS_PER_PAGE);

    const logAction = async (action: string, details: object) => {
        try {
            await supabase.from('audit_logs').insert({
                user_id: user?.id,
                action,
                details
            });
            fetchLogs();
        } catch (e) {
            console.error('Audit log failed:', e);
        }
    };

    const handleRoleChange = async (userId: string, newRole: string) => {
        if (userId === user?.id && newRole !== 'Admin') {
            alert('Security Restriction: You cannot remove your own Admin privileges.');
            return;
        }
        if (!confirm(`Are you sure you want to change this user's role to ${newRole}?`)) return;
        try {
            const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
            if (error) throw error;
            setUsers(users.map(u => u.id === userId ? { ...u, role: newRole as UserRole } : u));
            logAction('ROLE_CHANGE', { target_user: userId, new_role: newRole });
            alert('Role updated successfully.');
        } catch (err) {
            console.error('Error updating role:', err);
            alert('Failed to update role. Ensure you have admin privileges and policies are set.');
        }
    };

    const handleResetPassword = async (email: string) => {
        if (!email) return;
        if (!confirm(`Send password reset email to ${email}?`)) return;
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/update-password`,
            });
            if (error) throw error;
            logAction('PASSWORD_RESET', { target_email: email });
            alert(`Password reset link sent to ${email}.`);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            alert('Error: ' + message);
        }
    };

    const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
        // Default is_active to true if undefined
        const isActive = currentStatus !== false;

        if (userId === user?.id) {
            alert('Security Restriction: You cannot disable your own account.');
            return;
        }

        if (!confirm(`Are you sure you want to ${isActive ? 'disable' : 'enable'} this account?`)) return;
        try {
            const { error } = await supabase.from('profiles').update({ is_active: !isActive }).eq('id', userId);
            if (error) throw error;
            setUsers(users.map(u => u.id === userId ? { ...u, is_active: !isActive } : u));
            logAction('STATUS_CHANGE', { target_user: userId, new_status: !isActive });
        } catch {
            alert('Failed to update status. Database columns might be missing.');
        }
    };

    const handleDeleteUser = async () => {
        if (!deleteModal) return;
        setDeleting(true);
        try {
            const { error } = await supabase.from('profiles').delete().eq('id', deleteModal.userId);
            if (error) throw error;
            setUsers(users.filter(u => u.id !== deleteModal.userId));
            logAction('USER_DELETED', { target_user: deleteModal.userId, target_email: deleteModal.userEmail });
            setDeleteModal(null);
            setDeleteConfirmText('');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            alert('Failed to delete user: ' + message);
        } finally {
            setDeleting(false);
        }
    };

    if (role !== 'Admin') {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
                <Shield size={64} className="text-red-500" />
                <h2 className="text-2xl font-bold text-gray-800">Access Denied</h2>
                <p className="text-gray-600 max-w-md">You do not have permission to view the Admin Control Center. Please contact your system administrator.</p>
                <div className="flex gap-4">
                    <Button onClick={() => window.history.back()} variant="outline">Go Back</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-xl md:text-2xl font-bold text-text-main flex items-center gap-2">
                    <Shield className="text-primary" /> Admin Control Center
                </h1>
                <p className="text-text-muted">Manage system users, permissions, and security settings.</p>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 overflow-x-auto">
                <button
                    onClick={() => setActiveTab('users')}
                    className={`px-4 py-3 font-medium text-sm transition-colors flex flex-shrink-0 items-center gap-2 ${activeTab === 'users' ? 'border-b-2 border-primary text-primary' : 'text-text-muted hover:text-text-main'}`}
                >
                    <Users size={16} /> User Management
                </button>
                <button
                    onClick={() => setActiveTab('permissions')}
                    className={`px-4 py-3 font-medium text-sm transition-colors flex flex-shrink-0 items-center gap-2 ${activeTab === 'permissions' ? 'border-b-2 border-primary text-primary' : 'text-text-muted hover:text-text-main'}`}
                >
                    <Lock size={16} /> Permissions Matrix
                </button>
                <button
                    onClick={() => setActiveTab('logs')}
                    className={`px-4 py-3 font-medium text-sm transition-colors flex flex-shrink-0 items-center gap-2 ${activeTab === 'logs' ? 'border-b-2 border-primary text-primary' : 'text-text-muted hover:text-text-main'}`}
                >
                    <Activity size={16} /> Audit Logs
                </button>
                <button
                    onClick={() => setActiveTab('schedule')}
                    className={`px-4 py-3 font-medium text-sm transition-colors flex flex-shrink-0 items-center gap-2 ${activeTab === 'schedule' ? 'border-b-2 border-primary text-primary' : 'text-text-muted hover:text-text-main'}`}
                >
                    <FileUp size={16} /> Schedule Management
                </button>
            </div>

            {/* Content */}
            {activeTab === 'users' && (
                <Card className="p-6">
                    <div className="mb-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                        <div className="relative w-full md:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <input
                                type="text"
                                placeholder="Search users..."
                                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <Button onClick={fetchUsers} variant="outline" className="text-xs py-1 px-3">Refresh List</Button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[600px]">
                            <thead>
                                <tr className="border-b border-gray-100 text-sm text-text-muted uppercase tracking-wider">
                                    <th className="p-3">User</th>
                                    <th className="p-3">Role</th>
                                    <th className="p-3">Status</th>
                                    <th className="p-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.filter(u =>
                                (u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                    u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()))
                                ).map((u) => (
                                    <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                                        <td className="p-3">
                                            <div className="font-medium text-text-main">{u.full_name || 'No Name'}</div>
                                            <div className="text-xs text-text-muted">{u.email}</div>
                                            {u.id === user?.id && <span className="text-[10px] bg-blue-100 text-blue-800 px-1 rounded">You</span>}
                                        </td>
                                        <td className="p-3">
                                            <select
                                                value={u.role || 'Staff'}
                                                onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                                className="bg-white border border-gray-200 text-sm rounded px-2 py-1 focus:ring-2 focus:ring-primary cursor-pointer hover:border-gray-300 transition-colors"
                                            >
                                                <option value="Admin">Admin</option>
                                                <option value="Manager">Manager</option>
                                                <option value="Staff">Staff</option>
                                                <option value="MIS">MIS</option>
                                                <option value="Fleet">Fleet</option>
                                            </select>
                                        </td>
                                        <td className="p-3">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${u.is_active !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {u.is_active !== false ? 'Active' : 'Disabled'}
                                            </span>
                                        </td>
                                        <td className="p-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    variant="outline"
                                                    onClick={() => handleResetPassword(u.email)}
                                                    className="text-xs py-1 px-3 text-blue-600 border-blue-200 hover:bg-blue-50"
                                                    title="Send Password Reset Email"
                                                >
                                                    <Key size={14} className="mr-1" /> Reset
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    onClick={() => toggleUserStatus(u.id, u.is_active !== false)}
                                                    className={`text-xs py-1 px-3 ${u.is_active !== false ? "text-red-600 border-red-200 hover:bg-red-50" : "text-green-600 border-green-200 hover:bg-green-50"}`}
                                                >
                                                    {u.is_active !== false ? 'Disable' : 'Enable'}
                                                </Button>
                                                {u.id !== user?.id && (
                                                    <Button
                                                        variant="outline"
                                                        onClick={() => { setDeleteModal({ open: true, userId: u.id, userName: u.full_name || 'No Name', userEmail: u.email }); setDeleteConfirmText(''); }}
                                                        className="text-xs py-1 px-3 text-red-700 border-red-300 hover:bg-red-50"
                                                        title="Delete User"
                                                    >
                                                        <Trash2 size={14} />
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {users.length === 0 && !loading && (
                                    <tr><td colSpan={4} className="p-8 text-center text-text-muted">No users found.</td></tr>
                                )}
                                {loading && (
                                    <tr><td colSpan={4} className="p-8 text-center text-text-muted">Loading users...</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {activeTab === 'permissions' && (
                <Card className="p-6">
                    <h3 className="font-bold text-lg mb-4">Role Permission Matrix</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse min-w-[500px]">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                    <th className="p-3 text-left">Feature / Permission</th>
                                    <th className="p-3 text-center w-32">Admin</th>
                                    <th className="p-3 text-center w-32">Manager</th>
                                    <th className="p-3 text-center w-32">Staff</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                <tr>
                                    <td className="p-3 font-medium">Manage Users & Roles</td>
                                    <td className="p-3 text-center"><Check size={18} className="mx-auto text-green-600" /></td>
                                    <td className="p-3 text-center"><X size={18} className="mx-auto text-gray-300" /></td>
                                    <td className="p-3 text-center"><X size={18} className="mx-auto text-gray-300" /></td>
                                </tr>
                                <tr>
                                    <td className="p-3 font-medium">Access Admin Control</td>
                                    <td className="p-3 text-center"><Check size={18} className="mx-auto text-green-600" /></td>
                                    <td className="p-3 text-center"><X size={18} className="mx-auto text-gray-300" /></td>
                                    <td className="p-3 text-center"><X size={18} className="mx-auto text-gray-300" /></td>
                                </tr>
                                <tr>
                                    <td className="p-3 font-medium">Edit System Settings</td>
                                    <td className="p-3 text-center"><Check size={18} className="mx-auto text-green-600" /></td>
                                    <td className="p-3 text-center"><X size={18} className="mx-auto text-gray-300" /></td>
                                    <td className="p-3 text-center"><X size={18} className="mx-auto text-gray-300" /></td>
                                </tr>
                                <tr>
                                    <td className="p-3 font-medium">Export Data</td>
                                    <td className="p-3 text-center"><Check size={18} className="mx-auto text-green-600" /></td>
                                    <td className="p-3 text-center"><Check size={18} className="mx-auto text-green-600" /></td>
                                    <td className="p-3 text-center"><X size={18} className="mx-auto text-gray-300" /></td>
                                </tr>
                                <tr>
                                    <td className="p-3 font-medium">Delete Records</td>
                                    <td className="p-3 text-center"><Check size={18} className="mx-auto text-green-600" /></td>
                                    <td className="p-3 text-center"><X size={18} className="mx-auto text-gray-300" /></td>
                                    <td className="p-3 text-center"><X size={18} className="mx-auto text-gray-300" /></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {activeTab === 'logs' && (
                <Card className="p-6">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                        <div>
                            <h3 className="font-bold text-lg">System Audit Logs</h3>
                            <p className="text-xs text-text-muted mt-0.5">{filteredLogs.length} record{filteredLogs.length !== 1 ? 's' : ''} found</p>
                        </div>
                        <Button variant="outline" className="text-xs py-1 px-3 self-start sm:self-auto" onClick={fetchLogs} disabled={logsLoading}>
                            <RefreshCw size={14} className={`mr-1 ${logsLoading ? 'animate-spin' : ''}`} /> Refresh
                        </Button>
                    </div>

                    {/* Error banner */}
                    {logsError && (
                        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                            <p className="font-semibold mb-1">Failed to load audit logs</p>
                            <p className="text-xs font-mono break-all">{logsError}</p>
                            {logsError.includes('does not exist') && (
                                <p className="mt-2 text-xs text-red-600 font-medium">
                                    The <code className="bg-red-100 px-1 rounded">audit_logs</code> table is missing. Run the setup SQL in Supabase Dashboard → SQL Editor.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Filters */}
                    <div className="flex flex-wrap gap-3 mb-5 p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <select
                            value={logActionFilter}
                            onChange={e => { setLogActionFilter(e.target.value); setLogPage(1); }}
                            className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary min-w-[160px]"
                        >
                            <option value="">All Actions</option>
                            {uniqueActions.map(a => (
                                <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
                            ))}
                        </select>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-text-muted font-medium">From</span>
                            <input
                                type="date"
                                value={logFromDate}
                                onChange={e => { setLogFromDate(e.target.value); setLogPage(1); }}
                                className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-text-muted font-medium">To</span>
                            <input
                                type="date"
                                value={logToDate}
                                onChange={e => { setLogToDate(e.target.value); setLogPage(1); }}
                                className="text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                        </div>
                        {(logActionFilter || logFromDate || logToDate) && (
                            <button
                                onClick={() => { setLogActionFilter(''); setLogFromDate(''); setLogToDate(''); setLogPage(1); }}
                                className="text-xs font-bold text-red-500 hover:text-red-600 px-2 py-2 bg-red-50 rounded-lg border border-red-100"
                            >
                                Clear
                            </button>
                        )}
                    </div>

                    {pagedLogs.length > 0 ? (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left min-w-[700px]">
                                    <thead className="bg-gray-50 border-b border-gray-100">
                                        <tr className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                                            <th className="px-3 py-3 w-40">Time</th>
                                            <th className="px-3 py-3 w-36">User</th>
                                            <th className="px-3 py-3 w-56">Action</th>
                                            <th className="px-3 py-3">Details</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {pagedLogs.map((log: AuditLog) => (
                                            <tr key={log.id} className="hover:bg-gray-50/60 transition-colors">
                                                <td className="px-3 py-3 text-xs text-text-muted whitespace-nowrap">
                                                    <div className="font-medium text-gray-700">{new Date(log.created_at).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                                                    <div className="text-[10px]">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                </td>
                                                <td className="px-3 py-3 text-xs font-medium text-gray-800">{log.profiles?.full_name || 'Unknown'}</td>
                                                <td className="px-3 py-3">
                                                    <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide whitespace-nowrap ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-600'}`}>
                                                        {log.action.replace(/_/g, ' ')}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-3 text-xs text-text-muted">{renderDetails(log.details)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                                    <span className="text-xs text-text-muted">
                                        Page {logPage} of {totalPages} ({filteredLogs.length} total)
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setLogPage(p => Math.max(1, p - 1))}
                                            disabled={logPage === 1}
                                            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <ChevronLeft size={16} />
                                        </button>
                                        <button
                                            onClick={() => setLogPage(p => Math.min(totalPages, p + 1))}
                                            disabled={logPage === totalPages}
                                            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="mt-4 p-10 border border-dashed border-gray-200 rounded-xl text-center bg-gray-50">
                            <Activity className="mx-auto text-gray-300 mb-3" size={36} />
                            <p className="text-text-muted font-medium">
                                {logsLoading ? 'Loading...' : logs.length > 0 ? 'No logs match the current filters.' : 'No audit logs yet.'}
                            </p>
                            {!logsLoading && logs.length === 0 && !logsError && (
                                <p className="text-xs text-gray-400 mt-1">Logs will appear here as users perform actions in the app.</p>
                            )}
                        </div>
                    )}
                </Card>
            )}
            {activeTab === 'schedule' && (
                <div className="space-y-6">
                    <ScheduleUpload />
                    <ScheduleHistory />
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteModal?.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                                <Trash2 size={20} className="text-red-600" />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900">Delete User</h3>
                                <p className="text-sm text-text-muted">This action cannot be undone.</p>
                            </div>
                        </div>

                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 space-y-1">
                            <p><span className="font-semibold">Name:</span> {deleteModal.userName}</p>
                            <p><span className="font-semibold">Email:</span> {deleteModal.userEmail}</p>
                        </div>

                        <p className="text-sm text-text-muted">
                            This will remove the user's profile and access from the app. Type <span className="font-mono font-bold text-red-600">DELETE</span> to confirm.
                        </p>

                        <input
                            type="text"
                            placeholder='Type DELETE to confirm'
                            value={deleteConfirmText}
                            onChange={(e) => setDeleteConfirmText(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                        />

                        <div className="flex gap-3 justify-end">
                            <Button
                                variant="outline"
                                onClick={() => { setDeleteModal(null); setDeleteConfirmText(''); }}
                                disabled={deleting}
                                className="text-sm"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleDeleteUser}
                                disabled={deleteConfirmText !== 'DELETE' || deleting}
                                className="text-sm bg-red-600 hover:bg-red-700 text-white border-0 disabled:opacity-50"
                            >
                                {deleting ? 'Deleting...' : 'Delete User'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
