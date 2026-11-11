import type { Metadata } from "next";
import "./globals.css";
import { SwRegistration } from "@/components/pwa/sw-registration";

export const metadata: Metadata = {
  title: "Parking System",
  description: "Sistema integral de gestión de estacionamiento",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        {children}
        <SwRegistration />
      </body>
    </html>
  );
}
