import { useEffect, useState } from "react";
import "./App.css";
import { supabase } from "./supabaseClient";

const emptyForm = {
  title: "",
  type: "Comedy",
  venue: "",
  city: "",
  date: "",
  time: "",
  price: "",
  isTicketed: false,
  ticketTypes: [],
  flyerImage: "",
  flyerName: "",
  flyerPath: "",
  flyerFile: null,
};

const emptyEditForm = {
  title: "",
  type: "Comedy",
  venue: "",
  city: "",
  date: "",
  time: "",
  price: "",
  isTicketed: false,
  ticketTypes: [],
  flyerImage: "",
  flyerName: "",
  flyerPath: "",
  flyerFile: null,
};

const emptyFanProfileForm = {
  displayName: "",
  email: "",
  homeCity: "",
  favoriteEventTypes: [],
  marketingConsent: false,
};

const fanEventTypeOptions = [
  "Comedy",
  "Live Music",
  "Bar Games",
  "Theater",
  "Festivals",
  "Sports",
  "Family Events",
  "Nightlife",
];

const rewardTiers = [
  {
    label: "$5 off ticket",
    points: 200,
  },
  {
    label: "$10 off ticket",
    points: 350,
  },
  {
    label: "Free GA ticket",
    points: 500,
  },
  {
    label: "Free VIP/premium ticket",
    points: 1000,
  },
  {
    label: "$5 Tremendous gift card",
    points: 500,
  },
  {
    label: "$10 Tremendous gift card",
    points: 1000,
  },
  {
    label: "$25 Tremendous gift card",
    points: 2500,
  },
];

const emptyTicketTypeForm = {
  name: "General Admission",
  description: "",
  price: "",
  quantityAvailable: "",
  saleStatus: "on_sale",
};

function loadSavedValue(key, fallbackValue) {
  try {
    const savedValue = localStorage.getItem(key);
    return savedValue ? JSON.parse(savedValue) : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function formatDate(dateValue) {
  if (!dateValue) return "";
  const date = new Date(`${dateValue}T00:00:00`);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(timeValue) {
  if (!timeValue) return "";
  const [hour, minute] = timeValue.split(":");
  const date = new Date();
  date.setHours(Number(hour), Number(minute));
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function cleanPriceForEdit(price) {
  if (!price || price === "Free") return "";
  return String(price).replace("$", "");
}

function getEventSharePoints() {
  return 10;
}

function makeLocalTicketType(overrides = {}) {
  return {
    localId:
      crypto.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    id: null,
    quantityReserved: 0,
    ...emptyTicketTypeForm,
    ...overrides,
  };
}

function fromDbTicketType(item) {
  return {
    id: item.id,
    localId: String(item.id),
    eventId: item.event_id,
    producerId: item.producer_id || item.created_by || null,
    name: item.name || "",
    description: item.description || "",
    price: Number(item.price || 0),
    quantityAvailable: Number(item.quantity_available || 0),
    quantityReserved: Number(item.quantity_reserved || 0),
    saleStatus: item.sale_status || "on_sale",
  };
}

function ticketFormToDb(ticketType, eventId, producerId) {
  return {
    event_id: eventId,
    producer_id: producerId,
    created_by: producerId,
    name: ticketType.name.trim(),
    description: ticketType.description.trim(),
    price: Number(ticketType.price || 0),
    quantity_available: Number(ticketType.quantityAvailable || 0),
    sale_status: ticketType.saleStatus || "on_sale",
  };
}

function getRemainingTickets(ticketType) {
  return Math.max(
    0,
    Number(ticketType.quantityAvailable || 0) -
      Number(ticketType.quantityReserved || 0)
  );
}

function isFreeTicket(ticketType) {
  return Number(ticketType.price || 0) === 0;
}

function getNumericEventPrice(event) {
  const match = String(event?.price || "").match(/(\d+(?:\.\d+)?)/);
  const price = match ? Number(match[1]) : 0;
  return Number.isFinite(price) ? price : 0;
}

function isBoxOfficePlaceholder(value) {
  return /box\s*office.*coming\s*soon/i.test(String(value || ""));
}

function getEventPriceLabel(event, eventTicketTypes = []) {
  const paidTicketPrices = eventTicketTypes
    .filter((ticketType) => !isFreeTicket(ticketType))
    .map((ticketType) => Number(ticketType.price || 0))
    .filter((price) => Number.isFinite(price) && price > 0);

  if (paidTicketPrices.length > 0) {
    const lowestPrice = Math.min(...paidTicketPrices);
    const prefix = eventTicketTypes.some(isFreeTicket) ? "Free / " : "";
    return `${prefix}$${lowestPrice.toFixed(2)}`;
  }

  if (!isBoxOfficePlaceholder(event?.price)) {
    return event?.price || "";
  }

  if (eventTicketTypes.length > 0) {
    return `${eventTicketTypes.length} ticket ${
      eventTicketTypes.length === 1 ? "type" : "types"
    }`;
  }

  return "Tickets";
}

function getSharerKey() {
  let sharerKey = localStorage.getItem("streetTeamSharerKey");

  if (!sharerKey) {
    sharerKey =
      crypto.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    localStorage.setItem("streetTeamSharerKey", sharerKey);
  }

  return sharerKey;
}

function makeShareCode(eventId) {
  return `${eventId}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function buildShareLink(eventId, shareCode) {
  const url = new URL(window.location.href);
  url.searchParams.set("event", String(eventId));
  url.searchParams.set("share", shareCode);
  return url.toString();
}

const pendingReferralShareCodeKey = "streetTeamReferralShareCode";
const pendingCheckoutShareCodeKey = "streetTeamCheckoutShareCode";
const awardedReferralUsersKey = "streetTeamAwardedReferralUsers";

function getShareCodeFromUrl() {
  return new URLSearchParams(window.location.search).get("share");
}

function rememberReferralShareCode() {
  const shareCode = getShareCodeFromUrl();

  if (shareCode) {
    localStorage.setItem(pendingReferralShareCodeKey, shareCode);
    localStorage.setItem(pendingCheckoutShareCodeKey, shareCode);
  }
}

function getPointHistoryLabel(transaction) {
  if (transaction.source === "account_creation") {
    return transaction.description || "Account created";
  }

  if (transaction.source === "referral_signup") {
    return transaction.description || "Referral joined";
  }

  if (transaction.source === "own_paid_ticket_purchase") {
    return transaction.description || "Bought paid ticket";
  }

  if (transaction.source === "share_ticket_purchase") {
    return transaction.description || "Ticket bought from your link";
  }

  if (transaction.source === "referred_user_ticket_purchase") {
    return transaction.description || "Referred user bought a ticket";
  }

  if (transaction.reward_label) {
    return transaction.reward_label;
  }

  if (transaction.transaction_type === "share_reward") {
    return "Event shared";
  }

  if (transaction.transaction_type === "reward_redemption") {
    return "Reward redeemed";
  }

  return transaction.description || "Points";
}

function getDistanceMiles(fromLocation, event) {
  const eventLatitude = Number(event.latitude);
  const eventLongitude = Number(event.longitude);

  if (
    !fromLocation ||
    !Number.isFinite(eventLatitude) ||
    !Number.isFinite(eventLongitude)
  ) {
    return null;
  }

  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const latDelta = toRadians(eventLatitude - fromLocation.latitude);
  const lonDelta = toRadians(eventLongitude - fromLocation.longitude);
  const startLat = toRadians(fromLocation.latitude);
  const endLat = toRadians(eventLatitude);

  const a =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(startLat) *
      Math.cos(endLat) *
      Math.sin(lonDelta / 2) *
      Math.sin(lonDelta / 2);

  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function copyShareLinkToClipboard(shareLink) {
  try {
    await navigator.clipboard.writeText(shareLink);
    return true;
  } catch {
    prompt("Copy your Street Team share link:", shareLink);
    return false;
  }
}

function getInitialTicketMessage() {
  if (typeof window === "undefined") return "";

  const params = new URLSearchParams(window.location.search);
  const checkoutStatus = params.get("ticket_checkout");

  if (checkoutStatus === "success") {
    return "Payment received. Confirming your ticket.";
  }

  if (checkoutStatus === "cancelled") {
    return "Checkout canceled. Releasing the unpaid ticket hold.";
  }

  return "";
}

function formatTicketStatus(status) {
  if (status === "pending_payment") return "Pending payment";
  if (status === "paid") return "Paid";
  if (status === "reserved") return "Reserved";
  if (status === "cancelled") return "Canceled";
  if (status === "refunded") return "Refunded";
  return status || "Unknown";
}

function canCheckInReservation(reservation) {
  if (reservation.checked_in) return false;

  if (reservation.reservation_type === "paid") {
    return reservation.status === "paid";
  }

  return reservation.status === "reserved";
}

function getCheckInStatusLabel(reservation) {
  if (reservation.checked_in) return "Checked In";
  if (canCheckInReservation(reservation)) return "Not checked in";
  return "Not eligible";
}

function makeSafeFileName(fileName) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-+/g, "-");
}

async function uploadFlyerToStorage(file, ownerId) {
  if (!file) {
    return {
      publicUrl: "",
      filePath: "",
      fileName: "",
    };
  }

  const safeName = makeSafeFileName(file.name);
  const filePath = `${ownerId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("event-fliers")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage
    .from("event-fliers")
    .getPublicUrl(filePath);

  return {
    publicUrl: data.publicUrl,
    filePath,
    fileName: file.name,
  };
}

async function deleteFlyerFromStorage(filePath) {
  if (!filePath) return;

  const { error } = await supabase.storage
    .from("event-fliers")
    .remove([filePath]);

  if (error) {
    console.warn("Could not delete old flyer:", error);
  }
}

function fromDbEvent(item) {
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    venue: item.venue,
    city: item.city,
    date: item.event_date,
    time: item.event_time,
    price: item.price,
    points: getEventSharePoints(item),
    flyerImage: item.flyer_image || "",
    flyerName: item.flyer_name || "",
    flyerPath: item.flyer_path || "",
    ownerId: item.owner_id || null,
    isTicketed: Boolean(item.is_ticketed),
    latitude: item.latitude === null ? null : Number(item.latitude),
    longitude: item.longitude === null ? null : Number(item.longitude),
  };
}

function EventFlyer({ event, detail = false }) {
  const className = detail ? "detailFlyer" : "flyerMock";

  return (
    <div className={event.flyerImage ? `${className} hasImage` : className}>
      {event.flyerImage ? (
        <img src={event.flyerImage} alt={`${event.title} flier`} />
      ) : (
        <span>{event.type}</span>
      )}
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [selectedEvent, setSelectedEvent] = useState(null);

  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [selectedAccountType, setSelectedAccountType] = useState("fan");
  const [userRoles, setUserRoles] = useState([]);
  const [fanProfileForm, setFanProfileForm] = useState(() =>
    loadSavedValue("streetTeamFanProfile", emptyFanProfileForm)
  );
  const [fanProfile, setFanProfile] = useState(() =>
    loadSavedValue("streetTeamFanProfile", null)
  );
  const [fanProfileMessage, setFanProfileMessage] = useState("");
  const [isFanProfileLoading, setIsFanProfileLoading] = useState(false);

  const hasFanProfile = Boolean(
    fanProfile?.displayName
  );

  const hasFanRole = userRoles.includes("fan");
  const hasProducerRole = userRoles.includes("producer");

  const [fanStats, setFanStats] = useState({
    points: 0,
    shares: 0,
    visits: 0,
    eventsShared: 0,
  });
  const [pointHistory, setPointHistory] = useState([]);

  const [isRedeemingReward, setIsRedeemingReward] = useState(false);
  const [redemptionMessage, setRedemptionMessage] = useState("");
  const [redemptions, setRedemptions] = useState([]);

  const availableFanPoints = fanStats.points;

  const nextReward =
    rewardTiers.find((reward) => availableFanPoints < reward.points) ||
    rewardTiers[rewardTiers.length - 1];

  const pointsToNextReward = Math.max(
    0,
    nextReward.points - availableFanPoints
  );

  const rewardProgressPercent =
    nextReward.points > 0
      ? Math.min(
          100,
          Math.round((availableFanPoints / nextReward.points) * 100)
        )
      : 0;

  const [events, setEvents] = useState([]);
  const [ticketTypes, setTicketTypes] = useState([]);
  const [ticketReservations, setTicketReservations] = useState([]);
  const [producerTicketReservations, setProducerTicketReservations] = useState([]);
  const [attendeeProfiles, setAttendeeProfiles] = useState({});
  const [ticketMessage, setTicketMessage] = useState(getInitialTicketMessage);
  const [attendeeMessage, setAttendeeMessage] = useState("");
  const [isReservingTicket, setIsReservingTicket] = useState(false);
  const [checkoutTicketId, setCheckoutTicketId] = useState(null);
  const [checkingInReservationId, setCheckingInReservationId] = useState(null);
  const [ticketQuantities, setTicketQuantities] = useState({});
  const [userLocation, setUserLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState(
    typeof navigator !== "undefined" && navigator.geolocation
      ? "checking"
      : "unavailable"
  );
  const [radiusMiles, setRadiusMiles] = useState(25);
  const [shareMessage, setShareMessage] = useState("");
  const [shareStats, setShareStats] = useState({});
  const [, setIsLoadingShareStats] = useState(false);
  const [totalShares, setTotalShares] = useState(() =>
    loadSavedValue("streetTeamShares", 0)
  );

  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [eventError, setEventError] = useState("");

  const [form, setForm] = useState(emptyForm);
  const [editingEventId, setEditingEventId] = useState(null);
  const [editForm, setEditForm] = useState(emptyEditForm);

  function resetFanAccountState() {
    setFanProfile(null);
    setUserRoles([]);
    setFanStats({
      points: 0,
      shares: 0,
      visits: 0,
      eventsShared: 0,
    });
    setPointHistory([]);
    setRedemptions([]);
    setTicketReservations([]);
    setProducerTicketReservations([]);
    setAttendeeProfiles({});
  }

  useEffect(() => {
    rememberReferralShareCode();
  }, []);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setUser(data.session?.user ?? null);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const nextUser = session?.user ?? null;
        setUser(nextUser);

        if (!nextUser) {
          resetFanAccountState();
        }
      }
    );

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("streetTeamShares", JSON.stringify(totalShares));
  }, [totalShares]);

  useEffect(() => {
    loadEventsFromSupabase();
  }, []);

  useEffect(() => {
    if (events.length > 0) {
      loadTicketTypesFromSupabase(events.map((event) => event.id));
    }
  }, [events]);

  useEffect(() => {
    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationStatus("available");
      },
      () => {
        setLocationStatus("denied");
      },
      {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 1000 * 60 * 15,
      }
    );
  }, []);

  useEffect(() => {
  if (!user) return;

    loadShareStatsFromSupabase();
    loadRewardRedemptionsFromSupabase();
    loadTicketReservationsFromSupabase();
    loadProducerTicketReservationsFromSupabase();
}, [user, events.length]);

  useEffect(() => {
  if (!user) return;

  loadUserRoles(user);
  loadFanProfile(user);
  loadFanStatsFromSupabase();
  awardAccountCreationPoints(user);
  awardReferralSignupPoints(user);
}, [user]);

  useEffect(() => {
    if (!isLoadingEvents && events.length > 0) {
      logVisitFromShareLink();
    }
  }, [isLoadingEvents, events.length]);

  useEffect(() => {
    if (!user) return;

    const params = new URLSearchParams(window.location.search);
    const checkoutStatus = params.get("ticket_checkout");
    const reservationId = params.get("reservation_id");

    if (checkoutStatus !== "cancelled" || !reservationId) return;

    cancelOwnPendingTicketReservation(reservationId);
  }, [user]);

  async function loadEventsFromSupabase() {
    setIsLoadingEvents(true);
    setEventError("");

    const { data, error } = await supabase
      .from("events")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setEventError("Could not load events from Supabase.");
      setIsLoadingEvents(false);
      return;
    }

    setEvents(data.map(fromDbEvent));
    setIsLoadingEvents(false);
  }

  async function loadTicketTypesFromSupabase(eventIds) {
    if (!eventIds?.length) {
      setTicketTypes([]);
      return;
    }

    const { data, error } = await supabase
      .from("ticket_types")
      .select("*")
      .in("event_id", eventIds)
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("Could not load ticket types:", error);
      setTicketTypes([]);
      return;
    }

    const nextTicketTypes = (data || []).map(fromDbTicketType);
    const loadedEventIds = new Set(eventIds.map((eventId) => String(eventId)));

    setTicketTypes((currentTicketTypes) => [
      ...currentTicketTypes.filter(
        (ticketType) => !loadedEventIds.has(String(ticketType.eventId))
      ),
      ...nextTicketTypes,
    ]);
  }

  async function loadTicketReservationsFromSupabase() {
    if (!user) {
      setTicketReservations([]);
      return;
    }

    const { data, error } = await supabase
      .from("ticket_reservations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Could not load ticket reservations:", error);
      setTicketReservations([]);
      return;
    }

    setTicketReservations(data || []);
  }

  async function loadProducerTicketReservationsFromSupabase() {
    if (!user) {
      setProducerTicketReservations([]);
      return;
    }

    const ownedEventIds = events
      .filter((event) => event.ownerId === user.id)
      .map((event) => event.id);

    if (ownedEventIds.length === 0) {
      setProducerTicketReservations([]);
      return;
    }

    const { data, error } = await supabase
      .from("ticket_reservations")
      .select("*")
      .in("event_id", ownedEventIds)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Could not load producer ticket reservations:", error);
      setProducerTicketReservations([]);
      return;
    }

    setProducerTicketReservations(data || []);
    loadAttendeeProfilesFromSupabase(data || []);
  }

  async function loadAttendeeProfilesFromSupabase(reservations) {
    const attendeeUserIds = [
      ...new Set((reservations || []).map((reservation) => reservation.user_id).filter(Boolean)),
    ];

    if (attendeeUserIds.length === 0) {
      setAttendeeProfiles({});
      return;
    }

    const { data, error } = await supabase
      .from("fan_profiles")
      .select("id, display_name, email")
      .in("id", attendeeUserIds);

    if (error) {
      console.warn("Could not load attendee profiles:", error);
      setAttendeeProfiles({});
      return;
    }

    setAttendeeProfiles(
      (data || []).reduce((profilesById, profile) => {
        profilesById[profile.id] = profile;
        return profilesById;
      }, {})
    );
  }

  async function saveTicketTypesForEvent(eventId, nextTicketTypes, producerId) {
    const validTicketTypes = nextTicketTypes.filter(
      (ticketType) =>
        ticketType.name.trim() && Number(ticketType.quantityAvailable || 0) > 0
    );

    const existingTicketTypes = validTicketTypes.filter((ticketType) => ticketType.id);
    const newTicketTypes = validTicketTypes.filter((ticketType) => !ticketType.id);

    for (const ticketType of existingTicketTypes) {
      const { error } = await supabase
        .from("ticket_types")
        .update(ticketFormToDb(ticketType, eventId, producerId))
        .eq("id", ticketType.id)
        .eq("event_id", eventId);

      if (error) throw error;
    }

    if (newTicketTypes.length > 0) {
      const { error } = await supabase.from("ticket_types").insert(
        newTicketTypes.map((ticketType) =>
          ticketFormToDb(ticketType, eventId, producerId)
        )
      );

      if (error) throw error;
    }
  }

  async function loadShareStatsFromSupabase() {
    if (!user) return;

    setIsLoadingShareStats(true);

    const { data, error } = await supabase
      .from("event_share_actions")
      .select(
        "event_id, share_code, action, fan_user_id, fan_display_name, points_awarded"
      );

    if (error) {
      console.error(error);
      setIsLoadingShareStats(false);
      return;
    }

    const nextStats = {};
    const shareOwnersByCode = {};

    data.forEach((row) => {
      if (!nextStats[row.event_id]) {
        nextStats[row.event_id] = {
          shares: 0,
          visits: 0,
          promoters: {},
        };
      }

      if (row.action === "share") {
        const promoterKey = row.fan_user_id || row.fan_display_name || "unknown";
        const promoterName = row.fan_display_name || "Fan";

        nextStats[row.event_id].shares += 1;

        if (!nextStats[row.event_id].promoters[promoterKey]) {
          nextStats[row.event_id].promoters[promoterKey] = {
            name: promoterName,
            shares: 0,
            visits: 0,
            points: 0,
          };
        }

        nextStats[row.event_id].promoters[promoterKey].shares += 1;
        nextStats[row.event_id].promoters[promoterKey].points +=
          row.points_awarded || 0;

        shareOwnersByCode[`${row.event_id}-${row.share_code}`] = promoterKey;
      }
    });

    data.forEach((row) => {
      if (!nextStats[row.event_id]) return;

      if (row.action === "visit") {
        nextStats[row.event_id].visits += 1;

        const promoterKey = shareOwnersByCode[`${row.event_id}-${row.share_code}`];

        if (promoterKey && nextStats[row.event_id].promoters[promoterKey]) {
          nextStats[row.event_id].promoters[promoterKey].visits += 1;
        }
      }
    });

    Object.keys(nextStats).forEach((eventId) => {
      nextStats[eventId].promoters = Object.values(
        nextStats[eventId].promoters
      ).sort((a, b) => b.visits - a.visits || b.shares - a.shares);
    });

    setShareStats(nextStats);
    setIsLoadingShareStats(false);
}

async function loadFanStatsFromSupabase() {
  if (!user) return;

  try {
    let { data, error } = await supabase
      .from("point_transactions")
      .select(
        "id, points, transaction_type, event_id, reward_label, source, description, created_at"
      )
      .eq("user_id", user.id);

    if (error?.code === "42703") {
      const fallback = await supabase
        .from("point_transactions")
        .select("id, points, transaction_type, event_id, reward_label, created_at")
        .eq("user_id", user.id);

      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error("Error loading fan stats:", error);
      return;
    }

    const shareTransactions = (data || []).filter(
      (transaction) =>
        transaction.transaction_type === "share_reward" &&
        Number(transaction.points) > 0
    );

    setFanStats({
      points: Math.max(
        0,
        (data || []).reduce(
          (total, transaction) => total + (Number(transaction.points) || 0),
          0
        )
      ),
      shares: shareTransactions.length,
      visits: 0,
      eventsShared: new Set(
        shareTransactions
          .map((transaction) => transaction.event_id)
          .filter(Boolean)
      ).size,
    });
    setPointHistory(
      (data || [])
        .slice()
        .sort(
          (a, b) =>
            new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime()
        )
        .slice(0, 10)
    );
  } catch (err) {
    console.error("Unexpected error loading fan stats:", err);
  }
}

async function awardAccountCreationPoints(currentUser = user) {
  if (!currentUser) return;

  const awardedAccountUsers = loadSavedValue("streetTeamAwardedAccountUsers", {});
  if (awardedAccountUsers[currentUser.id]) return;

  const { data, error } = await supabase.rpc("award_account_creation_points");

  if (error) {
    console.warn("Account creation points were not awarded:", error);
    return;
  }

  localStorage.setItem(
    "streetTeamAwardedAccountUsers",
    JSON.stringify({
      ...awardedAccountUsers,
      [currentUser.id]: true,
    })
  );

  if (data) {
    await loadFanStatsFromSupabase();
  }
}

async function awardReferralSignupPoints(currentUser = user) {
  if (!currentUser) return;

  const shareCode = localStorage.getItem(pendingReferralShareCodeKey);
  if (!shareCode) return;

  const awardedUsers = loadSavedValue(awardedReferralUsersKey, {});
  if (awardedUsers[currentUser.id] === shareCode) return;

  const { data, error } = await supabase.rpc("award_referral_signup_points", {
    p_share_code: shareCode,
  });

  if (error) {
    console.warn("Referral signup points were not awarded:", error);
    return;
  }

  localStorage.setItem(
    awardedReferralUsersKey,
    JSON.stringify({
      ...awardedUsers,
      [currentUser.id]: shareCode,
    })
  );

  localStorage.removeItem(pendingReferralShareCodeKey);

  if (data) {
    await loadFanStatsFromSupabase();
  }
}

async function recordPointTransaction({
  points,
  type,
  eventId = null,
  rewardLabel = "",
  referenceId = null,
  metadata = {},
}) {
  if (!user || !points || !type) return { error: null };

  const { error } = await supabase.from("point_transactions").insert({
    user_id: user.id,
    points,
    transaction_type: type,
    event_id: eventId,
    reward_label: rewardLabel,
    reference_id: referenceId,
    metadata,
  });

  if (error) {
    console.warn("Point transaction was not recorded:", error);
  }

  return { error };
}

async function updateFanPointBalance(pointDelta, statDeltas = {}) {
  if (!user) {
    return { error: new Error("No logged-in user.") };
  }

  const currentStats = {
    points: fanStats.points || 0,
    shares: fanStats.shares || 0,
    visits: fanStats.visits || 0,
    eventsShared: fanStats.eventsShared || 0,
  };

  const nextStats = {
    points: Math.max(0, currentStats.points + pointDelta),
    shares: Math.max(0, currentStats.shares + (statDeltas.shares || 0)),
    visits: Math.max(0, currentStats.visits + (statDeltas.visits || 0)),
    eventsShared: Math.max(
      0,
      currentStats.eventsShared + (statDeltas.eventsShared || 0)
    ),
  };

  setFanStats(nextStats);
  return { data: nextStats };
}

async function loadRewardRedemptionsFromSupabase() {
  if (!user) {
    setRedemptions([]);
    return;
  }

  const { data, error } = await supabase
    .from("reward_redemptions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  setRedemptions(data || []);
}

async function requestRewardRedemption(reward) {
  if (!user) {
    setSelectedAccountType("fan");
    setAuthMode("signup");
    setActiveTab("account");
    return;
  }

  if (!hasFanRole || !hasFanProfile) {
    setRedemptionMessage("Save your fan profile before redeeming rewards.");
    setActiveTab("streetteam");
    return;
  }

  if (availableFanPoints < reward.points) {
    setRedemptionMessage(
      `You need ${reward.points - availableFanPoints} more available points for ${reward.label}.`
    );
    return;
  }

  const fanDisplayName =
    fanProfile?.displayName || fanProfileForm.displayName?.trim();

  const fanEmail = user.email || fanProfile?.email || fanProfileForm.email;

  if (!fanDisplayName || !fanEmail) {
    setRedemptionMessage("Your fan profile needs a name and account email.");
    setActiveTab("streetteam");
    return;
  }

  setIsRedeemingReward(true);
  setRedemptionMessage("");

  const { data: redemption, error } = await supabase
    .from("reward_redemptions")
    .insert({
      user_id: user.id,
      fan_display_name: fanDisplayName,
      fan_email: fanEmail,
      reward_label: reward.label,
      points_cost: reward.points,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    console.error(error);
    setIsRedeemingReward(false);

    if (error.code === "23505") {
      setRedemptionMessage(
        `You already have a pending request for ${reward.label}.`
      );
      return;
    }

    setRedemptionMessage("Could not submit reward request.");
    return;
  }

  const { error: pointsError } = await updateFanPointBalance(-reward.points);

  if (pointsError) {
    console.error(pointsError);

    await supabase
      .from("reward_redemptions")
      .update({ status: "failed" })
      .eq("id", redemption.id);

    setRedemptionMessage(
      "Reward request was not submitted because points could not be deducted."
    );
    setIsRedeemingReward(false);
    await loadRewardRedemptionsFromSupabase();
    return;
  }

  const { error: transactionError } = await recordPointTransaction({
    points: -reward.points,
    type: "reward_redemption",
    rewardLabel: reward.label,
    referenceId: redemption.id,
    metadata: {
      status: "pending",
    },
  });

  if (transactionError) {
    const rollback = await updateFanPointBalance(reward.points);

    await supabase
      .from("reward_redemptions")
      .update({ status: "failed" })
      .eq("id", redemption.id);

    if (rollback.error) {
      console.error("Could not roll back reward point deduction:", rollback.error);
    }

    setRedemptionMessage(
      "Reward request was not submitted because the point transaction could not be recorded."
    );
    setIsRedeemingReward(false);
    await loadRewardRedemptionsFromSupabase();
    return;
  }

  await loadRewardRedemptionsFromSupabase();
  await loadFanStatsFromSupabase();
  setIsRedeemingReward(false);

  setRedemptionMessage(
    `${reward.label} request submitted. ${reward.points} points were deducted.`
  );
}

async function logVisitFromShareLink() {
  const params = new URLSearchParams(window.location.search);
  const shareCode = params.get("share");
  const eventId = Number(params.get("event"));

  if (!shareCode || !eventId) return;

  const eventFromLink = events.find((event) => event.id === eventId);

  if (eventFromLink) {
    setSelectedEvent(eventFromLink);
    setActiveTab("event");
  }

  const visitKey = `streetTeamVisited-${shareCode}`;

  if (sessionStorage.getItem(visitKey)) return;

  sessionStorage.setItem(visitKey, "true");

  const { error } = await supabase.from("event_share_actions").insert({
    event_id: eventId,
    share_code: shareCode,
    sharer_key: getSharerKey(),
    action: "visit",
  });

  if (error) {
    console.error(error);
  }
}

async function reserveTicket(ticketType) {
  if (!selectedEvent) return;

  if (!user) {
    setTicketMessage("Log in before getting tickets.");
    setSelectedAccountType("fan");
    setAuthMode("login");
    setActiveTab("account");
    return;
  }

  if (!isFreeTicket(ticketType)) {
    setTicketMessage("Checkout for paid tickets is coming next.");
    return;
  }

  if (hasReservationForSelectedEvent) {
    setTicketMessage("You already have a reservation for this event.");
    return;
  }

  if (getRemainingTickets(ticketType) < 1) {
    setTicketMessage("This ticket type is sold out.");
    return;
  }

  setIsReservingTicket(true);
  setTicketMessage("");

  const { data, error } = await supabase.rpc("reserve_free_ticket", {
    p_ticket_type_id: ticketType.id,
    p_event_id: selectedEvent.id,
    p_quantity: 1,
  });

  setIsReservingTicket(false);

  if (error) {
    console.error(error);
    setTicketMessage(`Could not reserve ticket. ${error.message}`);
    return;
  }

  setTicketMessage("Ticket reserved. You can find it in My Team.");
  await loadTicketTypesFromSupabase(events.map((event) => event.id));
  await loadTicketReservationsFromSupabase();
  await loadProducerTicketReservationsFromSupabase();

  if (data?.confirmation_code) {
    setTicketMessage(
      `Ticket reserved. Confirmation code: ${data.confirmation_code}`
    );
  }
}

async function startPaidTicketCheckout(ticketType) {
  if (!selectedEvent) return;

  if (ticketType.isEventPriceFallback) {
    setTicketMessage("Create a paid ticket type before starting checkout.");
    return;
  }

  if (!user) {
    setTicketMessage("Log in before buying tickets.");
    setSelectedAccountType("fan");
    setAuthMode("login");
    setActiveTab("account");
    return;
  }

  const quantity = Number(ticketQuantities[ticketType.id] || 1);

  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 8) {
    setTicketMessage("Choose 1 to 8 tickets.");
    return;
  }

  if (getRemainingTickets(ticketType) < quantity) {
    setTicketMessage("Not enough tickets remain.");
    return;
  }

  setCheckoutTicketId(ticketType.id);
  setTicketMessage("Starting checkout. Your tickets are held while you pay.");

  const { data, error } = await supabase.functions.invoke(
    "create-checkout-session",
    {
      body: {
        event_id: selectedEvent.id,
        ticket_type_id: ticketType.id,
        quantity,
        share_code: localStorage.getItem(pendingCheckoutShareCodeKey) || null,
      },
    }
  );

  setCheckoutTicketId(null);

  if (error || !data?.url) {
    console.error(error);
    let checkoutErrorMessage = data?.error || error?.message || "";

    if (error?.context) {
      try {
        const errorBody = await error.context.json();
        checkoutErrorMessage = errorBody?.error || checkoutErrorMessage;
      } catch {
        try {
          checkoutErrorMessage = await error.context.text();
        } catch {
          // Keep the original Supabase client error message.
        }
      }
    }

    setTicketMessage(`Could not start checkout. ${checkoutErrorMessage}`);
    return;
  }

  window.location.href = data.url;
}

async function cancelOwnPendingTicketReservation(reservationId) {
  const { error } = await supabase.rpc("cancel_own_pending_ticket_reservation", {
    p_reservation_id: reservationId,
  });

  if (error) {
    console.warn("Could not release canceled ticket hold:", error);
    setTicketMessage(
      "Checkout canceled. The unpaid ticket hold may expire shortly."
    );
    return;
  }

  setTicketMessage("Checkout canceled. The unpaid ticket hold was released.");
  await loadTicketTypesFromSupabase(events.map((event) => event.id));
  await loadTicketReservationsFromSupabase();
}

async function checkInTicketReservation(reservation) {
  if (!reservation || !canCheckInReservation(reservation)) return;

  setCheckingInReservationId(reservation.id);
  setAttendeeMessage("");

  const { error } = await supabase.rpc("check_in_ticket_reservation", {
    p_reservation_id: reservation.id,
  });

  setCheckingInReservationId(null);

  if (error) {
    console.error(error);
    setAttendeeMessage(`Could not check in ticket. ${error.message}`);
    return;
  }

  setAttendeeMessage("Ticket checked in.");
  await loadProducerTicketReservationsFromSupabase();
  await loadTicketReservationsFromSupabase();
}

  function goToTab(tabName) {
    setSelectedEvent(null);
    setActiveTab(tabName);
  }

  function openEvent(event) {
    setSelectedEvent(event);
    setActiveTab("event");
    loadTicketTypesFromSupabase([event.id]);
  }

  async function shareEvent(event) {
    if (!user) {
      const message = "Create or log into your fan account before sharing for points.";
      setShareMessage(message);
      alert(message);
      setSelectedAccountType("fan");
      setAuthMode("signup");
      setActiveTab("account");
      return;
    }

    if (!hasFanRole) {
      const message =
        "This account is not marked as a fan account. Log in with a fan account to earn points.";
      setShareMessage(message);
      alert(message);
      setActiveTab("account");
      return;
    }

    const fanDisplayName =
      fanProfile?.displayName || fanProfileForm.displayName?.trim();

    if (!fanDisplayName) {
      const message = "Save your fan profile before sharing for points.";
      setShareMessage(message);
      alert(message);
      setActiveTab("streetteam");
      return;
    }

    setShareMessage("");
    const sharePoints = getEventSharePoints(event);

    const {
      data: existingPointReward,
      error: existingPointRewardError,
    } = await supabase
      .from("point_transactions")
      .select("reference_id, points")
      .eq("user_id", user.id)
      .eq("event_id", event.id)
      .eq("transaction_type", "share_reward")
      .gt("points", 0)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingPointRewardError) {
      console.error(existingPointRewardError);
      const message =
        "Could not check your existing share reward. Try again.";
      setShareMessage(message);
      alert(message);
      return;
    }

    if (existingPointReward) {
      const existingShareCode = existingPointReward.reference_id;

      if (existingShareCode) {
        const existingShareLink = buildShareLink(event.id, existingShareCode);
        await copyShareLinkToClipboard(existingShareLink);
      }

      const message = existingShareCode
        ? `Share link copied for "${event.title}". You already earned points for this event.`
        : `You already earned points for sharing "${event.title}".`;
      setShareMessage(message);
      alert(message);
      return;
    }

    const { data: existingShare, error: existingShareError } = await supabase
      .from("event_share_actions")
      .select("share_code, points_awarded")
      .eq("event_id", event.id)
      .eq("fan_user_id", user.id)
      .eq("action", "share")
      .gt("points_awarded", 0)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingShareError) {
      console.error(existingShareError);
      const message = "Could not check your existing share link. Try again.";
      setShareMessage(message);
      alert(message);
      return;
    }

    const hadExistingShareLink = Boolean(existingShare?.share_code);
    const shareCode = existingShare?.share_code || makeShareCode(event.id);
    const shareLink = buildShareLink(event.id, shareCode);

    if (!hadExistingShareLink) {
      const { error } = await supabase
        .from("event_share_actions")
        .insert({
          event_id: event.id,
          share_code: shareCode,
          sharer_key: getSharerKey(),
          action: "share",
          fan_user_id: user.id,
          fan_display_name: fanDisplayName,
          points_awarded: sharePoints,
        });

      if (error) {
        console.error(error);
        let message = `Could not create share link: ${error.message}`;

        if (error.code === "23505") {
          message =
            "A share link already exists for this event. Try sharing again to copy it.";
        }

        setShareMessage(message);
        alert(message);
        return;
      }
    }

    const { data: updatedStats, error: pointsError } = await updateFanPointBalance(sharePoints, {
      shares: 1,
      eventsShared: 1,
    });

    if (pointsError) {
      console.error(pointsError);
      if (!hadExistingShareLink) {
        await supabase
          .from("event_share_actions")
          .delete()
          .eq("event_id", event.id)
          .eq("share_code", shareCode)
          .eq("fan_user_id", user.id)
          .eq("action", "share");
      }

      const message = `Share points could not be added, so no share reward was created. ${pointsError.message}`;
      setShareMessage(message);
      alert(message);
      return;
    } else {
      const { error: transactionError } = await recordPointTransaction({
        points: sharePoints,
        type: "share_reward",
        eventId: event.id,
        referenceId: shareCode,
        metadata: {
          eventTitle: event.title,
          shareCode,
        },
      });

      if (transactionError) {
        const rollback = await updateFanPointBalance(-sharePoints, {
          shares: -1,
          eventsShared: -1,
        });

        if (!hadExistingShareLink) {
          await supabase
            .from("event_share_actions")
            .delete()
            .eq("event_id", event.id)
            .eq("share_code", shareCode)
            .eq("fan_user_id", user.id)
            .eq("action", "share");
        }

        if (rollback.error) {
          console.error("Could not roll back share point award:", rollback.error);
        }

        if (transactionError.code === "23505") {
          const { data: duplicatePointReward } = await supabase
            .from("point_transactions")
            .select("reference_id")
            .eq("user_id", user.id)
            .eq("event_id", event.id)
            .eq("transaction_type", "share_reward")
            .gt("points", 0)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (duplicatePointReward?.reference_id) {
            const existingShareLink = buildShareLink(
              event.id,
              duplicatePointReward.reference_id
            );
            await copyShareLinkToClipboard(existingShareLink);
          }

          const message = `Share link copied for "${event.title}". You already earned points for this event.`;
          setShareMessage(message);
          alert(message);
          return;
        }

        const message = `Share points were not awarded because the point transaction could not be recorded. ${transactionError.message}`;
        setShareMessage(message);
        alert(message);
        return;
      }
    }

    setTotalShares((currentShares) => currentShares + 1);

    await copyShareLinkToClipboard(shareLink);
    const message = pointsError
      ? `Share link copied for "${event.title}".`
      : `Share link copied. ${fanDisplayName} earned ${sharePoints} points for sharing "${event.title}". New balance: ${updatedStats.points} points.`;
    setShareMessage(message);
    alert(message);
    loadShareStatsFromSupabase();
  }

  async function getUserRole(userId) {
    if (!userId) return null;

    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (error) {
      console.error("Could not fetch user role:", error);
      return null;
    }

    const roles = data.map((row) => row.role);
    setUserRoles(roles);

    if (roles.includes(selectedAccountType)) {
      return selectedAccountType;
    }

    return roles[0] ?? null;
  }

  async function saveUserRoleForUser(userId, role) {
  if (!userId || !role) return;

  const { error } = await supabase.from("user_roles").upsert(
    {
      user_id: userId,
      role,
    },
    {
      onConflict: "user_id,role",
    }
  );

  if (error) {
    console.error("Could not save user role:", error);
    return;
  }

  setUserRoles((currentRoles) =>
    currentRoles.includes(role) ? currentRoles : [...currentRoles, role]
  );
}

async function loadUserRoles(currentUser) {
  if (!currentUser) {
    setUserRoles([]);
    return;
  }

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", currentUser.id);

  if (error) {
    console.error("Could not load user roles:", error);
    setUserRoles([]);
    return;
  }

  setUserRoles(data.map((row) => row.role));
}

  async function handleAuthSubmit(event) {
    event.preventDefault();

    const email = authEmail.trim();

    if (!email || !authPassword) {
      setAuthMessage("Enter your email and password.");
      return;
    }

    if (authPassword.length < 6) {
      setAuthMessage("Password must be at least 6 characters.");
      return;
    }

    setIsAuthLoading(true);
    setAuthMessage("");

    if (authMode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: authPassword,
      });

      setIsAuthLoading(false);

      if (error) {
        setAuthMessage(error.message);
        return;
      }

      if (data.session?.user) {
        const createdUser = data.session.user;
        await saveUserRoleForUser(createdUser.id, selectedAccountType);
        setUser(createdUser);

        setAuthMessage(
          selectedAccountType === "fan"
            ? "Fan account created. You are logged in."
            : "Producer account created. You are logged in."
        );

        setActiveTab(selectedAccountType === "fan" ? "streetteam" : "producer");

        if (selectedAccountType === "fan") {
          await loadFanProfile(createdUser);
        }
      } else {
        setAuthMessage("Account created. Check your email if confirmation is required.");
      }

      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: authPassword,
    });

    setIsAuthLoading(false);

    if (error) {
      setAuthMessage(error.message);
      return;
    }

    if (data?.user) {
      const loggedInUser = data.user;
      setUser(loggedInUser);

      const role = (await getUserRole(loggedInUser.id)) || selectedAccountType;
      setSelectedAccountType(role);
      setActiveTab(role === "fan" ? "streetteam" : "producer");

      if (role === "fan") {
        await loadFanProfile(loggedInUser);
      }
    }

    setAuthMessage("Logged in.");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setAuthPassword("");
    setAuthMessage("Logged out.");
    setEditingEventId(null);
    setActiveTab("fan");
  }

  function updateFanProfileForm(field, value) {
  setFanProfileForm((currentForm) => ({
    ...currentForm,
    [field]: value,
  }));
}

function toggleFavoriteEventType(eventType) {
  setFanProfileForm((currentForm) => {
    const alreadySelected = currentForm.favoriteEventTypes.includes(eventType);

    return {
      ...currentForm,
      favoriteEventTypes: alreadySelected
        ? currentForm.favoriteEventTypes.filter((type) => type !== eventType)
        : [...currentForm.favoriteEventTypes, eventType],
    };
  });
}

async function loadFanProfile(currentUser = user) {
  const profileUser = currentUser || user;
  if (!profileUser) return;

  setIsFanProfileLoading(true);

  const { data, error } = await supabase
    .from("fan_profiles")
    .select("*")
    .eq("id", profileUser.id)
    .maybeSingle();

  setIsFanProfileLoading(false);

  if (error) {
    console.error("Could not load fan profile:", error);
    return;
  }

  if (!data) {
    setFanProfile(null);
    setFanProfileForm((currentForm) => ({
      ...emptyFanProfileForm,
      email: profileUser.email || currentForm.email || "",
    }));
    return;
  }

  const loadedProfile = {
    displayName: data.display_name || "",
    email: data.email || profileUser.email || "",
    homeCity: data.home_city || "",
    favoriteEventTypes: Array.isArray(data.favorite_event_types)
      ? data.favorite_event_types
      : [],
    marketingConsent: Boolean(data.marketing_consent),
  };

  setFanProfile(loadedProfile);
  setFanProfileForm(loadedProfile);
}

async function saveFanProfileForm(event) {
  event.preventDefault();

  if (!user) {
    setFanProfileMessage("Log in or create an account before saving your fan profile.");
    setActiveTab("account");
    return;
  }

  const displayName = fanProfileForm.displayName.trim();
  const email = fanProfileForm.email.trim();

  if (!displayName || !email) {
    setFanProfileMessage("Enter your name/nickname and email.");
    return;
  }

  setIsFanProfileLoading(true);
  setFanProfileMessage("");

  const profileToSave = {
    id: user.id,
    display_name: displayName,
    email,
    home_city: fanProfileForm.homeCity.trim(),
    favorite_event_types: fanProfileForm.favoriteEventTypes,
    marketing_consent: fanProfileForm.marketingConsent,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("fan_profiles")
    .upsert(profileToSave, { onConflict: "id" })
    .select()
    .single();

  setIsFanProfileLoading(false);

  if (error) {
    console.error(error);
    setFanProfileMessage("Could not save fan profile to Supabase.");
    return;
  }

  const updatedFanProfileForm = {
    displayName,
    email,
    homeCity: fanProfileForm.homeCity,
    favoriteEventTypes: fanProfileForm.favoriteEventTypes,
    marketingConsent: fanProfileForm.marketingConsent,
  };

  setFanProfile(updatedFanProfileForm);

  localStorage.setItem(
    "streetTeamFanProfile",
    JSON.stringify(updatedFanProfileForm)
  );

  setFanProfileForm(updatedFanProfileForm);
  setFanProfileMessage("Fan profile saved on this device.");
}

  function updateForm(field, value) {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }

  function updateEditForm(field, value) {
    setEditForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }

  function addTicketType(mode = "create") {
    const update = mode === "edit" ? setEditForm : setForm;

    update((currentForm) => ({
      ...currentForm,
      isTicketed: true,
      ticketTypes: [
        ...currentForm.ticketTypes,
        makeLocalTicketType({
          name:
            currentForm.ticketTypes.length === 0
              ? "General Admission"
              : "VIP",
        }),
      ],
    }));
  }

  function updateTicketType(mode, localId, field, value) {
    const update = mode === "edit" ? setEditForm : setForm;

    update((currentForm) => ({
      ...currentForm,
      ticketTypes: currentForm.ticketTypes.map((ticketType) =>
        ticketType.localId === localId
          ? {
              ...ticketType,
              [field]: value,
            }
          : ticketType
      ),
    }));
  }

  async function removeTicketType(mode, ticketTypeToRemove) {
    const update = mode === "edit" ? setEditForm : setForm;

    if (
      mode === "edit" &&
      ticketTypeToRemove.id &&
      Number(ticketTypeToRemove.quantityReserved || 0) > 0
    ) {
      alert("Ticket types with reservations cannot be removed yet.");
      return;
    }

    if (mode === "edit" && ticketTypeToRemove.id) {
      const { error } = await supabase
        .from("ticket_types")
        .delete()
        .eq("id", ticketTypeToRemove.id)
        .eq("quantity_reserved", 0);

      if (error) {
        console.error(error);
        alert("Could not remove ticket type.");
        return;
      }

      setTicketTypes((currentTicketTypes) =>
        currentTicketTypes.filter(
          (ticketType) => ticketType.id !== ticketTypeToRemove.id
        )
      );
    }

    update((currentForm) => ({
      ...currentForm,
      ticketTypes: currentForm.ticketTypes.filter(
        (ticketType) => ticketType.localId !== ticketTypeToRemove.localId
      ),
    }));
  }

  function handleFlyerUpload(file, mode = "create") {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Please use a flier image under 5MB.");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (mode === "edit") {
        setEditForm((currentForm) => ({
          ...currentForm,
          flyerImage: reader.result,
          flyerName: file.name,
          flyerFile: file,
        }));
      } else {
        setForm((currentForm) => ({
          ...currentForm,
          flyerImage: reader.result,
          flyerName: file.name,
          flyerFile: file,
        }));
      }
    };

    reader.readAsDataURL(file);
  }

  function removeFlyer(mode = "create") {
    if (mode === "edit") {
      setEditForm((currentForm) => ({
        ...currentForm,
        flyerImage: "",
        flyerName: "",
        flyerPath: "",
        flyerFile: null,
      }));
    } else {
      setForm((currentForm) => ({
        ...currentForm,
        flyerImage: "",
        flyerName: "",
        flyerPath: "",
        flyerFile: null,
      }));
    }
  }

  async function createEvent(event) {
    event.preventDefault();

    if (!user || !hasProducerRole) {
      alert("Log in as a producer before creating events.");
      setActiveTab("account");
      return;
    }

    if (!form.title || !form.venue || !form.city || !form.date || !form.time) {
      alert("Fill out the event name, venue, city, date, and time first.");
      return;
    }

    if (
      form.isTicketed &&
      !form.ticketTypes.some(
        (ticketType) =>
          ticketType.name.trim() && Number(ticketType.quantityAvailable || 0) > 0
      )
    ) {
      alert("Add at least one ticket type with a name and quantity.");
      return;
    }

    const isFree = !form.price || Number(form.price) === 0;

    let uploadedFlyer = {
      publicUrl: "",
      filePath: "",
      fileName: "",
    };

    try {
      if (form.flyerFile) {
        uploadedFlyer = await uploadFlyerToStorage(form.flyerFile, user.id)
      }
    } catch (error) {
      console.error(error);
      alert("Could not upload flier to Supabase Storage.");
      return;
    }

    const eventToCreate = {
      title: form.title,
      type: form.type,
      venue: form.venue,
      city: form.city,
      event_date: formatDate(form.date),
      event_time: formatTime(form.time),
      price: isFree ? "Free" : `$${form.price}`,
      points: 10,
      is_ticketed: form.isTicketed,
      flyer_image: uploadedFlyer.publicUrl,
      flyer_name: uploadedFlyer.fileName,
      flyer_path: uploadedFlyer.filePath,
      owner_id: user.id,
    };

    const { data, error } = await supabase
      .from("events")
      .insert(eventToCreate)
      .select()
      .single();

    if (error) {
      console.error(error);
      await deleteFlyerFromStorage(uploadedFlyer.filePath);
      alert("Could not create event in Supabase.");
      return;
    }

    if (form.isTicketed) {
      try {
        await saveTicketTypesForEvent(data.id, form.ticketTypes, user.id);
        await loadTicketTypesFromSupabase([data.id]);
      } catch (ticketError) {
        console.error(ticketError);
        alert("Event created, but ticket types could not be saved.");
      }
    }

    setEvents((currentEvents) => [fromDbEvent(data), ...currentEvents]);
    setForm(emptyForm);
    setSelectedEvent(null);
    setActiveTab("producer");
    alert("Event created.");
  }

  function startEdit(event) {
    if (!user || !hasProducerRole || event.ownerId !== user.id) {
      alert("Log in as the event producer before editing events.");
      setActiveTab("account");
      return;
    }

    setEditingEventId(event.id);
    const currentTicketTypes = ticketTypes
      .filter((ticketType) => ticketType.eventId === event.id)
      .map((ticketType) => ({
        ...ticketType,
        price: String(ticketType.price || ""),
        quantityAvailable: String(ticketType.quantityAvailable || ""),
      }));

    setEditForm({
      title: event.title || "",
      type: event.type || "Comedy",
      venue: event.venue || "",
      city: event.city || "",
      date: event.date || "",
      time: event.time || "",
      price: cleanPriceForEdit(event.price),
      isTicketed: event.isTicketed || currentTicketTypes.length > 0,
      ticketTypes: currentTicketTypes,
      flyerImage: event.flyerImage || "",
      flyerName: event.flyerName || "",
      flyerPath: event.flyerPath || "",
      flyerFile: null,
    });
  }

  function cancelEdit() {
    setEditingEventId(null);
    setEditForm(emptyEditForm);
  }

  async function saveEventChanges(event) {
    event.preventDefault();

    const originalEvent = events.find((item) => item.id === editingEventId);

    if (!user || !hasProducerRole || originalEvent?.ownerId !== user.id) {
      alert("Log in as the event producer before saving changes.");
      setActiveTab("account");
      return;
    }

    if (
      !editForm.title ||
      !editForm.venue ||
      !editForm.city ||
      !editForm.date ||
      !editForm.time
    ) {
      alert("Fill out the event name, venue, city, date, and time first.");
      return;
    }

    const isFree = !editForm.price || Number(editForm.price) === 0;

    let finalFlyerImage = editForm.flyerImage;
    let finalFlyerName = editForm.flyerName;
    let finalFlyerPath = editForm.flyerPath;

    let newlyUploadedPath = "";

    try {
      if (editForm.flyerFile) {
        const uploadedFlyer = await uploadFlyerToStorage(editForm.flyerFile, user.id)

        finalFlyerImage = uploadedFlyer.publicUrl;
        finalFlyerName = uploadedFlyer.fileName;
        finalFlyerPath = uploadedFlyer.filePath;
        newlyUploadedPath = uploadedFlyer.filePath;
      }

      if (!editForm.flyerImage) {
        finalFlyerImage = "";
        finalFlyerName = "";
        finalFlyerPath = "";
      }
    } catch (error) {
      console.error(error);
      alert("Could not update flier in Supabase Storage.");
      return;
    }

    const updatedEvent = {
      title: editForm.title,
      type: editForm.type,
      venue: editForm.venue,
      city: editForm.city,
      event_date: editForm.date,
      event_time: editForm.time,
      price: isFree ? "Free" : `$${editForm.price}`,
      points: 10,
      is_ticketed: editForm.isTicketed,
      flyer_image: finalFlyerImage,
      flyer_name: finalFlyerName,
      flyer_path: finalFlyerPath,
    };

    const { data, error } = await supabase
      .from("events")
      .update(updatedEvent)
      .eq("id", editingEventId)
      .select()
      .single();

    if (error) {
      console.error(error);
      await deleteFlyerFromStorage(newlyUploadedPath);
      alert("Could not update event in Supabase.");
      return;
    }

    if (originalEvent?.flyerPath && originalEvent.flyerPath !== finalFlyerPath) {
      await deleteFlyerFromStorage(originalEvent.flyerPath);
    }

    const updatedAppEvent = fromDbEvent(data);

    try {
      if (editForm.isTicketed) {
        await saveTicketTypesForEvent(editingEventId, editForm.ticketTypes, user.id);
      }

      await loadTicketTypesFromSupabase(events.map((event) => event.id));
    } catch (ticketError) {
      console.error(ticketError);
      alert("Event saved, but ticket types could not be updated.");
    }

    setEvents((currentEvents) =>
      currentEvents.map((item) =>
        item.id === editingEventId ? updatedAppEvent : item
      )
    );

    if (selectedEvent?.id === editingEventId) {
      setSelectedEvent(updatedAppEvent);
    }

    cancelEdit();
    alert("Event updated.");
  }

  async function deleteEvent(eventId) {
    const eventToDelete = events.find((event) => event.id === eventId);

    if (!user || !hasProducerRole || eventToDelete?.ownerId !== user.id) {
      alert("Log in as the event producer before deleting events.");
      setActiveTab("account");
      return;
    }

    if (
      editForm.isTicketed &&
      !editForm.ticketTypes.some(
        (ticketType) =>
          ticketType.name.trim() && Number(ticketType.quantityAvailable || 0) > 0
      )
    ) {
      alert("Add at least one ticket type with a name and quantity.");
      return;
    }

    const confirmed = window.confirm(
      `Delete "${eventToDelete?.title || "this event"}"?`
    );

    if (!confirmed) return;

    const { error } = await supabase.from("events").delete().eq("id", eventId);

    if (error) {
      console.error(error);
      alert("Could not delete event from Supabase.");
      return;
    }

    await deleteFlyerFromStorage(eventToDelete?.flyerPath);

    setEvents((currentEvents) =>
      currentEvents.filter((event) => event.id !== eventId)
    );

    if (selectedEvent?.id === eventId) {
      setSelectedEvent(null);
      setActiveTab("fan");
    }

    if (editingEventId === eventId) {
      cancelEdit();
    }
  }
const producerEvents = user
  ? events.filter((event) => event.ownerId === user.id)
  : [];

const producerShareCount = producerEvents.reduce(
  (total, event) => total + (shareStats[event.id]?.shares || 0),
  0
);

const producerVisitCount = producerEvents.reduce(
  (total, event) => total + (shareStats[event.id]?.visits || 0),
  0
);

const eventsWithDistance = events.map((event) => ({
  ...event,
  distanceMiles: getDistanceMiles(userLocation, event),
}));

const hasAnyEventCoordinates = eventsWithDistance.some(
  (event) => event.distanceMiles !== null
);

const visibleEvents =
  userLocation && hasAnyEventCoordinates
    ? eventsWithDistance
        .filter(
          (event) =>
            event.distanceMiles === null || event.distanceMiles <= radiusMiles
        )
        .sort((firstEvent, secondEvent) => {
          if (firstEvent.distanceMiles === null) return 1;
          if (secondEvent.distanceMiles === null) return -1;
          return firstEvent.distanceMiles - secondEvent.distanceMiles;
        })
    : eventsWithDistance;

const locationMessage = userLocation
  ? hasAnyEventCoordinates
    ? `Showing events within ${radiusMiles} miles when event coordinates are available.`
    : "Location is on. Showing all events until event coordinates are added."
  : locationStatus === "denied"
  ? "Location was not shared. Showing all upcoming events instead."
  : locationStatus === "unavailable"
  ? "Location is not available in this browser. Showing all upcoming events."
  : "Checking location. Showing all upcoming events until nearby results are available.";

const selectedEventTicketTypes = selectedEvent
  ? ticketTypes.filter((ticketType) => ticketType.eventId === selectedEvent.id)
  : [];

const selectedEventHasPaidTicketType = selectedEventTicketTypes.some(
  (ticketType) => !isFreeTicket(ticketType)
);

const selectedEventDisplayTicketTypes =
  selectedEvent && !selectedEventHasPaidTicketType && getNumericEventPrice(selectedEvent) > 0
    ? [
        ...selectedEventTicketTypes,
        {
          id: `event-price-${selectedEvent.id}`,
          eventId: selectedEvent.id,
          name: "General Admission",
          description: "Paid admission",
          price: getNumericEventPrice(selectedEvent),
          quantityAvailable: null,
          quantityReserved: 0,
          saleStatus: "on_sale",
          isEventPriceFallback: true,
        },
      ]
    : selectedEventTicketTypes;

const hasReservationForSelectedEvent = Boolean(
  selectedEvent &&
    ticketReservations.some(
      (reservation) =>
        reservation.event_id === selectedEvent.id &&
        ["reserved", "pending_payment", "paid"].includes(reservation.status)
    )
);

const fanTicketReservations = ticketReservations.map((reservation) => {
  const ticketType = ticketTypes.find(
    (item) => item.id === reservation.ticket_type_id
  );
  const event = events.find((item) => item.id === reservation.event_id);

  return {
    ...reservation,
    ticketTypeName: ticketType?.name || "Ticket",
    eventTitle: event?.title || "Event",
    eventDate: event?.date || "",
    eventTime: event?.time || "",
  };
});

const producerTicketReservationRows = producerTicketReservations.map((reservation) => {
    const ticketType = ticketTypes.find(
      (item) => item.id === reservation.ticket_type_id
    );
    const event = events.find((item) => item.id === reservation.event_id);
    const attendeeProfile = attendeeProfiles[reservation.user_id];

    return {
      ...reservation,
      ticketTypeName: ticketType?.name || "Ticket",
      eventTitle: event?.title || "Event",
      attendeeName:
        attendeeProfile?.display_name ||
        reservation.fan_email ||
        "Attendee",
      attendeeEmail: reservation.fan_email || attendeeProfile?.email || "",
    };
  });

const attendeeCounts = producerTicketReservationRows.reduce(
  (counts, reservation) => {
    const quantity = Number(reservation.quantity || 0);

    counts.totalReservations += 1;
    counts.totalQuantity += quantity;

    if (reservation.checked_in) {
      counts.checkedIn += quantity;
    } else {
      counts.notCheckedIn += quantity;
    }

    return counts;
  },
  {
    totalReservations: 0,
    totalQuantity: 0,
    checkedIn: 0,
    notCheckedIn: 0,
  }
);

  function getTicketTypesForEvent(eventId) {
    return ticketTypes.filter((ticketType) => ticketType.eventId === eventId);
  }

  function renderTicketTypeEditor(mode, currentForm) {
    const update = mode === "edit" ? updateEditForm : updateForm;

    return (
      <section className="ticketSetup fullSpan">
        <label className="consentRow fullSpan">
          <input
            type="checkbox"
            checked={currentForm.isTicketed}
            onChange={(event) => {
              const checked = event.target.checked;
              update("isTicketed", checked);

              if (checked && currentForm.ticketTypes.length === 0) {
                addTicketType(mode);
              }
            }}
          />
          <span>This event has tickets or RSVPs.</span>
        </label>

        {currentForm.isTicketed && (
          <>
            <div className="ticketTypeList">
              {currentForm.ticketTypes.map((ticketType) => (
                <div className="ticketTypeEditor" key={ticketType.localId}>
                  <div className="formGrid">
                    <label className="formField">
                      Ticket Name
                      <input
                        value={ticketType.name}
                        onChange={(event) =>
                          updateTicketType(
                            mode,
                            ticketType.localId,
                            "name",
                            event.target.value
                          )
                        }
                        placeholder="General Admission"
                      />
                    </label>

                    <label className="formField">
                      Price
                      <input
                        type="number"
                        min="0"
                        value={ticketType.price}
                        onChange={(event) =>
                          updateTicketType(
                            mode,
                            ticketType.localId,
                            "price",
                            event.target.value
                          )
                        }
                        placeholder="0 for free RSVP"
                      />
                    </label>

                    <label className="formField">
                      Quantity
                      <input
                        type="number"
                        min={ticketType.quantityReserved || 0}
                        value={ticketType.quantityAvailable}
                        onChange={(event) =>
                          updateTicketType(
                            mode,
                            ticketType.localId,
                            "quantityAvailable",
                            event.target.value
                          )
                        }
                        placeholder="100"
                      />
                    </label>

                    <label className="formField">
                      Status
                      <select
                        value={ticketType.saleStatus}
                        onChange={(event) =>
                          updateTicketType(
                            mode,
                            ticketType.localId,
                            "saleStatus",
                            event.target.value
                          )
                        }
                      >
                        <option value="on_sale">On Sale</option>
                        <option value="paused">Paused</option>
                        <option value="sold_out">Sold Out</option>
                      </select>
                    </label>

                    <label className="formField fullSpan">
                      Description
                      <input
                        value={ticketType.description}
                        onChange={(event) =>
                          updateTicketType(
                            mode,
                            ticketType.localId,
                            "description",
                            event.target.value
                          )
                        }
                        placeholder="What this ticket includes"
                      />
                    </label>
                  </div>

                  {ticketType.quantityReserved > 0 && (
                    <p className="helperText">
                      {ticketType.quantityReserved} already reserved.
                    </p>
                  )}

                  <button
                    className="secondaryBtn wide"
                    type="button"
                    onClick={() => removeTicketType(mode, ticketType)}
                  >
                    Remove Ticket Type
                  </button>
                </div>
              ))}
            </div>

            <button
              className="secondaryBtn wide"
              type="button"
              onClick={() => addTicketType(mode)}
            >
              Add Ticket Type
            </button>
          </>
        )}
      </section>
    );
  }

  function renderAuthPanel(compact = false) {
    return (
      <section className={compact ? "authPanel compactAuth" : "authPanel"}>
        <p className="eyebrow">Street Team Account</p>
        <h1>{authMode === "login" ? "Log in." : "Create account."}</h1>

        <div className="roleChoiceGrid">
          <button
            className={
              selectedAccountType === "fan" ? "roleChoice activeRole" : "roleChoice"
            }
            type="button"
            onClick={() => setSelectedAccountType("fan")}
          >
            <strong>I'm a Fan</strong>
            <span>Find events, share shows, earn rewards.</span>
          </button>

          <button
            className={
              selectedAccountType === "producer"
                ? "roleChoice activeRole"
                : "roleChoice"
            }
            type="button"
            onClick={() => setSelectedAccountType("producer")}
          >
            <strong>I'm a Producer</strong>
            <span>Post events, upload fliers, track promoters.</span>
          </button>
        </div>

        <p>
          Choose how you want to use Street Team. Fans earn rewards by sharing.
          Producers create events and track who helped promote.
        </p>

        <form className="authForm" onSubmit={handleAuthSubmit}>
          <label className="formField">
            Email
            <input
              type="email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>

          <label className="formField">
            Password
            <input
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </label>

          <button className="primaryBtn wide" type="submit" disabled={isAuthLoading}>
            {isAuthLoading
              ? "Working..."
              : authMode === "login"
              ? "Log In"
              : "Create Account"}
          </button>
        </form>

        {authMessage && <p className="authMessage">{authMessage}</p>}

        <button
          className="secondaryBtn wide authSwitch"
          type="button"
          onClick={() => {
            setAuthMode(authMode === "login" ? "signup" : "login");
            setAuthMessage("");
          }}
        >
          {authMode === "login"
            ? "Need an account? Sign up"
            : "Already have an account? Log in"}
        </button>
      </section>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="logoWrap">
          <img
            className="brandHeaderLogo"
            src={`${import.meta.env.BASE_URL}assets/header-logo.png`}
            alt="Street Team"
          />
          <div className="tagline">Find shows. Share shows. Earn rewards.</div>
        </div>

        <nav className="tabs">
          <button
            className={activeTab === "home" ? "tab active" : "tab"}
            onClick={() => goToTab("home")}
          >
            Home
          </button>
          <button
            className={
              activeTab === "fan" || activeTab === "event"
                ? "tab active"
                : "tab"
            }
            onClick={() => goToTab("fan")}
          >
            Discover
          </button>
          <button
            className={activeTab === "producer" ? "tab active" : "tab"}
            onClick={() => goToTab("producer")}
          >
            Producer
          </button>
          <button
            className={activeTab === "streetteam" ? "tab active" : "tab"}
            onClick={() => goToTab("streetteam")}
>
           My Team
         </button>
         <button
            className={activeTab === "account" ? "tab active" : "tab"}
            onClick={() => goToTab("account")}
          >
            Account
          </button>
        </nav>
      </header>

      <main className="content">
        {ticketMessage && activeTab !== "event" && activeTab !== "streetteam" && (
          <p className="authMessage">{ticketMessage}</p>
        )}

        {activeTab === "home" && (
  <>
    <section className="heroCard">
      <div>
        <p className="eyebrow">Street Team</p>
        <h1>Find the shows people are actually talking about.</h1>
        <p>
          Discover live events, help promote your favorites, and earn rewards
          for putting people in the room.
        </p>
      </div>

      <div className="pointsBox lockedPoints">
        <span>Street Team</span>
        <p>Share shows. Track impact. Earn rewards.</p>
        <button
          className="secondaryBtn"
          type="button"
          onClick={() => goToTab("fan")}
        >
          Discover Events
        </button>
      </div>
    </section>

    <section className="sectionHeader">
      <h2>Featured Shows</h2>
      <p>Boosted and sponsored placements will live here.</p>
    </section>

    <div className="eventList">
      {events.slice(0, 3).map((event) => (
        <article className="eventCard" key={`home-${event.id}`}>
          <EventFlyer event={event} />

          <div className="eventInfo">
            <div className="eventTop">
              <span className="pill">Featured</span>
              <span className="price">
                {getEventPriceLabel(event, getTicketTypesForEvent(event.id))}
              </span>
            </div>

            <h3>{event.title}</h3>
            <p className="venue">{event.venue}</p>
            <p className="details">
              {event.city} · {event.date} · {event.time}
            </p>

            <div className="eventActions">
              <button className="primaryBtn" onClick={() => openEvent(event)}>
                View Event
              </button>
              <button
                className="secondaryBtn"
                onClick={() => shareEvent(event)}
              >
                Share +{event.points}
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>

    <section className="sponsorBanner">
      <p className="eyebrow">Sponsor Spot</p>
      <h2>Your brand could own this city’s live event feed.</h2>
      <p>
        Future sponsor banners, boosted event placements, and local brand
        partnerships will appear here.
      </p>
    </section>
  </>
)}
        {activeTab === "fan" && (
          <>
            <section className="heroCard">
              <div>
                <p className="eyebrow">Near You</p>
                <h1>Shows worth leaving the house for.</h1>
                <p>
                  Discover local comedy, music, game nights, festivals, and live
                  events near you.
                </p>
              </div>

              {user && hasFanProfile ? (
                <div className="pointsBox">
                  <span>Your Points</span>
                  <strong>{fanStats.points}</strong>
                </div>
              ) : (
                <div className="pointsBox lockedPoints">
                  <span>{user ? "Finish Profile" : "Earn Rewards"}</span>
                  <p>
                    {user
                      ? "Save your fan profile to start tracking points."
                      : "Create a free fan account to earn points for sharing events."}
                  </p>
                  <button
                    className="secondaryBtn"
                    type="button"
                    onClick={() => {
                      if (user) {
                        goToTab("streetteam");
                      } else {
                        setSelectedAccountType("fan");
                        setAuthMode("signup");
                        goToTab("account");
                      }
                    }}
                  >
                    {user ? "Go to My Team" : "Join Free"}
                  </button>
                </div>
              )}
            </section>

            <section className="sectionHeader">
              <h2>Upcoming Events</h2>
              <p>{locationMessage}</p>
            </section>

            <div className="discoveryControls">
              <label className="formField">
                Radius
                <select
                  value={radiusMiles}
                  onChange={(e) => setRadiusMiles(Number(e.target.value))}
                >
                  <option value={10}>10 miles</option>
                  <option value={25}>25 miles</option>
                  <option value={50}>50 miles</option>
                  <option value={100}>100 miles</option>
                </select>
              </label>
            </div>

            {isLoadingEvents && <p>Loading events...</p>}
            {eventError && <p className="errorText">{eventError}</p>}
            {shareMessage && <p className="authMessage">{shareMessage}</p>}
            {!isLoadingEvents && !eventError && events.length === 0 && (
              <section className="emptyState">
                <h3>No events yet.</h3>
                <p>Log in as a producer and create the first event.</p>
              </section>
            )}
            {!isLoadingEvents &&
              !eventError &&
              events.length > 0 &&
              visibleEvents.length === 0 && (
                <section className="emptyState">
                  <h3>No events inside that radius.</h3>
                  <p>Try expanding the radius or check back when more shows are added.</p>
                </section>
              )}

            <div className="eventList">
              {visibleEvents.map((event) => (
                <article className="eventCard" key={event.id}>
                  <EventFlyer event={event} />

                  <div className="eventInfo">
                    <div className="eventTop">
                      <span className="pill">{event.type}</span>
                      <span className="price">
                        {getEventPriceLabel(event, getTicketTypesForEvent(event.id))}
                      </span>
                    </div>

                    <h3>{event.title}</h3>
                    <p className="venue">{event.venue}</p>
                    {event.distanceMiles !== null && (
                      <p className="details">
                        {Math.round(event.distanceMiles)} miles away
                      </p>
                    )}
                    <p className="details">
                      {event.city} · {event.date} · {event.time}
                    </p>

                    <div className="eventActions">
                      <button
                        className="primaryBtn"
                        onClick={() => openEvent(event)}
                      >
                        View Event
                      </button>
                      <button
                        className="secondaryBtn"
                        onClick={() => shareEvent(event)}
                      >
                        Share +{event.points}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        {activeTab === "event" && selectedEvent && (
          <section className="eventDetail">
            <button className="backBtn" onClick={() => goToTab("fan")}>
              ← Back to events
            </button>

            <EventFlyer event={selectedEvent} detail />

            <div className="detailBody">
              <div className="eventTop">
                <span className="pill">{selectedEvent.type}</span>
                <span className="price">
                  {getEventPriceLabel(selectedEvent, selectedEventDisplayTicketTypes)}
                </span>
              </div>

              <h1>{selectedEvent.title}</h1>

              <div className="detailList">
                <div>
                  <span>Venue</span>
                  <strong>{selectedEvent.venue}</strong>
                </div>
                <div>
                  <span>Location</span>
                  <strong>{selectedEvent.city}</strong>
                </div>
                <div>
                  <span>Date</span>
                  <strong>{selectedEvent.date}</strong>
                </div>
                <div>
                  <span>Time</span>
                  <strong>{selectedEvent.time}</strong>
                </div>
              </div>

              <p>
                Help this event reach more people. Share it with your friends
                and earn points toward future rewards.
              </p>
              {shareMessage && <p className="authMessage">{shareMessage}</p>}

              <section className="ticketPanel">
                  <div className="sectionHeader smallHeader">
                    <h2>Tickets</h2>
                    <p>Free RSVPs can be reserved now. Paid checkout is coming next.</p>
                  </div>

                  {ticketMessage && <p className="authMessage">{ticketMessage}</p>}

                  {selectedEventDisplayTicketTypes.length === 0 ? (
                    <div className="emptyState">
                      <h3>Tickets coming soon.</h3>
                      <p>The producer has not published ticket types yet.</p>
                    </div>
                  ) : (
                    <div className="rewardsList">
                      {selectedEventDisplayTicketTypes.map((ticketType) => {
                        const remainingTickets = getRemainingTickets(ticketType);
                        const isFree = isFreeTicket(ticketType);
                        const hasKnownInventory =
                          ticketType.quantityAvailable !== null &&
                          ticketType.quantityAvailable !== undefined;
                        const canReserveFreeTicket =
                          isFree &&
                          !hasReservationForSelectedEvent &&
                          ticketType.saleStatus === "on_sale" &&
                          remainingTickets > 0;
                        const maxPaidQuantity = hasKnownInventory
                          ? Math.min(8, remainingTickets)
                          : 8;
                        const paidQuantity =
                          maxPaidQuantity > 0
                            ? Math.min(
                                Number(ticketQuantities[ticketType.id] || 1),
                                maxPaidQuantity
                              )
                            : 0;
                        const paidTotal = Number(ticketType.price || 0) * paidQuantity;
                        const canCheckoutPaidTicket =
                          !isFree &&
                          !ticketType.isEventPriceFallback &&
                          ticketType.saleStatus === "on_sale" &&
                          hasKnownInventory &&
                          remainingTickets >= paidQuantity &&
                          paidQuantity > 0;

                        return (
                          <div className="rewardCard" key={ticketType.id}>
                            <div>
                              <h3>{ticketType.name}</h3>
                              {ticketType.description && (
                                <p>{ticketType.description}</p>
                              )}
                              <p className="rewardStatus">
                                {isFree
                                  ? "Free RSVP"
                                  : `$${Number(ticketType.price).toFixed(2)}`}
                                {" · "}
                                {hasKnownInventory
                                  ? `${remainingTickets} remaining`
                                  : "Remaining quantity unavailable"}
                              </p>
                              {!isFree && (!hasKnownInventory || remainingTickets > 0) && (
                                <label className="formField ticketQuantityField">
                                  Quantity
                                  <select
                                    value={paidQuantity}
                                    onChange={(event) =>
                                      setTicketQuantities((currentQuantities) => ({
                                        ...currentQuantities,
                                        [ticketType.id]: Number(event.target.value),
                                      }))
                                    }
                                  >
                                    {Array.from(
                                      { length: maxPaidQuantity },
                                      (_, index) => index + 1
                                    ).map((quantity) => (
                                      <option value={quantity} key={quantity}>
                                        {quantity}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              )}
                              {!isFree && (!hasKnownInventory || remainingTickets > 0) && (
                                <p className="rewardStatus">
                                  Total: ${paidTotal.toFixed(2)}
                                </p>
                              )}
                            </div>

                            <button
                              className={
                                canReserveFreeTicket || canCheckoutPaidTicket
                                  ? "primaryBtn"
                                  : "secondaryBtn"
                              }
                              type="button"
                              disabled={
                                isReservingTicket ||
                                checkoutTicketId === ticketType.id ||
                                ticketType.saleStatus !== "on_sale" ||
                                (hasKnownInventory && remainingTickets <= 0) ||
                                (isFree
                                  ? hasReservationForSelectedEvent
                                  : !canCheckoutPaidTicket)
                              }
                              onClick={() =>
                                isFree
                                  ? reserveTicket(ticketType)
                                  : startPaidTicketCheckout(ticketType)
                              }
                            >
                              {isFree && hasReservationForSelectedEvent
                                ? "Already Reserved"
                                : !isFree
                                ? ticketType.isEventPriceFallback
                                  ? "Create ticket type"
                                  : checkoutTicketId === ticketType.id
                                  ? "Starting checkout..."
                                  : "Checkout"
                                : remainingTickets <= 0
                                ? "Sold Out"
                                : "Reserve Free Ticket"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
              </section>

              <div className="eventActions">
                <button
                  className="primaryBtn"
                  onClick={() => shareEvent(selectedEvent)}
                >
                  Share Event +{selectedEvent.points}
                </button>
                <button className="secondaryBtn" type="button">
                  Tickets Above
                </button>
              </div>
            </div>
          </section>
        )}

  {activeTab === "producer" && (!user || !hasProducerRole) && (
  <section className="panel">
    <p className="eyebrow">Producer Dashboard</p>
    <h1>Producer login required.</h1>
    <p>
      Log in with a producer account to create events, upload fliers, edit
      shows, and track who helped promote.
    </p>

    {user && !hasProducerRole && (
      <p className="authMessage">
        You are currently logged in, but this account is not marked as a
        producer account.
      </p>
    )}

    <div className="eventActions">
      {user && !hasProducerRole ? (
        <button
          className="primaryBtn"
          type="button"
          onClick={() => saveUserRoleForUser(user.id, "producer")}
        >
          Add Producer Access
        </button>
      ) : (
        <button
          className="primaryBtn"
          type="button"
          onClick={() => {
            setSelectedAccountType("producer");
            setAuthMode("login");
            goToTab("account");
          }}
        >
          Log In as Producer
        </button>
      )}

      <button
        className="secondaryBtn"
        type="button"
        onClick={() => {
          if (user) {
            handleLogout();
          } else {
            setSelectedAccountType("producer");
            setAuthMode("signup");
            goToTab("account");
          }
        }}
      >
        {user ? "Log Out" : "Create Producer Account"}
      </button>
    </div>
  </section>
)}

        {activeTab === "producer" && user && hasProducerRole && (
          <section className="panel">
            <p className="eyebrow">Producer Dashboard</p>
            <h1>Manage your events.</h1>
            <p>
              Logged in as <strong>{user.email}</strong>. Create, edit, delete,
              and update fliers.
            </p>

            <div className="producerGrid">
              <div className="miniCard">
                <strong>{producerEvents.length}</strong>
                <span>Active Events</span>
              </div>
              <div className="miniCard">
                <strong>{producerShareCount}</strong>
                <span>Tracked Shares</span>
        
              </div>
              <div className="miniCard">
                <strong>{producerVisitCount}</strong>
                <span>Link Visits</span>
              </div>
            </div>

            <section className="managerSection">
              <div className="sectionHeader smallHeader">
                <h2>Your Events</h2>
                <p>Edit events, fix typos, replace fliers, or delete old ones.</p>
              </div>

              {isLoadingEvents && <p>Loading events...</p>}

              <div className="manageList">
                {producerEvents.map((event) => (
                  <article className="manageCard" key={event.id}>
                    <EventFlyer event={event} />

                    <div className="manageInfo">
                      <div className="eventTop">
                        <span className="pill">{event.type}</span>
                        <span className="price">{event.price}</span>
                      </div>

                      <h3>{event.title}</h3>
                      <p className="venue">{event.venue}</p>
                      <p className="details">
                        {event.city} · {event.date} · {event.time}
                      </p>
                      <div className="shareStats">
                        <span>
                          Shares: <strong>{shareStats[event.id]?.shares || 0}</strong>
                        </span>
                        <span>
                          Visits: <strong>{shareStats[event.id]?.visits || 0}</strong>
                        </span>
                      </div>

                      {shareStats[event.id]?.promoters?.length > 0 && (
                        <div className="promoterList">
                          <strong>Top Promoters</strong>

                          {shareStats[event.id].promoters.slice(0, 3).map((promoter) => (
                            <div className="promoterRow" key={promoter.name}>
                              <span>{promoter.name}</span>
                              <em>
                                {promoter.shares} shares · {promoter.visits} visits · {" "}
                                {promoter.points} pts
                              </em>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="eventActions">
                        <button
                          className="secondaryBtn"
                          type="button"
                          onClick={() => startEdit(event)}
                        >
                          Edit
                        </button>
                        <button
                          className="dangerBtn"
                          type="button"
                          onClick={() => deleteEvent(event.id)}
                        >
                          Delete
                        </button>
                      </div>

                      {editingEventId === event.id && (
                        <form className="editForm" onSubmit={saveEventChanges}>
                          <h3 className="editTitle">Editing Event</h3>

                          <div className="formGrid">
                            <label className="formField fullSpan">
                              Event Name
                              <input
                                value={editForm.title}
                                onChange={(e) =>
                                  updateEditForm("title", e.target.value)
                                }
                              />
                            </label>

                            <label className="formField">
                              Event Type
                              <select
                                value={editForm.type}
                                onChange={(e) =>
                                  updateEditForm("type", e.target.value)
                                }
                              >
                                <option>Comedy</option>
                                <option>Music</option>
                                <option>Game Show</option>
                                <option>Festival</option>
                                <option>Theater</option>
                                <option>Sports</option>
                                <option>Other</option>
                              </select>
                            </label>

                            <label className="formField">
                              Ticket Price
                              <input
                                type="number"
                                min="0"
                                value={editForm.price}
                                onChange={(e) =>
                                  updateEditForm("price", e.target.value)
                                }
                                placeholder="0 for free"
                              />
                            </label>

                            <label className="formField">
                              Venue
                              <input
                                value={editForm.venue}
                                onChange={(e) =>
                                  updateEditForm("venue", e.target.value)
                                }
                              />
                            </label>

                            <label className="formField">
                              City
                              <input
                                value={editForm.city}
                                onChange={(e) =>
                                  updateEditForm("city", e.target.value)
                                }
                              />
                            </label>

                            <label className="formField">
                              Date
                              <input
                                value={editForm.date}
                                onChange={(e) =>
                                  updateEditForm("date", e.target.value)
                                }
                                placeholder="Example: Fri, May 10"
                              />
                            </label>

                            <label className="formField">
                              Time
                              <input
                                value={editForm.time}
                                onChange={(e) =>
                                  updateEditForm("time", e.target.value)
                                }
                                placeholder="Example: 8:00 PM"
                              />
                            </label>

                            <label className="formField fullSpan">
                              Replace Flier
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) =>
                                  handleFlyerUpload(e.target.files[0], "edit")
                                }
                              />
                            </label>

                            {renderTicketTypeEditor("edit", editForm)}
                          </div>

                          {editForm.flyerImage && (
                            <div className="flyerPreview">
                              <img
                                src={editForm.flyerImage}
                                alt="Flier preview"
                              />
                              <div>
                                <strong>
                                  {editForm.flyerName || "Current flier"}
                                </strong>
                                <button
                                  className="secondaryBtn"
                                  type="button"
                                  onClick={() => removeFlyer("edit")}
                                >
                                  Remove Flier
                                </button>
                              </div>
                            </div>
                          )}

                          <div className="eventActions">
                            <button className="primaryBtn" type="submit">
                              Save Changes
                            </button>
                            <button
                              className="secondaryBtn"
                              type="button"
                              onClick={cancelEdit}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="managerSection">
              <div className="sectionHeader smallHeader">
                <h2>Attendees</h2>
                <p>Free RSVPs and paid ticket purchases for your events.</p>
              </div>

              {attendeeMessage && <p className="authMessage">{attendeeMessage}</p>}

              {producerTicketReservationRows.length === 0 ? (
                <div className="emptyState">
                  <h3>No attendees yet.</h3>
                  <p>Attendees will appear here when fans claim or buy tickets.</p>
                </div>
              ) : (
                <div>
                  <div className="producerGrid">
                    <div className="miniCard">
                      <strong>{attendeeCounts.totalReservations}</strong>
                      <span>Orders</span>
                    </div>
                    <div className="miniCard">
                      <strong>{attendeeCounts.totalQuantity}</strong>
                      <span>Tickets</span>
                    </div>
                    <div className="miniCard">
                      <strong>{attendeeCounts.checkedIn}</strong>
                      <span>Checked In</span>
                    </div>
                    <div className="miniCard">
                      <strong>{attendeeCounts.notCheckedIn}</strong>
                      <span>Not Checked In</span>
                    </div>
                  </div>

                  <div className="rewardsList">
                  {producerTicketReservationRows.map((reservation) => (
                    <div className="rewardCard" key={reservation.id}>
                      <div>
                        <h3>{reservation.attendeeName}</h3>
                        <p>{reservation.eventTitle}</p>
                        <p>
                          {reservation.ticketTypeName} · Qty {reservation.quantity} ·{" "}
                          {formatTicketStatus(reservation.status)}
                        </p>
                        <p className="rewardStatus">
                          {reservation.fan_email || reservation.user_id} ·{" "}
                          {new Date(reservation.created_at).toLocaleString()}
                        </p>
                        <p className="rewardStatus">
                          {getCheckInStatusLabel(reservation)}
                        </p>
                      </div>
                      <button
                        className={
                          reservation.checked_in || !canCheckInReservation(reservation)
                            ? "secondaryBtn"
                            : "primaryBtn"
                        }
                        type="button"
                        disabled={
                          reservation.checked_in ||
                          !canCheckInReservation(reservation) ||
                          checkingInReservationId === reservation.id
                        }
                        onClick={() => checkInTicketReservation(reservation)}
                      >
                        {reservation.checked_in
                          ? "Checked In"
                          : checkingInReservationId === reservation.id
                          ? "Checking In..."
                          : canCheckInReservation(reservation)
                          ? "Check In"
                          : "Not Eligible"}
                      </button>
                    </div>
                  ))}
                  </div>
                </div>
              )}
            </section>

            <form className="createForm" onSubmit={createEvent}>
              <div className="sectionHeader smallHeader">
                <h2>Create New Event</h2>
                <p>Add a new show to Supabase.</p>
              </div>

              <div className="formGrid">
                <label className="formField fullSpan">
                  Event Name
                  <input
                    value={form.title}
                    onChange={(e) => updateForm("title", e.target.value)}
                    placeholder="Example: Buzzed Bee Live"
                  />
                </label>

                <label className="formField">
                  Event Type
                  <select
                    value={form.type}
                    onChange={(e) => updateForm("type", e.target.value)}
                  >
                    <option>Comedy</option>
                    <option>Music</option>
                    <option>Game Show</option>
                    <option>Festival</option>
                    <option>Theater</option>
                    <option>Sports</option>
                    <option>Other</option>
                  </select>
                </label>

                <label className="formField">
                  Ticket Price
                  <input
                    type="number"
                    min="0"
                    value={form.price}
                    onChange={(e) => updateForm("price", e.target.value)}
                    placeholder="0 for free"
                  />
                </label>

                <label className="formField">
                  Venue
                  <input
                    value={form.venue}
                    onChange={(e) => updateForm("venue", e.target.value)}
                    placeholder="Example: Harry the Hats"
                  />
                </label>

                <label className="formField">
                  City
                  <input
                    value={form.city}
                    onChange={(e) => updateForm("city", e.target.value)}
                    placeholder="Example: Surfside Beach, SC"
                  />
                </label>

                <label className="formField">
                  Date
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => updateForm("date", e.target.value)}
                  />
                </label>

                <label className="formField">
                  Time
                  <input
                    type="time"
                    value={form.time}
                    onChange={(e) => updateForm("time", e.target.value)}
                  />
                </label>

                <label className="formField fullSpan">
                  Event Flier
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFlyerUpload(e.target.files[0])}
                  />
                </label>

                {renderTicketTypeEditor("create", form)}
              </div>

              {form.flyerImage && (
                <div className="flyerPreview">
                  <img src={form.flyerImage} alt="Flier preview" />
                  <div>
                    <strong>{form.flyerName}</strong>
                    <button
                      className="secondaryBtn"
                      type="button"
                      onClick={removeFlyer}
                    >
                      Remove Flier
                    </button>
                  </div>
                </div>
              )}

              <button className="primaryBtn wide" type="submit">
                Publish Event
              </button>
            </form>
          </section>
        )}

        {activeTab === "legacy-rewards" && (
          <section className="panel">
            <p className="eyebrow">Rewards</p>
            <h1>Turn sharing into gift cards.</h1>
            <p>
              Fans earn points by sharing events. Points can be redeemed for
              digital gift cards and ticket discounts.
            </p>

            {redemptionMessage && <p className="authMessage">{redemptionMessage}</p>}

            <div className="rewardsList">
              {rewardTiers.map((reward) => {
                const hasEnoughPoints =
                  user && hasFanProfile && availableFanPoints >= reward.points;

                const pointsLeft = Math.max(0, reward.points - availableFanPoints);

                return (
                  <div className="rewardCard" key={reward.label}>
                    <div>
                      <h3>{reward.label}</h3>
                      <p>Redeem when you reach {reward.points.toLocaleString()} points.</p>

                      {user && hasFanProfile ? (
                        <p className="rewardStatus">
                          {hasEnoughPoints
                            ? "You have enough points for this reward."
                            : `${pointsLeft.toLocaleString()} points left.`}
                        </p>
                      ) : (
                        <p className="rewardStatus">
                          Create a fan profile to start earning rewards.
                        </p>
                      )}
                    </div>

                    <button
                      className={hasEnoughPoints ? "primaryBtn" : "secondaryBtn"}
                      disabled={!hasEnoughPoints || isRedeemingReward}
                      onClick={() => requestRewardRedemption(reward)}
                    >
                      {hasEnoughPoints ? "Redeem" : "Locked"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

{activeTab === "streetteam" && !user && (
  <section className="panel">
    <p className="eyebrow">My Team</p>
    <h1>Log in</h1>

    <div className="eventActions">
      <button
        className="primaryBtn"
        type="button"
        onClick={() => {
          setSelectedAccountType("fan");
          setAuthMode("login");
          goToTab("account");
        }}
      >
        Log In
      </button>

      <button
        className="secondaryBtn"
        type="button"
        onClick={() => {
          setSelectedAccountType("fan");
          setAuthMode("signup");
          goToTab("account");
        }}
      >
        Create Account
      </button>
    </div>
  </section>
)}

{activeTab === "streetteam" && user && (
  <section className="panel">
    <p className="eyebrow">My Team</p>
    <h1>Your street team dashboard.</h1>
    {ticketMessage && <p className="authMessage">{ticketMessage}</p>}

    <div className="myTeamGrid">
      <section className="teamDashboardCard">
        <div className="rewardProgressTop">
          <div>
            <p className="eyebrow">Profile</p>
            <h3>{fanProfile?.displayName || fanProfileForm.displayName || "Fan profile"}</h3>
          </div>
          <strong>{availableFanPoints.toLocaleString()}</strong>
        </div>
        <p>{fanProfile?.email || fanProfileForm.email || user.email}</p>
        <p>{availableFanPoints.toLocaleString()} points available</p>

        {!hasFanRole && (
          <button
            className="primaryBtn wide"
            type="button"
            onClick={() => saveUserRoleForUser(user.id, "fan")}
          >
            Add Fan Access
          </button>
        )}

        {hasFanRole && !hasFanProfile && (
          <form className="compactProfileForm" onSubmit={saveFanProfileForm}>
            <label className="formField">
              Name / Nickname
              <input
                value={fanProfileForm.displayName}
                onChange={(e) =>
                  updateFanProfileForm("displayName", e.target.value)
                }
                placeholder="Example: Amanda"
              />
            </label>
            <label className="formField">
              Email
              <input
                type="email"
                value={fanProfileForm.email}
                onChange={(e) => updateFanProfileForm("email", e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <button className="primaryBtn wide" type="submit">
              {isFanProfileLoading ? "Saving..." : "Save Profile"}
            </button>
          </form>
        )}

        {fanProfileMessage && <p className="authMessage">{fanProfileMessage}</p>}
      </section>

      <section className="teamDashboardCard">
        <p className="eyebrow">Rewards</p>
        <h3>{nextReward.label}</h3>
        <div className="progressBar">
          <div
            className="progressFill"
            style={{ width: `${rewardProgressPercent}%` }}
          />
        </div>
        <p>
          {pointsToNextReward === 0
            ? "You have enough points for this reward."
            : `${pointsToNextReward} points until your next reward.`}
        </p>
        {redemptionMessage && <p className="authMessage">{redemptionMessage}</p>}

        <div className="rewardsList">
          {rewardTiers.map((reward) => {
            const hasEnoughPoints =
              hasFanRole && hasFanProfile && availableFanPoints >= reward.points;
            const pointsLeft = Math.max(0, reward.points - availableFanPoints);

            return (
              <div className="rewardCard" key={reward.label}>
                <div>
                  <h3>{reward.label}</h3>
                  <p>Redeem at {reward.points.toLocaleString()} points.</p>
                  <p className="rewardStatus">
                    {hasEnoughPoints
                      ? "Ready to redeem."
                      : `${pointsLeft.toLocaleString()} points left.`}
                  </p>
                </div>

                <button
                  className={hasEnoughPoints ? "primaryBtn" : "secondaryBtn"}
                  disabled={!hasEnoughPoints || isRedeemingReward}
                  type="button"
                  onClick={() => requestRewardRedemption(reward)}
                >
                  {hasEnoughPoints ? "Redeem" : "Locked"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="teamDashboardCard">
        <p className="eyebrow">Share Stats</p>
        <div className="producerGrid teamStatsGrid">
          <div className="miniCard">
            <strong>{fanStats.shares}</strong>
            <span>Shares</span>
          </div>
          <div className="miniCard">
            <strong>{fanStats.visits}</strong>
            <span>Visits</span>
          </div>
          <div className="miniCard">
            <strong>{fanStats.eventsShared}</strong>
            <span>Events Shared</span>
          </div>
        </div>
      </section>

      <section className="teamDashboardCard">
        <p className="eyebrow">Points History</p>
        {pointHistory.length === 0 ? (
          <>
            <h3>No points yet</h3>
            <p>Earned and redeemed points will appear here.</p>
          </>
        ) : (
          <div className="rewardsList">
            {pointHistory.map((transaction) => {
              const points = Number(transaction.points || 0);

              return (
                <div className="rewardCard" key={transaction.id}>
                  <div>
                    <h3>
                      {points > 0 ? "+" : ""}
                      {points.toLocaleString()} {getPointHistoryLabel(transaction)}
                    </h3>
                    <p>
                      {transaction.created_at
                        ? new Date(transaction.created_at).toLocaleDateString()
                        : "Recent"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="teamDashboardCard">
        <p className="eyebrow">Saved / Shared Events</p>
        <h3>{fanStats.eventsShared} shared</h3>
        <p>Saved events will appear here when that feature is added.</p>
      </section>

      <section className="teamDashboardCard">
        <p className="eyebrow">Following</p>
        <h3>0 following</h3>
        <p>Followed artists, venues, and producers will appear here later.</p>
      </section>

      <section className="teamDashboardCard">
        <p className="eyebrow">My Tickets</p>
        {fanTicketReservations.length === 0 ? (
          <>
            <h3>No tickets yet</h3>
            <p>Free RSVPs and reserved tickets will appear here.</p>
          </>
        ) : (
          <div className="rewardsList">
            {fanTicketReservations.map((reservation) => (
              <div className="rewardCard" key={reservation.id}>
                <div>
                  <h3>{reservation.eventTitle}</h3>
                  <p>
                    {reservation.ticketTypeName} · Qty {reservation.quantity} ·{" "}
                    {formatTicketStatus(reservation.status)}
                  </p>
                  <p className="rewardStatus">
                    {reservation.eventDate} {reservation.eventTime}
                    {reservation.confirmation_code
                      ? ` · ${reservation.confirmation_code}`
                      : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {redemptions.length > 0 && (
        <section className="teamDashboardCard">
          <p className="eyebrow">Reward Requests</p>
          <div className="rewardsList">
            {redemptions.slice(0, 3).map((redemption) => (
              <div className="rewardCard" key={redemption.id}>
                <div>
                  <h3>{redemption.reward_label}</h3>
                  <p>
                    {redemption.points_cost?.toLocaleString()} points ·{" "}
                    {redemption.status || "pending"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  </section>
)}

{activeTab === "legacy-streetteam" && user && !hasFanRole && (
  <section className="panel">
    <p className="eyebrow">My Street Team</p>
    <h1>This account is not set up as a fan.</h1>
    <p>
      Fan accounts earn points and rewards by sharing events. Producer accounts
      manage events and track promoters.
    </p>

    <button
      className="primaryBtn"
      type="button"
      onClick={() => saveUserRoleForUser(user.id, "fan")}
    >
      Add Fan Access
    </button>
  </section>
)}

{activeTab === "legacy-streetteam" && user && hasFanRole && (
  <section className="panel">

    <div className="rewardProgressCard">
      <div className="rewardProgressTop">
        <div>
          <p className="eyebrow">My Team</p>
          <h3>{availableFanPoints.toLocaleString()} points available</h3>
        </div>
      </div>
      <p>Points are awarded one time per event when you create your approved share link.</p>
    </div>

    <section className="myTeamRewards">
      {redemptionMessage && <p className="authMessage">{redemptionMessage}</p>}

  <div className="sectionHeader smallHeader">
    <h2>Available Rewards</h2>
    <p>Redeeming a reward deducts points when the request is submitted.</p>
  </div>

  <div className="rewardsList">
    {rewardTiers.map((reward) => {
      const hasEnoughPoints = availableFanPoints >= reward.points;
      const pointsLeft = Math.max(0, reward.points - availableFanPoints);

      return (
        <div className="rewardCard" key={reward.label}>
          <div>
            <h3>{reward.label}</h3>
            <p>Redeem when you reach {reward.points.toLocaleString()} points.</p>

            <p className="rewardStatus">
              {hasEnoughPoints
                ? "You have enough points for this reward."
                : `${pointsLeft.toLocaleString()} points left.`}
            </p>
          </div>

          <button
  className={hasEnoughPoints ? "primaryBtn" : "secondaryBtn"}
  disabled={!hasEnoughPoints || isRedeemingReward}
  type="button"
  onClick={() => requestRewardRedemption(reward)}
>
  {hasEnoughPoints ? "Redeem" : "Locked"}
</button>
        </div>
      );
    })}
  </div>
</section>

    {redemptions.length > 0 && (
      <section className="rewardProgressCard">
        <div className="sectionHeader smallHeader">
          <h2>Reward Requests</h2>
          <p>Recent reward activity for this account.</p>
        </div>

        <div className="rewardsList">
          {redemptions.slice(0, 3).map((redemption) => (
            <div className="rewardCard" key={redemption.id}>
              <div>
                <h3>{redemption.reward_label}</h3>
                <p>
                  {redemption.points_cost?.toLocaleString()} points ·{" "}
                  {redemption.status || "pending"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    )}

    <form className="createForm" onSubmit={saveFanProfileForm}>
      <div className="formGrid">
        <label className="formField">
          Name / Nickname
          <input
            value={fanProfileForm.displayName}
            onChange={(e) =>
              updateFanProfileForm("displayName", e.target.value)
            }
            placeholder="Example: Amanda"
          />
        </label>

        <label className="formField">
          Email
          <input
            type="email"
            value={fanProfileForm.email}
            onChange={(e) => updateFanProfileForm("email", e.target.value)}
            placeholder="you@example.com"
          />
        </label>

        <label className="formField">
          Home City / Market
          <input
            value={fanProfileForm.homeCity}
            onChange={(e) => updateFanProfileForm("homeCity", e.target.value)}
            placeholder="Example: Myrtle Beach, SC"
          />
        </label>

        <div className="favoriteTypes fullSpan">
          <span className="favoriteTypesLabel">Favorite Event Types</span>

          <div className="favoriteTypeGrid">
            {fanEventTypeOptions.map((eventType) => (
              <button
                key={eventType}
                type="button"
                className={
                  fanProfileForm.favoriteEventTypes.includes(eventType)
                    ? "favoriteType activeFavoriteType"
                    : "favoriteType"
                }
                onClick={() => toggleFavoriteEventType(eventType)}
              >
                {eventType}
              </button>
            ))}
          </div>
        </div>

        <label className="consentRow fullSpan">
          <input
            type="checkbox"
            checked={fanProfileForm.marketingConsent}
            onChange={(e) =>
              updateFanProfileForm("marketingConsent", e.target.checked)
            }
          />
          <span>
            I agree to receive Street Team reward updates, event
            recommendations, and promotional emails.
          </span>
        </label>
      </div>

      <button className="primaryBtn wide" type="submit">
  {isFanProfileLoading ? "Saving..." : "Save Fan Profile"}
</button>

      {fanProfileMessage && <p className="authMessage">{fanProfileMessage}</p>}
    </form>

    {fanProfile && (
      <div className="fanProfileCard">
        <h3>{fanProfile.displayName}</h3>
        <p>{fanProfile.email}</p>
        {fanProfile.homeCity && <p>Home city: <strong>{fanProfile.homeCity}</strong></p>}
        {fanProfile.favoriteEventTypes?.length > 0 && (
          <p>
            Favorite types: <strong>{fanProfile.favoriteEventTypes.join(", ")}</strong>
          </p>
        )}
        <p>
          Marketing updates: <strong>{fanProfile.marketingConsent ? "Yes" : "No"}</strong>
        </p>
      </div>
    )}

    {user && hasFanProfile && (
      <div className="rewardProgressCard">
        <div className="rewardProgressTop">
          <div>
            <p className="eyebrow">Reward Progress</p>
            <h3>{nextReward.label}</h3>
          </div>

          <strong>{rewardProgressPercent}%</strong>
        </div>

        <div className="progressBar">
          <div
            className="progressFill"
            style={{ width: `${rewardProgressPercent}%` }}
          />
        </div>

        <p>
          {pointsToNextReward === 0
            ? "You have enough points for this reward."
            : `${pointsToNextReward} points until your next reward.`}
        </p>
      </div>
    )}
  </section>
)}
        {activeTab === "account" && (
          <>
            {user ? (
              <section className="panel">
                <p className="eyebrow">Account</p>
                <h1>You are logged in.</h1>
                <p>
                  Account: <strong>{user.email}</strong>
                </p>
                <p>
                  Roles:{" "}
                  <strong>
                    {userRoles.length > 0 ? userRoles.join(", ") : "Loading"}
                  </strong>
                </p>
                <button className="dangerBtn" type="button" onClick={handleLogout}>
                  Log Out
                </button>
              </section>
            ) : (
              renderAuthPanel(false)
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
