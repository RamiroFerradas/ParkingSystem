import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Parking System",
  description: "Sistema integral de gestión de estacionamiento",
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
      </body>
    </html>
  );
}
