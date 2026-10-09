"use client";

import React from "react";
import { useRouter } from "next/navigation";
import AdminBundlesView from "@/components/admin/AdminBundlesView";
import { RequireRole } from "@/components/require-role";

export default function Page() {
  const router = useRouter();
  return (
    <RequireRole role="admin">
      <div className="w-full flex-1 bg-white flex flex-col items-center">
        <AdminBundlesView onBack={() => router.push("/admin/menu")} />
      </div>
    </RequireRole>
  );
}
