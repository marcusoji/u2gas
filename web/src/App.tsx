import { lazy, Suspense, type ReactNode } from "react";
import {
  createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth, type Role } from "./lib/auth";
import { CartProvider } from "./lib/cart";
import { LoadBar } from "./components/primitives";
import { OfflineBanner, PermissionDenied, ScreenBoundary } from "./components/states";

/* ---------------------------------------------------------------------------
   Routing (addendum 74).

   Four prefixes, four lazy chunks. A customer never downloads the admin
   bundle. The prefix is navigation only — every API call is authorised again
   on the server, and RLS enforces the same boundary at the database.
   --------------------------------------------------------------------------- */

// --- Customer (the default chunk, so no lazy wrapper on the home route) -----
import CustomerHome from "./routes/customer/Home";
const Shop         = lazy(() => import("./routes/customer/Shop"));
const ProductPage  = lazy(() => import("./routes/customer/Product"));
const Cart         = lazy(() => import("./routes/customer/Cart"));
const OrderStatus  = lazy(() => import("./routes/customer/OrderStatus"));
const History      = lazy(() => import("./routes/customer/History"));
const Profile      = lazy(() => import("./routes/customer/Profile"));
const Notifications = lazy(() => import("./routes/customer/Notifications"));
const Addresses    = lazy(() => import("./routes/customer/Addresses"));

// --- Auth -------------------------------------------------------------------
const Login        = lazy(() => import("./routes/auth/Login"));
const VerifySent   = lazy(() => import("./routes/auth/VerifySent"));
const Callback     = lazy(() => import("./routes/auth/Callback"));

// --- Staff / driver / admin — separate chunks entirely -----------------------
const StaffApp  = lazy(() => import("./routes/staff/StaffApp"));
const DriverApp = lazy(() => import("./routes/driver/DriverApp"));
const AdminApp  = lazy(() => import("./routes/admin/AdminApp"));

function Loading() {
  return (
    <div className="screen" style={{ justifyContent: "center" }}>
      <LoadBar label="LOADING" />
    </div>
  );
}

function Boundary({ children }: { children: ReactNode }) {
  return (
    <ScreenBoundary>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </ScreenBoundary>
  );
}

/**
 * Role gate.
 *
 * Someone in the wrong prefix is sent to their own root, not shown a partial
 * render of a role they don't hold. Someone signed out keeps their deep link
 * through login via `next`.
 */
function Guard({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const { session, profile, loading, home } = useAuth();
  const location = useLocation();

  if (loading) return <Loading />;

  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth/login?next=${next}`} replace />;
  }

  if (profile && !allow.includes(profile.role)) {
    return <PermissionDenied home={home} />;
  }

  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="screen" style={{ justifyContent: "center", alignItems: "center" }}>
      <span className="stamp is-loud">NO SUCH PAGE</span>
      <a href="/" className="pill" style={{ marginTop: "var(--s-8)", width: 200,
        display: "grid", placeItems: "center", textDecoration: "none" }}>
        BACK TO THE START
      </a>
    </div>
  );
}

const router = createBrowserRouter([
  { path: "/", element: <CustomerHome /> },
  { path: "/shop", element: <Boundary><Shop /></Boundary> },
  { path: "/shop/:kind/:id", element: <Boundary><ProductPage /></Boundary> },
  { path: "/cart", element: <Boundary><Cart /></Boundary> },
  { path: "/orders/:id", element: <Boundary><OrderStatus /></Boundary> },
  // Paystack returns here. The page verifies server-side before believing it.
  { path: "/orders/verify", element: <Boundary><OrderStatus verifying /></Boundary> },

  {
    element: <Guard allow={["customer", "staff", "driver", "manager", "admin"]}><Outlet /></Guard>,
    children: [
      { path: "/history", element: <Boundary><History /></Boundary> },
      { path: "/profile", element: <Boundary><Profile /></Boundary> },
      { path: "/notifications", element: <Boundary><Notifications /></Boundary> },
      { path: "/addresses", element: <Boundary><Addresses /></Boundary> },
    ],
  },

  { path: "/auth/login", element: <Boundary><Login /></Boundary> },
  { path: "/auth/sent", element: <Boundary><VerifySent /></Boundary> },
  { path: "/auth/callback", element: <Boundary><Callback /></Boundary> },

  {
    path: "/staff/*",
    element: <Guard allow={["staff", "manager", "admin"]}>
      <Boundary><StaffApp /></Boundary>
    </Guard>,
  },
  {
    path: "/driver/*",
    element: <Guard allow={["driver", "manager", "admin"]}>
      <Boundary><DriverApp /></Boundary>
    </Guard>,
  },
  {
    path: "/admin/*",
    element: <Guard allow={["manager", "admin"]}>
      <Boundary><AdminApp /></Boundary>
    </Guard>,
  },

  { path: "*", element: <NotFound /> },
]);

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <OfflineBanner />
        <RouterProvider router={router} />
      </CartProvider>
    </AuthProvider>
  );
}
