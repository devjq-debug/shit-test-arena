import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shit Test Arena",
  description: "Practica tus mejores respuestas en tiempo real."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
