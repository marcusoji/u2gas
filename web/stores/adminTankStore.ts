import { create } from "zustand";

export interface AdminTankState {
  level: number; // 0 - 100 percentage
  tons: number; // current gas tons in tank
  totalCapacityTons: number; // max capacity of tank in tons (default 15)
  daysLeft: number; // predicted days remaining
  unit: "TONS" | "%";

  // Actions
  setUnit: (unit: "TONS" | "%") => void;
  toggleUnit: () => void;
  setLevel: (newLevel: number) => void;
  setTons: (newTons: number) => void;
  increment: () => void;
  decrement: () => void;
  setTankData: (
    data: Partial<{
      level: number;
      tons: number;
      totalCapacityTons: number;
      daysLeft: number;
    }>,
  ) => void;
  resetTankData: () => void;
}

const DEFAULT_CAPACITY = 15;
const BURN_RATE_PER_DAY = 15 * 0.4 / 34; // ~0.17647 Tons/day so 6 Tons = 34 Days

function computeDerived(
  tons: number,
  capacity: number = DEFAULT_CAPACITY,
) {
  const clampedTons = Math.max(0, Math.min(capacity, Number(tons.toFixed(1))));
  const level = Math.round((clampedTons / capacity) * 100);
  const daysLeft = clampedTons <= 0 ? 0 : Math.round(clampedTons / BURN_RATE_PER_DAY);
  return { level, tons: clampedTons, daysLeft };
}

export const useAdminTankStore = create<AdminTankState>((set, get) => ({
  level: 40,
  tons: 6,
  totalCapacityTons: DEFAULT_CAPACITY,
  daysLeft: 34,
  unit: "TONS",

  setUnit: (unit) => set({ unit }),

  toggleUnit: () =>
    set((state) => ({ unit: state.unit === "TONS" ? "%" : "TONS" })),

  setLevel: (newLevel) => {
    const clampedLevel = Math.max(0, Math.min(100, Math.round(newLevel)));
    const capacity = get().totalCapacityTons;
    const tons = Number(((clampedLevel / 100) * capacity).toFixed(1));
    const daysLeft = tons <= 0 ? 0 : Math.round(tons / BURN_RATE_PER_DAY);
    set({ level: clampedLevel, tons, daysLeft });
  },

  setTons: (newTons) => {
    const capacity = get().totalCapacityTons;
    const derived = computeDerived(newTons, capacity);
    set({ ...derived });
  },

  increment: () => {
    const { unit, tons, level, totalCapacityTons } = get();
    if (unit === "TONS") {
      const nextTons = Math.min(totalCapacityTons, Math.floor(tons) + 1);
      const derived = computeDerived(nextTons, totalCapacityTons);
      set({ ...derived });
    } else {
      const nextLevel = Math.min(100, level + 5);
      const newTons = Number(((nextLevel / 100) * totalCapacityTons).toFixed(1));
      const daysLeft = newTons <= 0 ? 0 : Math.round(newTons / BURN_RATE_PER_DAY);
      set({ level: nextLevel, tons: newTons, daysLeft });
    }
  },

  decrement: () => {
    const { unit, tons, level, totalCapacityTons } = get();
    if (unit === "TONS") {
      const nextTons = Math.max(0, Math.ceil(tons) - 1);
      const derived = computeDerived(nextTons, totalCapacityTons);
      set({ ...derived });
    } else {
      const nextLevel = Math.max(0, level - 5);
      const newTons = Number(((nextLevel / 100) * totalCapacityTons).toFixed(1));
      const daysLeft = newTons <= 0 ? 0 : Math.round(newTons / BURN_RATE_PER_DAY);
      set({ level: nextLevel, tons: newTons, daysLeft });
    }
  },

  setTankData: (data) => {
    set((state) => {
      const capacity = data.totalCapacityTons ?? state.totalCapacityTons;
      let level = data.level ?? state.level;
      let tons = data.tons ?? state.tons;
      let daysLeft = data.daysLeft ?? state.daysLeft;

      if (data.tons !== undefined && data.level === undefined) {
        const derived = computeDerived(data.tons, capacity);
        level = derived.level;
        tons = derived.tons;
        daysLeft = derived.daysLeft;
      } else if (data.level !== undefined && data.tons === undefined) {
        level = Math.max(0, Math.min(100, Math.round(data.level)));
        tons = Number(((level / 100) * capacity).toFixed(1));
        daysLeft = tons <= 0 ? 0 : Math.round(tons / BURN_RATE_PER_DAY);
      }

      return {
        ...state,
        ...data,
        level,
        tons,
        totalCapacityTons: capacity,
        daysLeft,
      };
    });
  },

  resetTankData: () => {
    set({
      level: 40,
      tons: 6,
      totalCapacityTons: DEFAULT_CAPACITY,
      daysLeft: 34,
      unit: "TONS",
    });
  },
}));
