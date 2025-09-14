"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from '../../context/LanguageContext';
import { WEB_CONSTANTS } from '../web_constantsthe';
import i18n from '../../i18n';
import { formatPrice, getConfig } from '@/utils/api';

// Component that uses useSearchParams - must be wrapped in Suspense
function OrderSuccessContent() {
  const { language } = useLanguage();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [config, setConfig] = useState<any>(null);
  
  // Get order details from URL parameters
  const orderId = searchParams.get('id');
  const orderTotal = searchParams.get('total');
  const paymentMethod = searchParams.get('payment');

  useEffect(() => {
    setMounted(true);
    
    // Load config for price formatting
    getConfig()
      .then((cfg) => setConfig(cfg))
      .catch(() => setConfig(null));
  }, []);

  // Helper to detect dark mode
  const isDark = typeof window !== 'undefined' && document.documentElement.classList.contains('dark');

  // If no order ID is provided, redirect to home
  useEffect(() => {
    if (mounted && !orderId) {
      router.replace('/');
    }
  }, [mounted, orderId, router]);

  if (!mounted || !orderId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#181818]' : 'bg-gray-50'}`} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className={`${isDark ? 'bg-[#222]' : 'bg-white'} shadow-sm`}>
        <div className="max-w-4xl mx-auto px-4">
          <div className={`relative flex items-center py-4 border-b ${isDark ? 'border-[#333]' : 'border-gray-100'} min-h-[60px]`}>
            <Link 
              href="/" 
              aria-label={i18n.t('back_to_home')}
              className={`absolute ${language === 'ar' ? 'left-0' : 'right-0'} top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-10 h-10 rounded-full ${isDark ? 'bg-[#222] hover:bg-[#333]' : 'bg-gray-100 hover:bg-gray-200'} transition-colors shadow-sm focus:outline-none`}
            >
              <svg 
                className="w-5 h-5" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                viewBox="0 0 24 24" 
                style={{ color: WEB_CONSTANTS.secondaryColor }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={language === 'ar' ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} />
              </svg>
            </Link>
            <h1 className="mx-auto text-xl font-bold text-center" style={{ color: isDark ? '#fff' : WEB_CONSTANTS.primaryColor }}>
              {i18n.t('order_confirmation')}
            </h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className={`${isDark ? 'bg-[#222]' : 'bg-white'} rounded-xl shadow-lg overflow-hidden`}>
          
          {/* Success Header Section */}
          <div className="text-center py-12 px-8" style={{ backgroundColor: `${WEB_CONSTANTS.primaryColor}10` }}>
            {/* Success Icon */}
            <div className="mb-6">
              <div 
                className="w-24 h-24 mx-auto rounded-full flex items-center justify-center shadow-lg"
                style={{ backgroundColor: WEB_CONSTANTS.primaryColor }}
              >
                <svg 
                  className="w-12 h-12 text-white" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>

            {/* Success Title */}
            <h1 
              className="text-3xl md:text-4xl font-bold mb-4"
              style={{ color: WEB_CONSTANTS.primaryColor }}
            >
              {i18n.t('order_success_title')}
            </h1>

            {/* Subtitle */}
            <p className={`text-lg mb-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
              {i18n.t('thank_you_for_order')}
            </p>
          </div>

          {/* Order Details Section */}
          <div className="p-8">
            <div className={`${isDark ? 'bg-[#181818]' : 'bg-gray-50'} rounded-lg p-6 mb-8`}>
              <h2 className={`text-xl font-semibold mb-6 ${isDark ? 'text-white' : 'text-gray-800'}`}>
                {i18n.t('order_details') || 'Order Details'}
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Order ID */}
                <div className="text-center md:text-left">
                  <div className={`text-sm font-medium mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {i18n.t('order_id')}
                  </div>
                  <div 
                    className="text-2xl font-bold"
                    style={{ color: WEB_CONSTANTS.primaryColor }}
                  >
                    #{orderId}
                  </div>
                </div>

                {/* Payment Method */}
                <div className="text-center md:text-left">
                  <div className={`text-sm font-medium mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {i18n.t('payment_method')}
                  </div>
                  <div className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                    {paymentMethod === 'cod' ? i18n.t('cash_on_delivery') : paymentMethod}
                  </div>
                </div>

                {/* Order Total */}
                {orderTotal && (
                  <div className="text-center md:text-left">
                    <div className={`text-sm font-medium mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {i18n.t('order_total')}
                    </div>
                    <div 
                      className="text-2xl font-bold"
                      style={{ color: WEB_CONSTANTS.primaryColor }}
                    >
                      {config ? formatPrice(parseFloat(orderTotal), config, language) : `${orderTotal} ${i18n.t('currency_symbol')}`}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Confirmation Message */}
            <div className={`${isDark ? 'bg-[#181818]' : 'bg-blue-50'} rounded-lg p-6 mb-8`}>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <svg 
                    className="w-6 h-6 text-blue-600" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className={`text-sm leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    {i18n.t('order_success_message')}
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/"
                className="px-8 py-4 rounded-lg font-semibold text-white text-center transition-all duration-200 hover:shadow-lg transform hover:scale-105"
                style={{ backgroundColor: WEB_CONSTANTS.primaryColor }}
              >
                {i18n.t('continue_shopping')}
              </Link>
              
              <Link
                href="/orders"
                className={`px-8 py-4 rounded-lg font-semibold border-2 text-center transition-all duration-200 hover:shadow-lg transform hover:scale-105 ${isDark ? 'text-white hover:bg-[#333]' : 'hover:bg-gray-50'}`}
                style={{ 
                  borderColor: WEB_CONSTANTS.primaryColor,
                  color: WEB_CONSTANTS.primaryColor
                }}
              >
                {i18n.t('track_your_order')}
              </Link>
            </div>
          </div>
        </div>

        {/* Contact Support Section */}
        <div className={`mt-8 text-center text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          <p className="mb-2">{i18n.t('contact_support')}:</p>
          <div className="flex justify-center gap-6 flex-wrap">
            <a 
              href={`tel:${WEB_CONSTANTS.phone}`}
              className="hover:underline transition-colors"
              style={{ color: WEB_CONSTANTS.primaryColor }}
            >
              📞 {WEB_CONSTANTS.phone}
            </a>
            <a 
              href={`mailto:${WEB_CONSTANTS.email}`}
              className="hover:underline transition-colors"
              style={{ color: WEB_CONSTANTS.primaryColor }}
            >
              ✉️ {WEB_CONSTANTS.email}
            </a>
            <a 
              href={WEB_CONSTANTS.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline transition-colors"
              style={{ color: WEB_CONSTANTS.primaryColor }}
            >
              💬 WhatsApp
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

// Loading component for Suspense fallback
function OrderSuccessLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading order details...</p>
      </div>
    </div>
  );
}

// Main export component with Suspense boundary
export default function OrderSuccessPage() {
  return (
    <Suspense fallback={<OrderSuccessLoading />}>
      <OrderSuccessContent />
    </Suspense>
  );
}
