import Image from "next/image";

export default function LedSign({
  children,
  hideBlueBand = false,
}: {
  children?: React.ReactNode;
  hideBlueBand?: boolean;
}) {
  return (
    <div className="relative w-214.25 h-60">

      {/* MOUNTING BRACKET ARMS */}
      <Image
        src="/icons/sign-brackets.svg"
        alt=""
        fill
        className="pointer-events-none z-0 object-contain overflow-visible"
      />

      {/* BOX (bezel) */}
      <div className="absolute left-[170px] top-[34px] w-[517px] h-[166px] z-10 rounded-[12px] bg-[#222] border-[1.5px] border-[#0a0a0a] shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_3px_6px_rgba(0,0,0,0.5)]">
        {/* SCREEN */}
        <div className="absolute left-[18.5px] top-[18.5px] w-[477px] h-[126px] rounded-[18px] bg-[#080202] border border-[#000000] shadow-[inset_0_2px_8px_rgba(0,0,0,0.98)] overflow-hidden flex items-center">
          {children}
        </div>
      </div>

      {/* BLUE BAND */}
      {!hideBlueBand && (
        <div className="absolute bottom-0 left-0 w-full h-[10px] z-20 bg-[#3040d0]" />
      )}
    </div>
  );
}
