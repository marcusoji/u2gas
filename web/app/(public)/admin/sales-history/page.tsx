"use client";

import React from "react";
import { useRouter } from "next/navigation";
import AdminSalesHistoryView from "@/components/admin/AdminSalesHistoryView";

export default function AdminSalesHistoryPage() {
  const router = useRouter();

  return (
    <div className="w-full flex-1 bg-white flex flex-col items-center">
      <AdminSalesHistoryView onBack={() => router.back()} />
    </div>
  );
}

