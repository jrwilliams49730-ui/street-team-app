import Stripe from "https://esm.sh/stripe@latest?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildPromoCode(redemptionId: string, userId: string) {
  const userPart = userId.replace(/-/g, "").slice(0, 4).toUpperCase();
  const redemptionPart = redemptionId.replace(/-/g, "").slice(0, 4).toUpperCase();
  const randomPart = crypto.randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
  return `ST-${userPart || redemptionPart}-${randomPart}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || "";

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !stripeSecretKey) {
      throw new Error("Missing required approval environment variables.");
    }

    const authHeader = req.headers.get("Authorization") || "";
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });
    const serviceSupabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2026-02-25.clover",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const { redemption_id: redemptionId } = await req.json();

    if (!redemptionId) {
      throw new Error("Choose a redemption.");
    }

    const { data: isAdmin, error: adminError } = await userSupabase.rpc("is_owner_admin");

    if (adminError || !isAdmin) {
      throw new Error("Not authorized.");
    }

    const { data: redemption, error: redemptionError } = await serviceSupabase
      .from("reward_redemptions")
      .select("*")
      .eq("id", redemptionId)
      .single();

    if (redemptionError || !redemption) {
      throw new Error("Reward request was not found.");
    }

    if (redemption.status === "approved" && redemption.coupon_code) {
      return new Response(JSON.stringify({ redemption }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    if (!redemption.stripe_enabled || redemption.reward_type === "gift_card") {
      const { data: updatedRedemption, error: updateError } = await serviceSupabase
        .from("reward_redemptions")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
        })
        .eq("id", redemptionId)
        .select()
        .single();

      if (updateError) {
        throw new Error(updateError.message);
      }

      return new Response(JSON.stringify({ redemption: updatedRedemption }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const couponParams: Stripe.CouponCreateParams = {
      duration: "once",
      name: redemption.reward_label || "Street Team ticket reward",
      metadata: {
        redemption_id: String(redemption.id),
        user_id: String(redemption.user_id),
        reward_type: String(redemption.reward_type || ""),
        eligible_ticket_type: String(redemption.eligible_ticket_type || "any"),
      },
    };

    if (Number(redemption.discount_amount_cents || 0) > 0) {
      couponParams.amount_off = Number(redemption.discount_amount_cents);
      couponParams.currency = "usd";
    } else if (Number(redemption.percent_off || 0) > 0) {
      couponParams.percent_off = Number(redemption.percent_off);
    } else {
      throw new Error("This ticket reward is missing discount configuration.");
    }

    const coupon = await stripe.coupons.create(couponParams);
    const code = buildPromoCode(String(redemption.id), String(redemption.user_id));
    const promotionCode = await stripe.promotionCodes.create({
      coupon: coupon.id,
      code,
      max_redemptions: 1,
      metadata: {
        redemption_id: String(redemption.id),
        user_id: String(redemption.user_id),
      },
    });

    const { data: updatedRedemption, error: updateError } = await serviceSupabase
      .from("reward_redemptions")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        coupon_code: code,
        stripe_coupon_id: coupon.id,
        stripe_promotion_code_id: promotionCode.id,
      })
      .eq("id", redemptionId)
      .select()
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    return new Response(JSON.stringify({ redemption: updatedRedemption }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Could not approve redemption.",
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
