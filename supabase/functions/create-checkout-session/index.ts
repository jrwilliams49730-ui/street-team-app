import Stripe from "https://esm.sh/stripe@latest?target=deno";
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
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
    const siteUrl =
      Deno.env.get("APP_URL") ||
      Deno.env.get("SITE_URL") ||
      "http://127.0.0.1:5173";

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !stripeSecretKey) {
      throw new Error("Missing required checkout environment variables.");
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

    const {
      event_id: eventId,
      ticket_type_id: ticketTypeId,
      quantity = 1,
      share_code: shareCode = null,
    } = await req.json();
    const requestedQuantity = Number(quantity);
    const checkoutShareCode =
      typeof shareCode === "string" && shareCode.trim()
        ? shareCode.trim()
        : null;

    const { data: userData, error: userError } = await userSupabase.auth.getUser();

    if (userError || !userData.user) {
      throw new Error("Log in before buying tickets.");
    }

    if (
      !Number.isInteger(requestedQuantity) ||
      requestedQuantity < 1 ||
      requestedQuantity > 8
    ) {
      throw new Error("Choose 1 to 8 tickets.");
    }

    const { data: ticketType, error: ticketTypeError } = await serviceSupabase
      .from("ticket_types")
      .select("id, event_id, name, description, price, quantity_available, quantity_reserved, sale_status")
      .eq("id", ticketTypeId)
      .eq("event_id", eventId)
      .single();

    if (ticketTypeError || !ticketType) {
      throw new Error("Ticket type was not found.");
    }

    if (Number(ticketType.price) <= 0) {
      throw new Error("Use free RSVP for this ticket type.");
    }

    if (ticketType.sale_status !== "on_sale") {
      throw new Error("This ticket type is not on sale.");
    }

    if (
      Number(ticketType.quantity_reserved || 0) + requestedQuantity >
      Number(ticketType.quantity_available || 0)
    ) {
      throw new Error("Not enough tickets remain.");
    }

    const { data: eventData, error: eventError } = await serviceSupabase
      .from("events")
      .select("id, title")
      .eq("id", eventId)
      .single();

    if (eventError || !eventData) {
      throw new Error("Event was not found.");
    }

    const { data: reservation, error: reservationError } = await userSupabase.rpc(
      "create_paid_ticket_reservation",
      {
        p_ticket_type_id: ticketTypeId,
        p_event_id: eventId,
        p_quantity: requestedQuantity,
      },
    );

    if (reservationError || !reservation) {
      throw new Error(reservationError?.message || "Could not create pending ticket order.");
    }

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `${eventData.title} - ${ticketType.name}`,
                description: ticketType.description || undefined,
              },
              unit_amount: Math.round(Number(ticketType.price) * 100),
            },
            quantity: requestedQuantity,
          },
        ],
        success_url: `${siteUrl}/?ticket_checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/?ticket_checkout=cancelled&event=${eventId}&reservation_id=${reservation.id}`,
        customer_email: userData.user.email || undefined,
        metadata: {
          order_id: reservation.id,
          event_id: String(eventId),
          ticket_type_id: String(ticketTypeId),
          user_id: userData.user.id,
          quantity: String(requestedQuantity),
          ...(checkoutShareCode ? { share_code: checkoutShareCode } : {}),
        },
      });

      const { error: updateError } = await serviceSupabase
        .from("ticket_reservations")
        .update({
          stripe_session_id: session.id,
          checkout_share_code: checkoutShareCode,
          amount_total: session.amount_total,
          currency: session.currency || "usd",
          updated_at: new Date().toISOString(),
        })
        .eq("id", reservation.id);

      if (updateError) {
        throw updateError;
      }

      return new Response(JSON.stringify({ url: session.url }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    } catch (stripeError) {
      await serviceSupabase.rpc("cancel_pending_ticket_reservation", {
        p_reservation_id: reservation.id,
      });

      throw stripeError;
    }
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Could not start checkout.",
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
