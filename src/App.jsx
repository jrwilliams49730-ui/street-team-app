import { useEffect, useRef, useState } from "react";
import "./App.css";
import { supabase } from "./supabaseClient";

const emptyForm = {
  title: "",
  type: "Comedy",
  venueName: "",
  streetAddress: "",
  city: "",
  state: "",
  zipCode: "",
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
  venueName: "",
  streetAddress: "",
  city: "",
  state: "",
  zipCode: "",
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

const appBasePath = import.meta.env.BASE_URL;
const ownerAdminRoutePath = `${appBasePath.replace(/\/$/, "")}/street-team-hq`;
const geocodeErrorMessage =
  "We could not verify this address. Please check the venue address and zip code.";
const geocodeWarningMessage =
  "Address could not be verified. You can still save this event, but radius search may be less accurate.";
const flyerMaxUploadBytes = 15 * 1024 * 1024;
const allowedFlyerMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedFlyerExtensions = /\.(jpe?g|png|webp)$/i;
const flyerAcceptTypes = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

const rewardTiers = [
  {
    label: "$5 gift card",
    points: 500,
    dollarAmount: 5,
    rewardType: "gift_card",
  },
  {
    label: "$10 gift card",
    points: 1000,
    dollarAmount: 10,
    rewardType: "gift_card",
  },
  {
    label: "$25 gift card",
    points: 2500,
    dollarAmount: 25,
    rewardType: "gift_card",
  },
  {
    label: "$50 gift card",
    points: 5000,
    dollarAmount: 50,
    rewardType: "gift_card",
  },
];

const configuredOwnerAdminEmails = ["staticentertainmentsc@gmail.com"];

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

  if (transaction.source === "own_paid_ticket_purchase") {
    return transaction.description || "Bought paid ticket";
  }

  if (transaction.source === "share_ticket_purchase") {
    return transaction.description || "Ticket bought from your link";
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

function getRewardConfig(reward) {
  const label = String(reward?.label || reward?.reward_label || "");

  return {
    rewardId: label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
    rewardType: "gift_card",
    selectedRewardType: "gift_card",
    dollarAmount: reward.dollarAmount || Number(label.match(/\$(\d+)/)?.[1] || 0),
  };
}

function isConfiguredOwnerAdminEmail(email) {
  return configuredOwnerAdminEmails.includes(String(email || "").toLowerCase());
}

function formatSupabaseError(error, fallbackMessage) {
  if (!error) return fallbackMessage;

  return [fallbackMessage, error.message, error.code ? `Code: ${error.code}` : ""]
    .filter(Boolean)
    .join(" ");
}

function dedupeTicketReservations(reservations) {
  const statusRank = {
    paid: 4,
    reserved: 3,
    pending_payment: 2,
    cancelled: 1,
    refunded: 1,
  };

  return Object.values(
    (reservations || []).reduce((groupedReservations, reservation) => {
      const purchaseKey =
        reservation.stripe_session_id ||
        reservation.stripe_payment_intent_id ||
        [
          reservation.user_id,
          reservation.event_id,
          reservation.ticket_type_id,
          reservation.reservation_type,
          reservation.quantity,
        ].join(":");
      const currentReservation = groupedReservations[purchaseKey];
      const currentRank = statusRank[currentReservation?.status] || 0;
      const nextRank = statusRank[reservation.status] || 0;

      if (
        !currentReservation ||
        nextRank > currentRank ||
        (nextRank === currentRank &&
          new Date(reservation.updated_at || reservation.created_at).getTime() >
            new Date(
              currentReservation.updated_at || currentReservation.created_at
            ).getTime())
      ) {
        groupedReservations[purchaseKey] = reservation;
      }

      return groupedReservations;
    }, {})
  ).sort(
    (first, second) =>
      new Date(second.created_at).getTime() - new Date(first.created_at).getTime()
  );
}

function getEventPriceFromTicketTypes(ticketTypesForEvent = []) {
  if (!ticketTypesForEvent.length) return "Free";

  const paidPrices = ticketTypesForEvent
    .map((ticketType) => Number(ticketType.price || 0))
    .filter((price) => Number.isFinite(price) && price > 0);

  if (paidPrices.length === 0) return "Free";

  const lowestPrice = Math.min(...paidPrices);
  return `$${lowestPrice.toFixed(2)}`;
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

function getEventAddressSignature(source) {
  return [
    source?.venueName || source?.venue || "",
    source?.streetAddress || "",
    source?.city || "",
    source?.state || "",
    source?.zipCode || "",
  ]
    .map((part) => String(part || "").trim().toLowerCase())
    .join("|");
}

function hasCompleteEventAddress(source) {
  return Boolean(
    String(source?.venueName || source?.venue || "").trim() &&
      String(source?.streetAddress || "").trim() &&
      String(source?.city || "").trim() &&
      String(source?.state || "").trim() &&
      String(source?.zipCode || "").trim()
  );
}

function hasRequiredEventLocation(source) {
  return Boolean(
    (String(source?.venueName || source?.venue || "").trim() ||
      String(source?.streetAddress || "").trim()) &&
      String(source?.city || "").trim() &&
      String(source?.state || "").trim() &&
      String(source?.zipCode || "").trim()
  );
}

async function geocodeEventAddress(addressSource) {
  const { data, error } = await supabase.functions.invoke("geocode-address", {
    body: {
      venue_name: addressSource.venueName || addressSource.venue || "",
      street_address: addressSource.streetAddress || "",
      city: addressSource.city || "",
      state: addressSource.state || "",
      zip_code: addressSource.zipCode || "",
    },
  });

  if (error || data?.error || !Number.isFinite(Number(data?.latitude)) || !Number.isFinite(Number(data?.longitude))) {
    throw new Error(data?.error || error?.message || geocodeErrorMessage);
  }

  return {
    latitude: Number(data.latitude),
    longitude: Number(data.longitude),
  };
}

async function resolveEventCoordinates(addressSource) {
  try {
    return {
      ...(await geocodeEventAddress(addressSource)),
      warning: "",
    };
  } catch (fullAddressError) {
    console.warn("Full event address could not be geocoded:", fullAddressError);
  }

  if (
    String(addressSource?.city || "").trim() &&
    String(addressSource?.state || "").trim() &&
    String(addressSource?.zipCode || "").trim()
  ) {
    try {
      const zipCoordinates = await geocodeEventAddress({
        city: addressSource.city,
        state: addressSource.state,
        zipCode: addressSource.zipCode,
      });

      return {
        ...zipCoordinates,
        warning: geocodeWarningMessage,
      };
    } catch (zipError) {
      console.warn("Event ZIP/city/state could not be geocoded:", zipError);
    }
  }

  return {
    latitude: null,
    longitude: null,
    warning: geocodeWarningMessage,
  };
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
    return "Payment successful. Your ticket will appear in My Team / My Tickets after Stripe confirms it.";
  }

  if (checkoutStatus === "cancelled") {
    return "Checkout canceled. No payment was taken.";
  }

  return "";
}

function getInitialCheckoutReturn() {
  if (typeof window === "undefined") {
    return {
      status: "",
      eventId: null,
    };
  }

  const params = new URLSearchParams(window.location.search);

  return {
    status: params.get("ticket_checkout") || "",
    eventId: Number(params.get("event")) || null,
  };
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

function isTicketQrActive(reservation) {
  if (reservation.reservation_type === "paid") {
    return reservation.status === "paid";
  }

  return reservation.status === "reserved";
}

function getTicketQrPayload(reservation) {
  return JSON.stringify({
    confirmation_code: reservation.confirmation_code || "",
    check_in_token: reservation.check_in_token || "",
    reservation_id: reservation.id,
    event_id: reservation.event_id,
  });
}

function getTicketQrImageUrl(reservation) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
    getTicketQrPayload(reservation)
  )}`;
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
    venue: item.venue_name || item.venue,
    venueName: item.venue_name || item.venue || "",
    streetAddress: item.street_address || "",
    city: item.city,
    state: item.state || "",
    zipCode: item.zip_code || "",
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
  const [activeTab, setActiveTab] = useState("fan");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [myTeamTab, setMyTeamTab] = useState("overview");
  const [producerTab, setProducerTab] = useState("dashboard");

  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [selectedAccountType, setSelectedAccountType] = useState("fan");
  const [userRoles, setUserRoles] = useState([]);
  const [areUserRolesLoaded, setAreUserRolesLoaded] = useState(false);
  const [isSavingProducerAccess, setIsSavingProducerAccess] = useState(false);
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
  const hasOwnerAdminRole =
    userRoles.includes("owner") || userRoles.includes("admin");

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
  const [ownerDashboard, setOwnerDashboard] = useState(null);
  const [isOwnerDashboardLoading, setIsOwnerDashboardLoading] = useState(false);
  const [ownerMessage, setOwnerMessage] = useState("");
  const [ownerSearch, setOwnerSearch] = useState("");
  const [ownerAdminTab, setOwnerAdminTab] = useState("overview");
  const [ownerUserRoleFilter, setOwnerUserRoleFilter] = useState("all");
  const [ownerEventStatusFilter, setOwnerEventStatusFilter] = useState("all");
  const [ownerPointTypeFilter, setOwnerPointTypeFilter] = useState("all");
  const [ownerPointsSourceFilter, setOwnerPointsSourceFilter] = useState("all");
  const [adminAdjustmentForm, setAdminAdjustmentForm] = useState({
    userId: "",
    points: "",
    reason: "",
  });
  const [adminRedemptionNotes, setAdminRedemptionNotes] = useState({});

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
  const [attendeeSearch, setAttendeeSearch] = useState("");
  const [attendeeFilter, setAttendeeFilter] = useState("all");
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyResult, setVerifyResult] = useState(null);
  const [scannerEventId, setScannerEventId] = useState("all");
  const [checkoutReturn, setCheckoutReturn] = useState(getInitialCheckoutReturn);
  const [isScannerActive, setIsScannerActive] = useState(false);
  const [scannerMessage, setScannerMessage] = useState("");
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
  const [isRadiusFilterActive, setIsRadiusFilterActive] = useState(false);
  const [eventLocationSearch, setEventLocationSearch] = useState("");
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
  const scannerVideoRef = useRef(null);
  const scannerTimerRef = useRef(null);
  const scannerStreamRef = useRef(null);
  const isOwnerRoute = window.location.pathname === ownerAdminRoutePath;
  const isOwnerExperience = isOwnerRoute;
  const isWaitingForUserRoles = Boolean(user && !areUserRolesLoaded);

  function resetFanAccountState() {
    setFanProfile(null);
    setUserRoles([]);
    setAreUserRolesLoaded(false);
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
    setAttendeeSearch("");
    setAttendeeFilter("all");
    setVerifyCode("");
    setVerifyResult(null);
    stopQrScanner();
  }

  useEffect(() => {
    rememberReferralShareCode();
  }, []);

  useEffect(() => {
    return () => {
      if (scannerTimerRef.current) {
        clearInterval(scannerTimerRef.current);
      }

      if (scannerStreamRef.current) {
        scannerStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
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
        setAreUserRolesLoaded(false);

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
}, [user]);

  useEffect(() => {
    if (!isOwnerExperience || !user || !hasOwnerAdminRole) return;

    loadOwnerDashboard();
  }, [isOwnerExperience, user, hasOwnerAdminRole]);

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

    setTicketReservations(dedupeTicketReservations(data || []));
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
        "id, user_id, points, transaction_type, event_id, ticket_reservation_id, share_link_id, redemption_id, reward_label, source, description, created_at"
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

async function recordPointTransaction({
  points,
  type,
  eventId = null,
  rewardLabel = "",
  referenceId = null,
  redemptionId = null,
  shareLinkId = null,
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
    redemption_id: redemptionId,
    share_link_id: shareLinkId,
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

async function loadOwnerDashboard() {
  setIsOwnerDashboardLoading(true);
  setOwnerMessage("");

  const { data, error } = await supabase.rpc("get_owner_dashboard");

  setIsOwnerDashboardLoading(false);

  if (error) {
    console.error(error);
    setOwnerMessage("Could not load owner dashboard.");
    return;
  }

  setOwnerDashboard(data || {});
}

async function submitAdminPointAdjustment(event) {
  event.preventDefault();

  const points = Number(adminAdjustmentForm.points);

  if (!adminAdjustmentForm.userId || !Number.isFinite(points) || points === 0) {
    setOwnerMessage("Choose a user and enter a non-zero points amount.");
    return;
  }

  if (!adminAdjustmentForm.reason.trim()) {
    setOwnerMessage("Enter a reason for the point adjustment.");
    return;
  }

  const { error } = await supabase.rpc("admin_adjust_points", {
    p_user_id: adminAdjustmentForm.userId,
    p_points: Math.trunc(points),
    p_reason: adminAdjustmentForm.reason.trim(),
  });

  if (error) {
    console.error(error);
    setOwnerMessage(`Point adjustment failed. ${error.message}`);
    return;
  }

  setOwnerMessage("Point adjustment recorded.");
  setAdminAdjustmentForm({
    userId: "",
    points: "",
    reason: "",
  });
  await loadOwnerDashboard();
}

async function updateRedemptionStatus(redemptionId, status, adminNotes = "") {
  if (status === "approved") {
    const { data, error } = await supabase.functions.invoke("approve-redemption", {
      body: {
        redemption_id: String(redemptionId),
        admin_notes: adminNotes,
      },
    });

    if (error || data?.error) {
      console.error(error || data?.error);
      setOwnerMessage(
        `Could not approve redemption. ${data?.error || error?.message || ""}`
      );
      return;
    }

    setOwnerMessage(
      data?.manual_required
        ? data.message || "Tremendous not configured."
        : "Reward request sent."
    );
    await loadOwnerDashboard();
    return;
  }

  const { error } = await supabase.rpc("admin_update_redemption_status", {
    p_redemption_id: String(redemptionId),
    p_status: status,
    p_admin_notes: adminNotes,
  });

  if (error) {
    console.error(error);
    setOwnerMessage(`Could not update redemption. ${error.message}`);
    return;
  }

  setOwnerDashboard((currentDashboard) =>
    currentDashboard
      ? {
          ...currentDashboard,
          redemptions: (currentDashboard.redemptions || []).map((redemption) =>
            String(redemption.id) === String(redemptionId)
              ? { ...redemption, status }
              : redemption
          ),
        }
      : currentDashboard
  );
  setOwnerMessage(`Reward request marked ${status}.`);
  await loadOwnerDashboard();
}

async function updateAdminUserRole(userId, role, enabled) {
  const { error } = await supabase.rpc("admin_set_user_role", {
    p_user_id: userId,
    p_role: role,
    p_enabled: enabled,
  });

  if (error) {
    console.error(error);
    setOwnerMessage(`Could not update user role. ${error.message}`);
    return;
  }

  setOwnerMessage(`${role} role ${enabled ? "added" : "removed"}.`);
  await loadOwnerDashboard();
}

async function updateAdminUserActive(userId, isActive) {
  const note = isActive
    ? "Reactivated from Street Team HQ"
    : "Deactivated from Street Team HQ";

  const { error } = await supabase.rpc("admin_set_user_active", {
    p_user_id: userId,
    p_is_active: isActive,
    p_note: note,
  });

  if (error) {
    console.error(error);
    setOwnerMessage(`Could not update user status. ${error.message}`);
    return;
  }

  setOwnerMessage(isActive ? "User reactivated." : "User deactivated.");
  await loadOwnerDashboard();
}

async function updateAdminEventStatus(eventId, status) {
  const { error } = await supabase.rpc("admin_update_event_status", {
    p_event_id: eventId,
    p_status: status,
  });

  if (error) {
    console.error(error);
    setOwnerMessage(`Could not update event. ${error.message}`);
    return;
  }

  setOwnerMessage(`Event marked ${status}.`);
  await loadOwnerDashboard();
  await loadEventsFromSupabase();
}

async function deleteAdminEventIfSafe(eventId) {
  const eventToDelete = ownerEvents.find((event) => event.id === eventId);
  const confirmed = window.confirm(
    `Delete ${eventToDelete?.title || "this event"}? This only works when no ticket history exists.`
  );

  if (!confirmed) return;

  const { error } = await supabase.rpc("admin_delete_event_if_safe", {
    p_event_id: eventId,
  });

  if (error) {
    console.error(error);
    setOwnerMessage(`Could not delete event. ${error.message}`);
    return;
  }

  setOwnerMessage("Event deleted.");
  await loadOwnerDashboard();
  await loadEventsFromSupabase();
}

async function resetAdminTestData() {
  const confirmed = window.confirm(
    "Reset test data? This deletes all non-admin users, events, tickets, points, shares, and reward history while preserving the admin account."
  );

  if (!confirmed) return;

  const { data, error } = await supabase.rpc("reset_mvp_test_data", {
    p_admin_email: configuredOwnerAdminEmails[0],
  });

  if (error) {
    console.error("Admin reset failed:", error);
    setOwnerMessage(formatSupabaseError(error, "Admin reset failed."));
    return;
  }

  console.info("Admin reset summary:", data);

  const summary = data || {};
  setOwnerMessage(
    `Reset complete. Deleted: users ${summary.non_admin_users_deleted || 0}, events ${
      summary.events_deleted || 0
    }, tickets ${summary.tickets_deleted || 0}, reservations ${
      summary.reservations_deleted || 0
    }, shares ${summary.share_links_deleted || 0}, referrals ${
      summary.referrals_deleted || 0
    }, points ${summary.points_history_deleted || 0}, rewards ${
      summary.reward_redemptions_deleted || 0
    }, check-ins ${summary.check_ins_scans_deleted || 0}, files ${
      summary.uploaded_files_deleted || 0
    }.`
  );

  await loadOwnerDashboard();
  await loadEventsFromSupabase();
  await loadTicketTypesFromSupabase([]);
}

async function requestRewardRedemption(reward) {
  if (!user) {
    setSelectedAccountType("fan");
    setAuthMode("signup");
    setActiveTab("streetteam");
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
  const rewardConfig = getRewardConfig(reward);

  const { data: redemption, error } = await supabase
    .from("reward_redemptions")
    .insert({
      user_id: user.id,
      fan_display_name: fanDisplayName,
      fan_email: fanEmail,
      reward_label: reward.label,
      points_cost: reward.points,
      points_spent: reward.points,
      dollar_amount: rewardConfig.dollarAmount,
      selected_reward_type: rewardConfig.selectedRewardType,
      reward_id: rewardConfig.rewardId,
      reward_type: rewardConfig.rewardType,
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
    redemptionId: redemption.id,
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
    setActiveTab("streetteam");
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
    setActiveTab("streetteam");
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
  setCheckoutReturn({
    status: "cancelled",
    eventId: Number(new URLSearchParams(window.location.search).get("event")) || null,
  });
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
  setVerifyResult((currentResult) =>
    currentResult?.reservation?.id === reservation.id
      ? {
          ...currentResult,
          status: "checked_in",
          message: "Checked in.",
          reservation: {
            ...currentResult.reservation,
            checked_in: true,
          },
        }
      : currentResult
  );
  await loadProducerTicketReservationsFromSupabase();
  await loadTicketReservationsFromSupabase();
}

function getVerificationResultForCode(code) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  if (!normalizedCode) {
    return {
      status: "invalid",
      message: "Enter a confirmation code.",
    };
  }

  const reservation = producerTicketReservationRows.find(
    (row) => String(row.confirmation_code || "").toUpperCase() === normalizedCode
  );

  if (!reservation) {
    return {
      status: "invalid",
      message: "No valid ticket found for your events.",
    };
  }

  if (
    scannerEventId !== "all" &&
    String(reservation.event_id) !== String(scannerEventId)
  ) {
    return {
      status: "invalid",
      message: "Ticket does not belong to this event.",
      reservation,
    };
  }

  if (reservation.checked_in) {
    return {
      status: "checked_in",
      message: "Already checked in.",
      reservation,
    };
  }

  if (!canCheckInReservation(reservation)) {
    return {
      status: "invalid",
      message: `${formatTicketStatus(reservation.status)} tickets cannot be checked in.`,
      reservation,
    };
  }

  return {
    status: "valid",
    message: "Valid ticket. Ready for check-in.",
    reservation,
  };
}

function verifyTicketByCode(event) {
  event.preventDefault();
  setVerifyResult(getVerificationResultForCode(verifyCode));
}

function getTicketScanPayload(rawValue) {
  try {
    const payload = JSON.parse(rawValue);
    return {
      confirmationCode: payload.confirmation_code || "",
      checkInToken: payload.check_in_token || "",
      reservationId: payload.reservation_id || payload.ticket_order_id || "",
      eventId: payload.event_id || "",
    };
  } catch {
    const confirmationCode = String(rawValue || "").match(/ST-[A-Z0-9]{6}/i)?.[0] || "";
    return {
      confirmationCode,
      checkInToken: "",
      reservationId: "",
      eventId: "",
    };
  }
}

function verifyScannedTicket(rawValue) {
  const payload = getTicketScanPayload(rawValue);

  if (
    payload.eventId &&
    !producerEvents.some((event) => String(event.id) === String(payload.eventId))
  ) {
    setVerifyResult({
      status: "invalid",
      message: "Ticket does not belong to your events.",
    });
    return;
  }

  if (
    scannerEventId !== "all" &&
    payload.eventId &&
    String(payload.eventId) !== String(scannerEventId)
  ) {
    setVerifyResult({
      status: "invalid",
      message: "Ticket does not belong to this event.",
    });
    return;
  }

  const reservation = producerTicketReservationRows.find(
    (row) =>
      (payload.confirmationCode &&
        String(row.confirmation_code || "").toUpperCase() ===
          String(payload.confirmationCode).toUpperCase()) ||
      (payload.checkInToken &&
        String(row.check_in_token || "") === String(payload.checkInToken)) ||
      (payload.reservationId && String(row.id) === String(payload.reservationId))
  );

  if (reservation?.confirmation_code) {
    setVerifyCode(reservation.confirmation_code);
    setVerifyResult(getVerificationResultForCode(reservation.confirmation_code));
    return;
  }

  if (payload.confirmationCode) {
    setVerifyCode(payload.confirmationCode);
    setVerifyResult(getVerificationResultForCode(payload.confirmationCode));
    return;
  }

  setVerifyResult({
    status: "invalid",
    message: "Invalid Ticket.",
  });
}

function stopQrScanner() {
  if (scannerTimerRef.current) {
    clearInterval(scannerTimerRef.current);
    scannerTimerRef.current = null;
  }

  if (scannerStreamRef.current) {
    scannerStreamRef.current.getTracks().forEach((track) => track.stop());
    scannerStreamRef.current = null;
  }

  if (scannerVideoRef.current) {
    scannerVideoRef.current.srcObject = null;
  }

  setIsScannerActive(false);
}

async function startQrScanner() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setScannerMessage("Camera access is not available in this browser.");
    return;
  }

  if (!("BarcodeDetector" in window)) {
    setScannerMessage(
      "This browser does not support camera QR scanning yet. Use manual code lookup."
    );
    return;
  }

  stopQrScanner();
  setScannerMessage("Requesting camera permission...");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
      },
      audio: false,
    });

    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    scannerStreamRef.current = stream;

    if (scannerVideoRef.current) {
      scannerVideoRef.current.srcObject = stream;
      await scannerVideoRef.current.play();
    }

    setIsScannerActive(true);
    setScannerMessage("Scanning...");

    let isDetecting = false;
    scannerTimerRef.current = window.setInterval(async () => {
      if (isDetecting || !scannerVideoRef.current) return;

      isDetecting = true;

      try {
        const codes = await detector.detect(scannerVideoRef.current);
        const rawValue = codes[0]?.rawValue;

        if (rawValue) {
          verifyScannedTicket(rawValue);
          setScannerMessage("QR code scanned.");
          stopQrScanner();
        }
      } catch (error) {
        console.warn("QR scan failed:", error);
      } finally {
        isDetecting = false;
      }
    }, 500);
  } catch (error) {
    console.warn("Camera permission failed:", error);
    setScannerMessage("Camera permission was blocked or unavailable.");
    stopQrScanner();
  }
}

function goToTab(tabName) {
  setSelectedEvent(null);

  if (!user && tabName === "streetteam") {
    setSelectedAccountType("fan");
  }

  if (!user && tabName === "producer") {
    setSelectedAccountType("producer");
  }

  setActiveTab(tabName);
}

function goToMyTickets() {
  setSelectedEvent(null);
  setMyTeamTab("tickets");
  setActiveTab("streetteam");
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
      setActiveTab("streetteam");
      return;
    }

    if (!hasFanRole) {
      const message =
        "This account is not marked as a fan account. Log in with a fan account to earn points.";
      setShareMessage(message);
      alert(message);
      setActiveTab("streetteam");
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
        shareLinkId: shareCode,
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

  function logAdminAccessStatus(currentUser, roles, isOwnerAdminAllowed) {
    if (!import.meta.env.DEV || !currentUser) return;

    console.debug("Admin access check", {
      email: currentUser.email || null,
      profileFound: Boolean(fanProfile),
      roleValue: roles.join(",") || null,
      is_admin: roles.includes("admin") || roles.includes("owner"),
      adminRouteAllowed: Boolean(isOwnerAdminAllowed),
      redirectDestination:
        roles.includes("admin") || roles.includes("owner")
          ? ownerAdminRoutePath
          : null,
    });
  }

  function openOwnerAdminRoute() {
    if (window.location.pathname === ownerAdminRoutePath) return;

    window.location.assign(ownerAdminRoutePath);
  }

  async function resolveUserRoles(currentUser) {
    if (!currentUser) return [];

    let roles = [];

    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", currentUser.id);

    if (error) {
      console.error("Could not load user roles:", error);
    } else {
      roles = (data || []).map((row) => row.role);
    }

    const { data: isOwnerAdminAllowed, error: adminError } =
      await supabase.rpc("is_owner_admin");

    if (adminError) {
      console.error("Could not verify admin access:", adminError);
    }

    if (
      isOwnerAdminAllowed ||
      isConfiguredOwnerAdminEmail(currentUser.email)
    ) {
      roles = Array.from(new Set([...roles, "owner", "admin"]));
    }

    logAdminAccessStatus(currentUser, roles, isOwnerAdminAllowed);

    return roles;
  }

  function getPrimaryRole(roles) {
    if (roles.includes("owner")) {
      return "owner";
    }

    if (roles.includes("admin")) {
      return "admin";
    }

    if (roles.includes(selectedAccountType)) {
      return selectedAccountType;
    }

    return roles[0] ?? null;
  }

  async function getUserRole(currentUser) {
    if (!currentUser) return null;

    const roles = await resolveUserRoles(currentUser);
    setUserRoles(roles);
    setAreUserRolesLoaded(true);

    return getPrimaryRole(roles);
  }

  async function saveUserRoleForUser(userId, role) {
  if (!userId || !role) return { error: null };

  if (role === "producer") {
    setIsSavingProducerAccess(true);
  }

  const { data, error } = await supabase.rpc("set_own_app_role", {
    p_role: role,
  });

  if (role === "producer") {
    setIsSavingProducerAccess(false);
  }

  if (error) {
    console.error("Could not save user role:", error);
    return { error };
  }

  const nextRoles = Array.isArray(data) ? data : [];

  setUserRoles((currentRoles) => {
    const mergedRoles = new Set([...currentRoles, ...nextRoles, role]);
    return Array.from(mergedRoles);
  });

  setAreUserRolesLoaded(true);
  return { error: null, roles: nextRoles };
}

async function loadUserRoles(currentUser) {
  if (!currentUser) {
    setUserRoles([]);
    setAreUserRolesLoaded(false);
    return;
  }

  const roles = await resolveUserRoles(currentUser);
  setUserRoles(roles);
  setAreUserRolesLoaded(true);
}

  async function handleAuthSubmit(event) {
    event.preventDefault();

    const email = authEmail.trim();
    const accountTypeForSubmit =
      activeTab === "producer"
        ? "producer"
        : activeTab === "streetteam"
        ? "fan"
        : selectedAccountType;

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
        const roleResult = await saveUserRoleForUser(
          createdUser.id,
          accountTypeForSubmit
        );

        if (roleResult?.error) {
          setUser(createdUser);
          setAuthMessage(
            formatSupabaseError(
              roleResult.error,
              `Account created, but ${accountTypeForSubmit} access could not be saved.`
            )
          );
          return;
        }

        setUser(createdUser);

        setAuthMessage(
          accountTypeForSubmit === "fan"
            ? "Fan account created. You are logged in."
            : "Producer account created. You are logged in."
        );

        setActiveTab(accountTypeForSubmit === "fan" ? "streetteam" : "producer");

        if (accountTypeForSubmit === "fan") {
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

      let role = (await getUserRole(loggedInUser)) || selectedAccountType;
      setSelectedAccountType(role);

      if (role === "owner" || role === "admin") {
        openOwnerAdminRoute();
        return;
      }

      if (accountTypeForSubmit === "producer" && role !== "producer") {
        const roleResult = await saveUserRoleForUser(loggedInUser.id, "producer");

        if (roleResult?.error) {
          setAuthMessage(
            formatSupabaseError(
              roleResult.error,
              "Logged in, but producer access could not be saved."
            )
          );
          setActiveTab("producer");
          return;
        }

        role = "producer";
        setSelectedAccountType("producer");
      }

      setActiveTab(
        role === "fan"
          ? "streetteam"
          : role === "producer"
          ? "producer"
          : "fan"
      );

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
    setActiveTab("streetteam");
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

    const hasAllowedType = allowedFlyerMimeTypes.has(file.type);
    const hasAllowedExtension = allowedFlyerExtensions.test(file.name || "");

    if (!hasAllowedType && !hasAllowedExtension) {
      alert("Please upload a JPG, JPEG, PNG, or WEBP flyer.");
      return;
    }

    if (file.size > flyerMaxUploadBytes) {
      alert("Flyer must be under 15 MB.");
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
      setActiveTab("producer");
      return;
    }

    if (!form.title || !hasRequiredEventLocation(form) || !form.date || !form.time) {
      alert("Fill out the event name, venue or address, city, state, zip code, date, and time first.");
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

    const eventPriceLabel = form.isTicketed
      ? getEventPriceFromTicketTypes(form.ticketTypes)
      : "Free";
    const coordinates = await resolveEventCoordinates(form);
    if (coordinates.warning) {
      alert(coordinates.warning);
    }

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
      venue: form.venueName,
      venue_name: form.venueName,
      street_address: form.streetAddress,
      city: form.city,
      state: form.state,
      zip_code: form.zipCode,
      event_date: formatDate(form.date),
      event_time: formatTime(form.time),
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      price: eventPriceLabel,
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
      setActiveTab("producer");
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
      venueName: event.venueName || event.venue || "",
      streetAddress: event.streetAddress || "",
      city: event.city || "",
      state: event.state || "",
      zipCode: event.zipCode || "",
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
      setActiveTab("producer");
      return;
    }

    if (
      !editForm.title ||
      !hasRequiredEventLocation(editForm) ||
      !editForm.date ||
      !editForm.time
    ) {
      alert("Fill out the event name, venue or address, city, state, zip code, date, and time first.");
      return;
    }

    const eventPriceLabel = editForm.isTicketed
      ? getEventPriceFromTicketTypes(editForm.ticketTypes)
      : "Free";
    const addressChanged =
      getEventAddressSignature(editForm) !== getEventAddressSignature(originalEvent);
    let coordinates = {
      latitude: originalEvent?.latitude,
      longitude: originalEvent?.longitude,
    };

    if (
      addressChanged ||
      !Number.isFinite(Number(coordinates.latitude)) ||
      !Number.isFinite(Number(coordinates.longitude))
    ) {
      try {
        coordinates = await resolveEventCoordinates(editForm);
        if (coordinates.warning) {
          alert(coordinates.warning);
        }
      } catch (error) {
        console.error(error);
        alert(geocodeWarningMessage);
        coordinates = {
          latitude: null,
          longitude: null,
        };
      }
    }

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
      venue: editForm.venueName,
      venue_name: editForm.venueName,
      street_address: editForm.streetAddress,
      city: editForm.city,
      state: editForm.state,
      zip_code: editForm.zipCode,
      event_date: editForm.date,
      event_time: editForm.time,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      price: eventPriceLabel,
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
      setActiveTab("producer");
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

    const { error } = await supabase.rpc("delete_own_event", {
      p_event_id: eventId,
    });

    if (error) {
      console.error("Could not delete event from Supabase:", error);
      alert(formatSupabaseError(error, "Could not delete event from Supabase."));
      return;
    }

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

const normalizedLocationSearch = eventLocationSearch.trim().toLowerCase();
const eventsMatchingLocationSearch = normalizedLocationSearch
  ? eventsWithDistance.filter((event) =>
      [
        event.venue,
        event.venueName,
        event.streetAddress,
        event.city,
        event.state,
        event.zipCode,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(normalizedLocationSearch)
        )
    )
  : eventsWithDistance;

const visibleEvents =
  isRadiusFilterActive && userLocation && hasAnyEventCoordinates
    ? eventsWithDistance
        .filter(
          (event) =>
            event.distanceMiles !== null && event.distanceMiles <= radiusMiles
        )
        .sort((firstEvent, secondEvent) => {
          if (firstEvent.distanceMiles === null) return 1;
          if (secondEvent.distanceMiles === null) return -1;
          return firstEvent.distanceMiles - secondEvent.distanceMiles;
        })
    : eventsMatchingLocationSearch;

const locationMessage = userLocation
  ? isRadiusFilterActive && hasAnyEventCoordinates
    ? `Showing events within ${radiusMiles} miles.`
    : "Showing all upcoming events."
  : locationStatus === "denied"
  ? "Location was not shared. Search by city or zip code instead."
  : locationStatus === "unavailable"
  ? "Location is not available in this browser. Search by city or zip code instead."
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
    eventVenue: event?.venue || "",
    eventCity: event?.city || "",
  };
});

const pointTotals = pointHistory.reduce(
  (totals, transaction) => {
    const points = Number(transaction.points || 0);
    if (points > 0) totals.earned += points;
    if (points < 0) totals.redeemed += Math.abs(points);
    return totals;
  },
  { earned: 0, redeemed: 0 }
);

function getEventDateValue(date, time = "") {
  const parsed = new Date(`${date || ""} ${time || ""}`.trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isPastTicketReservation(reservation) {
  const eventDate = getEventDateValue(reservation.eventDate, reservation.eventTime);
  return eventDate ? eventDate < new Date() : false;
}

function isPastProducerEvent(event) {
  const eventDate = getEventDateValue(event.date, event.time);
  return eventDate ? eventDate < new Date() : false;
}

const upcomingFanTicketReservations = fanTicketReservations.filter(
  (reservation) => !isPastTicketReservation(reservation)
);

const pastFanTicketReservations = fanTicketReservations.filter(
  isPastTicketReservation
);

const upcomingProducerEvents = producerEvents.filter(
  (event) => !isPastProducerEvent(event)
);

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

const producerTicketsSold = producerTicketReservationRows
  .filter((reservation) => ["paid", "reserved"].includes(reservation.status))
  .reduce((total, reservation) => total + Number(reservation.quantity || 0), 0);

const recentProducerCheckIns = producerTicketReservationRows
  .filter((reservation) => reservation.checked_in)
  .sort(
    (first, second) =>
      new Date(second.checked_in_at || second.created_at).getTime() -
      new Date(first.checked_in_at || first.created_at).getTime()
  )
  .slice(0, 5);

const attendeeSearchText = attendeeSearch.trim().toLowerCase();

const visibleProducerTicketReservationRows = attendeeSearchText
  ? producerTicketReservationRows.filter((reservation) =>
      [
        reservation.attendeeName,
        reservation.attendeeEmail,
        reservation.fan_email,
        reservation.confirmation_code,
        reservation.eventTitle,
        reservation.ticketTypeName,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(attendeeSearchText)
        )
    )
  : producerTicketReservationRows;

const filteredProducerTicketReservationRows = visibleProducerTicketReservationRows.filter(
  (reservation) => {
    if (attendeeFilter === "checked_in") return Boolean(reservation.checked_in);
    if (attendeeFilter === "not_checked_in") return !reservation.checked_in;
    return true;
  }
);

const ownerSearchText = ownerSearch.trim().toLowerCase();

const ownerUsers = ownerDashboard?.users || [];
const ownerProducers = ownerDashboard?.producers || [];
const ownerEvents = ownerDashboard?.events || [];
const ownerTickets = ownerDashboard?.tickets || [];
const ownerRedemptions = ownerDashboard?.redemptions || [];
const ownerPoints = ownerDashboard?.points || [];
const ownerSuspicious = ownerDashboard?.suspicious || [];
const ownerTotals = ownerDashboard?.totals || {};
const pendingOwnerRedemptions = ownerRedemptions.filter(
  (item) => item.status === "pending"
);
const totalOwnerTicketSalesCents = Number(ownerTotals.ticket_sales_cents || 0);
const recentOwnerActivity = [
  ...ownerRedemptions.map((item) => ({
    id: `redemption-${item.id}`,
    type: "Redemption",
    label: item.reward_label,
    detail: item.user_email || item.fan_email || item.user_id,
    created_at: item.created_at,
  })),
  ...ownerPoints.map((item) => ({
    id: `points-${item.id}`,
    type: "Points",
    label: `${Number(item.points || 0) > 0 ? "+" : ""}${Number(
      item.points || 0
    ).toLocaleString()} points`,
    detail: item.description || item.source || item.transaction_type,
    created_at: item.created_at,
  })),
]
  .filter((item) => item.created_at)
  .sort(
    (first, second) =>
      new Date(second.created_at).getTime() - new Date(first.created_at).getTime()
  )
  .slice(0, 8);

const matchesOwnerSearch = (values) =>
  !ownerSearchText ||
  values
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(ownerSearchText));

const visibleOwnerUsers = ownerUsers.filter((item) => {
  const roles = item.roles || [];
  const matchesRole =
    ownerUserRoleFilter === "all" ||
    (ownerUserRoleFilter === "active" && item.is_active !== false) ||
    (ownerUserRoleFilter === "deactivated" && item.is_active === false) ||
    roles.includes(ownerUserRoleFilter);

  return (
    matchesRole &&
    matchesOwnerSearch([
      item.email,
      item.profile_email,
      item.display_name,
      roles.join(" "),
    ])
  );
});

const visibleOwnerEvents = ownerEvents.filter((item) => {
  const status = item.status || "active";
  const matchesStatus =
    ownerEventStatusFilter === "all" || status === ownerEventStatusFilter;

  return (
    matchesStatus &&
    matchesOwnerSearch([
      item.title,
      item.venue,
      item.city,
      item.owner_email,
      status,
      item.event_date,
    ])
  );
});

const visibleOwnerTickets = ownerTickets.filter((item) =>
  matchesOwnerSearch([
    item.buyer_email,
    item.event_title,
    item.ticket_type,
    item.confirmation_code,
    item.status,
  ])
);

const visibleOwnerRedemptions = ownerRedemptions.filter((item) =>
  matchesOwnerSearch([
    item.user_email,
    item.fan_email,
    item.fan_display_name,
    item.reward_label,
    item.status,
  ])
);

const visibleOwnerPoints = ownerPoints.filter((item) => {
  const source = item.source || item.transaction_type || "";
  const points = Number(item.points || 0);
  const matchesSource =
    ownerPointsSourceFilter === "all" || source === ownerPointsSourceFilter;
  const matchesType =
    ownerPointTypeFilter === "all" ||
    (ownerPointTypeFilter === "earned" && points > 0) ||
    (ownerPointTypeFilter === "redeemed" && points < 0);

  return (
    matchesSource &&
    matchesType &&
    matchesOwnerSearch([
      item.user_email,
      item.source,
      item.transaction_type,
      item.description,
      item.reward_label,
      item.reference_id,
      item.ticket_reservation_id,
    ])
  );
});

  function getTicketTypesForEvent(eventId) {
    return ticketTypes.filter((ticketType) => ticketType.eventId === eventId);
  }

  function openCheckoutReturnEvent() {
    const eventFromCheckout = events.find(
      (event) => event.id === checkoutReturn.eventId
    );

    if (eventFromCheckout) {
      openEvent(eventFromCheckout);
      return;
    }

    setActiveTab("fan");
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

  function renderAuthPanel(compact = false, lockedRole = null) {
    const isLockedToFan = lockedRole === "fan";
    const isLockedToProducer = lockedRole === "producer";

    return (
      <section className={compact ? "authPanel compactAuth" : "authPanel"}>
        <p className="eyebrow">
          {isLockedToProducer ? "Producer Account" : "Street Team Account"}
        </p>
        <h1>{authMode === "login" ? "Log in." : "Create account."}</h1>

        {!lockedRole && (
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
        )}

        <p>
          {isLockedToProducer
            ? "Log in or create a producer account to create events, upload fliers, and track attendees."
            : isLockedToFan
            ? "Log in or create a fan account to track points, rewards, and tickets."
            : "Choose how you want to use Street Team. Fans earn rewards by sharing. Producers create events and track who helped promote."}
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

  if (isOwnerExperience) {
    return (
      <div className="app">
        <header className="topbar">
          <div className="logoWrap">
            <img
              className="brandHeaderLogo"
              src={`${import.meta.env.BASE_URL}assets/header-logo.png`}
              alt="Street Team"
            />
            <div className="tagline">Control Center</div>
          </div>
        </header>

        <main className="content">
          {isWaitingForUserRoles && (
            <section className="panel">
              <p className="eyebrow">Loading</p>
              <h1>Checking access.</h1>
            </section>
          )}

          {!user && renderAuthPanel(true)}

          {user && !isWaitingForUserRoles && !hasOwnerAdminRole && (
            <section className="panel">
              <p className="eyebrow">Not Found</p>
              <h1>This page is not available.</h1>
              <p>Use a different account if you believe you should have access.</p>
            </section>
          )}

          {user && !isWaitingForUserRoles && hasOwnerAdminRole && (
            <section className="panel">
              <p className="eyebrow">Owner</p>
              <h1>Street Team HQ</h1>
              <p>System-wide operations for authorized owner/admin accounts.</p>

              {ownerMessage && <p className="authMessage">{ownerMessage}</p>}

              <div className="eventActions">
                <button
                  className="secondaryBtn"
                  type="button"
                  onClick={loadOwnerDashboard}
                  disabled={isOwnerDashboardLoading}
                >
                  {isOwnerDashboardLoading ? "Refreshing..." : "Refresh"}
                </button>
                <button
                  className="secondaryBtn"
                  type="button"
                  onClick={handleLogout}
                >
                  Sign Out
                </button>
                <button
                  className="dangerBtn"
                  type="button"
                  onClick={resetAdminTestData}
                >
                  Reset Test Data
                </button>
              </div>

              <div className="tabs sectionTabs">
                {[
                  ["overview", "Overview"],
                  ["users", "Users"],
                  ["events", "Events"],
                  ["redemptions", "Redemptions"],
                  ["points", "Points / Logs"],
                ].map(([tabId, label]) => (
                  <button
                    className={ownerAdminTab === tabId ? "tab active" : "tab"}
                    key={tabId}
                    type="button"
                    onClick={() => setOwnerAdminTab(tabId)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <label className="formField">
                Search
                <input
                  value={ownerSearch}
                  onChange={(event) => setOwnerSearch(event.target.value)}
                  placeholder="Name, email, event, ticket, code, or reference"
                />
              </label>

              {ownerAdminTab === "overview" && (
              <div className="producerGrid">
                <div className="miniCard">
                  <strong>{ownerUsers.length}</strong>
                  <span>Total Users</span>
                </div>
                <div className="miniCard">
                  <strong>{ownerEvents.length}</strong>
                  <span>Total Events</span>
                </div>
                <div className="miniCard">
                  <strong>{pendingOwnerRedemptions.length}</strong>
                  <span>Pending Redemptions</span>
                </div>
                <div className="miniCard">
                  <strong>${(totalOwnerTicketSalesCents / 100).toFixed(2)}</strong>
                  <span>Ticket Sales</span>
                </div>
              </div>
              )}

              {ownerAdminTab === "overview" && (
              <section className="managerSection">
                <div className="sectionHeader smallHeader">
                  <h2>Recent Activity</h2>
                  <p>Latest redemption and points ledger activity.</p>
                </div>
                <div className="rewardsList">
                  {recentOwnerActivity.length === 0 ? (
                    <div className="rewardCard">
                      <div>
                        <h3>No recent activity.</h3>
                        <p>New activity will appear here.</p>
                      </div>
                    </div>
                  ) : (
                    recentOwnerActivity.map((item) => (
                      <div className="rewardCard" key={item.id}>
                        <div>
                          <h3>{item.type}: {item.label}</h3>
                          <p>{item.detail || "System activity"}</p>
                          <p className="rewardStatus">
                            {new Date(item.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
              )}

              {ownerAdminTab === "points" && (
              <section className="managerSection">
                <div className="sectionHeader smallHeader">
                  <h2>Manual Points Adjustment</h2>
                  <p>Every adjustment creates a ledger record.</p>
                </div>
                <form className="createForm" onSubmit={submitAdminPointAdjustment}>
                  <div className="formGrid">
                    <label className="formField">
                      User
                      <select
                        value={adminAdjustmentForm.userId}
                        onChange={(event) =>
                          setAdminAdjustmentForm((currentForm) => ({
                            ...currentForm,
                            userId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Choose user</option>
                        {ownerUsers.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.email || item.profile_email || item.id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="formField">
                      Points
                      <input
                        type="number"
                        value={adminAdjustmentForm.points}
                        onChange={(event) =>
                          setAdminAdjustmentForm((currentForm) => ({
                            ...currentForm,
                            points: event.target.value,
                          }))
                        }
                        placeholder="Example: 25 or -25"
                      />
                    </label>
                    <label className="formField fullSpan">
                      Reason
                      <input
                        value={adminAdjustmentForm.reason}
                        onChange={(event) =>
                          setAdminAdjustmentForm((currentForm) => ({
                            ...currentForm,
                            reason: event.target.value,
                          }))
                        }
                        placeholder="Required audit reason"
                      />
                    </label>
                  </div>
                  <button className="primaryBtn" type="submit">
                    Record Adjustment
                  </button>
                </form>
              </section>
              )}

              {ownerAdminTab === "users" && (
              <section className="managerSection">
                <div className="sectionHeader smallHeader">
                  <h2>Users</h2>
                  <p>Account basics, roles, point balances, and safe deactivation.</p>
                </div>
                <label className="formField">
                  Role / Status
                  <select
                    value={ownerUserRoleFilter}
                    onChange={(event) => setOwnerUserRoleFilter(event.target.value)}
                  >
                    <option value="all">All users</option>
                    <option value="fan">Fans</option>
                    <option value="producer">Producers</option>
                    <option value="admin">Admins</option>
                    <option value="active">Active</option>
                    <option value="deactivated">Deactivated</option>
                  </select>
                </label>
                <div className="rewardsList">
                  {visibleOwnerUsers.slice(0, 50).map((item) => (
                    <div className="rewardCard" key={item.id}>
                      <div>
                        <h3>{item.display_name || item.email || "User"}</h3>
                        <p>{item.email || item.profile_email || item.id}</p>
                        <p className="rewardStatus">
                          {(item.roles || []).join(", ") || "No role"} Â·{" "}
                          {Number(item.points_balance || 0).toLocaleString()} points Â·{" "}
                          {item.created_at
                            ? new Date(item.created_at).toLocaleDateString()
                            : "Unknown date"}
                        </p>
                        <p className="rewardStatus">
                          {item.is_active === false ? "Deactivated" : "Active"}
                          {item.deactivated_at
                            ? ` Â· ${new Date(item.deactivated_at).toLocaleString()}`
                            : ""}
                        </p>
                      </div>
                      <div className="eventActions">
                        {["fan", "producer", "admin"].map((role) => {
                          const hasRole = (item.roles || []).includes(role);

                          return (
                            <button
                              className={hasRole ? "secondaryBtn" : "primaryBtn"}
                              disabled={item.id === user.id && role === "admin" && hasRole}
                              key={role}
                              type="button"
                              onClick={() =>
                                updateAdminUserRole(item.id, role, !hasRole)
                              }
                            >
                              {hasRole ? `Remove ${role}` : `Add ${role}`}
                            </button>
                          );
                        })}
                        <button
                          className={item.is_active === false ? "primaryBtn" : "dangerBtn"}
                          disabled={item.id === user.id}
                          type="button"
                          onClick={() =>
                            updateAdminUserActive(item.id, item.is_active === false)
                          }
                        >
                          {item.is_active === false ? "Reactivate" : "Deactivate"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              )}

              {ownerAdminTab === "users" && (
              <section className="managerSection">
                <div className="sectionHeader smallHeader">
                  <h2>Producers</h2>
                  <p>Producer accounts and event counts.</p>
                </div>
                <div className="rewardsList">
                  {ownerProducers.slice(0, 50).map((item) => (
                    <div className="rewardCard" key={item.id}>
                      <div>
                        <h3>{item.display_name || item.email || "Producer"}</h3>
                        <p>{item.email || item.id}</p>
                        <p className="rewardStatus">
                          {item.event_count || 0} events Â· Producer approval/suspension
                          is not in the current schema yet.
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              )}

              {ownerAdminTab === "events" && (
              <section className="managerSection">
                <div className="sectionHeader smallHeader">
                  <h2>Events</h2>
                  <p>All events across producers.</p>
                </div>
                <label className="formField">
                  Status
                  <select
                    value={ownerEventStatusFilter}
                    onChange={(event) => setOwnerEventStatusFilter(event.target.value)}
                  >
                    <option value="all">All events</option>
                    <option value="active">Active</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
                <div className="rewardsList">
                  {visibleOwnerEvents.slice(0, 75).map((item) => (
                    <div className="rewardCard" key={item.id}>
                      <div>
                        <h3>{item.title}</h3>
                        <p>
                          {item.venue} Â· {item.city} Â· {item.event_date} {item.event_time}
                        </p>
                        <p className="rewardStatus">
                          {item.owner_email || item.owner_id} ·{" "}
                          {item.is_ticketed ? "Ticketed" : "Not ticketed"} ·{" "}
                          {item.status || "active"} · {item.ticket_count || 0} tickets/orders
                        </p>
                      </div>
                      <div className="eventActions">
                        <button className="secondaryBtn" type="button" onClick={() => updateAdminEventStatus(item.id, "active")}>
                          Activate
                        </button>
                        <button className="secondaryBtn" type="button" onClick={() => updateAdminEventStatus(item.id, "cancelled")}>
                          Cancel
                        </button>
                        <button className="secondaryBtn" type="button" onClick={() => updateAdminEventStatus(item.id, "archived")}>
                          Archive
                        </button>
                        <button className="dangerBtn" type="button" disabled={Number(item.ticket_count || 0) > 0} onClick={() => deleteAdminEventIfSafe(item.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              )}

              {ownerAdminTab === "events" && (
              <section className="managerSection">
                <div className="sectionHeader smallHeader">
                  <h2>Tickets / Orders</h2>
                  <p>Paid orders, free RSVPs, pending, canceled, refunded, and check-ins.</p>
                </div>
                <div className="rewardsList">
                  {visibleOwnerTickets.slice(0, 100).map((item) => (
                    <div className="rewardCard" key={item.id}>
                      <div>
                        <h3>{item.event_title || "Event"}</h3>
                        <p>
                          {item.ticket_type || "Ticket"} Â· Qty {item.quantity} Â·{" "}
                          {formatTicketStatus(item.status)}
                        </p>
                        <p className="rewardStatus">
                          {item.buyer_email || item.user_id} Â·{" "}
                          {item.confirmation_code || "No code"} Â·{" "}
                          {item.checked_in ? "Checked in" : "Not checked in"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              )}

              {ownerAdminTab === "redemptions" && (
              <section className="managerSection">
                <div className="sectionHeader smallHeader">
                  <h2>Rewards / Redemptions</h2>
                  <p>Update request status without changing points again.</p>
                </div>
                <div className="rewardsList">
                  {visibleOwnerRedemptions.slice(0, 100).map((item) => (
                    <div className="rewardCard" key={item.id}>
                      <div>
                        <h3>{item.reward_label}</h3>
                        <p>
                          {item.fan_display_name || item.user_email || item.user_id} Â·{" "}
                          {item.points_cost} points Â· {item.status}
                        </p>
                        <p className="rewardStatus">
                          {item.created_at
                            ? new Date(item.created_at).toLocaleString()
                            : "Unknown date"}
                        </p>
                        {item.tremendous_order_id && (
                          <p className="rewardStatus">
                            Tremendous order: <strong>{item.tremendous_order_id}</strong>
                          </p>
                        )}
                        {item.tremendous_external_id && (
                          <p className="rewardStatus">
                            External ID: <strong>{item.tremendous_external_id}</strong>
                          </p>
                        )}
                        {item.error_message && (
                          <p className="rewardStatus">
                            Error: <strong>{item.error_message}</strong>
                          </p>
                        )}
                        {item.admin_notes && (
                          <p className="rewardStatus">
                            Notes: <strong>{item.admin_notes}</strong>
                          </p>
                        )}
                        <label className="formField">
                          Fulfillment Notes
                          <textarea
                            value={adminRedemptionNotes[item.id] ?? item.admin_notes ?? ""}
                            onChange={(event) =>
                              setAdminRedemptionNotes((currentNotes) => ({
                                ...currentNotes,
                                [item.id]: event.target.value,
                              }))
                            }
                            placeholder="Provider, amount, confirmation/reference number"
                          />
                        </label>
                      </div>
                      <select
                        value={item.status || "pending"}
                        onChange={(event) =>
                          updateRedemptionStatus(
                            item.id,
                            event.target.value,
                            adminRedemptionNotes[item.id] ?? item.admin_notes ?? ""
                          )
                        }
                      >
                        <option value="pending">pending</option>
                        <option value="approved">Approve / Send</option>
                        <option value="sent">sent</option>
                        <option value="manually_sent">manually_sent</option>
                        <option value="canceled">canceled</option>
                        <option value="failed">failed</option>
                      </select>
                    </div>
                  ))}
                </div>
              </section>
              )}

              {ownerAdminTab === "points" && (
              <section className="managerSection">
                <div className="sectionHeader smallHeader">
                  <h2>Points History</h2>
                  <p>Earned and redeemed ledger entries.</p>
                </div>
                <label className="formField">
                  Type
                  <select
                    value={ownerPointTypeFilter}
                    onChange={(event) => setOwnerPointTypeFilter(event.target.value)}
                  >
                    <option value="all">All entries</option>
                    <option value="earned">Earned</option>
                    <option value="redeemed">Redeemed</option>
                  </select>
                </label>
                <label className="formField">
                  Source
                  <select
                    value={ownerPointsSourceFilter}
                    onChange={(event) =>
                      setOwnerPointsSourceFilter(event.target.value)
                    }
                  >
                    <option value="all">All sources</option>
                    <option value="share_reward">share_link</option>
                    <option value="own_paid_ticket_purchase">ticket_purchase</option>
                    <option value="share_ticket_purchase">share_ticket_purchase</option>
                    <option value="reward_redemption">reward_redemption</option>
                    <option value="admin_adjustment">admin_adjustment</option>
                  </select>
                </label>
                <div className="rewardsList">
                  {visibleOwnerPoints.slice(0, 150).map((item) => (
                    <div className="rewardCard" key={item.id}>
                      <div>
                        <h3>
                          {Number(item.points || 0) > 0 ? "+" : ""}
                          {Number(item.points || 0).toLocaleString()} points
                        </h3>
                        <p>
                          {item.user_email || item.user_id} Â·{" "}
                          {item.source || item.transaction_type || "points"}
                        </p>
                        <p className="rewardStatus">
                          {item.description || item.reward_label || "Ledger entry"} Â·{" "}
                          {item.created_at
                            ? new Date(item.created_at).toLocaleString()
                            : "Unknown date"}
                        </p>
                        <p className="rewardStatus">
                          Reference: {item.reference_id || item.ticket_reservation_id || "none"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              )}

              {ownerAdminTab === "overview" && (
              <section className="managerSection">
                <div className="sectionHeader smallHeader">
                  <h2>Suspicious Activity</h2>
                  <p>Simple high-volume point activity signals for now.</p>
                </div>
                <div className="rewardsList">
                  {ownerSuspicious.length === 0 ? (
                    <div className="rewardCard">
                      <div>
                        <h3>No suspicious activity found.</h3>
                        <p>Blocked share attempts are not currently recorded.</p>
                      </div>
                    </div>
                  ) : (
                    ownerSuspicious.map((item) => (
                      <div
                        className="rewardCard"
                        key={`${item.activity_type}-${item.user_id}`}
                      >
                        <div>
                          <h3>{item.activity_type}</h3>
                          <p>{item.email || item.user_id}</p>
                          <p className="rewardStatus">
                            {item.transaction_count} transactions Â· {item.point_total} points
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
              )}
            </section>
          )}
        </main>
      </div>
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
            className={
              activeTab === "fan" || activeTab === "event"
                ? "tab active"
                : "tab"
            }
            onClick={() => goToTab("fan")}
          >
            Events
          </button>
          <button
            className={
              activeTab === "streetteam" ? "tab active" : "tab"
            }
            onClick={() => {
              setMyTeamTab("overview");
              goToTab("streetteam");
            }}
          >
            Fan
          </button>
          <button
            className={activeTab === "producer" ? "tab active" : "tab"}
            onClick={() => goToTab("producer")}
          >
            Producer
          </button>
        </nav>
      </header>

      <main className="content">
        {ticketMessage && activeTab !== "event" && activeTab !== "streetteam" && (
          <div className="authMessage">
            <p>{ticketMessage}</p>
            {checkoutReturn.status === "success" && (
              <button
                className="secondaryBtn"
                type="button"
                onClick={() => goToTab("streetteam")}
              >
                View My Tickets
              </button>
            )}
            {checkoutReturn.status === "cancelled" && (
              <button
                className="secondaryBtn"
                type="button"
                onClick={openCheckoutReturnEvent}
              >
                Return to Event
              </button>
            )}
          </div>
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
      <h2>Featured Events</h2>
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
              {event.city} Â· {event.date} Â· {event.time}
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
      <h2>Your brand could own this cityâ€™s live event feed.</h2>
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
                <h1>Events worth leaving the house for.</h1>
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
                        goToTab("streetteam");
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
              {userLocation && (
                <label className="formField">
                  Radius
                  <select
                    value={radiusMiles}
                    onChange={(e) => {
                      setRadiusMiles(Number(e.target.value));
                      setIsRadiusFilterActive(true);
                    }}
                  >
                    <option value={5}>5 miles</option>
                    <option value={10}>10 miles</option>
                    <option value={25}>25 miles</option>
                    <option value={50}>50 miles</option>
                  </select>
                </label>
              )}
              {!userLocation && (
                <label className="formField">
                  City or ZIP
                  <input
                    value={eventLocationSearch}
                    onChange={(e) => {
                      setEventLocationSearch(e.target.value);
                      setIsRadiusFilterActive(false);
                    }}
                    placeholder="Myrtle Beach or 29577"
                  />
                </label>
              )}
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
                  <h3>No matching events.</h3>
                  <p>
                    Try expanding the radius, searching another city or zip code,
                    or check back when more shows are added.
                  </p>
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
                      {event.city} Â· {event.date} Â· {event.time}
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
              â† Back to events
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
              {checkoutReturn.status === "cancelled" && (
                <p className="authMessage">
                  Checkout canceled. You can choose tickets again below.
                </p>
              )}

              <section className="ticketPanel">
                  <div className="sectionHeader smallHeader">
                    <h2>Tickets</h2>
                    <p>Reserve free RSVPs or choose paid tickets for Stripe checkout.</p>
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
                                {" Â· "}
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
        {authMessage ||
          "This account is not marked as a producer account. Sign up from Producer with a producer account to manage events."}
      </p>
    )}

    {user && !hasProducerRole ? (
      <div className="eventActions">
        <button
          className="secondaryBtn"
          type="button"
          onClick={handleLogout}
        >
          Log Out
        </button>
      </div>
    ) : (
      renderAuthPanel(false, "producer")
    )}
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
            <div className="eventActions">
              <button className="secondaryBtn" type="button" onClick={handleLogout}>
                Log Out
              </button>
            </div>

            <div className="tabs sectionTabs">
              {[
                ["dashboard", "Dashboard"],
                ["events", "Events"],
                ["tickets", "Tickets"],
                ["scanner", "Scanner"],
              ].map(([tabId, label]) => (
                <button
                  className={producerTab === tabId ? "tab active" : "tab"}
                  key={tabId}
                  type="button"
                  onClick={() => setProducerTab(tabId)}
                >
                  {label}
                </button>
              ))}
            </div>

            {producerTab === "dashboard" && (
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
                <span>Link Opens</span>
              </div>
              <div className="miniCard">
                <strong>{upcomingProducerEvents.length}</strong>
                <span>Upcoming Events</span>
              </div>
              <div className="miniCard">
                <strong>{producerTicketsSold}</strong>
                <span>Tickets Sold</span>
              </div>
              <div className="miniCard">
                <strong>{attendeeCounts.checkedIn}</strong>
                <span>Recent Check-ins</span>
              </div>
            </div>
            )}

            {producerTab === "dashboard" && (
              <section className="managerSection">
                <div className="sectionHeader smallHeader">
                  <h2>Status</h2>
                  <p>Your event and ticket setup at a glance.</p>
                </div>
                <div className="rewardsList">
                  <div className="rewardCard">
                    <div>
                      <h3>{upcomingProducerEvents.length} upcoming event(s)</h3>
                      <p>Use the Events tab to create or edit shows.</p>
                    </div>
                  </div>
                  <div className="rewardCard">
                    <div>
                      <h3>{recentProducerCheckIns.length} latest check-in(s)</h3>
                      <p>
                        {recentProducerCheckIns.length
                          ? recentProducerCheckIns
                              .map((item) => item.attendeeName)
                              .join(", ")
                          : "No check-ins yet."}
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {producerTab === "events" && (
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
                        {event.city} Â· {event.date} Â· {event.time}
                      </p>
                      <div className="shareStats">
                        <span>
                          Shares: <strong>{shareStats[event.id]?.shares || 0}</strong>
                        </span>
                        <span>
                          Opens: <strong>{shareStats[event.id]?.visits || 0}</strong>
                        </span>
                      </div>

                      {shareStats[event.id]?.promoters?.length > 0 && (
                        <div className="promoterList">
                          <strong>Top Promoters</strong>

                          {shareStats[event.id].promoters.slice(0, 3).map((promoter) => (
                            <div className="promoterRow" key={promoter.name}>
                              <span>{promoter.name}</span>
                              <em>
                                {promoter.shares} shares Â· {promoter.visits} visits Â· {" "}
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
                              Venue Name
                              <input
                                value={editForm.venueName}
                                onChange={(e) =>
                                  updateEditForm("venueName", e.target.value)
                                }
                              />
                            </label>

                            <label className="formField fullSpan">
                              Street Address
                              <input
                                value={editForm.streetAddress}
                                onChange={(e) =>
                                  updateEditForm("streetAddress", e.target.value)
                                }
                                placeholder="Example: 123 Main St"
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
                              State
                              <input
                                value={editForm.state}
                                onChange={(e) =>
                                  updateEditForm("state", e.target.value)
                                }
                                placeholder="SC"
                              />
                            </label>

                            <label className="formField">
                              Zip Code
                              <input
                                value={editForm.zipCode}
                                onChange={(e) =>
                                  updateEditForm("zipCode", e.target.value)
                                }
                                placeholder="29575"
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
                                accept={flyerAcceptTypes}
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
            )}

            {(producerTab === "tickets" || producerTab === "scanner") && (
            <section className="managerSection">
              <div className="sectionHeader smallHeader">
                <h2>{producerTab === "scanner" ? "Scanner" : "Tickets"}</h2>
                <p>
                  {producerTab === "scanner"
                    ? "Scan or verify confirmation codes for check-in."
                    : "Free RSVPs and paid ticket purchases for your events."}
                </p>
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

                  {producerTab === "scanner" && (
                  <form className="createForm" onSubmit={verifyTicketByCode}>
                    <div className="sectionHeader smallHeader">
                      <h2>Verify Ticket</h2>
                      <p>Type or paste a confirmation code from a fan ticket.</p>
                    </div>
                    <div className="formGrid">
                      <label className="formField">
                        Event
                        <select
                          value={scannerEventId}
                          onChange={(event) => setScannerEventId(event.target.value)}
                        >
                          <option value="all">All producer events</option>
                          {producerEvents.map((event) => (
                            <option key={event.id} value={event.id}>
                              {event.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="formField">
                        Confirmation Code
                        <input
                          value={verifyCode}
                          onChange={(event) => setVerifyCode(event.target.value)}
                          placeholder="ST-8K4P2Q"
                        />
                      </label>
                      <button className="primaryBtn" type="submit">
                        Verify
                      </button>
                    </div>
                    <div className="eventActions">
                      <button
                        className="secondaryBtn"
                        type="button"
                        onClick={isScannerActive ? stopQrScanner : startQrScanner}
                      >
                        {isScannerActive ? "Stop Scanner" : "Open QR Scanner"}
                      </button>
                    </div>
                    <video
                      className={isScannerActive ? "qrScannerVideo active" : "qrScannerVideo"}
                      ref={scannerVideoRef}
                      muted
                      playsInline
                    />
                    {scannerMessage && (
                      <p className="authMessage">{scannerMessage}</p>
                    )}
                    {verifyResult && (
                      <div className="rewardCard">
                        <div>
                          <h3>{verifyResult.message}</h3>
                          {verifyResult.reservation && (
                            <p>
                              {verifyResult.reservation.attendeeName} Â·{" "}
                              {verifyResult.reservation.eventTitle} Â·{" "}
                              {verifyResult.reservation.confirmation_code}
                            </p>
                          )}
                        </div>
                        {verifyResult.status === "valid" && (
                          <button
                            className="primaryBtn"
                            type="button"
                            onClick={() =>
                              checkInTicketReservation(verifyResult.reservation)
                            }
                          >
                            Check In
                          </button>
                        )}
                      </div>
                    )}
                  </form>
                  )}

                  {producerTab === "tickets" && (
                  <>
                  <label className="formField">
                    Search Attendees
                    <input
                      value={attendeeSearch}
                      onChange={(event) => setAttendeeSearch(event.target.value)}
                      placeholder="Name, email, or confirmation code"
                    />
                  </label>
                  <label className="formField">
                    Filter
                    <select
                      value={attendeeFilter}
                      onChange={(event) => setAttendeeFilter(event.target.value)}
                    >
                      <option value="all">All attendees</option>
                      <option value="checked_in">Checked in</option>
                      <option value="not_checked_in">Not checked in</option>
                    </select>
                  </label>

                  <div className="rewardsList">
                  {filteredProducerTicketReservationRows.map((reservation) => (
                    <div className="rewardCard" key={reservation.id}>
                      <div>
                        <h3>{reservation.attendeeName}</h3>
                        <p>{reservation.eventTitle}</p>
                        <p>
                          {reservation.ticketTypeName} Â· Qty {reservation.quantity} Â·{" "}
                          {formatTicketStatus(reservation.status)}
                        </p>
                        <p className="rewardStatus">
                          {reservation.fan_email || reservation.user_id} Â·{" "}
                          {new Date(reservation.created_at).toLocaleString()}
                        </p>
                        <p className="rewardStatus">
                          {getCheckInStatusLabel(reservation)}
                        </p>
                        {reservation.checked_in_at && (
                          <p className="rewardStatus">
                            Checked in {new Date(reservation.checked_in_at).toLocaleString()}
                          </p>
                        )}
                        {reservation.confirmation_code && (
                          <p className="rewardStatus">
                            Code: <strong>{reservation.confirmation_code}</strong>
                          </p>
                        )}
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
                  </>
                  )}
                </div>
              )}
            </section>
            )}

            {producerTab === "events" && (
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
                  Venue Name
                  <input
                    value={form.venueName}
                    onChange={(e) => updateForm("venueName", e.target.value)}
                    placeholder="Example: Harry the Hats"
                  />
                </label>

                <label className="formField fullSpan">
                  Street Address
                  <input
                    value={form.streetAddress}
                    onChange={(e) => updateForm("streetAddress", e.target.value)}
                    placeholder="Example: 123 Main St"
                  />
                </label>

                <label className="formField">
                  City
                  <input
                    value={form.city}
                    onChange={(e) => updateForm("city", e.target.value)}
                    placeholder="Example: Surfside Beach"
                  />
                </label>

                <label className="formField">
                  State
                  <input
                    value={form.state}
                    onChange={(e) => updateForm("state", e.target.value)}
                    placeholder="SC"
                  />
                </label>

                <label className="formField">
                  Zip Code
                  <input
                    value={form.zipCode}
                    onChange={(e) => updateForm("zipCode", e.target.value)}
                    placeholder="29575"
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
                    key={`${form.flyerName}-${form.flyerImage}`}
                    type="file"
                    accept={flyerAcceptTypes}
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
            )}
          </section>
        )}

        {activeTab === "legacy-rewards" && (
          <section className="panel">
            <p className="eyebrow">Rewards</p>
            <h1>Turn sharing into gift cards.</h1>
            <p>
              Fans earn points by sharing events. Points can be redeemed for
              digital gift cards.
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
    {renderAuthPanel(false, "fan")}
  </section>
)}

{activeTab === "streetteam" && user && (
  <section className="panel">
    <p className="eyebrow">My Team</p>
    <h1>Your street team dashboard.</h1>
    {ticketMessage && <p className="authMessage">{ticketMessage}</p>}
    {checkoutReturn.status === "success" && (
      <p className="authMessage">
        Payment successful. Your paid ticket will show as paid after Stripe confirms
        through the webhook.
      </p>
    )}

    <div className="tabs sectionTabs">
      {[
        ["overview", "Overview"],
        ["rewards", "Rewards"],
        ["history", "History"],
        ["tickets", "Tickets"],
      ].map(([tabId, label]) => (
        <button
          className={myTeamTab === tabId ? "tab active" : "tab"}
          key={tabId}
          type="button"
          onClick={() => setMyTeamTab(tabId)}
        >
          {label}
        </button>
      ))}
    </div>

    <div className="myTeamGrid">
      {myTeamTab === "overview" && (
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
        <button className="secondaryBtn wide" type="button" onClick={handleLogout}>
          Log Out
        </button>

        {!hasFanRole && !hasFanProfile && (
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
      )}

      {myTeamTab === "rewards" && (
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
      )}

      {myTeamTab === "overview" && (
      <section className="teamDashboardCard">
        <p className="eyebrow">Share Stats</p>
        <div className="producerGrid teamStatsGrid">
          <div className="miniCard">
            <strong>{fanStats.shares}</strong>
            <span>Shares</span>
          </div>
          <div className="miniCard">
            <strong>{fanStats.eventsShared}</strong>
            <span>Events Shared</span>
          </div>
        </div>
        <p className="rewardStatus">
          Share an event once to earn points. Paid ticket points appear here
          after Stripe confirms the purchase.
        </p>
      </section>
      )}

      {myTeamTab === "overview" && (
      <section className="teamDashboardCard">
        <p className="eyebrow">Points Summary</p>
        <div className="producerGrid teamStatsGrid">
          <div className="miniCard">
            <strong>{availableFanPoints.toLocaleString()}</strong>
            <span>Available</span>
          </div>
          <div className="miniCard">
            <strong>{pointTotals.earned.toLocaleString()}</strong>
            <span>Lifetime Earned</span>
          </div>
          <div className="miniCard">
            <strong>{pointTotals.redeemed.toLocaleString()}</strong>
            <span>Redeemed</span>
          </div>
        </div>
      </section>
      )}

      {myTeamTab === "overview" && pointHistory.length > 0 && (
      <section className="teamDashboardCard">
        <p className="eyebrow">Recent Activity</p>
        <div className="rewardsList">
          {pointHistory.slice(0, 3).map((transaction) => {
            const points = Number(transaction.points || 0);

            return (
              <div className="rewardCard" key={transaction.id}>
                <div>
                  <h3>
                    {points > 0 ? "+" : ""}
                    {points.toLocaleString()} {getPointHistoryLabel(transaction)}
                  </h3>
                  <p className="rewardStatus">
                    {transaction.created_at
                      ? new Date(transaction.created_at).toLocaleDateString()
                      : "Recent"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      )}

      {myTeamTab === "history" && (
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
      )}

      {myTeamTab === "tickets" && (
      <section className="teamDashboardCard">
        <p className="eyebrow">My Tickets</p>
        {fanTicketReservations.length === 0 ? (
          <>
            <h3>No tickets yet</h3>
            <p>Free RSVPs and reserved tickets will appear here.</p>
            <button className="primaryBtn" type="button" onClick={() => goToTab("fan")}>
              Browse Events
            </button>
          </>
        ) : (
          <div className="rewardsList">
            {upcomingFanTicketReservations.length > 0 && (
              <h3 className="ticketGroupTitle">Upcoming</h3>
            )}
            {upcomingFanTicketReservations.map((reservation) => (
              <div className="rewardCard" key={reservation.id}>
                <div>
                  <h3>{reservation.eventTitle}</h3>
                  {reservation.confirmation_code && (
                    <p className="rewardStatus">
                      Confirmation: <strong>{reservation.confirmation_code}</strong>
                    </p>
                  )}
                  <p>
                    {reservation.ticketTypeName} Â· Qty {reservation.quantity} Â·{" "}
                    {formatTicketStatus(reservation.status)}
                  </p>
                  <p className="rewardStatus">
                    {reservation.eventDate} {reservation.eventTime}
                    {reservation.confirmation_code
                      ? ` Â· ${reservation.confirmation_code}`
                      : ""}
                  </p>
                  {(reservation.eventVenue || reservation.eventCity) && (
                    <p className="rewardStatus">
                      {[reservation.eventVenue, reservation.eventCity]
                        .filter(Boolean)
                        .join(" Â· ")}
                    </p>
                  )}
                  <p className="rewardStatus">
                    {reservation.checked_in
                      ? `Checked in${
                          reservation.checked_in_at
                            ? ` ${new Date(
                                reservation.checked_in_at
                              ).toLocaleString()}`
                            : ""
                        }`
                      : "Not checked in"}
                  </p>
                  <div className="eventActions">
                    {events.some((event) => event.id === reservation.event_id) && (
                      <button
                        className="secondaryBtn"
                        type="button"
                        onClick={() =>
                          shareEvent(events.find((event) => event.id === reservation.event_id))
                        }
                      >
                        Share This Show
                      </button>
                    )}
                  </div>
                </div>
                {reservation.confirmation_code &&
                isTicketQrActive(reservation) ? (
                  <img
                    className="ticketQr"
                    src={getTicketQrImageUrl(reservation)}
                    alt={`QR code for ${reservation.confirmation_code}`}
                  />
                ) : reservation.confirmation_code &&
                  !isTicketQrActive(reservation) ? (
                  <div className="ticketQr disabledQr">
                    <span>
                      {reservation.status === "pending_payment"
                        ? "Payment pending"
                        : "QR unavailable"}
                    </span>
                  </div>
                ) : null}
              </div>
            ))}
            {pastFanTicketReservations.length > 0 && (
              <h3 className="ticketGroupTitle">Past</h3>
            )}
            {pastFanTicketReservations.map((reservation) => (
              <div className="rewardCard" key={reservation.id}>
                <div>
                  <h3>{reservation.eventTitle}</h3>
                  <p>
                    {reservation.ticketTypeName} Â· Qty {reservation.quantity} Â·{" "}
                    {formatTicketStatus(reservation.status)}
                  </p>
                  <p className="rewardStatus">
                    {reservation.eventDate} {reservation.eventTime}
                    {reservation.eventVenue || reservation.eventCity
                      ? ` Â· ${[reservation.eventVenue, reservation.eventCity]
                          .filter(Boolean)
                          .join(" Â· ")}`
                      : ""}
                  </p>
                  {reservation.confirmation_code && (
                    <p className="rewardStatus">
                      Confirmation: <strong>{reservation.confirmation_code}</strong>
                    </p>
                  )}
                  <p className="rewardStatus">
                    {reservation.checked_in ? "Checked in" : "Not checked in"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      )}

      {myTeamTab === "rewards" && redemptions.length > 0 && (
        <section className="teamDashboardCard">
          <p className="eyebrow">Reward Requests</p>
          <div className="rewardsList">
            {redemptions.slice(0, 3).map((redemption) => (
              <div className="rewardCard" key={redemption.id}>
                <div>
                  <h3>{redemption.reward_label}</h3>
                  <p>
                    {redemption.points_cost?.toLocaleString()} points Â·{" "}
                    {redemption.status || "pending"}
                  </p>
                  {redemption.tremendous_order_id && (
                    <p className="rewardStatus">
                      Tremendous order: <strong>{redemption.tremendous_order_id}</strong>
                    </p>
                  )}
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
                  {redemption.points_cost?.toLocaleString()} points Â·{" "}
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
      </main>
    </div>
  );
}

export default App;

