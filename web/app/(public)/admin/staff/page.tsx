"use client";

import React from "react";
import { useRouter } from "next/navigation";
import AdminStaffView from "@/components/admin/AdminStaffView";
import { paths } from "@/utils/paths";

export default function AdminStaffPage() {
  const router = useRouter();

  return (
    <div className="w-full flex-1 bg-white flex flex-col items-center">
      <AdminStaffView onBack={() => router.push(paths.adminMenu)} />
    </div>
  );
}
