import type { Metadata } from "next";
import { getSellerInfo } from '@/utils/api';
import ClientLayout from './ClientLayout';

export const metadata: Metadata = {
  title: "فاخر | Fakher",
  description: "فاخر – نكهات شرقية أصيلة تجمع القهوة والهيل والزعفران والتمور في مكان واحد",
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
