"use client";

import React from "react";
import { useRouter } from "next/navigation";
import AdminGasHistoryView from "@/components/admin/AdminGasHistoryView";
import { paths } from "@/utils/paths";

export default function AdminHistoryPage() {
  const router = useRouter();

  return (
    <div className="w-full flex-1 bg-white flex flex-col items-center">
      <AdminGasHistoryView onBack={() => router.back()} />
    </div>
  );
}
