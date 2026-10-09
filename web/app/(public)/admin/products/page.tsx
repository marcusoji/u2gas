"use client";

import React from "react";
import { useRouter } from "next/navigation";
import AdminProductsView from "@/components/admin/AdminProductsView";
import { RequireRole } from "@/components/require-role";

export default function Page() {
  const router = useRouter();
  return (
    <RequireRole role="admin">
      <div className="w-full flex-1 bg-white flex flex-col items-center">
        <AdminProductsView onBack={() => router.push("/admin/menu")} />
      </div>
    </RequireRole>
  );
}
