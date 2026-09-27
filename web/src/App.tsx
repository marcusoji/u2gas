import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import {
  createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth, type Role } from "./lib/auth";
import { CartProvider } from "./lib/cart";
import { EMBEDDED_API } from "./mocks/gate";
import { LoadBar, PageLoading } from "./components/primitives";
import { OfflineBanner, PermissionDenied, ScreenBoundary } from "./components/states";
import { MockBar } from "./components/MockBar";

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
const Checkout     = lazy(() => import("./routes/customer/Checkout"));
const OrderStatus  = lazy(() => import("./routes/customer/OrderStatus"));
const History      = lazy(() => import("./routes/customer/History"));
const Profile      = lazy(() => import("./routes/customer/Profile"));
const PersonalDetails = lazy(() => import("./routes/customer/PersonalDetails"));
const Notifications = lazy(() => import("./routes/customer/Notifications"));
const Addresses    = lazy(() => import("./routes/customer/Addresses"));

// --- Auth -------------------------------------------------------------------
const Landing      = lazy(() => import("./routes/auth/Landing"));
const Login        = lazy(() => import("./routes/auth/Login"));
const VerifySent   = lazy(() => import("./routes/auth/VerifySent"));
const Callback     = lazy(() => import("./routes/auth/Callback"));

// --- Staff / driver / admin — separate chunks entirely -----------------------
const StaffApp  = lazy(() => import("./routes/staff/StaffApp"));
const DriverApp = lazy(() => import("./routes/driver/DriverApp"));
const AdminApp  = lazy(() => import("./routes/admin/AdminApp"));

/**
 * The customer and auth screens have no app shell of their own, so the hold is
 * applied here, once, around the whole outlet. The three app prefixes each put
 * their own hold inside their shell so it can cover the screen but not the tab
 * bar.
 */
function PageHold() {
  const location = useLocation();
  return (
    <PageLoading label="LOADING" resetKey={location.pathname}>
      <Outlet />
    </PageLoading>
  );
}

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

  // With no Worker behind it there is no login to send anyone to, so a missing
  // session is never a redirect. The embedded API always answers with the role
  // the switch selected; a role that does not hold this prefix still gets the
  // "not your door" screen, exactly as the real build would show it.
  if (!session && !EMBEDDED_API) {
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
  // Customer and auth screens share one hold. `/` is the entry screen (LOG IN 1,
  // figma 1:1219) with a guest path to `/home`.
  {
    element: <Boundary><PageHold /></Boundary>,
    children: [
      { path: "/", element: <Landing /> },
      { path: "/home", element: <CustomerHome /> },
      { path: "/shop", element: <Shop /> },
      { path: "/shop/:kind/:id", element: <ProductPage /> },
      { path: "/cart", element: <Cart /> },
      { path: "/checkout", element: <Checkout /> },
      { path: "/orders/:id", element: <OrderStatus /> },
      // Paystack returns here. The page verifies server-side before believing it.
      { path: "/orders/verify", element: <OrderStatus verifying /> },
      { path: "/auth/login", element: <Login /> },
      { path: "/auth/sent", element: <VerifySent /> },
      { path: "/auth/callback", element: <Callback /> },
      { path: "*", element: <NotFound /> },
    ],
  },

  {
    element: (
      <Guard allow={["customer", "staff", "driver", "manager", "admin"]}>
        <Boundary><PageHold /></Boundary>
      </Guard>
    ),
    children: [
      { path: "/history", element: <History /> },
      { path: "/profile", element: <Profile /> },
      { path: "/profile/details", element: <PersonalDetails /> },
      { path: "/notifications", element: <Notifications /> },
      { path: "/addresses", element: <Addresses /> },
    ],
  },

  // The three role apps. Each carries its own hold inside its shell, around the
  // screen and under its tab bar.
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
]);

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <OfflineBanner />
        <RouterProvider router={router} />
        <MockBar />
      </CartProvider>
    </AuthProvider>
  );
}
