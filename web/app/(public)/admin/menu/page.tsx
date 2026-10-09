"use client";

import React from "react";
import { useRouter } from "next/navigation";
import AdminMenuModal from "@/components/admin/AdminMenuModal";
import { RequireRole } from "@/components/require-role";
import { paths } from "@/utils/paths";

export default function AdminMenuPage() {
  const router = useRouter();

  return (
    <RequireRole role="admin">
      <div className="w-full min-h-screen bg-white">
        <AdminMenuModal
          open={true}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              router.push(paths.admin);
            }
          }}
        />
      </div>
    </RequireRole>
  );
}
