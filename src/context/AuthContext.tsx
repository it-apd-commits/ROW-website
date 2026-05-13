import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import type { UserRole, UserProfile } from '@/types/rbac';

import { AuthContext } from './AuthContextObject';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [role, setRole] = useState<UserRole>('Staff');
    const [profile, setProfile] = useState<UserProfile | null>(null);

    const fetchProfile = async (userId: string, userEmail?: string) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            // EMERGENCY BYPASS: Known admin emails that should always have access
            const adminEmails = ['it@apd-india.org', 'shaikazeem@apd-india.org'];
            const isEmergencyAdmin = userEmail && adminEmails.includes(userEmail.toLowerCase().trim());

            if (error) {
                console.error('AuthContext: Profile fetch error:', error);
            }

            if (data && !error) {
                setProfile(data);

                // Extremely robust role normalization
                const rawRole = (data.role || '').toString().trim().toLowerCase();
                let userRole: UserRole = 'Staff';

                // If DB says admin OR it's a known emergency admin email
                if (rawRole === 'admin' || isEmergencyAdmin) {
                    userRole = 'Admin';
                } else if (rawRole === 'manager') {
                    userRole = 'Manager';
                } else if (rawRole === 'mis') {
                    userRole = 'MIS';
                } else if (rawRole === 'fleet') {
                    userRole = 'Fleet';
                } else {
                    userRole = 'Staff';
                }

                setRole(userRole);
            } else if (isEmergencyAdmin) {
                // Fallback: If DB fetch failed but email is verified admin
                console.warn('AuthContext: Database fetch failed but email is in Admin list. Granting emergency access.');
                setRole('Admin');
                // Create a dummy profile so the app doesn't crash
                setProfile({
                    id: userId,
                    email: userEmail!,
                    role: 'Admin',
                    is_active: true,
                    full_name: userEmail?.split('@')[0]
                } as UserProfile);
            } else {
                setRole('Staff');
            }
        } catch (error) {
            console.error('AuthContext: Unexpected error in fetchProfile:', error);
            setRole('Staff');
        }
    };

    useEffect(() => {
        // Check active sessions and sets the user
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchProfile(session.user.id, session.user.email).finally(() => setIsLoading(false));
            } else {
                setIsLoading(false);
            }
        });

        // Listen for changes on auth state
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchProfile(session.user.id, session.user.email);
            } else {
                setProfile(null);
                setRole('Staff');
            }
            setIsLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const logout = async () => {
        await supabase.auth.signOut();
        setProfile(null);
        setRole('Staff');
    };

    const isAuthenticated = !!user;

    const refreshProfile = async () => {
        if (user) await fetchProfile(user.id, user.email);
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, user, session, isLoading, logout, role, profile, refreshProfile }}>
            {children}
        </AuthContext.Provider>
    );
}

