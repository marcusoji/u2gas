"use client";

import Image from "next/image";
import { useAuthStore } from "@/stores/authStore";

export interface NavbarProps {
  /**
   * Whether to show profile avatar if user is logged in. Defaults to true.
   */
  showProfile?: boolean;
  /**
   * Profile click callback.
   */
  onProfileClick?: () => void;
  /**
   * Number of unread notifications to display. Defaults to 3.
   */
  notificationCount?: number;
  /**
   * Notification bell click callback.
   */
  onNotificationClick?: () => void;
  /**
   * Additional class names for styling or spacing.
   */
  className?: string;
}

export function Navbar({
  showProfile = true,
  onProfileClick,
  notificationCount = 3,
  onNotificationClick,
  className = "",
}: NavbarProps) {
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const user = useAuthStore((state) => state.user);

  const shouldShowProfile = showProfile;

  return (
    <nav
      className={`w-full flex items-center justify-between relative z-40 select-none ${className}`}
    >
      {/* Left: Profile avatar if logged in, otherwise spacer */}
      {shouldShowProfile ? (
        <button
          type="button"
          onClick={onProfileClick}
          aria-label="User Profile"
          className="relative w-10 h-10 rounded-full bg-white shadow-sm border border-neutral-200/70 flex items-center justify-center overflow-hidden hover:scale-105 active:scale-95 transition-all cursor-pointer p-0.5"
        >
          <div className="relative w-full h-full rounded-full overflow-hidden">
            <Image
              src={user?.avatar || "/images/profile-avatar.png"}
              alt={user?.firstName || "Profile"}
              fill
              className="object-cover"
            />
          </div>
        </button>
      ) : (
        <div />
      )}

      {/* Right: Notification Bell Button */}
      <button
        type="button"
        onClick={onNotificationClick}
        aria-label="Notifications"
        className="relative w-10 h-10 rounded-full bg-white shadow-sm border border-neutral-200/70 flex items-center justify-center text-neutral-800 hover:bg-neutral-50 active:scale-95 transition-all cursor-pointer"
      >
        <Image
          src="/icons/notification.svg"
          alt="Notifications"
          width={16}
          height={22}
          className="w-4 h-auto"
        />
        {notificationCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#22C55E] text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-xs">
            {notificationCount}
          </span>
        )}
      </button>
    </nav>
  );
}

export default Navbar;
