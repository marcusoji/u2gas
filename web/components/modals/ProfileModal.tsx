"use client";

import { useState } from "react";
import Image from "next/image";
import FullScreenView from "@/components/ui/FullScreenView";
import { useAuthStore } from "@/stores/authStore";
import { dummyUserProfile } from "@/data";
import type { UserProfile } from "@/types";

export interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialEditMode?: boolean;
  /** Optional custom user profile override (e.g. from React Query / Server Component) */
  user?: UserProfile;
  /** Optional handler for React Query mutation or custom save logic */
  onSave?: (data: UserProfile) => void | Promise<void>;
  /** Optional Server Action for form submission */
  action?: (formData: FormData) => void | Promise<void>;
}

export default function ProfileModal({
  open,
  onOpenChange,
  initialEditMode = false,
  user: userProp,
  onSave,
  action,
}: ProfileModalProps) {
  const storeUser = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const updateUser = useAuthStore((state) => state.updateUser);

  const [isEditing, setIsEditing] = useState(initialEditMode);

  // Derived user profile data (supports prop injection or zustand store fallback)
  const user = userProp || storeUser || dummyUserProfile;

  const handleLogout = async () => {
    await logout();
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    if (action) {
      // Allow Server Action integration
      return;
    }
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: UserProfile = {
      firstName: (formData.get("firstName") as string)?.trim(),
      lastName: (formData.get("lastName") as string)?.trim(),
      email: (formData.get("email") as string)?.trim(),
      address: (formData.get("address") as string)?.trim(),
    };

    if (onSave) {
      await onSave(data);
    } else {
      updateUser(data);
    }

    setIsEditing(false);
  };

  return (
    <FullScreenView
      open={open}
      onClose={() => {
        setIsEditing(false);
        onOpenChange(false);
      }}
      title="PERSONAL DETAILS"
      headerRight={
        <button
          type="button"
          onClick={handleLogout}
          className="text-[11px] text-[#838EF8] hover:text-[#1317E4] font-mono font-bold uppercase tracking-wider px-2 py-1 rounded-md hover:bg-neutral-50 transition-colors cursor-pointer"
        >
          LOG OUT
        </button>
      }
      contentClassName="pt-2 pb-8"
    >
      <form
        id="profile-form"
        action={action}
        onSubmit={handleSubmit}
        className="w-full flex flex-col items-center"
      >
        {/* Polaroid-Style Photo */}
        <div className="flex flex-col items-center mb-4 shrink-0">
          <div className="bg-white p-2 pb-3 rounded-[4px] shadow-[0_8px_24px_rgba(0,0,0,0.12)] border border-neutral-100 flex flex-col items-center">
            <div className="relative w-26 h-28 sm:w-28 sm:h-32 overflow-hidden rounded-[2px] bg-neutral-100">
              <Image
                src={user.avatar || "/images/profile-avatar.png"}
                alt={`${user.firstName || "User"} avatar`}
                fill
                priority
                className="object-cover"
              />
            </div>
          </div>

          {/* Manage / DONE Pill Button */}
          {isEditing ? (
            <button
              type="submit"
              className="bg-[#1317E4] hover:bg-[#0F12BE] active:scale-95 text-white text-[11px] font-bold px-5 py-0.5 rounded-full transition-all mt-2 shadow-xs cursor-pointer uppercase tracking-wider"
            >
              DONE
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="bg-[#B9BFF8] hover:bg-[#A8AFF6] active:scale-95 text-[#1317E4] text-[11px] font-bold px-4 py-0.5 rounded-full transition-all mt-2 shadow-xs cursor-pointer lowercase"
            >
              manage
            </button>
          )}
        </div>

        {/* Detail Pill Cards & Map Section (396px wide) */}
        <div className="w-full flex flex-col gap-2.5 sm:gap-3 max-w-[396px] items-center">
          {/* FIRST NAME */}
          <div
            className={`w-full rounded-full bg-white py-3 px-6 flex flex-col items-center justify-center text-center transition-all ${
              isEditing
                ? "border border-dashed border-[#A5B4FC]/90 shadow-[0_2px_12px_rgba(0,0,0,0.02)]"
                : "border border-neutral-100/90 shadow-[0_6px_24px_rgba(0,0,0,0.04)]"
            }`}
          >
            <span className="text-[10px] text-[#1317E4] tracking-[0.14em] uppercase mb-0.5">
              FIRST NAME
            </span>
            {isEditing ? (
              <input
                name="firstName"
                type="text"
                defaultValue={user.firstName || "JOHN"}
                className="w-full text-center bg-transparent border-none outline-none text-[20px] sm:text-[22px] font-bold text-[#838EF8] focus:text-[#1317E4] tracking-wider uppercase leading-tight"
              />
            ) : (
              <span className="text-[20px] sm:text-[22px] font-bold text-[#1317E4] tracking-wider uppercase leading-tight">
                {user.firstName || "JOHN"}
              </span>
            )}
          </div>

          {/* LAST NAME */}
          <div
            className={`w-full rounded-full bg-white py-3 px-6 flex flex-col items-center justify-center text-center transition-all ${
              isEditing
                ? "border border-dashed border-[#A5B4FC]/90 shadow-[0_2px_12px_rgba(0,0,0,0.02)]"
                : "border border-neutral-100/90 shadow-[0_6px_24px_rgba(0,0,0,0.04)]"
            }`}
          >
            <span className="text-[10px] text-[#1317E4] tracking-[0.14em] uppercase mb-0.5">
              LAST NAME
            </span>
            {isEditing ? (
              <input
                name="lastName"
                type="text"
                defaultValue={user.lastName || "doe"}
                className="w-full text-center bg-transparent border-none outline-none text-[20px] sm:text-[22px] font-bold text-[#838EF8] focus:text-[#1317E4] tracking-wider leading-tight"
              />
            ) : (
              <span className="text-[20px] sm:text-[22px] font-bold text-[#1317E4] tracking-wider leading-tight">
                {user.lastName || "doe"}
              </span>
            )}
          </div>

          {/* EMAIL */}
          <div
            className={`w-full rounded-full bg-white py-3 px-6 flex flex-col items-center justify-center text-center transition-all ${
              isEditing
                ? "border border-dashed border-[#A5B4FC]/90 shadow-[0_2px_12px_rgba(0,0,0,0.02)]"
                : "border border-neutral-100/90 shadow-[0_6px_24px_rgba(0,0,0,0.04)]"
            }`}
          >
            <span className="text-[10px] text-[#1317E4] tracking-[0.14em] uppercase mb-0.5">
              EMAIL
            </span>
            {isEditing ? (
              <input
                name="email"
                type="email"
                defaultValue={user.email || "EXAMPLE@GMAIL.COM"}
                className="w-full text-center bg-transparent border-none outline-none text-[17px] sm:text-[19px] font-bold text-[#838EF8] focus:text-[#1317E4] tracking-wider uppercase leading-tight"
              />
            ) : (
              <span className="text-[17px] sm:text-[19px] font-bold text-[#1317E4] tracking-wider uppercase leading-tight truncate max-w-full">
                {user.email || "EXAMPLE@GMAIL.COM"}
              </span>
            )}
          </div>

          {/* HOME - ADDRESS */}
          <div
            className={`w-full rounded-full bg-white py-3 px-6 flex flex-col items-center justify-center text-center transition-all mt-1.5 ${
              isEditing
                ? "border border-dashed border-[#A5B4FC]/90 shadow-[0_2px_12px_rgba(0,0,0,0.02)]"
                : "border border-neutral-100/90 shadow-[0_6px_24px_rgba(0,0,0,0.04)]"
            }`}
          >
            <span className="text-[10px] text-[#1317E4] tracking-[0.14em] uppercase mb-0.5">
              HOME - ADDRESS
            </span>
            {isEditing ? (
              <input
                id="profile-address-input"
                name="address"
                type="text"
                defaultValue={user.address || "4, Anthony Villa, Um..."}
                className="w-full text-center bg-transparent border-none outline-none text-[15px] sm:text-[16px] font-bold text-[#838EF8] focus:text-[#1317E4] tracking-wider leading-tight"
              />
            ) : (
              <span className="text-[15px] sm:text-[16px] font-bold text-[#1317E4] tracking-wider leading-tight truncate max-w-full">
                {user.address || "4, Anthony Villa, Um..."}
              </span>
            )}
          </div>

          {/* Map Card in Edit Mode: 396x200 */}
          {isEditing && (
            <div className="w-full max-w-[396px] mt-2 relative rounded-[24px] overflow-hidden aspect-[396/200] flex items-center justify-center shrink-0 shadow-sm border border-neutral-200/50">
              <Image
                src="/images/map.png"
                alt="Address Map"
                width={396}
                height={200}
                className="w-full h-full object-cover select-none"
                priority
              />
            </div>
          )}
        </div>
      </form>
    </FullScreenView>
  );
}

export { ProfileModal };

