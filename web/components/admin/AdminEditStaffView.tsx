"use client";

import React, { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, X, Camera } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAdminStaffStore } from "@/stores/adminStaffStore";
import { paths } from "@/utils/paths";

interface AdminEditStaffViewProps {
  onBack?: () => void;
  onDone?: () => void;
}

/** The drawn ROLE labels mapped back to the roles the Worker accepts. */
const ROLE_VALUE: Record<string, "staff" | "admin" | "driver"> = {
  CASHIER: "staff",
  STAFF: "staff",
  ADMIN: "admin",
  DRIVER: "driver",
};

interface Draft {
  firstName: string;
  lastName: string;
  role: string;
  bankName: string;
  accountNumber: string;
}

export default function AdminEditStaffView({
  onBack,
  onDone,
}: AdminEditStaffViewProps) {
  const router = useRouter();
  const {
    staffList,
    selectedStaffId,
    setSelectedStaffId,
    addStaff,
    updateStaff,
    removeStaff,
    load,
    loaded,
    saving,
  } = useAdminStaffStore();

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newAvatarUrl, setNewAvatarUrl] = useState<string>("");
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeStaff =
    staffList.find((s) => s.id === selectedStaffId) || staffList[0];

  // A local draft so typing does not fire a request per keystroke; SAVE commits
  // it. Re-seeded whenever the selected person (or a reload) changes, using the
  // render-time reset pattern rather than an effect.
  const [draft, setDraft] = useState<Draft | null>(null);
  const [seededFor, setSeededFor] = useState<string | null>(null);
  const seedKey = activeStaff
    ? `${activeStaff.id}:${activeStaff.firstName}:${activeStaff.lastName}:${activeStaff.bankName}:${activeStaff.accountNumber}`
    : "";
  if (seedKey !== seededFor) {
    setSeededFor(seedKey);
    setDraft(
      activeStaff
        ? {
            firstName: activeStaff.firstName,
            lastName: activeStaff.lastName,
            role: activeStaff.role,
            bankName: activeStaff.bankName,
            accountNumber: activeStaff.accountNumber,
          }
        : null,
    );
  }

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.push(paths.adminStaff);
    }
  };

  const handleDone = () => {
    if (onDone) {
      onDone();
    } else {
      router.push(paths.adminStaff);
    }
  };

  const handleOpenAddModal = () => {
    setNewAvatarUrl("");
    setNotice(null);
    setIsAddModalOpen(true);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setNewAvatarUrl(url);
    }
  };

  const handleSubmitAddStaff = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const firstName = String(form.get("firstName") ?? "").trim();
    const lastName = String(form.get("lastName") ?? "").trim();
    const email = String(form.get("role") ?? "").trim();
    const roleRaw = String(form.get("roleSelect") ?? "").trim();
    const bankName = String(form.get("bankName") ?? "").trim();
    const accountNumber = String(form.get("accountNumber") ?? "").trim();

    const err = await addStaff({
      email,
      display_name: `${firstName} ${lastName}`.trim(),
      role: ROLE_VALUE[roleRaw] ?? "staff",
      bank_name: bankName || undefined,
      account_number: /^[0-9]{10}$/.test(accountNumber)
        ? accountNumber
        : undefined,
    });
    if (err) {
      setNotice(err.message);
      return;
    }
    setIsAddModalOpen(false);
  };

  const handleSave = async () => {
    if (!activeStaff || !draft) return;
    const err = await updateStaff(activeStaff.id, {
      display_name: `${draft.firstName} ${draft.lastName}`.trim(),
      role: ROLE_VALUE[draft.role.toUpperCase()] ?? "staff",
      bank_name: draft.bankName || null,
      account_number: /^[0-9]{10}$/.test(draft.accountNumber)
        ? draft.accountNumber
        : null,
    });
    setNotice(err ? err.message : "SAVED");
  };

  const handleRemoveStaff = async () => {
    if (!activeStaff) return;
    const err = await removeStaff(activeStaff.id);
    if (err) setNotice(err.message);
  };

  return (
    <div className="w-full max-w-[420px] flex-1 flex flex-col items-center justify-between px-6 py-6 sm:py-8 select-none min-h-[90vh]">
      {/* ADD NEW STAFF MODAL */}
      <AnimatePresence>
        {isAddModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-white rounded-[28px] border-2 border-dashed border-[#C5CAE9] p-5 sm:p-6 max-w-[380px] w-full shadow-[0_12px_40px_rgba(19,23,228,0.12)] relative max-h-[90vh] overflow-y-auto no-scrollbar"
            >
              <div className="flex items-center justify-between mb-2 px-1">
                <span
                  style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                  className="text-[13px] font-bold tracking-[0.18em] text-[#1317E4] uppercase"
                >
                  ADD NEW STAFF
                </span>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-1 rounded-full text-[#1317E4] hover:bg-[#ECEEFE] transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmitAddStaff} className="flex flex-col gap-2.5">
                {/* AVATAR UPLOAD */}
                <div className="flex flex-col items-center justify-center my-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-[66px] h-[66px] rounded-full border-2 border-dashed border-[#1317E4] bg-[#ECEEFE]/40 relative overflow-hidden flex flex-col items-center justify-center cursor-pointer group hover:bg-[#ECEEFE]/80 transition-all shadow-xs"
                    title="Upload Staff Photo"
                  >
                    {newAvatarUrl ? (
                      <Image
                        src={newAvatarUrl}
                        alt="New staff avatar"
                        fill
                        className="object-cover object-center"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-[#1317E4] gap-0.5">
                        <Camera className="w-5 h-5 stroke-[2.2]" />
                        <span
                          style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                          className="text-[8px] font-bold tracking-wider uppercase"
                        >
                          PHOTO
                        </span>
                      </div>
                    )}
                  </button>
                </div>
                {/* FIRST NAME */}
                <div className="w-full bg-white rounded-full py-2.5 px-4 flex flex-col items-center justify-center border border-dashed border-[#C5CAE9] focus-within:border-[#1317E4] transition-all">
                  <span
                    style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                    className="text-[10px] font-bold tracking-[0.15em] text-[#1317E4] uppercase mb-0.5"
                  >
                    FIRST NAME
                  </span>
                  <div
                    style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                    className="inline-flex items-center justify-center gap-1.5 text-[16px] font-bold text-[#1317E4]"
                  >
                    <span className="select-none">[</span>
                    <input
                      type="text"
                      name="firstName"
                      placeholder="EMPTY"
                      className="bg-transparent text-center text-[#1317E4] placeholder:text-[#838EF8]/60 uppercase tracking-widest outline-none px-1 w-[120px]"
                    />
                    <span className="select-none">]</span>
                  </div>
                </div>

                {/* LAST NAME */}
                <div className="w-full bg-white rounded-full py-2.5 px-4 flex flex-col items-center justify-center border border-dashed border-[#C5CAE9] focus-within:border-[#1317E4] transition-all">
                  <span
                    style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                    className="text-[10px] font-bold tracking-[0.15em] text-[#1317E4] uppercase mb-0.5"
                  >
                    LAST NAME
                  </span>
                  <div
                    style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                    className="inline-flex items-center justify-center gap-1.5 text-[16px] font-bold text-[#1317E4]"
                  >
                    <span className="select-none">[</span>
                    <input
                      type="text"
                      name="lastName"
                      placeholder="EMPTY"
                      className="bg-transparent text-center text-[#1317E4] placeholder:text-[#838EF8]/60 tracking-widest outline-none px-1 w-[120px]"
                    />
                    <span className="select-none">]</span>
                  </div>
                </div>

                {/* ROLE / EMAIL */}
                <div className="w-full bg-white rounded-full py-2.5 px-4 flex flex-col items-center justify-center border border-dashed border-[#C5CAE9] focus-within:border-[#1317E4] transition-all">
                  <span
                    style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                    className="text-[10px] font-bold tracking-[0.15em] text-[#1317E4] uppercase mb-1"
                  >
                    ROLE
                  </span>
                  <div
                    style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                    className="border border-dashed border-[#838EF8] px-3.5 py-0.5 rounded-[8px] inline-flex items-center justify-center max-w-full"
                  >
                    <input
                      type="email"
                      name="role"
                      required
                      placeholder="EXAMPLE@GMAIL.COM"
                      className="bg-transparent text-center text-[#1317E4] placeholder:text-[#838EF8]/60 text-[15px] font-bold tracking-wider uppercase outline-none leading-tight w-[200px]"
                    />
                  </div>
                  <div
                    style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                    className="mt-2 border border-dashed border-[#838EF8] px-3 py-0.5 rounded-[8px] inline-flex items-center justify-center"
                  >
                    <select
                      name="roleSelect"
                      defaultValue="CASHIER"
                      aria-label="Role"
                      className="bg-transparent text-center text-[#1317E4] text-[13px] font-bold tracking-wider uppercase outline-none leading-tight cursor-pointer"
                    >
                      <option value="CASHIER">CASHIER</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="DRIVER">DRIVER</option>
                    </select>
                  </div>
                </div>

                {/* BANK DETAILS */}
                <div className="w-full bg-white rounded-full py-2.5 px-4 flex flex-col items-center justify-center border border-dashed border-[#C5CAE9] focus-within:border-[#1317E4] transition-all">
                  <span
                    style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                    className="text-[10px] font-bold tracking-[0.15em] text-[#1317E4] uppercase mb-1"
                  >
                    BANK DETAILS
                  </span>
                  <div
                    style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                    className="flex items-center justify-center gap-2.5 w-full flex-wrap"
                  >
                    <div className="border border-dashed border-[#838EF8] px-3 py-0.5 rounded-[8px] inline-flex items-center justify-center">
                      <input
                        type="text"
                        name="bankName"
                        placeholder="OPAY"
                        defaultValue="OPAY"
                        className="bg-transparent text-center text-[#1317E4] placeholder:text-[#838EF8]/60 text-[15px] font-bold tracking-wider uppercase outline-none leading-tight w-[80px]"
                      />
                    </div>
                    <div className="border border-dashed border-[#838EF8] px-3 py-0.5 rounded-[8px] inline-flex items-center justify-center">
                      <input
                        type="text"
                        name="accountNumber"
                        placeholder="9137307797"
                        className="bg-transparent text-center text-[#1317E4] placeholder:text-[#838EF8]/60 text-[15px] font-bold tracking-wider outline-none leading-tight w-[110px]"
                      />
                    </div>
                  </div>
                </div>

                {/* ACTION BUTTONS */}
                <div className="flex items-center justify-center gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="border border-[#1317E4] text-[#1317E4] bg-white rounded-[10px] font-mono text-[11px] font-bold px-4 py-1.5 uppercase tracking-wider hover:bg-[#ECEEFE]/50 active:scale-95 transition-all cursor-pointer shadow-xs"
                  >
                    CANCEL
                  </button>
                  <button
                    type="submit"
                    className="bg-[#1317E4] text-white rounded-[10px] font-mono text-[11px] font-bold px-5 py-1.5 uppercase tracking-wider hover:bg-[#0f12c5] active:scale-95 transition-all cursor-pointer shadow-xs"
                  >
                    ADD STAFF
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-full flex items-center justify-start">
        <button
          type="button"
          onClick={handleBack}
          className="bg-[#1317E4] text-white font-mono text-[11px] font-bold px-3 py-1.5 rounded-[6px] tracking-wider uppercase flex items-center gap-1.5 shadow-xs hover:bg-[#0f12c5] active:scale-95 transition-all cursor-pointer select-none"
          aria-label="Go Back"
        >
          <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
          <span className="leading-none">BACK</span>
        </button>
      </div>

      <div className="w-full flex flex-col items-center gap-6 my-auto py-2">
        <div className="flex flex-col items-center w-full">
          {/* ADD BUTTON + 4 STAFF AVATARS */}
          <div className="flex items-center justify-center gap-2 sm:gap-2.5 max-w-full py-1">
            {/* ADD STAFF BUTTON (Hollow circle with top-right + icon) */}
            <button
              type="button"
              onClick={handleOpenAddModal}
              title="Add New Staff"
              className="relative p-0.5 rounded-full transition-transform active:scale-95 cursor-pointer focus:outline-hidden group shrink-0"
              aria-label="Add new staff"
            >
              <div className="w-[58px] h-[58px] sm:w-[66px] sm:h-[66px] rounded-full border-2 border-[#1317E4] bg-white relative shadow-xs group-hover:border-[#0f12c5] group-hover:bg-[#1317E4]/5 transition-all">
                <div className="absolute -top-1.5 -right-1.5 bg-white rounded-full p-0.5 z-10 flex items-center justify-center">
                  <Plus className="w-5 h-5 text-[#1317E4] stroke-[3]" />
                </div>
              </div>
            </button>

            {/* 4 STAFF AVATARS */}
            {staffList.slice(0, 4).map((staff) => {
              const isSelected = staff.id === activeStaff?.id;
              return (
                <button
                  key={staff.id}
                  type="button"
                  onClick={() => setSelectedStaffId(staff.id)}
                  className="relative p-0.5 rounded-full transition-transform active:scale-95 cursor-pointer focus:outline-hidden shrink-0"
                  aria-label={`Select ${staff.firstName || "staff"} ${staff.lastName || ""}`}
                >
                  <div
                    className={`w-[58px] h-[58px] sm:w-[66px] sm:h-[66px] rounded-full overflow-hidden transition-all ${
                      isSelected
                        ? "border-[2.5px] border-[#1317E4] shadow-sm scale-105"
                        : "border border-neutral-200/80 hover:border-[#1317E4]/50"
                    }`}
                  >
                    {staff.isBlackPlaceholder ? (
                      <div className="w-full h-full bg-black" />
                    ) : (
                      <div className="w-full h-full relative bg-neutral-100">
                        <Image
                          src={staff.avatarUrl || "/images/profile-avatar.png"}
                          alt={`${staff.firstName} ${staff.lastName}`}
                          fill
                          className="object-cover object-center"
                        />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-center mt-3.5">
            <button
              type="button"
              onClick={handleDone}
              className="bg-[#1317E4] text-white font-mono text-[11px] font-bold px-5 py-1.5 rounded-[12px] tracking-wider uppercase hover:bg-[#0f12c5] active:scale-95 transition-all cursor-pointer shadow-xs"
            >
              DONE
            </button>
          </div>
        </div>

        {activeStaff && (
          <div className="w-full flex flex-col items-center gap-3.5 max-w-[380px]">
            {/* FIRST NAME INPUT */}
            <div className="w-full bg-white rounded-full py-3.5 px-6 flex flex-col items-center justify-center border-2 border-dashed border-[#C5CAE9] shadow-[0_2px_12px_rgba(131,142,248,0.06)] transition-all focus-within:border-[#1317E4]">
              <span
                style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                className="text-[12px] font-bold tracking-[0.15em] text-[#1317E4] uppercase mb-0.5"
              >
                FIRST NAME
              </span>
              <div
                style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                className="inline-flex items-center justify-center gap-1.5 text-[20px] font-bold text-[#1317E4]"
              >
                <span className="text-[20px] select-none text-[#1317E4]">[</span>
                <input
                  type="text"
                  value={draft?.firstName ?? ""}
                  onChange={(e) =>
                    setDraft((d) =>
                      d ? { ...d, firstName: e.target.value.toUpperCase() } : d,
                    )
                  }
                  placeholder="EMPTY"
                  style={{
                    width: `${Math.max((draft?.firstName || "EMPTY").length, 3) + 1}ch`,
                  }}
                  className="bg-transparent text-center text-[#1317E4] placeholder:text-[#838EF8]/60 text-[20px] font-bold uppercase tracking-widest outline-none px-1"
                />
                <span className="text-[20px] select-none text-[#1317E4]">]</span>
              </div>
            </div>

            {/* LAST NAME INPUT */}
            <div className="w-full bg-white rounded-full py-3.5 px-6 flex flex-col items-center justify-center border-2 border-dashed border-[#C5CAE9] shadow-[0_2px_12px_rgba(131,142,248,0.06)] transition-all focus-within:border-[#1317E4]">
              <span
                style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                className="text-[12px] font-bold tracking-[0.15em] text-[#1317E4] uppercase mb-0.5"
              >
                LAST NAME
              </span>
              <div
                style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                className="inline-flex items-center justify-center gap-1.5 text-[20px] font-bold text-[#1317E4]"
              >
                <span className="text-[20px] select-none text-[#1317E4]">[</span>
                <input
                  type="text"
                  value={draft?.lastName ?? ""}
                  onChange={(e) =>
                    setDraft((d) =>
                      d ? { ...d, lastName: e.target.value.toUpperCase() } : d,
                    )
                  }
                  placeholder="EMPTY"
                  style={{
                    width: `${Math.max((draft?.lastName || "EMPTY").length, 3) + 1}ch`,
                  }}
                  className="bg-transparent text-center text-[#1317E4] placeholder:text-[#838EF8]/60 text-[20px] font-bold tracking-widest outline-none px-1"
                />
                <span className="text-[20px] select-none text-[#1317E4]">]</span>
              </div>
            </div>

            {/* ROLE INPUT */}
            <div className="w-full bg-white rounded-full py-3.5 px-6 flex flex-col items-center justify-center border-2 border-dashed border-[#C5CAE9] shadow-[0_2px_12px_rgba(131,142,248,0.06)] transition-all focus-within:border-[#1317E4]">
              <span
                style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                className="text-[12px] font-bold tracking-[0.15em] text-[#1317E4] uppercase mb-1"
              >
                ROLE
              </span>
              <div
                style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                className="border border-dashed border-[#838EF8] px-4 py-0.5 rounded-[10px] inline-flex items-center justify-center"
              >
                <select
                  value={draft?.role ?? "CASHIER"}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, role: e.target.value } : d))
                  }
                  aria-label="Role"
                  className="bg-transparent text-center text-[#1317E4] text-[20px] font-bold tracking-wider uppercase outline-none leading-tight cursor-pointer"
                >
                  <option value="CASHIER">CASHIER</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="DRIVER">DRIVER</option>
                </select>
              </div>
            </div>

            {/* BANK DETAILS INPUT */}
            <div className="w-full bg-white rounded-full py-3.5 px-6 flex flex-col items-center justify-center border-2 border-dashed border-[#C5CAE9] shadow-[0_2px_12px_rgba(131,142,248,0.06)] transition-all focus-within:border-[#1317E4]">
              <span
                style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                className="text-[12px] font-bold tracking-[0.15em] text-[#1317E4] uppercase mb-1"
              >
                BANK DETAILS
              </span>
              <div
                style={{ fontFamily: 'var(--font-jgs7), "jgs7", monospace' }}
                className="flex items-center justify-center gap-3 w-full flex-wrap"
              >
                <div className="border border-dashed border-[#838EF8] px-3.5 py-0.5 rounded-[10px] inline-flex items-center justify-center">
                  <input
                    type="text"
                    value={draft?.bankName ?? ""}
                    onChange={(e) =>
                      setDraft((d) =>
                        d ? { ...d, bankName: e.target.value.toUpperCase() } : d,
                      )
                    }
                    placeholder="OPAY"
                    style={{
                      width: `${Math.max((draft?.bankName || "OPAY").length, 4) + 1}ch`,
                    }}
                    className="bg-transparent text-center text-[#1317E4] placeholder:text-[#838EF8]/60 text-[20px] font-bold tracking-wider uppercase outline-none leading-tight"
                  />
                </div>

                <div className="border border-dashed border-[#838EF8] px-3.5 py-0.5 rounded-[10px] inline-flex items-center justify-center">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={draft?.accountNumber ?? ""}
                    onChange={(e) =>
                      setDraft((d) =>
                        d
                          ? { ...d, accountNumber: e.target.value.replace(/\D/g, "") }
                          : d,
                      )
                    }
                    placeholder="9137307797"
                    style={{
                      width: `${Math.max((draft?.accountNumber || "9137307797").length, 10) + 1}ch`,
                    }}
                    className="bg-transparent text-center text-[#1317E4] placeholder:text-[#838EF8]/60 text-[20px] font-bold tracking-wider outline-none leading-tight"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {notice && (
          <p className="font-mono text-[11px] font-bold tracking-wider uppercase text-center text-[#1317E4] bg-[#ECEEFE] px-4 py-1.5 rounded-full">
            {notice}
          </p>
        )}

        <div className="mt-2 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !activeStaff}
            className="bg-[#1317E4] text-white font-mono text-[12px] font-bold px-7 py-2.5 rounded-full uppercase tracking-wider shadow-[0_4px_16px_rgba(19,23,228,0.32)] hover:bg-[#0f12c5] active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            SAVE
          </button>
          <button
            type="button"
            onClick={handleRemoveStaff}
            disabled={saving || !activeStaff}
            className="bg-[#D50000] text-white font-mono text-[12px] font-bold px-7 py-2.5 rounded-full uppercase tracking-wider shadow-[0_4px_16px_rgba(213,0,0,0.32)] hover:bg-[#b50000] active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            REMOVE STAFF
          </button>
        </div>
      </div>
    </div>
  );
}
