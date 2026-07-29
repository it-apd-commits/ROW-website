import { Menu, Bell, HelpCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePendingSyncCount } from '@/hooks/usePendingSyncCount';
import { useAuth } from '@/hooks/useAuth';

interface HeaderProps {
    onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
    const pendingSyncCount = usePendingSyncCount();
    const { role } = useAuth();
    const canViewSyncDashboard = role === 'Admin';

    const badgeTitle = pendingSyncCount > 0
        ? `${pendingSyncCount} record${pendingSyncCount === 1 ? '' : 's'} not yet synced to the server${canViewSyncDashboard ? '' : ' — ask an admin to check the Sync Dashboard'}`
        : 'All records synced';

    const bellContent = (
        <>
            <Bell size={20} />
            {pendingSyncCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full border border-white">
                    {pendingSyncCount > 9 ? '9+' : pendingSyncCount}
                </span>
            )}
        </>
    );

    return (
        <header className="h-16 bg-surface border-b border-gray-200 px-4 md:px-8 flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center gap-4">
                <button
                    className="md:hidden p-2.5 text-text-muted hover:bg-gray-100 rounded-lg"
                    onClick={onMenuClick}
                >
                    <Menu size={24} />
                </button>
                <h2 className="text-lg font-medium text-text-main">
                    {/* Placeholder for dynamic breadcrumb or page title */}
                    Rehab Services
                </h2>
            </div>
            <div className="flex items-center gap-2 md:gap-4">
                {canViewSyncDashboard ? (
                    <Link
                        to="/sync"
                        className="p-2.5 text-text-muted hover:text-primary hover:bg-gray-50 rounded-full transition-colors relative"
                        title={badgeTitle}
                    >
                        {bellContent}
                    </Link>
                ) : (
                    <span
                        className="p-2.5 text-text-muted rounded-full relative"
                        title={badgeTitle}
                    >
                        {bellContent}
                    </span>
                )}
                <button className="p-2.5 text-text-muted hover:text-primary hover:bg-gray-50 rounded-full transition-colors">
                    <HelpCircle size={20} />
                </button>
            </div>
        </header>
    );
}
