import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0d9488",
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://noxderma.web.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Noxderma — Medicine Distribution, Billing & Khata Software",
  description:
    "Medicine sales billing, godown stock, customer khata and offline order booking system.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/brand/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    shortcut: "/favicon.ico",
    apple: "/brand/icon-192.png",
  },
  openGraph: {
    type: "website",
    siteName: "Noxderma Pharma",
    url: `${SITE_URL}/`,
    title: "Noxderma — Medicine Distribution, Billing & Khata Software",
    description:
      "Medicine sales billing, godown stock, customer khata and offline order booking system.",
    images: [
      {
        url: `${SITE_URL}/brand/og-logo.jpg`,
        secureUrl: `${SITE_URL}/brand/og-logo.jpg`,
        width: 512,
        height: 512,
        alt: "Noxderma Pharma Logo",
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Noxderma — Medicine Distribution, Billing & Khata Software",
    description:
      "Medicine sales billing, godown stock, customer khata and offline order booking system.",
    images: [`${SITE_URL}/brand/og-logo.jpg`],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Noxderma",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={`${inter.className} font-sans min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
