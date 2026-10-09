import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import { toViewAdminStaff, type ViewAdminStaff } from "@/lib/adapters";

interface AddStaffBody {
  email: string;
  display_name: string;
  role: "staff" | "admin" | "driver";
  bank_name?: string;
  account_number?: string;
}

interface AdminStaffState {
  staffList: ViewAdminStaff[];
  selectedStaffId: string;
  loading: boolean;
  loaded: boolean;
  saving: boolean;
  error: ApiError | null;
  load: () => Promise<void>;
  setSelectedStaffId: (id: string) => void;
  addStaff: (body: AddStaffBody) => Promise<ApiError | null>;
  updateStaff: (
    id: string,
    body: {
      display_name?: string;
      role?: "staff" | "admin" | "driver";
      bank_name?: string | null;
      account_number?: string | null;
    },
  ) => Promise<ApiError | null>;
  removeStaff: (id: string) => Promise<ApiError | null>;
}

/**
 * The roster comes from `/admin/staff`, and add/remove are the two endpoints
 * migration 0024 backs. It is a store rather than a hook because three screens
 * (the menu, the roster and the edit sheet) render the same people and must
 * agree; keeping one copy avoids the menu and the roster disagreeing after an
 * add.
 */
export const useAdminStaffStore = create<AdminStaffState>((set, get) => ({
  staffList: [],
  selectedStaffId: "",
  loading: false,
  loaded: false,
  saving: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const { staff } = await api.admin.staff();
      const staffList = staff.map(toViewAdminStaff);
      const selected = get().selectedStaffId;
      set({
        staffList,
        loading: false,
        loaded: true,
        selectedStaffId: staffList.some((s) => s.id === selected)
          ? selected
          : (staffList[0]?.id ?? ""),
      });
    } catch (e) {
      set({
        loading: false,
        loaded: true,
        error:
          e instanceof ApiError
            ? e
            : new ApiError("INTERNAL", 500, "SOMETHING WENT WRONG"),
      });
    }
  },

  setSelectedStaffId: (id) => set({ selectedStaffId: id }),

  addStaff: async (body) => {
    set({ saving: true, error: null });
    try {
      await api.admin.addStaff(body);
      await get().load();
      return null;
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError("INTERNAL", 500, "SOMETHING WENT WRONG");
      set({ saving: false, error: err });
      return err;
    } finally {
      set({ saving: false });
    }
  },

  removeStaff: async (id) => {
    set({ saving: true, error: null });
    try {
      await api.admin.removeStaff(id);
      await get().load();
      return null;
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError("INTERNAL", 500, "SOMETHING WENT WRONG");
      set({ saving: false, error: err });
      return err;
    } finally {
      set({ saving: false });
    }
  },

  updateStaff: async (id, body) => {
    set({ saving: true, error: null });
    try {
      await api.admin.updateStaff(id, body);
      await get().load();
      return null;
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError("INTERNAL", 500, "SOMETHING WENT WRONG");
      set({ saving: false, error: err });
      return err;
    } finally {
      set({ saving: false });
    }
  },
}));
