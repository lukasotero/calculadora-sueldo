import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://lukasotero.github.io/"),
  title: {
    default: "Calculadora de Sueldo — entendé tu recibo",
    template: "%s · Calculadora de Sueldo",
  },
  description:
    "Calculá tu sueldo neto o bruto y revisá tu recibo de sueldo de forma privada.",
  applicationName: "Calculadora de Sueldo",
  alternates: {
    canonical: "https://lukasotero.github.io/calculadora-sueldo/",
  },
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: "Calculadora de Sueldo",
    title: "Tu sueldo, sin letra chica.",
    description:
      "Calculá, compará y entendé cada línea de tu recibo de sueldo de forma privada.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tu sueldo, sin letra chica.",
    description:
      "Calculá, compará y entendé cada línea de tu recibo de sueldo de forma privada.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f8f7" },
    { media: "(prefers-color-scheme: dark)", color: "#071b20" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR" className="dark" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
