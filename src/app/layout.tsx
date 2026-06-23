import type { Metadata, Viewport } from "next";
import { Red_Hat_Display, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

const redHatDisplay = Red_Hat_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-red-hat-display",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

// No production domain yet — update when the marketing site is deployed.
const siteUrl = "https://sidecode.dev";
const tagline =
  "Connect a repo. Sidecode maps it live and re-scans every push — two specialist agents and a coordinator find problems, draft fixes, and open the PR.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Sidecode — Review that rides side by side.",
    template: "%s | Sidecode",
  },
  description: tagline,
  applicationName: "Sidecode",
  keywords: [
    "code review",
    "AI code review",
    "multi-agent",
    "live code companion",
    "pull request review",
    "static analysis",
    "Gemini",
    "Vertex AI",
    "CI/CD gate",
    "vibe coding",
  ],
  authors: [{ name: "Sidecode" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "Sidecode",
    title: "Sidecode — Review that rides side by side.",
    description: tagline,
  },
  twitter: {
    card: "summary_large_image",
    title: "Sidecode — Review that rides side by side.",
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
  themeColor: "#1e1e1e",
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
      className={`${redHatDisplay.variable} ${jetbrainsMono.variable}`}
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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
