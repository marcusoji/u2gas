"use client";

import React from "react";
import { useRouter } from "next/navigation";
import AdminDriversView from "@/components/admin/AdminDriversView";
import { RequireRole } from "@/components/require-role";

export default function Page() {
  const router = useRouter();
  return (
    <RequireRole role="admin">
      <div className="w-full flex-1 bg-white flex flex-col items-center">
        <AdminDriversView onBack={() => router.push("/admin/menu")} />
      </div>
    </RequireRole>
  );
}
