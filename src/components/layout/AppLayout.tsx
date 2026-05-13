import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { TokenService } from '@/services/tokenService';

export function AppLayout() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        // Initialize token sequence on login/mount
        TokenService.getLastToken();
    }, []);

    return (
        <div className="flex h-screen bg-background text-text-main font-sans overflow-hidden">
            <Sidebar
                collapsed={sidebarCollapsed}
                onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
                mobileOpen={mobileMenuOpen}
                onMobileClose={() => setMobileMenuOpen(false)}
            />

            <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
                <Header onMenuClick={() => setMobileMenuOpen(true)} />

                <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8">
                    <div className="max-w-7xl mx-auto w-full min-w-0">
                        <Outlet />
                    </div>
                </main>

                <footer className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-1 px-4 md:px-8 py-3 border-t border-gray-100 bg-white text-xs text-text-muted">
                    <span>
                        &copy; {new Date().getFullYear()} <span className="font-semibold text-primary">Rehab on Wheels</span> &mdash; The Association of People with Disability
                    </span>
                    <span className="font-medium text-gray-400 sm:text-right">
                        Developed by <span className="text-primary font-semibold">APD IT</span>
                    </span>
                </footer>
            </div>
        </div>
    );
}
