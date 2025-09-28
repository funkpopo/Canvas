import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Canvas Kubernetes Dashboard",
  description:
    "Operator-focused workspace for monitoring Kubernetes clusters and workloads.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-[var(--canvas-bg)]">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[var(--canvas-bg)] text-[var(--canvas-fg)]`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
