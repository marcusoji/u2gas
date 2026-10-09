import AdminStaffHistoryView from "@/components/admin/AdminStaffHistoryView";
import { RequireRole } from "@/components/require-role";

export default function AdminStaffHistoryPage() {
  return (
    <RequireRole role="admin">
      <AdminStaffHistoryView />
    </RequireRole>
  );
}
