import { createContext } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import type { UserRole, UserProfile } from '@/types/rbac';

export interface AuthContextType {
    isAuthenticated: boolean;
    user: User | null;
    session: Session | null;
    isLoading: boolean;
    logout: () => Promise<void>;
    role: UserRole;
    profile: UserProfile | null;
    refreshProfile: () => Promise<void>;
    // Set when fetchProfile finds profiles.is_active === false for the
    // signed-in account (and it isn't an emergency admin) — the account is
    // signed out immediately after. Login.tsx surfaces this as an error.
    disabledMessage: string | null;
    clearDisabledMessage: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
