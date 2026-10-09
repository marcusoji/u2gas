"use client";

import { RoleGuard } from "@/components/auth/RoleGuard";

/**
 * Every screen under `/admin` belongs to the admin role, so the gate lives on
 * the subtree rather than on each page. The Worker enforces the same boundary
 * with `requireRole`; this only keeps a wrong-role visitor off an empty shell.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleGuard allow={["admin"]}>{children}</RoleGuard>;
}
