// ============================================================
// MATRA — RevenueCat Purchases Service
// ============================================================

import { Platform } from 'react-native';
import Purchases, {
  PurchasesPackage,
  CustomerInfo,
  LOG_LEVEL,
  PurchasesOffering,
} from 'react-native-purchases';
import Constants from 'expo-constants';

const ENTITLEMENT_ID = 'premium';

// Product identifiers — must match App Store Connect & Google Play Console
export const PRODUCT_IDS = {
  monthly: 'matra_premium_monthly',
  annual: 'matra_premium_annual',
} as const;

let isConfigured = false;

/**
 * Initialize RevenueCat SDK. Call once at app startup.
 */
export async function configurePurchases(appUserId?: string): Promise<void> {
  if (isConfigured) return;

  const apiKey = Constants.expoConfig?.extra?.revenueCatApiKey;
  if (!apiKey || apiKey === 'YOUR_REVENUECAT_API_KEY') {
    console.warn('[Purchases] RevenueCat API key not configured — skipping init');
    return;
  }

  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  Purchases.configure({
    apiKey,
    appUserID: appUserId ?? null,
  });

  isConfigured = true;
  console.log('[Purchases] RevenueCat configured');
}

/**
 * Identify the user with RevenueCat after sign-in.
 * This links purchases to the Supabase user ID.
 */
export async function identifyUser(userId: string): Promise<CustomerInfo> {
  if (!isConfigured) {
    await configurePurchases(userId);
  }
  const { customerInfo } = await Purchases.logIn(userId);
  return customerInfo;
}

/**
 * Log out from RevenueCat (anonymous user).
 */
export async function logOutPurchases(): Promise<void> {
  if (!isConfigured) return;
  const isAnonymous = await Purchases.isAnonymous();
  if (!isAnonymous) {
    await Purchases.logOut();
  }
}

/**
 * Get available offerings (packages with pricing from the stores).
 */
export async function getOfferings(): Promise<PurchasesOffering | null> {
  if (!isConfigured) return null;
  const offerings = await Purchases.getOfferings();
  return offerings.current ?? null;
}

/**
 * Purchase a package. Returns updated CustomerInfo.
 * Throws on cancellation or error.
 */
export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

/**
 * Restore previous purchases (e.g. after reinstall).
 */
export async function restorePurchases(): Promise<CustomerInfo> {
  return await Purchases.restorePurchases();
}

/**
 * Get current customer info.
 */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!isConfigured) return null;
  return await Purchases.getCustomerInfo();
}

/**
 * Check if user has active premium entitlement.
 */
export function isPremiumActive(info: CustomerInfo): boolean {
  return info.entitlements.active[ENTITLEMENT_ID] !== undefined;
}

/**
 * Check if purchase error is a user cancellation.
 */
export function isUserCancellation(error: any): boolean {
  return error?.userCancelled === true || error?.code === '1';
}
