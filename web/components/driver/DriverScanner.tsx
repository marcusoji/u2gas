"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import ManualEntryModal from "./ManualEntryModal";
import { api, ApiError } from "@/lib/api";

export interface ScanResultData {
  orderId: string;
  customer?: string;
  itemTitle?: string;
  timestamp: string;
}

export default function DriverScanner({
  onVerified,
}: {
  /** Called after the server confirms a scan, so the caller can refresh. */
  onVerified?: () => void;
} = {}) {
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<"idle" | "success" | "failed">(
    "idle",
  );
  const [scannedResult, setScannedResult] = useState<ScanResultData | null>(
    null,
  );
  const [scanError, setScanError] = useState<string | null>(null);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const qrScannerRef = useRef<Html5Qrcode | null>(null);

  // Initialize and stop scanner
  useEffect(() => {
    let isMounted = true;

    if (isScanning && !scannedResult) {
      setCameraError(null);
      const scannerId = "driver-qr-reader";

      // Small delay to ensure DOM element is mounted
      const timer = setTimeout(async () => {
        try {
          if (!qrScannerRef.current) {
            qrScannerRef.current = new Html5Qrcode(scannerId, {
              formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
              verbose: false,
            });
          }

          const qr = qrScannerRef.current;
          await qr.start(
            { facingMode: "environment" },
            {
              fps: 10,
              qrbox: { width: 220, height: 220 },
            },
            (decodedText) => {
              if (isMounted) {
                handleScanSuccess(decodedText);
              }
            },
            () => {
              // Ignore frame-by-frame errors
            },
          );
        } catch (err: unknown) {
          if (isMounted) {
            const msg =
              err instanceof Error
                ? err.message
                : "Unable to access camera. Please check permissions.";
            setCameraError(msg);
          }
        }
      }, 150);

      return () => {
        isMounted = false;
        clearTimeout(timer);
        stopScanner();
      };
    } else {
      stopScanner();
    }

    return () => {
      isMounted = false;
      stopScanner();
    };
  }, [isScanning, scannedResult]);

  const stopScanner = async () => {
    if (qrScannerRef.current) {
      try {
        if (qrScannerRef.current.isScanning) {
          await qrScannerRef.current.stop();
        }
      } catch {
        // Safe ignore
      }
    }
  };

  const handleScanFailure = (text?: string) => {
    stopScanner();
    setIsScanning(false);
    setScanStatus("failed");
    setScannedResult({
      orderId: text?.trim() || "ORD-INVALID",
      customer: "Unrecognized Order",
      itemTitle: "Verification Failed",
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
  };

  /**
   * Redeem the scanned token with the server.
   *
   * The QR is signed and single-use; only `driver/scan` can mark the delivery
   * done, and it is the server that refuses a token that is wrong, expired, for
   * the wrong fulfilment type, or already redeemed. Deciding "success" in the
   * client would let the same token complete two drops.
   */
  const verify = async (token: string) => {
    stopScanner();
    setIsScanning(false);
    try {
      const res = await api.driver.scan(token);
      setScanStatus("success");
      onVerified?.();
      setScannedResult({
        orderId: res.order_number,
        customer: "Verified",
        itemTitle: "Delivery confirmed",
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    } catch (e) {
      handleScanFailure(token);
      setScanError(
        e instanceof ApiError ? e.message : "COULDN'T VERIFY THAT CODE",
      );
    }
  };

  const handleScanSuccess = (text: string) => {
    void verify(text.trim());
  };

  const handleManualConfirm = (code: string) => {
    void verify(code.trim().toUpperCase());
  };

  const handleReset = () => {
    setScannedResult(null);
    setScanStatus("idle");
    setCameraError(null);
    setScanError(null);
    setIsScanning(false);
  };

  const toggleScan = () => {
    if (scanStatus !== "idle" || scannedResult) {
      handleReset();
    }
    setIsScanning((prev) => !prev);
  };

  return (
    <div className="w-full flex flex-col items-center select-none">
      {/* ──────────────── SCANNER VIEWPORT FRAME ──────────────── */}
      <div
        className="relative w-[260px] sm:w-[280px] aspect-[4/5] max-w-[80vw] flex items-center justify-center my-2"
        style={{ aspectRatio: "4 / 5" }}
      >
        {/* Frame graphic (Border pattern matching user mockup) */}
        <div className="absolute inset-0 pointer-events-none z-20">
          <Image
            src="/images/driver-scanner-frame-v2.png"
            alt="Scanner Frame"
            fill
            priority
            className="object-fill"
          />
        </div>

        {/* Viewport Interior Content */}
        <div className="relative w-[84%] h-[87%] rounded-[36px] overflow-hidden flex items-center justify-center z-10">
          {isScanning ? (
            /* STATE 2: ACTIVE LIVE CAMERA SCANNING */
            <div className="relative w-full h-full flex flex-col items-center justify-center bg-black overflow-hidden">
              <div
                id="driver-qr-reader"
                className="w-full h-full [&_video]:object-cover [&_video]:w-full [&_video]:h-full"
              />

              {/* Sweeping Laser Line Animation */}
              <motion.div
                initial={{ top: "10%" }}
                animate={{ top: "85%" }}
                transition={{
                  repeat: Infinity,
                  repeatType: "reverse",
                  duration: 1.8,
                  ease: "easeInOut",
                }}
                className="absolute left-4 right-4 h-[2px] bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.9),0_0_4px_#fff] z-30 pointer-events-none"
              />

              {/* Camera Error or Desktop Fallback Simulation */}
              {cameraError && (
                <div className="absolute inset-0 bg-black/90 p-4 flex flex-col items-center justify-center text-center z-40">
                  <p className="text-[10px] text-red-400 uppercase mb-2 tracking-wider">
                    {cameraError.includes("Permission") ||
                    cameraError.includes("NotAllowed")
                      ? "CAMERA PERMISSION DENIED"
                      : "CAMERA UNAVAILABLE"}
                  </p>
                  <p className="text-[9px] text-neutral-400 uppercase mb-3">
                    Enter the order number with the pen instead
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsManualModalOpen(true);
                        setIsScanning(false);
                      }}
                      className="px-3 py-1.5 rounded-full bg-[#1317E4] text-white text-[10px] uppercase tracking-wider cursor-pointer active:scale-95"
                    >
                      Enter Order Number
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* STATE 3: IDLE VIEW WITH BLURRED TARGET (Matching Mockup) */
            <div className="relative w-full h-full flex items-center justify-center">
              <div className="relative w-full h-full filter blur-[4.5px] opacity-80 select-none pointer-events-none">
                <Image
                  src="/images/trash.jpg"
                  alt="Target"
                  fill
                  priority
                  className="object-cover mix-blend-multiply"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ──────────────── ACTION CONTROLS (SCAN & PEN BUTTONS) ──────────────── */}
      <div className="flex items-center justify-center gap-4 mt-4">
        {/* Blue Pill "SCAN" Button */}
        <button
          type="button"
          onClick={toggleScan}
          className="py-3 px-9 rounded-full bg-brand-primary hover:bg-brand-primary/95 text-white text-base tracking-widest uppercase flex items-center justify-center cursor-pointer active:scale-95"
        >
          {isScanning ? "STOP" : "SCAN"}
        </button>

        {/* Circular Signature / Manual Entry Button */}
        <button
          type="button"
          onClick={() => setIsManualModalOpen(true)}
          aria-label="Manual Entry"
          className="w-12 h-12 rounded-full bg-linear-to-b from-white to-[#D5D5D5] border border-[#D8DCE5] flex items-center justify-center cursor-pointer active:scale-95 shadow-sm"
        >
          <Image
            src="/images/manual-sign-pen.png"
            alt="Manual Entry"
            width={26}
            height={26}
            className="object-contain"
            priority
          />
        </button>
      </div>

      {/* ──────────────── SUCCESS / FAILED OVERLAY (OUTSIDE SCAN BOX, ON TOP) ──────────────── */}
      <AnimatePresence>
        {(scanStatus === "success" ||
          scanStatus === "failed" ||
          (scannedResult && scanStatus !== "idle")) && (
          <motion.div
            key="driver-scan-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleReset}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[3px] flex flex-col items-center justify-center select-none cursor-pointer overflow-hidden p-4 touch-none overscroll-none"
          >
            <div className="flex flex-col items-center justify-center relative -translate-y-44 sm:-translate-y-48">
              {/* Green ambient radial glow for success, Red for failure */}
              <motion.div
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35 }}
                className={`absolute -inset-16 pointer-events-none z-10 ${
                  scanStatus === "failed"
                    ? "bg-[radial-gradient(circle_at_center,rgba(220,38,38,0.75)_0%,rgba(185,28,28,0.4)_45%,transparent_80%)]"
                    : "bg-[radial-gradient(circle_at_center,rgba(74,222,128,0.75)_0%,rgba(34,197,94,0.4)_45%,transparent_80%)]"
                }`}
              />

              {/* Hand sticker with spring pop animation */}
              <motion.div
                initial={{
                  scale: 0.15,
                  opacity: 0.3,
                  rotate: scanStatus === "failed" ? 6 : -6,
                }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 350,
                  damping: 18,
                }}
                className="relative z-20 w-52 h-64 sm:w-60 sm:h-72 max-w-full flex items-center justify-center select-none"
              >
                <Image
                  src={
                    scanStatus === "failed"
                      ? "/images/driver-failed-hand.png"
                      : "/images/driver-success-hand.png"
                  }
                  alt={scanStatus === "failed" ? "Scan Failed" : "Scan Success"}
                  width={240}
                  height={315}
                  priority
                  className="object-contain drop-shadow-[0_16px_36px_rgba(0,0,0,0.45)] pointer-events-none"
                />
              </motion.div>

              {scanError && (
                <p className="relative z-30 mt-4 text-[11px] font-mono tracking-wider text-white uppercase text-center max-w-[280px]">
                  {scanError}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual Entry Sheet Modal */}
      <ManualEntryModal
        open={isManualModalOpen}
        onOpenChange={setIsManualModalOpen}
        onConfirm={handleManualConfirm}
      />
    </div>
  );
}
