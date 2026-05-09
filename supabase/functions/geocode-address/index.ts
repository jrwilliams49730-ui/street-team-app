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
    const apiKey = Deno.env.get("GEOCODING_API_KEY") || "";

    if (!supabaseUrl || !supabaseAnonKey || !apiKey) {
      throw new Error("Missing required geocoding environment variables.");
    }

    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      throw new Error("Log in before geocoding events.");
    }

    const {
      venue_name: venueName = "",
      street_address: streetAddress = "",
      city = "",
      state = "",
      zip_code: zipCode = "",
    } = await req.json();

    if (
      !String(venueName).trim() ||
      !String(streetAddress).trim() ||
      !String(city).trim() ||
      !String(state).trim() ||
      !String(zipCode).trim()
    ) {
      throw new Error("Enter venue name, street address, city, state, and zip code.");
    }

    const addressParts = [venueName, streetAddress, city, state, zipCode, "USA"]
      .map((part) => String(part || "").trim())
      .filter(Boolean);

    const address = addressParts.join(", ");
    const geocodeUrl = new URL("https://api.opencagedata.com/geocode/v1/json");
    geocodeUrl.searchParams.set("q", address);
    geocodeUrl.searchParams.set("key", apiKey);
    geocodeUrl.searchParams.set("countrycode", "us");
    geocodeUrl.searchParams.set("limit", "1");
    geocodeUrl.searchParams.set("no_annotations", "1");

    const response = await fetch(geocodeUrl);

    if (!response.ok) {
      throw new Error("Address verification failed.");
    }

    const payload = await response.json();
    const firstResult = payload?.results?.[0];
    const latitude = Number(firstResult?.geometry?.lat);
    const longitude = Number(firstResult?.geometry?.lng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error("We could not verify this address. Please check the venue address and zip code.");
    }

    return new Response(
      JSON.stringify({
        latitude,
        longitude,
        formatted: firstResult.formatted || address,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "We could not verify this address. Please check the venue address and zip code.",
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
