"use client";

import Navbar from "@/components/layout/Navbar";

export interface DriverHeaderProps {
  notificationCount?: number;
  onNotificationClick?: () => void;
  className?: string;
}

export function DriverHeader({
  notificationCount = 3,
  onNotificationClick,
  className = "px-6 pt-5 pb-2",
}: DriverHeaderProps) {
  return (
    <Navbar
      showProfile={false}
      notificationCount={notificationCount}
      onNotificationClick={onNotificationClick}
      className={className}
    />
  );
}

export default DriverHeader;

