// ============================================================
// MATRA — Validate Subscription (RevenueCat Webhook)
// ============================================================
// Receives webhooks from RevenueCat when subscription state changes.
// Updates the database accordingly.
// ============================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import type { SubscriptionTier } from '../_shared/types.ts';

// RevenueCat webhook event types
type RCEventType =
  | 'INITIAL_PURCHASE'
  | 'RENEWAL'
  | 'CANCELLATION'
  | 'UNCANCELLATION'
  | 'BILLING_ISSUE'
  | 'SUBSCRIBER_ALIAS'
  | 'PRODUCT_CHANGE'
  | 'EXPIRATION'
  | 'NON_RENEWING_PURCHASE';

interface RCWebhookEvent {
  event: {
    type: RCEventType;
    app_user_id: string;
    product_id: string;
    expiration_at_ms: number | null;
    purchased_at_ms: number;
    store: 'PLAY_STORE' | 'APP_STORE' | 'STRIPE';
    environment: 'PRODUCTION' | 'SANDBOX';
    original_app_user_id: string;
    entitlement_ids: string[];
  };
  api_version: string;
}

function productToTier(productId: string): SubscriptionTier {
  if (productId.includes('premium') || productId.includes('pro')) return 'premium';
  return 'free';
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Verify webhook authenticity
    const authHeader = req.headers.get('Authorization');
    const expectedToken = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return errorResponse('Invalid webhook token', 'UNAUTHORIZED', 401);
    }

    const payload: RCWebhookEvent = await req.json();
    const event = payload.event;
    const supabase = getServiceClient();

    console.log(`RevenueCat webhook: ${event.type} for user ${event.app_user_id}`);

    // Skip sandbox events in production
    if (Deno.env.get('ENVIRONMENT') === 'production' && event.environment === 'SANDBOX') {
      return jsonResponse({ skipped: true });
    }

    const userId = event.app_user_id;
    const tier = productToTier(event.product_id);

    switch (event.type) {
      case 'INITIAL_PURCHASE':
      case 'NON_RENEWING_PURCHASE': {
        // Create new subscription record
        await supabase.from('subscriptions').insert({
          user_id: userId,
          tier,
          status: 'active',
          provider: 'revenuecat',
          provider_subscription_id: event.product_id,
          provider_customer_id: event.original_app_user_id,
          started_at: new Date(event.purchased_at_ms).toISOString(),
          expires_at: event.expiration_at_ms
            ? new Date(event.expiration_at_ms).toISOString()
            : null,
          metadata: { store: event.store, environment: event.environment },
        });

        // Update profile tier
        await supabase
          .from('profiles')
          .update({ subscription_tier: tier })
          .eq('id', userId);
        break;
      }

      case 'RENEWAL': {
        // Update existing subscription
        await supabase
          .from('subscriptions')
          .update({
            status: 'active',
            expires_at: event.expiration_at_ms
              ? new Date(event.expiration_at_ms).toISOString()
              : null,
          })
          .eq('user_id', userId)
          .eq('status', 'active');
        break;
      }

      case 'CANCELLATION': {
        // Mark as cancelled (still active until expires_at)
        await supabase
          .from('subscriptions')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('status', 'active');
        break;
      }

      case 'EXPIRATION': {
        // Subscription fully expired — downgrade to free
        await supabase
          .from('subscriptions')
          .update({ status: 'expired' })
          .eq('user_id', userId)
          .in('status', ['active', 'cancelled']);

        await supabase
          .from('profiles')
          .update({ subscription_tier: 'free' })
          .eq('id', userId);
        break;
      }

      case 'BILLING_ISSUE': {
        await supabase
          .from('subscriptions')
          .update({ status: 'billing_retry' })
          .eq('user_id', userId)
          .eq('status', 'active');
        break;
      }

      case 'UNCANCELLATION': {
        await supabase
          .from('subscriptions')
          .update({
            status: 'active',
            cancelled_at: null,
          })
          .eq('user_id', userId)
          .eq('status', 'cancelled');

        await supabase
          .from('profiles')
          .update({ subscription_tier: tier })
          .eq('id', userId);
        break;
      }

      case 'PRODUCT_CHANGE': {
        const newTier = productToTier(event.product_id);
        await supabase
          .from('subscriptions')
          .update({ tier: newTier })
          .eq('user_id', userId)
          .eq('status', 'active');

        await supabase
          .from('profiles')
          .update({ subscription_tier: newTier })
          .eq('id', userId);
        break;
      }
    }

    return jsonResponse({ processed: true, eventType: event.type });
  } catch (err) {
    console.error('Webhook error:', err);
    return errorResponse(err.message, 'WEBHOOK_ERROR', 500);
  }
});
