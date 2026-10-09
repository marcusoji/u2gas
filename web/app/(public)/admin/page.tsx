import type { Metadata } from "next";
import AdminPageClient from "@/components/admin/AdminPageClient";
import { RequireRole } from "@/components/require-role";

export const metadata: Metadata = {
  title: "Admin Tank Reservoir | U2 Gas",
  description: "U2 Gas Central Tank Level Gauge and Inventory Management",
};

export default function AdminPage() {
  return (
    <RequireRole role="admin">
      <AdminPageClient />
    </RequireRole>
  );
}
