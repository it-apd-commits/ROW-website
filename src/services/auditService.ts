import { supabase } from '@/lib/supabase';

export const auditService = {
    async log(action: string, details: Record<string, unknown> = {}, userId?: string): Promise<void> {
        try {
            let uid = userId;
            if (!uid) {
                const { data: { user } } = await supabase.auth.getUser();
                uid = user?.id;
            }
            if (!uid) return;
            await supabase.from('audit_logs').insert({ user_id: uid, action, details });
        } catch {
            // Never crash the app on audit failure
        }
    },
};
