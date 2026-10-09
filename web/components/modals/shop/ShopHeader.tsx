"use client";

import MarqueeSlider from "@abundiko/react-marquee";

export type ShopHeaderProps = {
  viewMode: "grid" | "detail" | "basket";
  onBack: () => void;
};

export function ShopHeader({ viewMode, onBack }: ShopHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-4 shrink-0 relative z-20">
      <button
        type="button"
        onClick={onBack}
        className="text-left group cursor-pointer"
      >
        <h2 className="text-[17px] leading-[1.15] text-[#838EF8] tracking-[0.08em] uppercase group-hover:text-[#6a76ee] transition-colors whitespace-pre-line">
          {viewMode === "basket"
            ? "SHOPPING\nBASKET"
            : "SHOP FOR\nACCESSORIES"}
        </h2>
        {viewMode !== "grid" && (
          <span className="text-[10px] text-neutral-400 uppercase tracking-wider flex items-center gap-1 mt-1 group-hover:text-[#838EF8]">
            ←{" "}
            {viewMode === "basket"
              ? "CONTINUE SHOPPING"
              : "ALL ACCESSORIES"}
          </span>
        )}
      </button>

      <div className="flex items-center gap-2">
        {/* Mini LED Rate Ticker — only on main grid view */}
        {viewMode === "grid" && (
          <div className="w-20 h-8 bg-[#1A1A1A] rounded-[6px] border border-neutral-800 shadow-[inset_0_1px_2px_rgba(255,255,255,0.1)] flex items-center justify-center overflow-hidden shrink-0">
            <div className="w-full h-full flex items-center overflow-hidden [&_.marquee-anim]:h-full [&_.marquee-anim]:flex [&_.marquee-anim]:items-center">
              <MarqueeSlider
                speed={6}
                axis="-x"
                className="h-full flex items-center"
              >
                <span className="inline-flex items-center text-[10px] leading-none font-bold tracking-wider font-led px-1 select-none text-[#FF0303] whitespace-nowrap drop-shadow-[0_0_4px_rgba(255,3,3,0.9)]">
                  Today&rsquo;s Rate: 1kg at ₦1,400 •&nbsp;
                </span>
                <span className="inline-flex items-center text-[10px] leading-none font-bold tracking-wider font-led px-1 select-none text-[#FF0303] whitespace-nowrap drop-shadow-[0_0_4px_rgba(255,3,3,0.9)]">
                  Today&rsquo;s Rate: 1kg at ₦1,400 •&nbsp;
                </span>
              </MarqueeSlider>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ShopHeader;
