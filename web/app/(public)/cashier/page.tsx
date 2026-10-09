import type { Metadata } from "next";
import CashierPageClient from "@/components/cashier/CashierPageClient";
import { RequireRole } from "@/components/require-role";

export const metadata: Metadata = {
  title: "Cashier Scanner | U2 Gas",
  description: "U2 Gas Cashier QR Scanner and Order Payment Verification",
};

export default function CashierPage() {
  return (
    <RequireRole role="staff">
      <CashierPageClient />
    </RequireRole>
  );
}
