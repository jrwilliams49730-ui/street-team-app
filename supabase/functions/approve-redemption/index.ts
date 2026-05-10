import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const tremendousApiKey = Deno.env.get("TREMENDOUS_API_KEY") || "";
    const tremendousBaseUrl =
      Deno.env.get("TREMENDOUS_BASE_URL") || "https://testflight.tremendous.com/api/v2";
    const tremendousCampaignId = Deno.env.get("TREMENDOUS_CAMPAIGN_ID") || "";
    const tremendousFundingSourceId = Deno.env.get("TREMENDOUS_FUNDING_SOURCE_ID") || "balance";

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error("Missing required reward approval environment variables.");
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

    const { redemption_id: redemptionId, admin_notes: adminNotes = "" } = await req.json();

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

    if (redemption.status === "sent" && redemption.tremendous_order_id) {
      return new Response(JSON.stringify({ redemption }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    if (redemption.status !== "pending" && redemption.status !== "failed") {
      throw new Error("Only pending or failed rewards can be sent.");
    }

    if (!tremendousApiKey || !tremendousCampaignId) {
      const manualMessage = "Tremendous not configured.";
      const { data: manualRedemption, error: manualUpdateError } = await serviceSupabase
        .from("reward_redemptions")
        .update({
          status: "pending",
          admin_notes: String(adminNotes || redemption.admin_notes || ""),
          error_message: manualMessage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", redemptionId)
        .select()
        .single();

      if (manualUpdateError) {
        throw new Error(manualUpdateError.message);
      }

      return new Response(
        JSON.stringify({
          manual_required: true,
          message: manualMessage,
          redemption: manualRedemption,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const dollarAmount = Number(redemption.dollar_amount || 0);
    const recipientEmail = String(redemption.fan_email || "").trim();
    const recipientName = String(redemption.fan_display_name || recipientEmail || "Street Team fan");
    const tremendousExternalId =
      redemption.tremendous_external_id || `street-team-redemption-${redemption.id}`;

    if (!recipientEmail || !dollarAmount) {
      throw new Error("Reward request is missing recipient email or amount.");
    }

    const rewardPayload = {
      campaign_id: tremendousCampaignId,
      value: {
        denomination: dollarAmount,
        currency_code: "USD",
      },
      recipient: {
        name: recipientName,
        email: recipientEmail,
      },
      delivery: {
        method: "EMAIL",
      },
    };

    const orderPayload = {
      external_id: tremendousExternalId,
      payment: {
        funding_source_id: tremendousFundingSourceId,
      },
      reward: rewardPayload,
    };

    const tremendousResponse = await fetch(`${tremendousBaseUrl.replace(/\/$/, "")}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tremendousApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderPayload),
    });

    const tremendousBody = await tremendousResponse.json().catch(() => ({}));

    if (!tremendousResponse.ok) {
      const errorMessage =
        tremendousBody?.errors?.[0]?.message ||
        tremendousBody?.message ||
        `Tremendous returned ${tremendousResponse.status}.`;

      const { data: failedRedemption } = await serviceSupabase
        .from("reward_redemptions")
        .update({
          status: "failed",
          error_message: errorMessage,
          tremendous_external_id: tremendousExternalId,
          admin_notes: String(adminNotes || redemption.admin_notes || ""),
          updated_at: new Date().toISOString(),
        })
        .eq("id", redemptionId)
        .select()
        .single();

      return new Response(JSON.stringify({ error: errorMessage, redemption: failedRedemption }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const order = tremendousBody?.order || tremendousBody;
    const reward = order?.reward || order?.rewards?.[0] || {};

    const { data: updatedRedemption, error: updateError } = await serviceSupabase
      .from("reward_redemptions")
      .update({
        status: "sent",
        approved_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
        tremendous_order_id: order?.id || tremendousBody?.id || null,
        tremendous_reward_id: reward?.id || null,
        tremendous_external_id: tremendousExternalId,
        admin_notes: String(adminNotes || redemption.admin_notes || ""),
        error_message: null,
        updated_at: new Date().toISOString(),
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
