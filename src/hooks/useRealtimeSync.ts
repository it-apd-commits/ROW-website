import { useEffect, useLayoutEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

type Options = {
    tables: string | string[];
    onChange: () => void;
    enabled?: boolean;
    debounceMs?: number;
};

// Subscribes to Supabase Realtime postgres_changes on the given tables and
// also refetches when the tab regains focus. Refetches are debounced so a
// burst of row changes only triggers one reload.
export function useRealtimeSync({ tables, onChange, enabled = true, debounceMs = 400 }: Options) {
    const callbackRef = useRef(onChange);
    useLayoutEffect(() => {
        callbackRef.current = onChange;
    });

    // Stable key so the effect only re-runs when the set of tables changes.
    const tableKey = Array.isArray(tables) ? tables.join('|') : tables;

    useEffect(() => {
        if (!enabled) return;

        const tableList = tableKey.split('|');
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;

        const triggerRefetch = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                callbackRef.current();
            }, debounceMs);
        };

        const channel = supabase.channel(`realtime-${tableList.join('-')}-${Date.now()}`);

        tableList.forEach((table) => {
            channel.on(
                'postgres_changes' as never,
                { event: '*', schema: 'public', table },
                () => triggerRefetch()
            );
        });

        channel.subscribe();

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') triggerRefetch();
        };
        const handleFocus = () => triggerRefetch();

        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('focus', handleFocus);
        window.addEventListener('online', handleFocus);

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            supabase.removeChannel(channel);
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('online', handleFocus);
        };
    }, [tableKey, enabled, debounceMs]);
}
