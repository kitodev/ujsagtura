import "./globals.css";
import type { Metadata, Viewport } from "next";
export const metadata: Metadata = { title: "Újságtúra" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="hu"><body>{children}</body></html>;
}
