import type { Metadata } from "next";
import { getSellerInfo } from '@/utils/api';
import ClientLayout from './ClientLayout';
import Script from 'next/script';
import { WEB_CONSTANTS } from './web_constantsthe';

export const metadata: Metadata = {
  title: "بافاريا | Bavaria",
  description: "بافاريا للعطور – باقة من العطور الراقية والبخور الفاخر بلمسات عطرية مبتكرة تجمع بين الأصالة والفخامة",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let seller = null;
  try {
    seller = await getSellerInfo();
  } catch (e) {
    seller = null;
  }
  return (
    <html lang="ar" dir="rtl">
      <head>
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
      </head>
      <ClientLayout seller={seller}>{children}</ClientLayout>
    </html>
  );
}
