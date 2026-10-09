import type { Metadata } from "next";
import localFont from "next/font/local";
import { Barlow_Semi_Condensed } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import Footer from "@/components/footer";
import { Providers } from "@/components/providers";

const jgs7 = localFont({
  src: "../public/fonts/jgs7.woff2",
  variable: "--font-jgs7",
  display: "swap",
});

// The LED readouts and tickers are set in jgs5, a companion face to jgs7 —
// same advances, different glyphs. The live file uses it on every readout, so
// mapping the LED token to jgs7 rendered the wrong glyphs at the right widths.
const jgs5 = localFont({
  src: "../public/fonts/jgs5.woff2",
  variable: "--font-jgs5",
  display: "swap",
});

const barlowSemiCondensed = Barlow_Semi_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-barlow-semi-condensed",
  display: "swap",
});

export const metadata: Metadata = {
  title: "U2 Gas",
  description: "U2 Oil and Gas Ltd",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn("h-full antialiased", jgs7.variable, jgs5.variable, barlowSemiCondensed.variable)}
    >
      <body
        suppressHydrationWarning
        className="min-h-full flex flex-col bg-white text-foreground font-sans overflow-x-hidden"
      >
        <div className="flex-1 flex flex-col items-center w-full">
          <Providers>{children}</Providers>
        </div>
        <Footer />
      </body>
    </html>
  );
}
