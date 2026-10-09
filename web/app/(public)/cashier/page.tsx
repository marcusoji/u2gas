import type { Metadata } from "next";
import CashierPageClient from "@/components/cashier/CashierPageClient";
import { RoleGuard } from "@/components/auth/RoleGuard";

export const metadata: Metadata = {
  title: "Cashier Scanner | U2 Gas",
  description: "U2 Gas Cashier QR Scanner and Order Payment Verification",
};

export default function CashierPage() {
  return (
    <RoleGuard allow={["staff", "admin"]}>
      <CashierPageClient />
    </RoleGuard>
  );
}
