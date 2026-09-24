import { lazy, Suspense } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { LoadBar } from "../../components/primitives";

const Tank         = lazy(() => import("./Tank"));
const Products     = lazy(() => import("./Products"));
const BundleUpload = lazy(() => import("./BundleUpload"));
const Orders       = lazy(() => import("./Orders"));
const People       = lazy(() => import("./People"));
const Settings     = lazy(() => import("./Settings"));
const Audit        = lazy(() => import("./Audit"));
const Reports      = lazy(() => import("./Reports"));

export default function AdminApp() {
  return (
    <div>
      <Suspense fallback={
        <div className="screen" style={{ justifyContent: "center" }}>
          <LoadBar label="OPENING THE OFFICE" />
        </div>
      }>
        <Routes>
          <Route index element={<Tank />} />
          <Route path="products" element={<Products />} />
          <Route path="bundles/new" element={<BundleUpload />} />
          <Route path="orders" element={<Orders />} />
          <Route path="people" element={<People />} />
          <Route path="settings" element={<Settings />} />
          <Route path="reports" element={<Reports />} />
          <Route path="audit" element={<Audit />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Suspense>

      <nav style={{
        position: "sticky", bottom: 0,
        background: "var(--white)",
        borderTop: "1px solid var(--field)",
        display: "flex", overflowX: "auto",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}>
        {[
          { to: "/admin", label: "TANK", end: true },
          { to: "/admin/products", label: "STOCK" },
          { to: "/admin/orders", label: "ORDERS" },
          { to: "/admin/people", label: "PEOPLE" },
          { to: "/admin/settings", label: "SETUP" },
          { to: "/admin/reports", label: "REPORTS" },
          { to: "/admin/audit", label: "LOG" },
        ].map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end}
            style={({ isActive }) => ({
              flex: "1 0 auto", textAlign: "center",
              padding: "var(--s-3) var(--s-3)",
              fontSize: "var(--t-caption)", letterSpacing: ".1em",
              textDecoration: "none", whiteSpace: "nowrap",
              color: isActive ? "var(--blue)" : "var(--grey)",
            })}>
            {i.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
