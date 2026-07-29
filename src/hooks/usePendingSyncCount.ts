import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db';

// Total records not yet confirmed on the server (pending or failed), across
// every offline-capable table. Polled so any screen — not just the admin
// Sync Dashboard — can warn that a record hasn't reached Supabase yet.
export function usePendingSyncCount() {
    const [count, setCount] = useState(0);

    const loadCount = useCallback(async () => {
        const counts = await Promise.all([
            db.beneficiaries.where('sync_status').anyOf(['pending', 'failed']).count(),
            db.service_entries.where('sync_status').anyOf(['pending', 'failed']).count(),
            db.offline_initial_assessments.where('sync_status').anyOf(['pending', 'failed']).count(),
            db.offline_clinical_assessments.where('sync_status').anyOf(['pending', 'failed']).count(),
            db.offline_follow_up_assessments.where('sync_status').anyOf(['pending', 'failed']).count(),
        ]);
        setCount(counts.reduce((sum, c) => sum + c, 0));
    }, []);

    useEffect(() => {
        const timeout = setTimeout(loadCount, 0);
        const interval = setInterval(loadCount, 5000);
        return () => {
            clearTimeout(timeout);
            clearInterval(interval);
        };
    }, [loadCount]);

    return count;
}
