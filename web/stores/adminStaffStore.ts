import { create } from "zustand";
import type { AdminStaffProfile } from "@/types";
import { dummyAdminStaff } from "@/data";

interface AdminStaffState {
  staffList: AdminStaffProfile[];
  selectedStaffId: string;
  setSelectedStaffId: (id: string) => void;
  updateStaff: (id: string, updates: Partial<AdminStaffProfile>) => void;
  removeStaff: (id: string) => void;
  resetStaffList: () => void;
}

export const useAdminStaffStore = create<AdminStaffState>((set, get) => ({
  staffList: dummyAdminStaff.slice(0, 4),
  selectedStaffId: dummyAdminStaff[0]?.id || "staff-1",

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
