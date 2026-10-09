import type { Metadata } from "next";
import DriverPageClient from "@/components/driver/DriverPageClient";
import { RoleGuard } from "@/components/auth/RoleGuard";

export const metadata: Metadata = {
  title: "Driver Scanner | U2 Gas",
  description: "U2 Gas Driver Cylinder QR Scanner and Delivery Verification",
};

export default function DriverPage() {
  return (
    <RoleGuard allow={["driver", "admin"]}>
      <DriverPageClient />
    </RoleGuard>
  );
}
