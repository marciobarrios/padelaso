import type { Metadata, Viewport } from "next";
import { GeistPixelSquare } from "geist/font/pixel";
import { AuthProvider } from "@/components/auth/auth-provider";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/components/theme/theme-provider";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { getServerAuth } from "@/lib/server-auth";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, groups, activeGroupId } = await getServerAuth();

  return (
    <html
      lang="es"
      className={`${GeistPixelSquare.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh flex flex-col pb-[env(safe-area-inset-bottom)]">
        <ThemeProvider>
          <AuthProvider
            initialUser={user}
            initialGroups={groups}
            initialActiveGroupId={activeGroupId}
          >
            {children}
          </AuthProvider>
          <ThemeSwitcher />
        </ThemeProvider>
      </body>
    </html>
  );
}
