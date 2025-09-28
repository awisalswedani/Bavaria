import type { Metadata } from "next";
import { getSellerInfo } from '@/utils/api';
import ClientLayout from './ClientLayout';

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
      <ClientLayout seller={seller}>{children}</ClientLayout>
    </html>
  );
}
