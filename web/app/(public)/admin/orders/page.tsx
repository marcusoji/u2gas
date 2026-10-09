"use client";

import React from "react";
import { useRouter } from "next/navigation";
import AdminOrdersView from "@/components/admin/AdminOrdersView";
import { RequireRole } from "@/components/require-role";

export default function Page() {
  const router = useRouter();
  return (
    <RequireRole role="admin">
      <div className="w-full flex-1 bg-white flex flex-col items-center">
        <AdminOrdersView onBack={() => router.push("/admin/menu")} />
      </div>
    </RequireRole>
  );
}
