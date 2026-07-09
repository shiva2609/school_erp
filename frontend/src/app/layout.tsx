import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from 'react-hot-toast';
import { ConfirmProvider } from '@/components/common/ConfirmProvider';
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: 'swap',
});

export const metadata: Metadata = {
  title: "ESMS - Enterprise School Management",
  description: "Modern, scalable School ERP platform",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-gray-50 text-gray-900 selection:bg-brand-500/30 selection:text-brand-900">
        <ConfirmProvider>
          <Toaster position="top-right" toastOptions={{ duration: 4000, style: { borderRadius: '12px', padding: '12px 16px', fontSize: '14px', fontWeight: '600' } }} />
          {children}
        </ConfirmProvider>
      </body>
    </html>
  );
}
