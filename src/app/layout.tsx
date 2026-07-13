import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Suspense } from "react";
import { GeistPixelSquare } from "geist/font/pixel";
import { Analytics } from "@vercel/analytics/next";
import { AuthProvider } from "@/components/auth/auth-provider";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/components/theme/theme-provider";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import "./globals.css";

export const metadata: Metadata = {
  title: "Padelaso",
  description: "Gamifica tus partidos de pádel con amigos",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${GeistPixelSquare.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh flex flex-col pb-[env(safe-area-inset-bottom)]">
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
          <Suspense fallback={null}>
            <ThemeSwitcher />
          </Suspense>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
