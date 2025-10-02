"use client";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/components/CartContext";
import Header from '@/components/Header';
import { getSellerInfo } from '@/utils/api';
import MobileNavBar from "./MobileNavBar";
import { LanguageProvider } from '../context/LanguageContext';
import OfflineNotification from '@/components/OfflineNotification';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { cache } from '@/lib/cache';
import Script from 'next/script';
import { WEB_CONSTANTS } from './web_constantsthe';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function ClientLayout({ seller, children }: { seller: any, children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Scroll to top when pathname changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
  }, [pathname]);

  // Send GA page_view on route changes (captures SPA navigations)
  useEffect(() => {
    if (!WEB_CONSTANTS.googleAnalyticsId) return;
    if (typeof window === 'undefined') return;
    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
    // Prefer GA4 config call to set the page path
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (window.gtag) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      window.gtag('config', WEB_CONSTANTS.googleAnalyticsId, {
        page_path: url,
      });
    }
  }, [pathname, searchParams]);

  // Periodic cache cleanup and service worker registration
  useEffect(() => {
    // Clean cache on app start
    cache.cleanup();

    // Set up periodic cleanup every 30 minutes
    const cleanupInterval = setInterval(() => {
      cache.cleanup();
    }, 30 * 60 * 1000);

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
        })
        .catch((error) => {
        });
    }

    return () => clearInterval(cleanupInterval);
  }, []);

  return (
    <LanguageProvider>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {WEB_CONSTANTS.googleAnalyticsId ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${WEB_CONSTANTS.googleAnalyticsId}`}
              strategy="afterInteractive"
            />
            <Script id="gtag-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${WEB_CONSTANTS.googleAnalyticsId}');
              `}
            </Script>
          </>
        ) : null}
        <CartProvider>
          <OfflineNotification />
          <Header seller={seller} />
          {children}
          <MobileNavBar />
        </CartProvider>
      </body>
    </LanguageProvider>
  );
} 