import Stripe from "https://esm.sh/stripe@latest?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.1";

Deno.serve(async (req) => {
  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!stripeSecretKey || !webhookSecret || !supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Missing required webhook environment variables.");
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2026-02-25.clover",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const signature = req.headers.get("Stripe-Signature");
    const body = await req.text();

    if (!signature) {
      throw new Error("Missing Stripe signature.");
    }

    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
    );

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { data: existingEvent, error: existingEventError } = await supabase
      .from("stripe_webhook_events")
      .select("stripe_event_id, processed_at")
      .eq("stripe_event_id", event.id)
      .maybeSingle();

    if (existingEventError) {
      throw new Error(existingEventError.message);
    }

    if (existingEvent?.processed_at) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    if (!existingEvent) {
      const { error: receivedEventError } = await supabase
      .from("stripe_webhook_events")
      .insert({
        stripe_event_id: event.id,
        event_type: event.type,
        first_seen_at: new Date().toISOString(),
      });

      if (receivedEventError?.code !== "23505" && receivedEventError) {
        throw new Error(receivedEventError.message);
      }
    }

    if (event.type !== "checkout.session.completed") {
      await supabase
        .from("stripe_webhook_events")
        .update({
          processed_at: new Date().toISOString(),
          processing_error: null,
        })
        .eq("stripe_event_id", event.id);

      return new Response(JSON.stringify({ received: true }), {
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.order_id;

    if (!orderId) {
      throw new Error("Checkout session is missing order metadata.");
    }

    const completedSession = await stripe.checkout.sessions.retrieve(session.id, {
      expand: [
        "discounts.promotion_code",
        "discounts.coupon",
        "total_details.breakdown.discounts.discount.promotion_code",
        "total_details.breakdown.discounts.discount.coupon",
      ],
    } as Stripe.Checkout.SessionRetrieveParams);

    const { error } = await supabase.rpc("mark_ticket_reservation_paid", {
      p_reservation_id: orderId,
      p_stripe_session_id: session.id,
      p_payment_intent_id:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id || "",
      p_amount_total: completedSession.amount_total || session.amount_total || 0,
      p_currency: completedSession.currency || session.currency || "usd",
    });

    if (error) {
      await supabase
        .from("stripe_webhook_events")
        .update({
          processing_error: error.message,
        })
        .eq("stripe_event_id", event.id);

      throw new Error(error.message);
    }

    const { error: pointsError } = await supabase.rpc("award_paid_ticket_points", {
      p_reservation_id: orderId,
      p_share_code: session.metadata?.share_code || null,
    });

    if (pointsError) {
      await supabase
        .from("stripe_webhook_events")
        .update({
          processing_error: pointsError.message,
        })
        .eq("stripe_event_id", event.id);

      throw new Error(pointsError.message);
    }

    const directDiscounts = ((completedSession as unknown as { discounts?: unknown[] }).discounts || []);
    const breakdownDiscounts =
      (completedSession as unknown as {
        total_details?: { breakdown?: { discounts?: Array<{ discount?: unknown }> } };
      }).total_details?.breakdown?.discounts?.map((item) => item.discount) || [];
    const allDiscounts = [...directDiscounts, ...breakdownDiscounts];
    const usedDiscount = allDiscounts[0] as
      | {
          coupon?: string | { id?: string };
          promotion_code?: string | { id?: string; code?: string };
        }
      | undefined;
    const usedPromotionCode = usedDiscount?.promotion_code;
    const usedCoupon = usedDiscount?.coupon;
    const promotionCodeId =
      typeof usedPromotionCode === "string" ? usedPromotionCode : usedPromotionCode?.id || "";
    const couponCode =
      typeof usedPromotionCode === "object" ? usedPromotionCode?.code || "" : "";
    const couponId = typeof usedCoupon === "string" ? usedCoupon : usedCoupon?.id || "";

    if (promotionCodeId || couponId || couponCode) {
      const { error: discountError } = await supabase.rpc("mark_ticket_discount_used", {
        p_stripe_promotion_code_id: promotionCodeId || null,
        p_stripe_coupon_id: couponId || null,
        p_coupon_code: couponCode || null,
        p_reservation_id: orderId,
        p_stripe_session_id: session.id,
      });

      if (discountError) {
        await supabase
          .from("stripe_webhook_events")
          .update({
            processing_error: discountError.message,
          })
          .eq("stripe_event_id", event.id);

        throw new Error(discountError.message);
      }
    }

    await supabase
      .from("stripe_webhook_events")
      .update({
        processed_at: new Date().toISOString(),
        processing_error: null,
      })
      .eq("stripe_event_id", event.id);

    return new Response(JSON.stringify({ received: true }), {
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Webhook failed.",
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
});
