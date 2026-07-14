import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { Settings as SettingsIcon, User, Bell, Shield, Database, LogOut, FileDown, Trash2, KeyRound, Lock, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';

export function SettingsPage() {
    const { user, logout, role } = useAuth();
    const { can } = usePermissions();
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'data'>('profile');

    // Notification State
    const [notifications, setNotifications] = useState({
        email: true,
        reminders: true,
        reports: false
    });

    const [isExporting, setIsExporting] = useState(false);

    // Load settings on mount
    useEffect(() => {
        const saved = localStorage.getItem('row_settings_notifications');
        if (saved) {
            setNotifications(JSON.parse(saved));
        }
    }, []);

    // Save settings when changed
    const handleNotificationChange = (key: keyof typeof notifications) => {
        const newSettings = { ...notifications, [key]: !notifications[key] };
        setNotifications(newSettings);
        localStorage.setItem('row_settings_notifications', JSON.stringify(newSettings));
    };

    const handleLogout = async () => {
        try {
            await logout();
        } catch (error) {
            console.error('Error logging out:', error);
        }
    };

    const handleChangePassword = async () => {
        if (!user?.email) return;
        if (!confirm(`Send password reset email to ${user.email}?`)) return;

        try {
            const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
                redirectTo: window.location.origin + '/update-password',
            });
            if (error) throw error;
            alert('Password reset email sent. Please check your inbox.');
        } catch (error) {
            console.error('Error sending reset email:', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            alert('Failed to send reset email: ' + message);
        }
    };

    const handleExportData = async () => {
        if (!can('canExportData')) {
            alert('You do not have permission to export data.');
            return;
        }

        setIsExporting(true);
        try {
            const { data: beneficiaries, error: benError } = await supabase.from('beneficiaries').select('*');
            if (benError) throw benError;

            const exportData = {
                exported_at: new Date().toISOString(),
                exported_by: user?.email,
                role: role,
                beneficiaries: beneficiaries || [],
                count: beneficiaries?.length || 0
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `row_export_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Export failed:', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            alert('Failed to export data: ' + message);
        } finally {
            setIsExporting(false);
        }
    };

    const handleClearCache = async () => {
        if (!confirm('WARNING: This will clear all local data, including unsynced offline records and your login session. Are you sure?')) {
            return;
        }

        try {
            // Clear ALL Dexie tables (beneficiaries, service entries, assessments, metadata)
            await Promise.all(db.tables.map(table => table.clear()));
            localStorage.clear();
            alert('Cache cleared. The application will now reload.');
            window.location.reload();
        } catch (error) {
            console.error('Error clearing cache:', error);
            alert('Failed to clear cache.');
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div className="flex items-center gap-3">
                    <SettingsIcon className="text-primary" size={32} />
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-text-main">Settings</h1>
                        <p className="text-text-muted">Manage your account and preferences</p>
                    </div>
                </div>

                {can('canViewAdminPage') && (
                    <Button onClick={() => navigate('/admin/control')} className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md">
                        <Lock size={16} /> Admin Control Center
                    </Button>
                )}
            </div>

            {/* Tabs Navigation */}
            <div className="flex border-b border-gray-200 overflow-x-auto">
                <button
                    onClick={() => setActiveTab('profile')}
                    className={`px-4 py-3 font-medium text-sm transition-colors flex flex-shrink-0 items-center gap-2 ${activeTab === 'profile' ? 'border-b-2 border-primary text-primary' : 'text-text-muted hover:text-text-main'}`}
                >
                    <User size={16} /> Profile
                </button>
                <button
                    onClick={() => setActiveTab('security')}
                    className={`px-4 py-3 font-medium text-sm transition-colors flex flex-shrink-0 items-center gap-2 ${activeTab === 'security' ? 'border-b-2 border-primary text-primary' : 'text-text-muted hover:text-text-main'}`}
                >
                    <Shield size={16} /> Security & Privacy
                </button>
                <button
                    onClick={() => setActiveTab('data')}
                    className={`px-4 py-3 font-medium text-sm transition-colors flex flex-shrink-0 items-center gap-2 ${activeTab === 'data' ? 'border-b-2 border-primary text-primary' : 'text-text-muted hover:text-text-main'}`}
                >
                    <Database size={16} /> Data Management
                </button>
            </div>

            {/* Tab Content */}
            <div className="space-y-6">

                {/* PROFILE TAB */}
                {activeTab === 'profile' && (
                    <div className="space-y-6">
                        <Card className="p-6">
                            <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                                <User className="text-primary" size={20} />
                                <h2 className="text-xl font-semibold text-text-main">User Profile</h2>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="text-sm font-semibold text-text-muted uppercase tracking-wide">Account Status</label>
                                    <div className="mt-1 flex items-center gap-2">
                                        <CheckCircle2 size={18} className="text-green-500" />
                                        <span className="font-medium text-text-main">Active</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-text-muted uppercase tracking-wide">Assigned Role</label>
                                    <div className="mt-1">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${role === 'Admin' ? 'bg-purple-100 text-purple-800' : role === 'Manager' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                                            {role}
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-text-muted uppercase tracking-wide">Email Address</label>
                                    <p className="mt-1 text-text-main">{user?.email || 'Not available'}</p>
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-text-muted uppercase tracking-wide">User ID</label>
                                    <p className="mt-1 text-text-main text-xs font-mono bg-gray-50 p-2 rounded truncate">{user?.id || 'Not available'}</p>
                                </div>
                            </div>
                        </Card>

                        <Card className="p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <Bell className="text-primary" size={20} />
                                <h2 className="text-xl font-semibold text-text-main">Notification Preferences</h2>
                            </div>
                            <div className="space-y-4">
                                <label className="flex items-center gap-3 cursor-pointer select-none p-2 hover:bg-gray-50 rounded transition-colors">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 text-primary focus:ring-primary rounded border-gray-300"
                                        checked={notifications.email}
                                        onChange={() => handleNotificationChange('email')}
                                    />
                                    <span className="text-text-main">Email notifications for new beneficiaries</span>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer select-none p-2 hover:bg-gray-50 rounded transition-colors">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 text-primary focus:ring-primary rounded border-gray-300"
                                        checked={notifications.reminders}
                                        onChange={() => handleNotificationChange('reminders')}
                                    />
                                    <span className="text-text-main">Service reminders</span>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer select-none p-2 hover:bg-gray-50 rounded transition-colors">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 text-primary focus:ring-primary rounded border-gray-300"
                                        checked={notifications.reports}
                                        onChange={() => handleNotificationChange('reports')}
                                    />
                                    <span className="text-text-main">Weekly reports</span>
                                </label>
                            </div>
                        </Card>

                        <Card className="p-6">
                            <Button
                                variant="outline"
                                className="w-full justify-center flex items-center gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 transition-all"
                                onClick={handleLogout}
                            >
                                <LogOut size={18} />
                                Sign Out
                            </Button>
                        </Card>
                    </div>
                )}

                {/* SECURITY TAB */}
                {activeTab === 'security' && (
                    <Card className="p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <Shield className="text-primary" size={20} />
                            <h2 className="text-xl font-semibold text-text-main">Security & Privacy</h2>
                        </div>
                        <div className="space-y-4 max-w-lg">
                            <div>
                                <h4 className="font-medium mb-2">Password</h4>
                                <Button variant="outline" className="w-full justify-start gap-2" onClick={handleChangePassword}>
                                    <KeyRound size={16} /> Send Password Reset Email
                                </Button>
                            </div>

                            <hr className="border-gray-100" />

                            <div>
                                <h4 className="font-medium mb-2">Two-Factor Authentication</h4>
                                <Button variant="outline" className="w-full justify-start gap-2 opacity-60 cursor-not-allowed" disabled>
                                    <Shield size={16} /> Enable 2FA (Coming Soon)
                                </Button>
                                <p className="text-xs text-text-muted mt-1 ml-1">Enhanced security features are currently under development.</p>
                            </div>

                            {role === 'Admin' && (
                                <>
                                    <hr className="border-gray-100" />
                                    <div>
                                        <h4 className="font-medium mb-2 text-purple-700">Admin Security Controls</h4>
                                        <div className="bg-purple-50 p-4 rounded-lg text-sm text-purple-800 space-y-2">
                                            <div className="flex justify-between items-center">
                                                <span>Force Session Timeout</span>
                                                <span className="font-bold">Enabled (1h)</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span>Login Attempts Limit</span>
                                                <span className="font-bold">5 Attempts</span>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </Card>
                )}

                {/* DATA TAB */}
                {activeTab === 'data' && (
                    <Card className="p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <Database className="text-primary" size={20} />
                            <h2 className="text-xl font-semibold text-text-main">Data Management</h2>
                        </div>
                        <div className="space-y-4">
                            {can('canExportData') ? (
                                <div className="p-4 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors">
                                    <h4 className="font-medium text-text-main mb-1">Export Data</h4>
                                    <p className="text-sm text-text-muted mb-3">Download a complete JSON backup of all beneficiary records.</p>
                                    <Button
                                        variant="outline"
                                        className="w-full sm:w-auto justify-start gap-2"
                                        onClick={handleExportData}
                                        disabled={isExporting}
                                    >
                                        <FileDown size={16} /> {isExporting ? 'Exporting...' : 'Export Beneficiary Data'}
                                    </Button>
                                </div>
                            ) : (
                                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 text-center text-text-muted text-sm">
                                    Export functionality is restricted to Managers and Admins.
                                </div>
                            )}

                            <div className="p-4 border border-red-100 bg-red-50/30 rounded-lg">
                                <h4 className="font-medium text-red-700 mb-1">Danger Zone</h4>
                                <p className="text-sm text-red-600/80 mb-3">Clear local application data and cached files. This will log you out.</p>
                                <Button
                                    variant="outline"
                                    className="w-full sm:w-auto justify-start gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                                    onClick={handleClearCache}
                                >
                                    <Trash2 size={16} /> Clear Local Cache
                                </Button>
                            </div>
                        </div>
                    </Card>
                )}
            </div>
        </div>
    );
}

