import { lazy, Suspense } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { LoadBar } from "../../components/primitives";

const Drops    = lazy(() => import("./Drops"));
const Drop     = lazy(() => import("./Drop"));
const DriverScan = lazy(() => import("./DriverScan"));
const DriverMe = lazy(() => import("./DriverMe"));

export default function DriverApp() {
  return (
    <div>
      <Suspense fallback={
        <div className="screen" style={{ justifyContent: "center" }}>
          <LoadBar label="STARTING UP" />
        </div>
      }>
        <Routes>
          <Route index element={<Drops />} />
          <Route path="drops/:id" element={<Drop />} />
          <Route path="scan" element={<DriverScan />} />
          <Route path="me" element={<DriverMe />} />
          <Route path="*" element={<Navigate to="/driver" replace />} />
        </Routes>
      </Suspense>

      <nav style={{
        position: "sticky", bottom: 0,
        background: "var(--white)",
        borderTop: "1px solid var(--field)",
        display: "flex",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}>
        {[
          { to: "/driver", label: "DROPS", end: true },
          { to: "/driver/scan", label: "SCAN" },
          { to: "/driver/me", label: "ME" },
        ].map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end}
            style={({ isActive }) => ({
              flex: 1, textAlign: "center", padding: "var(--s-3) 0",
              fontSize: "var(--t-caption)", letterSpacing: ".1em",
              textDecoration: "none",
              color: isActive ? "var(--blue)" : "var(--grey)",
            })}>
            {i.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
