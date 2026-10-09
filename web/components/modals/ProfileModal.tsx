"use client";

import { useState } from "react";
import Image from "next/image";
import FullScreenView from "@/components/ui/FullScreenView";
import { useAuthStore } from "@/stores/authStore";
import type { UserProfile } from "@/types";
import { api, ApiError } from "@/lib/api";

export interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialEditMode?: boolean;
  /** Called after sign-out so the caller can send the person to /login. */
  onSignedOut?: () => void;
}

export default function ProfileModal({
  open,
  onOpenChange,
  initialEditMode = false,
  onSignedOut,
}: ProfileModalProps) {
  const storeUser = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const logout = useAuthStore((state) => state.logout);
  const syncFromProfile = useAuthStore((state) => state.syncFromProfile);
  const updateUser = useAuthStore((state) => state.updateUser);

  const [isEditing, setIsEditing] = useState(initialEditMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const user: UserProfile = storeUser ?? {};

  const handleLogout = async () => {
    onOpenChange(false);
    await logout();
    onSignedOut?.();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const first_name = ((formData.get("firstName") as string) || "").trim();
    const last_name = ((formData.get("lastName") as string) || "").trim();
    const phone = ((formData.get("phone") as string) || "").trim();

    setError(null);
    setSaving(true);

    // Optimistic: the fields are what the person just typed, and a failure
    // rolls the whole object back to the server's copy below.
    const optimistic: UserProfile = {
      ...user,
      firstName: first_name,
      lastName: last_name,
    };
    updateUser(optimistic);

    try {
      await api.updateMe({ first_name, last_name, phone });
      if (profile) {
        syncFromProfile({
          ...profile,
          first_name,
          last_name,
          phone: phone || null,
        });
      }
      setIsEditing(false);
    } catch (err) {
      if (profile) syncFromProfile(profile); // discard the optimistic edit
      setError(err instanceof ApiError ? err.message : "COULDN'T SAVE");
    } finally {
      setSaving(false);
    }
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
              disabled={saving}
              className="bg-[#1317E4] hover:bg-[#0F12BE] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed text-white text-[11px] font-bold px-5 py-0.5 rounded-full transition-all mt-2 shadow-xs cursor-pointer uppercase tracking-wider"
            >
              {saving ? "SAVING…" : "DONE"}
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
            {/* Email is the sign-in identity. Changing it needs a confirmation
                round trip through Supabase, so it is shown, never edited here. */}
            <span className="text-[17px] sm:text-[19px] font-bold text-[#1317E4] tracking-wider uppercase leading-tight truncate max-w-full">
              {user.email || "NOT SET"}
            </span>
          </div>

          {/* PHONE */}
          <div
            className={`w-full rounded-full bg-white py-3 px-6 flex flex-col items-center justify-center text-center transition-all mt-1.5 ${
              isEditing
                ? "border border-dashed border-[#A5B4FC]/90 shadow-[0_2px_12px_rgba(0,0,0,0.02)]"
                : "border border-neutral-100/90 shadow-[0_6px_24px_rgba(0,0,0,0.04)]"
            }`}
          >
            <span className="text-[10px] text-[#1317E4] tracking-[0.14em] uppercase mb-0.5">
              PHONE
            </span>
            {isEditing ? (
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                defaultValue={profile?.phone || ""}
                placeholder="+234..."
                className="w-full text-center bg-transparent border-none outline-none text-[15px] sm:text-[16px] font-bold text-[#838EF8] focus:text-[#1317E4] tracking-wider leading-tight"
              />
            ) : (
              <span className="text-[15px] sm:text-[16px] font-bold text-[#1317E4] tracking-wider leading-tight truncate max-w-full">
                {profile?.phone || "NOT SET"}
              </span>
            )}
          </div>

          {error && (
            <p
              role="alert"
              className="text-[11px] font-mono tracking-wider text-red-500 uppercase text-center"
            >
              {error}
            </p>
          )}
        </div>
      </form>
    </FullScreenView>
  );
}

export { ProfileModal };

