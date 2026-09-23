import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { PickToPrompt } from "@/components/PickToPrompt";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Brightline Solar Help Center",
  description: "Support articles for Brightline Solar customers and partners.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">
        {children}
        {/* Dev-only element picker: click the pointer icon bottom-left, then any element, to copy its details. */}
        {process.env.NODE_ENV === "development" && <PickToPrompt />}
      </body>
    </html>
  );
}
