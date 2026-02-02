import { Suspense } from 'react';
import DashboardClient from './ui/DashboardClient';

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p>Loading dashboard...</p>
        </div>
      }
    >
      <DashboardClient />
    </Suspense>
  );
}

