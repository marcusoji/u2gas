import { lazy, Suspense } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { LoadBar } from "../../components/primitives";

const Scan       = lazy(() => import("./Scan"));
const Queue      = lazy(() => import("./Queue"));
const WalkIn     = lazy(() => import("./WalkIn"));
const Collect    = lazy(() => import("./Collect"));
const Lookup     = lazy(() => import("./Lookup"));
const Shift      = lazy(() => import("./Shift"));

/**
 * Cashier app. Same machine as the customer terminal, in industrial grey.
 *
 * Mounted under /staff as its own chunk — a customer never downloads any of
 * this. (Addendum 74.1)
 */
export default function StaffApp() {
  return (
    <div className="app-shell">
      <Suspense fallback={
        <div className="screen" style={{ justifyContent: "center" }}>
          <LoadBar label="OPENING THE TILL" />
        </div>
      }>
        <Routes>
          <Route index element={<Scan />} />
          <Route path="queue" element={<Queue />} />
          <Route path="walk-in" element={<WalkIn />} />
          <Route path="collect/:orderId" element={<Collect />} />
          <Route path="lookup" element={<Lookup />} />
          <Route path="shift" element={<Shift />} />
          <Route path="*" element={<Navigate to="/staff" replace />} />
        </Routes>
      </Suspense>

      <StaffNav />
    </div>
  );
}

/**
 * Bottom bar. The prototype navigated by swiping between frames, which a real
 * app cannot do — a cashier needs to reach the queue mid-transaction.
 * Built from the existing tab styling rather than a new component.
 */
function StaffNav() {
  const items = [
    { to: "/staff", label: "SCAN", end: true },
    { to: "/staff/queue", label: "QUEUE" },
    { to: "/staff/walk-in", label: "WALK-IN" },
    { to: "/staff/lookup", label: "FIND" },
    { to: "/staff/shift", label: "SHIFT" },
  ];

  return (
    <nav className="app-nav">
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end}>{i.label}</NavLink>
      ))}
    </nav>
  );
}
