"use client";

import React from "react";
import { useRouter } from "next/navigation";
import AdminStaffView from "@/components/admin/AdminStaffView";
import { RequireRole } from "@/components/require-role";
import { paths } from "@/utils/paths";

export default function AdminStaffPage() {
  const router = useRouter();

  return (
    <RequireRole role="admin">
      <div className="w-full flex-1 bg-white flex flex-col items-center">
        <AdminStaffView onBack={() => router.push(paths.adminMenu)} />
      </div>
    </RequireRole>
  );
}
