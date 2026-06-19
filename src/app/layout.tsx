import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-archivo",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

// No production domain yet — update when the marketing site is deployed.
const siteUrl = "https://bugtrap.dev";
const tagline =
  "AI ships code faster than humans can review it. BugTrap runs three specialist agents on every change and hands you one clear safe-to-merge or blocked verdict.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "BugTrap — Ship fast. Merge with confidence.",
    template: "%s | BugTrap",
  },
  description: tagline,
  applicationName: "BugTrap",
  keywords: [
    "code review",
    "AI code review",
    "multi-agent",
    "pull request review",
    "static analysis",
    "Gemini",
    "Vertex AI",
    "CI/CD gate",
    "vibe coding",
  ],
  authors: [{ name: "BugTrap" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "BugTrap",
    title: "BugTrap — Ship fast. Merge with confidence.",
    description: tagline,
  },
  twitter: {
    card: "summary_large_image",
    title: "BugTrap — Ship fast. Merge with confidence.",
    description: tagline,
  },
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1d1d20",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        {/* Mark JS as active before paint so reveal elements start hidden
            (and stay visible for no-JS users). Avoids a reveal flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
        {children}
      </body>
    </html>
  );
}
