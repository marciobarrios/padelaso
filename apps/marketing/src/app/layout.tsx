import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { GeistSans } from "geist/font/sans";
import { GeistPixelSquare } from "geist/font/pixel";
import "./globals.css";

const siteUrl = "https://padelaso.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Padelaso — El tercer set empieza aquí",
  description:
    "Guarda tus partidos de pádel, celebra cada puntazo y descubre quién manda de verdad en tu grupo.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_ES",
    url: siteUrl,
    siteName: "Padelaso",
    title: "Padelaso — El tercer set empieza aquí",
    description:
      "Partidos, momentazos y estadísticas para grupos de amigos que juegan al pádel.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Padelaso — El tercer set empieza aquí",
    description:
      "Partidos, momentazos y estadísticas para grupos de amigos que juegan al pádel.",
    images: ["/opengraph-image"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6efde",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${GeistSans.variable} ${GeistPixelSquare.variable}`}
    >
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
