import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Roboto, Roboto_Mono } from "next/font/google";
import "./globals.css";

// Storyblok's app uses Roboto and Roboto Mono.
const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Workflow Board",
  description: "A kanban board of Storyblok stories by workflow stage.",
};

// Storyblok opens the plugin with `?theme=…`. "dark" means its dark theme; any other value is its light one.
// Without the parameter (the OAuth round trip drops it) we reuse the last one seen in this tab, and outside
// Storyblok the CSS follows the system setting. Runs before paint so the page never flashes the wrong theme.
const themeScript = `(function(){try{var k="sb-theme",t=new URLSearchParams(location.search).get("theme");if(t)sessionStorage.setItem(k,t);else t=sessionStorage.getItem(k);if(t)document.documentElement.dataset.theme=t==="dark"?"dark":"light"}catch(e){}})()`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${roboto.variable} ${robotoMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
