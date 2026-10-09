"use client";

import React from "react";
import { useRouter } from "next/navigation";
import AdminEditStaffView from "@/components/admin/AdminEditStaffView";
import { RequireRole } from "@/components/require-role";
import { paths } from "@/utils/paths";

export default function AdminEditStaffPage() {
  const router = useRouter();

  return (
    <RequireRole role="admin">
      <div className="w-full flex-1 bg-white flex flex-col items-center">
        <AdminEditStaffView
          onBack={() => router.push(paths.adminStaff)}
          onDone={() => router.push(paths.adminStaff)}
        />
      </div>
    </RequireRole>
  );
}
