"use client";

import React from "react";
import { useRouter } from "next/navigation";
import AdminGasHistoryView from "@/components/admin/AdminGasHistoryView";
import { RequireRole } from "@/components/require-role";

export default function AdminHistoryPage() {
  const router = useRouter();

  return (
    <RequireRole role="admin">
      <div className="w-full flex-1 bg-white flex flex-col items-center">
        <AdminGasHistoryView onBack={() => router.back()} />
      </div>
    </RequireRole>
  );
}
