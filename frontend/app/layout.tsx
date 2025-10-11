import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClusterProvider } from "@/lib/cluster-context";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Canvas",
  description: "Kubernetes集群管理",
  icons: {
    icon: "/canvas-icon.svg",
    shortcut: "/canvas-icon.svg",
    apple: "/canvas-icon.svg",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <ClusterProvider>
              {children}
              <Toaster />
            </ClusterProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
