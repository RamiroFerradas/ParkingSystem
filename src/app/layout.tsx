import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { SwRegistration } from "@/components/pwa/sw-registration";

/*
 * Archivo: designed for signage and print legibility, which is the same job
 * the app does on a counter. IBM Plex Mono carries plates, ticket numbers and
 * every code, so data reads as data instead of body copy.
 */
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-archivo",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mauricio's Parking",
  description: "Sistema integral de gestión de estacionamiento",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#15130f",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
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
      className={`${archivo.variable} ${plexMono.variable}`}
    >
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        {children}
        <SwRegistration />
      </body>
    </html>
  );
}
