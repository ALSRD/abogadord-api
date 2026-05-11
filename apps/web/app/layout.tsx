import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "AbogadoRD AI Chat",
  description: "MVP de chat IA jurídico con streaming, historial local y experiencia premium."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className="dark">
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
