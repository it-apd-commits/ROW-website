import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './routes/AppRoutes';
import { AuthProvider } from './context/AuthContext';
import { SyncService } from './lib/syncService';
import { db } from './lib/db';

function App() {
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const [bCount, sCount] = await Promise.all([
          db.beneficiaries.where('sync_status').anyOf(['pending', 'failed']).count(),
          db.service_entries.where('sync_status').anyOf(['pending', 'failed']).count(),
        ]);
        if (bCount + sCount > 0) {
          SyncService.syncPendingRecords().catch(console.error);
        }
      } catch {
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
