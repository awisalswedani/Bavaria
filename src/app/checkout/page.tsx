"use client";

import { useEffect, useState, useRef } from "react";
import { useCart } from "@/components/CartContext";
import { useRouter } from "next/navigation";
import { formatPrice, getConfig, getOrCreateGuestId, getShippingMethods, getSellerInfoFromCart, placeOrder, addAddress, getAddressList, chooseShippingMethod, getCart, digitalPaymentPlaceOrder, setCheckoutSession } from "@/utils/api";
import Link from "next/link";
import { useLanguage } from '../../context/LanguageContext';
import { WEB_CONSTANTS } from '../web_constantsthe';
import i18n from '../../i18n';

// Helper: Retry fetching address list after address creation
async function fetchLatestAddressWithRetry(guestId: string, retries = 5, delayMs = 300): Promise<number | null> {
  for (let i = 0; i < retries; i++) {
    const addressList = await getAddressList(guestId);
    if (Array.isArray(addressList) && addressList.length > 0) {
      const sorted = [...addressList].sort((a, b) => (b.id || 0) - (a.id || 0));
      const foundId = sorted[0].id || sorted[0].address_id;
      return foundId;
    }
    await new Promise(res => setTimeout(res, delayMs));
  }
  return null;
}

function isDefined<T>(val: T | undefined | null): val is T {
  return val !== undefined && val !== null;
}

type WebPaymentRequestParams = {
  user_id: string | number;
  customer_id: string | number;
  payment_method: string;
  payment_platform: string;
  callback?: string;
  address_id?: string | number;
  billing_address_id?: string | number;
  order_note?: string;
};

// Helper to fetch CSRF token from backend
async function fetchCsrfToken(): Promise<string | null> {
  try {
    const res = await fetch('https://awisapp.com/customer/web-payment-request', {
      method: 'GET',
      credentials: 'include',
    });
    const html = await res.text();
    // Try to find meta tag first
    const metaMatch = html.match(/<meta name="csrf-token" content="([^"]+)"/);
    if (metaMatch && metaMatch[1]) return metaMatch[1];
    // Fallback: try to find hidden input
    const inputMatch = html.match(/<input[^>]+name=['\"]?_token['\"]?[^>]+value=['\"]?([^'\"> ]+)['\"]?[^>]*>/);
    if (inputMatch && inputMatch[1]) return inputMatch[1];
    return null;
  } catch {
    return null;
  }
}

function submitWebPaymentRequest({
  user_id,
  customer_id,
  payment_method,
  payment_platform,
  callback,
  address_id,
  billing_address_id,
  order_note,
  csrf_token,
}: WebPaymentRequestParams & { csrf_token: string }) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = 'https://awisapp.com/customer/web-payment-request';
  form.target = '_self';
  const fields: [string, string | number | undefined | null][] = [
    ['_token', csrf_token],
    ['user_id', user_id],
    ['customer_id', customer_id],
    ['payment_method', payment_method],
    ['payment_platform', payment_platform],
    ['callback', callback],
    ['address_id', address_id],
    ['billing_address_id', billing_address_id],
    ['order_note', order_note],
  ];
  fields.forEach(([name, value]) => {
    if (isDefined(value)) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = String(value);
      form.appendChild(input);
    }
  });
  document.body.appendChild(form);
  form.submit();
}

function getLocalizedProductName(item: any, language: string) {
  const product = item.product || {};
  if (product.translations && Array.isArray(product.translations)) {
    if (language === 'ar') {
      const t = product.translations.find((tr: any) => (tr.locale === 'kw' || tr.locale === 'ar') && tr.key === 'name');
      if (t && t.value) return t.value;
    } else {
      const t = product.translations.find((tr: any) => tr.locale === 'en' && tr.key === 'name');
      if (t && t.value) return t.value;
    }
  }
  // Fallbacks
  if (language === 'ar') return product.name_ar || product.name || item.name;
  return product.name || item.name;
}

export default function CheckoutPage() {
  const { state, clearCart } = useCart();
  const router = useRouter();
  const { language } = useLanguage();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    country: "Kuwait",
    city: "",
    postal: "00000",
    address: "",
    addressType: "دائم",
  });
  const [delivery, setDelivery] = useState<string>("");
  const [deliveryPrice, setDeliveryPrice] = useState<number>(0);
  const [shippingOptions, setShippingOptions] = useState<any[]>([]);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [payment, setPayment] = useState<string>("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [config, setConfig] = useState<any>(null);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(true);
  const [paymentMethodsError, setPaymentMethodsError] = useState<string | null>(null);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [guestIdLoading, setGuestIdLoading] = useState(true);
  const [guestIdError, setGuestIdError] = useState<string | null>(null);
  const [addressId, setAddressId] = useState<number | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [allowedCountries, setAllowedCountries] = useState<string[]>([]);
  const [allowedCountriesLoading, setAllowedCountriesLoading] = useState(true);
  const [countryError, setCountryError] = useState<string | null>(null);
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);
  const [isNavigatingToSuccess, setIsNavigatingToSuccess] = useState(false);
  
  // Add mounted state tracking
  const isMounted = useRef(true);

  useEffect(() => {
    // Component is mounted
    isMounted.current = true;
    
    // Cleanup function to mark as unmounted
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    getConfig()
      .then((cfg) => {
        setConfig(cfg);
      })
      .catch(() => setConfig(null));
  }, []);

  useEffect(() => {
    getOrCreateGuestId()
      .then((id) => {
        setGuestId(id);
        setGuestIdLoading(false);
      })
      .catch(() => {
        setGuestIdError("تعذر الحصول على رقم الضيف. يرجى إعادة تحميل الصفحة.");
        setGuestIdLoading(false);
      });
  }, []);

  // Only fetch shipping methods after guestId is ready
  useEffect(() => {
    if (!guestIdLoading && guestId) {
      // Flutter app logic: Try seller's shipping methods first, then fallback to admin/global if none found
      const { sellerId, sellerType } = getSellerInfoFromCart(state.items);
      setShippingLoading(true);
      getShippingMethods(sellerId, sellerType, guestId)
        .then((options) => {
          setShippingOptions(options);
          if (options.length > 0) {
            setDelivery(options[0].key || options[0].id || options[0].title);
            setDeliveryPrice(Number(options[0].cost || 0));
          }
        })
        .catch((err) => {
          setShippingOptions([]);
        })
        .finally(() => setShippingLoading(false));
    }
  }, [guestIdLoading, guestId, state.items]);

  // Fetch allowed delivery countries on mount
  useEffect(() => {
    if (!guestId) return;
    setAllowedCountriesLoading(true);
    fetch(`https://awisapp.com/api/v1/customer/get-restricted-country-list?guest_id=${guestId}`)
      .then(async res => {
        if (!res.ok) {
          let msg = 'تعذر تحميل قائمة الدول. يرجى إعادة المحاولة لاحقاً.';
          if (res.status === 401) msg = 'غير مصرح. يرجى إعادة تحميل الصفحة أو تسجيل الدخول.';
          setAllowedCountries([]);
          setCountryError(msg);
          setAllowedCountriesLoading(false);
          return;
        }
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0 && data.every(c => typeof c === 'string')) {
          setAllowedCountries(data);
          setCountryError(null);
        } else {
          setAllowedCountries([]);
          setCountryError('تعذر تحميل قائمة الدول. يرجى إعادة المحاولة لاحقاً.');
        }
        setAllowedCountriesLoading(false);
      })
      .catch(() => {
        setAllowedCountries([]);
        setCountryError('تعذر تحميل قائمة الدول. يرجى التحقق من الاتصال أو المحاولة لاحقاً.');
        setAllowedCountriesLoading(false);
      });
  }, [guestId]);

  // Fetch payment methods from backend config
  useEffect(() => {
    async function fetchPaymentMethods() {
      setPaymentMethodsLoading(true);
      setPaymentMethodsError(null);
      try {
        const res = await fetch("https://awisapp.com/api/v1/config", {
          headers: {
            'Content-Type': 'application/json',
            'Accept-Language': language,
            'X-Language': language,
          },
        });
        if (!res.ok) throw new Error("فشل تحميل طرق الدفع من الخادم");
        const data = await res.json();
        
        // Use all payment methods returned by the backend (do not filter by is_active)
        let allMethods = data.payment_methods || [];
        
        // Check if COD is enabled separately and add it manually if needed
        if (data.cod_status === 1 || data.cod_status === true || data.cash_on_delivery === 1 || data.cash_on_delivery === true) {
          // Add COD to payment methods if it's not already included
          const hasCOD = allMethods.some((method: any) => 
            (method.key || method.key_name || '').toLowerCase().includes('cod') ||
            (method.key || method.key_name || '').toLowerCase().includes('cash')
          );
          
          if (!hasCOD) {
            allMethods.push({
              key: 'cod',
              key_name: 'cod',
              name: language === 'ar' ? 'الدفع عند الاستلام' : 'Cash on Delivery',
              label: language === 'ar' ? 'الدفع عند الاستلام' : 'Cash on Delivery',
              is_active: true
            });
          }
        }
        
        setPaymentMethods(allMethods);
        if ((!payment || payment === '') && allMethods.length > 0) {
          setPayment(allMethods[0].key || allMethods[0].key_name || '');
        }
      } catch (err: any) {
        setPaymentMethodsError(err.message || "فشل تحميل طرق الدفع");
      } finally {
        setPaymentMethodsLoading(false);
      }
    }
    fetchPaymentMethods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Synchronous effect to perform redirect
  useEffect(() => {
    if (pendingRedirect && isMounted.current) {
      window.location.href = pendingRedirect;
    }
  }, [pendingRedirect]);

  // Redirect to cart if cart is empty (but not during COD success navigation)
  useEffect(() => {
    if (state.items.length === 0 && !isNavigatingToSuccess) {
      router.replace('/cart');
    }
  }, [state.items, router, isNavigatingToSuccess]);

  // Step validation
  const validateStep = () => {
    if (step === 1) {
      // Email is now optional, so we exclude it from required fields
      const required = ["name", "phone", "country", "city", "address"];
      return required.every((k) => form[k as keyof typeof form].trim() !== "");
    }
    if (step === 2) {
      return !!delivery;
    }
    if (step === 3) {
      return !!payment;
    }
    return true;
  };

  // Address creation (step 1)
  const handleAddressNext = async () => {
    setError(null);
    // No address API call, just validate and move to next step
    try {
      if (!validateStep()) throw new Error("يرجى تعبئة جميع الحقون المطلوبة");
      setStep(2);
    } catch (err: any) {
      setError(err.message || "حدث خطأ أثناء إضافة العنوان");
    }
  };

  // Place order (final step)
  const handlePayment = async () => {
    try {
      if (!isMounted.current) return;
      setPlacing(true);
      setError(null);
      setSuccess(null);
      if (!delivery) throw new Error("يرجى اختيار طريقة التوصيل");
      if (!payment) throw new Error("يرجى اختيار طريقة الدفع");
      if (!state.items.length) throw new Error("السلة فارغة");
      if (guestIdLoading || !guestId) throw new Error('يرجى الانتظار حتى يتم تجهيز الحساب المؤقت');
      
      // Use default email if user didn't provide one
      const emailToUse = form.email.trim() || 'owis10k@gmail.com';
      
      // 1. Create address and get address_id
      const addressRes = await addAddress({
        name: form.name,
        phone: form.phone,
        email: emailToUse,
        country: form.country,
        city: form.city,
        postal: form.postal,
        address: form.address,
        address_type: form.addressType,
        guest_id: guestId,
      });
      let address_id = addressRes.address_id || addressRes.id || addressRes.data?.id;
      if (!address_id) {
        address_id = await fetchLatestAddressWithRetry(guestId);
      }
      if (!address_id) throw new Error("فشل حفظ العنوان. يرجى المحاولة مرة أخرى.");
      // 2. Fetch cart and select shipping method
      const cart = await getCart();
      if (!Array.isArray(cart) || cart.length === 0) {
        if (isMounted.current) {
          setError('السلة فارغة أو لم يتم مزامنتها مع الخادم بعد. يرجى إضافة منتجات وإعادة المحاولة.');
          setPlacing(false);
        }
        return;
      }
      let cartGroupId = 'default';
      if (cart[0].cart_group_id) {
        cartGroupId = cart[0].cart_group_id;
      }
      await chooseShippingMethod(delivery, guestId, cartGroupId);
      // 3. Place order with address_id and shipping_cost
      // Check if payment method is COD (handle different possible COD key names)
      const isCOD = payment?.toLowerCase() === 'cod' || 
                    payment?.toLowerCase() === 'cash_on_delivery' || 
                    payment?.toLowerCase().includes('cod') || 
                    payment?.toLowerCase().includes('نقد');
      
      
      if (!isCOD) {
        // Digital/online payment flow: Use the proper API function like the old project
        const digitalPaymentParams = {
          order_note: '',
          customer_id: guestId,
          address_id,
          billing_address_id: address_id,
          coupon_code: '',
          coupon_discount: '',
          payment_method: payment,
          is_check_create_account: false,
          password: '',
          payment_platform: 'web',
          payment_request_from: 'app',
          external_redirect_link: 'https://awisapp.com/web-payment?flag=success&&token={token}',
        };

        const data = await digitalPaymentPlaceOrder(digitalPaymentParams);
        
        if (data && data.redirect_link) {
          if (isMounted.current) {
            // Set session storage flag to indicate payment attempt
            if (typeof window !== 'undefined') {
              sessionStorage.setItem('recent_payment_attempt', 'true');
            }
            window.location.href = data.redirect_link;
          }
        } else {
          const msg = (data && typeof data === 'object' && 'message' in data) ? data.message : String(data);
          throw new Error('No redirect_link received from backend! Error: ' + msg);
        }
        return;
      }
      // Cash on delivery (existing logic)
      const orderPayload = {
        address_id,
        delivery,
        payment,
        order_note: '',
        cartItems: state.items.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          variant: item.variant,
          color: item.color || undefined,
        })),
        guest_id: guestId,
        country: form.country,
        city: form.city,
        postal: form.postal,
        phone: form.phone,
        name: form.name,
        address: form.address,
        email: emailToUse,
        shipping_cost: deliveryPrice,
      };
      const res = await placeOrder(orderPayload);
      if (isMounted.current) {
        // Extract order ID from COD response (backend returns order_ids array)
        let orderId = null;
        if (res?.order_ids && Array.isArray(res.order_ids) && res.order_ids.length > 0) {
          orderId = res.order_ids[0]; // Take first order ID from array
        } else if (res?.order_id) {
          orderId = res.order_id; // Fallback to single order_id
        }
        
        // Set navigation flag to prevent empty cart redirect
        setIsNavigatingToSuccess(true);
        
        // Navigate to dedicated success page immediately (like Flutter's DashBoardScreen navigation)
        const total = state.subtotal + deliveryPrice;
        const queryParams = new URLSearchParams({
          id: String(orderId || 'COD_SUCCESS'),
          total: String(total),
          payment: 'cod'
        });
        
        // Use replace to prevent going back to checkout (like Flutter's pushAndRemoveUntil)
        router.replace(`/order-success?${queryParams.toString()}`);
        
        // Clear cart after a short delay to ensure navigation starts
        setTimeout(() => {
          if (isMounted.current) {
            clearCart();
          }
        }, 200);
      }
    } catch (err: any) {
      if (isMounted.current) {
        if (err && err.message) {
          setError(err.message);
        } else {
          setError("حدث خطأ أثناء الشراء");
        }
      }
    } finally {
      if (isMounted.current) {
        setPlacing(false);
      }
    }
  };

  // Stepper UI
  const StepIndicator = () => (
    <div className="flex justify-center gap-2 mb-8">
      {[1, 2].map((s) => (
        <div
          key={s}
          className={`w-8 h-2 rounded-full transition-all duration-300 ${
            step === s
              ? "bg-blue-600 w-16"
              : step > s
              ? "bg-green-500"
              : "bg-gray-300"
          }`}
        ></div>
      ))}
    </div>
  );

  // Helper to detect dark mode
  const isDark = typeof window !== 'undefined' && document.documentElement.classList.contains('dark');

  if (guestIdLoading || !guestId) {
    return <div className="text-center text-lg py-10">جاري تجهيز الحساب المؤقت للزائر...</div>;
  }
  if (guestIdError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-100">
        <div className="text-red-600 text-lg">{guestIdError}</div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#181818]' : 'bg-gray-50'}`} dir="rtl">
      <header className={`${isDark ? 'bg-[#222]' : 'bg-white'} shadow-sm`}>
        <div className="max-w-2xl mx-auto px-4">
          <div className={`relative flex items-center py-2 border-b ${isDark ? 'border-[#333]' : 'border-gray-100'} min-h-[48px]`}>
            {step === 1 ? (
              <Link href="/cart" aria-label="Back to cart" className={`absolute left-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-9 h-9 rounded-full ${isDark ? 'bg-[#222] hover:bg-[#333]' : 'bg-gray-100 hover:bg-gray-200'} transition-colors shadow-sm focus:outline-none`} style={{ boxShadow: 'none' }}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: WEB_CONSTANTS.secondaryColor }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setStep(1)}
                aria-label="Back to address"
                className={`absolute left-0 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-9 h-9 rounded-full ${isDark ? 'bg-[#222] hover:bg-[#333]' : 'bg-gray-100 hover:bg-gray-200'} transition-colors shadow-sm focus:outline-none`}
                style={{ boxShadow: 'none' }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: WEB_CONSTANTS.secondaryColor }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h1 className="mx-auto text-xl font-bold truncate max-w-xs md:max-w-lg text-center w-full" style={{ color: isDark ? '#fff' : '#222' }}>
              {step === 2 ? i18n.t('shipping_and_payment') : i18n.t('checkout_address_info')}
            </h1>
          </div>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-8">
        <StepIndicator />
        {step === 1 && (
          <div className={`${isDark ? 'bg-[#222]' : 'bg-white'} rounded-lg shadow p-6 mb-6`} dir={language === 'ar' ? 'rtl' : 'ltr'}>
            <h2 className={`text-xl font-semibold mb-4 ${isDark ? 'text-white' : 'text-[#222]'}`}>{i18n.t('checkout_address_info')}</h2>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); handleAddressNext(); }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block mb-1 font-medium ${isDark ? 'text-white' : 'text-[#222]'}`}>{i18n.t('checkout_name')} <span className="text-red-500">*</span></label>
                  <input name="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={`w-full rounded p-2 border focus:outline-none focus:ring-2 ${isDark ? 'bg-[#181818] text-white border-[#444] focus:ring-primary' : 'bg-white text-[#222] border-gray-300 focus:ring-primary'}`} style={{ borderColor: WEB_CONSTANTS.primaryColor }} required />
                </div>
                <div>
                  <label className={`block mb-1 font-medium ${isDark ? 'text-white' : 'text-[#222]'}`}>{i18n.t('checkout_phone')} <span className="text-red-500">*</span></label>
                  <input
                    name="phone"
                    value={form.phone}
                    onChange={e => {
                      // Only allow numbers
                      const value = e.target.value.replace(/[^0-9]/g, '');
                      setForm({ ...form, phone: value });
                    }}
                    className={`w-full rounded p-2 border focus:outline-none focus:ring-2 ${isDark ? 'bg-[#181818] text-white border-[#444] focus:ring-primary' : 'bg-white text-[#222] border-gray-300 focus:ring-primary'}`}
                    style={{ borderColor: WEB_CONSTANTS.primaryColor }}
                    required
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="tel"
                  />
                </div>
                  <div>
                    <label className={`block mb-1 font-medium ${isDark ? 'text-white' : 'text-[#222]'}`}>{i18n.t('checkout_email')} <span className="text-gray-400 text-sm">({language === 'ar' ? 'اختياري' : 'optional'})</span></label>
                    <input
                      name="email"
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      className={`w-full rounded p-2 border focus:outline-none focus:ring-2 ${isDark ? 'bg-[#181818] text-white border-[#444] focus:ring-primary' : 'bg-white text-[#222] border-gray-300 focus:ring-primary'}`}
                      style={{ borderColor: WEB_CONSTANTS.primaryColor }}
                      type="email"
                      autoComplete="email"
                      placeholder={language === 'ar' ? 'البريد الإلكتروني (اختياري)' : 'Email (optional)'}
                    />
                  </div>
                <div>
                  <label className={`block mb-1 font-medium ${isDark ? 'text-white' : 'text-[#222]'}`}>{i18n.t('checkout_address_type')}</label>
                  <select name="addressType" value={form.addressType} onChange={e => setForm({ ...form, addressType: e.target.value })} className={`w-full rounded p-2 border focus:outline-none focus:ring-2 ${isDark ? 'bg-[#181818] text-white border-[#444] focus:ring-primary' : 'bg-white text-[#222] border-gray-300 focus:ring-primary'}`} style={{ borderColor: WEB_CONSTANTS.primaryColor }}>
                    <option value="دائم">{i18n.t('checkout_address_type_permanent')}</option>
                    <option value="مؤقت">{i18n.t('checkout_address_type_temporary')}</option>
                  </select>
                </div>
                <div className="mb-4">
                  <label className={`block mb-1 ${isDark ? 'text-white' : 'text-[#222]'}`}>{i18n.t('checkout_country')}</label>
                  {allowedCountriesLoading ? (
                    <div className={isDark ? 'text-[#ccc]' : 'text-[#666]'}>جاري تحميل قائمة الدول...</div>
                  ) : allowedCountries.length === 0 ? (
                    <div className="text-red-500">{countryError || 'تعذر تحميل قائمة الدول.'}</div>
                  ) : (
                    <select
                      className={`w-full rounded p-2 border focus:outline-none focus:ring-2 ${isDark ? 'bg-[#181818] text-white border-[#444] focus:ring-primary' : 'bg-white text-[#222] border-gray-300 focus:ring-primary'}`}
                      value={form.country}
                      onChange={e => setForm({ ...form, country: e.target.value })}
                      style={{ borderColor: WEB_CONSTANTS.primaryColor }}
                      required
                    >
                      <option value="">{i18n.t('checkout_country')}</option>
                      {allowedCountries.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  )}
                  {countryError && allowedCountries.length > 0 && <div className="text-red-500 text-sm mt-1">{countryError}</div>}
                </div>
                <div>
                  <label className={`block mb-1 font-medium ${isDark ? 'text-white' : 'text-[#222]'}`}>{i18n.t('checkout_city')} <span className="text-red-500">*</span></label>
                  <input name="city" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className={`w-full rounded p-2 border focus:outline-none focus:ring-2 ${isDark ? 'bg-[#181818] text-white border-[#444] focus:ring-primary' : 'bg-white text-[#222] border-gray-300 focus:ring-primary'}`} style={{ borderColor: WEB_CONSTANTS.primaryColor }} required />
                </div>
                <div className="md:col-span-2">
                  <label className={`block mb-1 font-medium ${isDark ? 'text-white' : 'text-[#222]'}`}>{i18n.t('checkout_address')} <span className="text-red-500">*</span></label>
                  <input name="address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className={`w-full rounded p-2 border focus:outline-none focus:ring-2 ${isDark ? 'bg-[#181818] text-white border-[#444] focus:ring-primary' : 'bg-white text-[#222] border-gray-300 focus:ring-primary'}`} style={{ borderColor: WEB_CONSTANTS.primaryColor }} required />
                </div>
              </div>
              {error && <div className="text-red-600 text-center mt-2 bg-red-50 dark:bg-[#3a1a1a] rounded p-2">{error}</div>}
              <button type="submit" className="w-full text-white py-3 px-4 rounded-md transition-colors mt-4 font-bold" style={{ background: WEB_CONSTANTS.primaryColor }} disabled={addressLoading}>
                {addressLoading ? i18n.t('checkout_saving_address') : i18n.t('checkout_next')}
              </button>
            </form>
          </div>
        )}
        {step === 2 && (
          <form onSubmit={e => { e.preventDefault(); handlePayment(); }} dir={language === 'ar' ? 'rtl' : 'ltr'}>
            {/* Shipping Options */}
            <div className={`${isDark ? 'bg-[#222]' : 'bg-white'} rounded-lg shadow p-6 mb-6`}>
              <h2 className={`text-xl font-semibold mb-4 ${isDark ? 'text-white' : 'text-[#222]'}`}>{i18n.t('shipping_method')}</h2>
              {shippingLoading ? (
                <div className={isDark ? 'text-[#ccc]' : 'text-[#666]'}>جاري تحميل خيارات الشحن...</div>
              ) : shippingOptions.length === 0 ? (
                <div className="text-center text-red-500">لا توجد خيارات شحن متاحة حالياً لهذا البائع. جرب تحديث الصفحة أو التواصل مع الدعم.</div>
              ) : (
                <div className="flex flex-col gap-4 mt-2">
                  {shippingOptions.map((option: any, idx: number) => (
                    <label key={option.id || option.key || idx} className={`flex items-center gap-2 cursor-pointer rounded p-3 border transition-colors ${isDark ? 'bg-[#181818] border-[#444] text-white' : 'bg-white border-gray-200 text-[#222]'} ${delivery === (option.key || option.id || option.title) ? `border-[${WEB_CONSTANTS.primaryColor}]` : ''}` }>
                      <input
                        type="radio"
                        name="delivery"
                        value={option.key || option.id || option.title}
                        checked={delivery === (option.key || option.id || option.title)}
                        onChange={async () => {
                          if (!isMounted.current) return;
                          setDelivery(option.key || option.id || option.title);
                          setDeliveryPrice(Number(option.cost || 0));
                          try {
                            if (guestId && isMounted.current) {
                              // Fetch cart and extract cart_group_id
                              const cart = await getCart();
                              if (!isMounted.current) return;
                              if (!Array.isArray(cart) || cart.length === 0) {
                                if (isMounted.current) {
                                  setError('السلة فارغة أو لم يتم مزامنتها مع الخادم بعد. يرجى إضافة منتجات وإعادة المحاولة.');
                                }
                                return;
                              }
                              let cartGroupId = 'default';
                              if (cart[0].cart_group_id) {
                                cartGroupId = cart[0].cart_group_id;
                              }
                              await chooseShippingMethod(option.id, guestId, cartGroupId);
                            }
                          } catch (err) {
                            if (isMounted.current) {
                              setError('تعذر حفظ طريقة الشحن المختارة. يرجى المحاولة مرة أخرى.');
                            }
                          }
                        }}
                        className={`accent-[${WEB_CONSTANTS.primaryColor}] focus:ring-2 focus:ring-[${WEB_CONSTANTS.primaryColor}]`}
                      />
                      <span className={isDark ? 'text-white' : 'text-[#222]'}>
                        {(() => {
                          const label = i18n.t('fast_delivery', { lng: language });
                          if (label === 'fast_delivery') {
                            return language === 'ar' ? 'توصيل سريع' : 'Fast Delivery';
                          }
                          return label;
                        })()}
                      </span>
                      <span className="ml-2 font-bold" style={{ color: WEB_CONSTANTS.primaryColor }}>{option.cost !== undefined ? formatPrice(option.cost, config, language) : ''}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {/* Payment Methods */}
            <div className={`${isDark ? 'bg-[#222]' : 'bg-white'} rounded-lg shadow p-6 mb-6`}>
              <h2 className={`text-xl font-semibold mb-4 ${isDark ? 'text-white' : 'text-[#222]'}`}>{i18n.t('payment_method')}</h2>
              {paymentMethodsLoading ? (
                <div className={isDark ? 'text-[#ccc]' : 'text-[#666]'}>جاري تحميل طرق الدفع...</div>
              ) : paymentMethodsError ? (
                <div style={{ color: 'red' }}>{paymentMethodsError}</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  {paymentMethods.map((method, idx) => (
                    <label 
                      key={method.key || method.name || idx} 
                      className={`
                        border rounded-lg p-4 cursor-pointer 
                        flex items-center justify-between
                        transition-all duration-200 ease-in-out
                        hover:shadow-md
                        ${isDark ? 'bg-[#181818] border-[#444] text-white hover:bg-[#222]' : 'bg-white border-gray-200 text-[#222] hover:bg-gray-50'} 
                        ${payment === (method.key || method.key_name) ? `border-[${WEB_CONSTANTS.primaryColor}] ring-2 ring-[${WEB_CONSTANTS.primaryColor}] ring-opacity-20` : ''}
                      `}
                    >
                      {(method.key || method.key_name)?.toLowerCase() === 'fatoorah' ? (
                        <>
                          <input
                            type="radio"
                            name="payment"
                            value={method.key || method.key_name}
                            checked={payment === (method.key || method.key_name)}
                            onChange={() => setPayment(method.key || method.key_name)}
                            className={`w-4 h-4 accent-[${WEB_CONSTANTS.primaryColor}] focus:ring-2 focus:ring-[${WEB_CONSTANTS.primaryColor}]`}
                            disabled={paymentMethodsLoading}
                          />
                          <div className="flex-1 flex justify-center mx-4">
                            <img 
                              src="/payment-logos.png" 
                              alt="Online Payment Methods" 
                              className="h-10 max-w-[180px] object-contain" 
                            />
                          </div>
                          <div className="w-4"></div> {/* Spacer for balance */}
                        </>
                      ) : (method.key || method.key_name)?.toLowerCase() === 'cod' || (method.key || method.key_name)?.toLowerCase() === 'cash_on_delivery' || (method.name || method.label || '')?.toLowerCase().includes('cod') || (method.name || method.label || '')?.toLowerCase().includes('نقد') ? (
                        <>
                          <input
                            type="radio"
                            name="payment"
                            value={method.key || method.key_name}
                            checked={payment === (method.key || method.key_name)}
                            onChange={() => setPayment(method.key || method.key_name)}
                            className={`w-4 h-4 accent-[${WEB_CONSTANTS.primaryColor}] focus:ring-2 focus:ring-[${WEB_CONSTANTS.primaryColor}]`}
                            disabled={paymentMethodsLoading}
                          />
                          <div className="flex-1 flex justify-center items-center mx-4">
                            <div className="flex items-center gap-3">
                              <svg className="w-8 h-8 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                              </svg>
                              <span className={`font-medium text-center ${isDark ? 'text-white' : 'text-[#222]'}`}>
                                {language === 'ar' ? 'الدفع عند الاستلام' : 'Cash on Delivery'}
                              </span>
                            </div>
                          </div>
                          <div className="w-4"></div> {/* Spacer for balance */}
                        </>
                      ) : (
                        <>
                          <input
                            type="radio"
                            name="payment"
                            value={method.key || method.key_name}
                            checked={payment === (method.key || method.key_name)}
                            onChange={() => setPayment(method.key || method.key_name)}
                            className={`w-4 h-4 accent-[${WEB_CONSTANTS.primaryColor}] focus:ring-2 focus:ring-[${WEB_CONSTANTS.primaryColor}]`}
                            disabled={paymentMethodsLoading}
                          />
                          <div className="flex-1 flex justify-center items-center mx-4">
                            <div className="flex items-center gap-3">
                              {method.image && <img src={method.image} alt={method.name || method.label || 'طريقة الدفع'} className="h-8 object-contain flex-shrink-0" />}
                              <span className={`font-medium text-center ${isDark ? 'text-white' : 'text-[#222]'}`}>
                                {method.name || method.label || method.key || method.key_name}
                              </span>
                            </div>
                          </div>
                          <div className="w-4"></div> {/* Spacer for balance */}
                        </>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
            {/* Order Summary */}
            <div className={`${isDark ? 'bg-[#222]' : 'bg-white'} rounded-lg shadow p-6 mb-6`}>
              <h2 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-[#222]'}`}>{i18n.t('order_summary')}</h2>
              {state.items.length === 0 ? (
                <div className={isDark ? 'text-[#ccc]' : 'text-[#666]'}>السلة فارغة</div>
              ) : (
                <ul className={`divide-y ${isDark ? 'divide-[#333]' : 'divide-gray-200'} mb-4`}>
                  {state.items.map((item) => (
                    <li key={item.id} className="py-2 flex justify-between items-center">
                      <span className={`text-sm ${isDark ? 'text-white' : 'text-[#222]'}`}>{getLocalizedProductName(item, language)} × {item.quantity}</span>
                      <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-[#222]'}`}>{formatPrice((item.price - item.discount) * item.quantity, config, language)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className={`flex justify-between text-sm mb-1 ${isDark ? 'text-[#ccc]' : 'text-[#666]'}`}> 
                <span>{i18n.t('checkout_subtotal')}</span>
                <span>{formatPrice(state.subtotal, config, language)}</span>
              </div>
              <div className={`flex justify-between text-sm mb-1 ${isDark ? 'text-[#ccc]' : 'text-[#666]'}`}> 
                <span>{i18n.t('checkout_shipping')}</span>
                <span>{formatPrice(deliveryPrice, config, language)}</span>
              </div>
              <div className={`border-t pt-3 flex justify-between text-lg font-semibold ${isDark ? 'border-[#333] text-white' : 'border-gray-200 text-[#222]'}`}> 
                <span>{i18n.t('checkout_total')}</span>
                <span>{formatPrice(state.subtotal + deliveryPrice, config, language)}</span>
              </div>
            </div>
            {error && <div className="text-red-600 text-center mt-4 text-lg font-bold">[خطأ]: {error}</div>}
            <button
              type="submit"
              className="w-full text-white py-3 px-4 rounded-md transition-colors text-lg font-bold mt-4"
              style={{ background: WEB_CONSTANTS.primaryColor }}
              disabled={placing || !payment || paymentMethodsLoading || shippingLoading || !delivery}
            >
              {placing ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                  </svg>
                </span>
              ) : payment !== 'cod' ? 'ادفع الآن' : 'تأكيد الطلب'}
            </button>
          </form>
        )}
        {step === 4 && (
          <div className={`${isDark ? 'bg-[#222]' : 'bg-white'} rounded-lg shadow p-6 mb-6 text-center`}>
            <h2 className="text-2xl font-bold text-green-600 mb-4">تم إرسال الطلب بنجاح!</h2>
            <p className="mb-6">شكراً لطلبك. سيتم التواصل معك قريباً.</p>
            <Link href="/" className="text-white py-2 px-6 rounded" style={{ background: WEB_CONSTANTS.primaryColor }}>{i18n.t('checkout_return_home')}</Link>
          </div>
        )}
      </main>
      <div className="h-20 lg:hidden" />
    </div>
  );
} 