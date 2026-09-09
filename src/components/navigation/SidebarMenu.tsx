import {
    LayoutDashboard,
    Calendar,
    MapPin,
    UserPlus,
    Users,
    History,
    BarChart3,
    RefreshCw,
    Ticket,
    Shield,
    Bus,
    Dumbbell,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NavItem } from './NavItem';
import { usePermissions } from '@/hooks/usePermissions';

type NavItemEntry = { type: 'item'; path: string; label: string; icon: LucideIcon };
type NavSectionEntry = { type: 'section'; label: string };
type NavEntry = NavItemEntry | NavSectionEntry;

const navEntries: NavEntry[] = [
    { type: 'item', path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },

    { type: 'section', label: 'OPERATIONS' },
    { type: 'item', path: '/calendar', label: 'Calendar', icon: Calendar },
    { type: 'item', path: '/tracking/add-trip', label: 'Add Trip', icon: Bus },
    { type: 'item', path: '/tracking', label: 'Live Bus Tracking', icon: MapPin },
    { type: 'item', path: '/tracking/history', label: 'Trip History', icon: History },

    { type: 'section', label: 'PATIENT FLOW' },
    { type: 'item', path: '/token-management', label: 'Token Management', icon: Ticket },
    { type: 'item', path: '/beneficiary/add', label: 'Add Beneficiary', icon: UserPlus },
    { type: 'item', path: '/beneficiary/list', label: 'Beneficiary List', icon: Users },

    { type: 'section', label: 'CLINICAL' },
    { type: 'item', path: '/assessments/history', label: 'Assessment History', icon: History },
    { type: 'item', path: '/services/history', label: 'Service History', icon: History },
    { type: 'item', path: '/exercises/manage', label: 'Exercise Library', icon: Dumbbell },

    { type: 'section', label: 'MANAGEMENT' },
    { type: 'item', path: '/reports', label: 'Reports & Analytics', icon: BarChart3 },
    { type: 'item', path: '/sync', label: 'Sync Control', icon: RefreshCw },
    { type: 'item', path: '/admin/control', label: 'Admin Control', icon: Shield },
];

interface SidebarMenuProps {
    collapsed: boolean;
    mobileOpen: boolean;
    onMobileClose: () => void;
}

export function SidebarMenu({ collapsed, mobileOpen, onMobileClose }: SidebarMenuProps) {
    const { hasPageAccess } = usePermissions();

    const hasAccess = (path: string) => {
        if (path === '/dashboard' || path === '/calendar') return hasPageAccess('dashboard');
        if (path.startsWith('/tracking')) return hasPageAccess('tracking');
        if (path.startsWith('/beneficiary')) return hasPageAccess('beneficiary');
        if (path.startsWith('/services')) return hasPageAccess('services');
        if (path.startsWith('/assessments')) return hasPageAccess('assessments');
        if (path.startsWith('/exercises')) return hasPageAccess('exercises');
        if (path === '/reports') return hasPageAccess('reports');
        if (path === '/token-management') return hasPageAccess('tokens');
        if (path === '/sync' || path === '/admin/control') return hasPageAccess('admin');
        if (path === '/settings') return hasPageAccess('settings');
        return true;
    };

    const filteredEntries: NavEntry[] = [];
    for (let i = 0; i < navEntries.length; i++) {
        const entry = navEntries[i];
        if (entry.type === 'section') {
            let hasChild = false;
            for (let j = i + 1; j < navEntries.length; j++) {
                if (navEntries[j].type === 'section') break;
                if (navEntries[j].type === 'item' && hasAccess((navEntries[j] as NavItemEntry).path)) {
                    hasChild = true;
                    break;
                }
            }
            if (hasChild) filteredEntries.push(entry);
        } else {
            if (hasAccess(entry.path)) filteredEntries.push(entry);
        }
    }

    return (
        <nav className="flex-1 overflow-y-auto py-6 space-y-1 px-3">
            {filteredEntries.map((entry) =>
                entry.type === 'section' ? (
                    <div
                        key={entry.label}
                        className={`px-3 pt-4 pb-1 text-xs font-semibold text-gray-400 tracking-wider ${collapsed ? 'text-center' : ''}`}
                    >
                        {collapsed ? '—' : entry.label}
                    </div>
                ) : (
                    <NavItem
                        key={entry.path}
                        path={entry.path}
                        label={entry.label}
                        icon={entry.icon}
                        collapsed={collapsed}
                        onClick={() => mobileOpen && onMobileClose()}
                    />
                )
            )}
        </nav>
    );
}
