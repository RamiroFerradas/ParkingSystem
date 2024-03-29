import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ParkingProvider } from "./context/ParkingContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Parking app",
  description: "Aplicacion para cocheras",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ParkingProvider>{children}</ParkingProvider>
      </body>
    </html>
  );
}
