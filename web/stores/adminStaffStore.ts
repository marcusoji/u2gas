import { create } from "zustand";
import type { AdminStaffProfile } from "@/types";
import { dummyAdminStaff } from "@/data";

/** The database's `staff` role is the design's CASHIER; keep one vocabulary. */
export const STAFF_ROLE_LABEL: Record<string, string> = {
  staff: "CASHIER",
  admin: "ADMIN",
  driver: "DRIVER",
};

/** One `/admin/staff` row, flattened to the shape the roster screens read. */
export interface StaffRow {
  staff_id: string;
  bank_name: string | null;
  account_number: string | null;
  profile: {
    profile_id: string;
    display_name: string | null;
    email: string | null;
    role: string | null;
    avatar_asset?: { base_path?: string | null } | null;
  } | null;
}

function splitName(display: string | null, email: string | null): {
  firstName: string;
  lastName: string;
} {
  const source = (display ?? email?.split("@")[0] ?? "").trim();
  if (!source) return { firstName: "", lastName: "" };
  const [first, ...rest] = source.split(/\s+/);
  return { firstName: first, lastName: rest.join(" ") };
}

export function toAdminStaffProfile(row: StaffRow): AdminStaffProfile {
  const { firstName, lastName } = splitName(
    row.profile?.display_name ?? null,
    row.profile?.email ?? null,
  );
  return {
    id: row.staff_id,
    firstName,
    lastName,
    role: STAFF_ROLE_LABEL[row.profile?.role ?? "staff"] ?? "STAFF",
    email: row.profile?.email ?? "",
    bankName: row.bank_name ?? "",
    accountNumber: row.account_number ?? "",
    avatarUrl: "",
  };
}

interface AdminStaffState {
  staffList: AdminStaffProfile[];
  selectedStaffId: string;
  setStaffList: (staff: AdminStaffProfile[]) => void;
  setSelectedStaffId: (id: string) => void;
  updateStaff: (id: string, updates: Partial<AdminStaffProfile>) => void;
  removeStaff: (id: string) => void;
  resetStaffList: () => void;
}

export const useAdminStaffStore = create<AdminStaffState>((set, get) => ({
  staffList: dummyAdminStaff.slice(0, 4),
  selectedStaffId: dummyAdminStaff[0]?.id || "staff-1",

  setStaffList: (staff) =>
    set({
      staffList: staff,
      // Keep the selection on a real row; a removed person must not linger as
      // the selected id.
      selectedStaffId:
        staff.find((s) => s.id === get().selectedStaffId)?.id ??
        staff[0]?.id ??
        "",
    }),

  setSelectedStaffId: (id: string) => set({ selectedStaffId: id }),

  updateStaff: (id: string, updates: Partial<AdminStaffProfile>) => {
    set({
      staffList: get().staffList.map((staff) =>
        staff.id === id ? { ...staff, ...updates } : staff
      ),
    });
  },

  removeStaff: (id: string) => {
    const remaining = get().staffList.filter((s) => s.id !== id);
    set({
      staffList: remaining,
      selectedStaffId: remaining[0]?.id || "",
    });
  },

  resetStaffList: () => {
    set({
      staffList: dummyAdminStaff.slice(0, 4),
      selectedStaffId: dummyAdminStaff[0]?.id || "staff-1",
    });
  },
}));
