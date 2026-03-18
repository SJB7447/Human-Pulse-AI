import { Header } from '@/components/Header';
import { AdminNotificationSettings } from '@/components/notifications/AdminNotificationSettings';

export default function AdminNotificationSettingsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="mx-auto max-w-5xl px-6 pb-12 pt-28">
        <AdminNotificationSettings />
      </main>
    </div>
  );
}
