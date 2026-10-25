import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Campus Pickleball",
  description:
    "Connect with university pickleball players and set up your player profile.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
