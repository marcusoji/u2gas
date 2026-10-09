"use client";

import React from "react";
import { useRouter } from "next/navigation";
import AdminEditStaffView from "@/components/admin/AdminEditStaffView";
import { paths } from "@/utils/paths";

export default function AdminEditStaffPage() {
  const router = useRouter();

  return (
    <div className="w-full flex-1 bg-white flex flex-col items-center">
      <AdminEditStaffView
        onBack={() => router.push(paths.adminStaff)}
        onDone={() => router.push(paths.adminStaff)}
      />
    </div>
  );
}
