import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './routes/AppRoutes';
import { AuthProvider } from './context/AuthContext';

function App() {
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const { db } = await import('./lib/db');
        const [bCount, sCount, iCount, cCount, fCount] = await Promise.all([
          db.beneficiaries.where('sync_status').anyOf(['pending', 'failed']).count(),
          db.service_entries.where('sync_status').anyOf(['pending', 'failed']).count(),
          db.offline_initial_assessments.where('sync_status').anyOf(['pending', 'failed']).count(),
          db.offline_clinical_assessments.where('sync_status').anyOf(['pending', 'failed']).count(),
          db.offline_follow_up_assessments.where('sync_status').anyOf(['pending', 'failed']).count(),
        ]);
        if (bCount + sCount + iCount + cCount + fCount > 0) {
          const { SyncService } = await import('./lib/syncService');
          SyncService.syncPendingRecords().catch(console.error);
        }
      } catch (err) {
        console.error('[App] Dexie count failed, falling back to full sync:', err);
        const { SyncService } = await import('./lib/syncService');
        SyncService.syncPendingRecords().catch(console.error);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

export default App;
