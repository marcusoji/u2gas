"use client";

import React from "react";
import { useRouter } from "next/navigation";
import AdminSalesHistoryView from "@/components/admin/AdminSalesHistoryView";
import { RequireRole } from "@/components/require-role";

export default function AdminSalesHistoryPage() {
  const router = useRouter();

  return (
    <RequireRole role="admin">
      <div className="w-full flex-1 bg-white flex flex-col items-center">
        <AdminSalesHistoryView onBack={() => router.back()} />
      </div>
    </RequireRole>
  );
}

