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

    // Global reconnect handler — pages with useOnlineStatus also trigger this,
    // but this guarantees sync fires on reconnect no matter which page is open.
    const handleOnline = async () => {
      const { SyncService } = await import('./lib/syncService');
      SyncService.syncPendingRecords().catch(console.error);
    };
    window.addEventListener('online', handleOnline);

    // Periodic retry: a push can fail once (transient network blip, dropped
    // session) and stay stuck in Dexie until the next reload or online event.
    // Re-attempting every 30s while online lets it self-heal without either.
    const retryInterval = setInterval(() => {
      if (navigator.onLine) {
        import('./lib/syncService').then(({ SyncService }) => {
          SyncService.syncPendingRecords().catch(console.error);
        });
      }
    }, 30000);

    return () => {
      clearTimeout(timer);
      clearInterval(retryInterval);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

export default App;
