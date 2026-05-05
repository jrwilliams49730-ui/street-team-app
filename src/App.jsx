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
    points: item.points,
    flyerImage: item.flyer_image || "",
    flyerName: item.flyer_name || "",
    flyerPath: item.flyer_path || "",
    ownerId: item.owner_id || null,
  };
}

function App() {
  const [activeTab, setActiveTab] = useState("fan");
  const [selectedEvent, setSelectedEvent] = useState(null);

  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [selectedAccountType, setSelectedAccountType] = useState("fan");

  const [fanProfileForm, setFanProfileForm] = useState(() =>
    loadSavedValue("streetTeamFanProfile", emptyFanProfileForm)
  );
  const [fanProfile, setFanProfile] = useState(() =>
    loadSavedValue("streetTeamFanProfile", null)
  );
  const [fanProfileMessage, setFanProfileMessage] = useState("");
  const [isFanProfileLoading, setIsFanProfileLoading] = useState(false);
  const [points, setPoints] = useState(() =>
    loadSavedValue("streetTeamPoints", 120)
  );
  const [events, setEvents] = useState([]);
  const [shareStats, setShareStats] = useState({});
const [isLoadingShareStats, setIsLoadingShareStats] = useState(false);
  const [totalShares, setTotalShares] = useState(() =>
    loadSavedValue("streetTeamShares", 0)
  );

  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [eventError, setEventError] = useState("");

  const [form, setForm] = useState(emptyForm);
  const [editingEventId, setEditingEventId] = useState(null);
  const [editForm, setEditForm] = useState(emptyEditForm);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setUser(data.session?.user ?? null);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("streetTeamPoints", JSON.stringify(points));
  }, [points]);

  useEffect(() => {
    localStorage.setItem("streetTeamShares", JSON.stringify(totalShares));
  }, [totalShares]);

  useEffect(() => {
    loadEventsFromSupabase();
  }, []);

  useEffect(() => {
  if (user) {
    loadShareStatsFromSupabase();
  } else {
    setShareStats({});
  }
}, [user, events.length]);

  useEffect(() => {
    if (!user) {
      setFanProfile(null);
      setFanProfileForm(emptyFanProfileForm);
      return;
    }

    async function loadUserRoleAndProfile() {
      const role = (await getUserRole(user.id)) || selectedAccountType;
      setSelectedAccountType(role);
      setActiveTab(role === "fan" ? "streetteam" : "producer");

      if (role === "fan") {
        await loadFanProfile(user);
      }
    }

    loadUserRoleAndProfile();
  }, [user]);

useEffect(() => {
  if (!isLoadingEvents && events.length > 0) {
    logVisitFromShareLink();
  }
}, [isLoadingEvents, events.length]);
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

  function goToTab(tabName) {
    setSelectedEvent(null);
    setActiveTab(tabName);
  }

  function openEvent(event) {
    setSelectedEvent(event);
    setActiveTab("event");
  }

  async function shareEvent(event) {
    if (!user) {
      alert("Create or log into your fan account before sharing for points.");
      setActiveTab("streetteam");
      return;
    }

    const fanDisplayName =
      fanProfile?.display_name || fanProfileForm.displayName?.trim();

    if (!fanDisplayName) {
      alert("Save your fan profile before sharing for points.");
      setActiveTab("streetteam");
      return;
    }

    const shareCode = makeShareCode(event.id);
    const shareLink = buildShareLink(event.id, shareCode);

    const { error } = await supabase.from("event_share_actions").insert({
      event_id: event.id,
      share_code: shareCode,
      sharer_key: getSharerKey(),
      action: "share",
      fan_user_id: user.id,
      fan_display_name: fanDisplayName,
      points_awarded: event.points,
    });

    if (error) {
      console.error(error);
      alert("Could not create share link.");
      return;
    }

    setPoints((currentPoints) => currentPoints + event.points);
    setTotalShares((currentShares) => currentShares + 1);

    try {
      await navigator.clipboard.writeText(shareLink);
      alert(
        `Share link copied. ${fanDisplayName} earned ${event.points} points for sharing "${event.title}".`
      );
    } catch {
      prompt("Copy your Street Team share link:", shareLink);
    }

    loadShareStatsFromSupabase();
  }

  async function getUserRole(userId) {
    if (!userId) return null;

    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Could not fetch user role:", error);
      return null;
    }

    return data?.role ?? null;
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
    }
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

  const { data, error } = await supabase
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

    if (!user) {
      alert("Log in as a producer before creating events.");
      setActiveTab("account");
      return;
    }

    if (!form.title || !form.venue || !form.city || !form.date || !form.time) {
      alert("Fill out the event name, venue, city, date, and time first.");
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
      points: isFree ? 15 : 25,
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

    setEvents((currentEvents) => [fromDbEvent(data), ...currentEvents]);
    setForm(emptyForm);
    setSelectedEvent(null);
    setActiveTab("fan");
    alert("Event created.");
  }

  function startEdit(event) {
    if (!user) {
      alert("Log in before editing events.");
      setActiveTab("account");
      return;
    }

    setEditingEventId(event.id);
    setEditForm({
      title: event.title || "",
      type: event.type || "Comedy",
      venue: event.venue || "",
      city: event.city || "",
      date: event.date || "",
      time: event.time || "",
      price: cleanPriceForEdit(event.price),
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

    if (!user) {
      alert("Log in before saving changes.");
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

    const originalEvent = events.find((item) => item.id === editingEventId);
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
      points: isFree ? 15 : 25,
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
    if (!user) {
      alert("Log in before deleting events.");
      setActiveTab("account");
      return;
    }

    const eventToDelete = events.find((event) => event.id === eventId);
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
            className={
              activeTab === "fan" || activeTab === "event"
                ? "tab active"
                : "tab"
            }
            onClick={() => goToTab("fan")}
          >
            Fan
          </button>
          <button
            className={activeTab === "producer" ? "tab active" : "tab"}
            onClick={() => goToTab("producer")}
          >
            Producer
          </button>
          <button
            className={activeTab === "rewards" ? "tab active" : "tab"}
            onClick={() => goToTab("rewards")}
          >
            Rewards
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
        {activeTab === "fan" && (
          <>
            <section className="heroCard">
              <div>
                <p className="eyebrow">Near Myrtle Beach</p>
                <h1>Shows worth leaving the house for.</h1>
                <p>
                  Discover local comedy, music, game nights, festivals, and live
                  events near you.
                </p>
              </div>

              <div className="pointsBox">
                <span>Your Points</span>
                <strong>{points}</strong>
              </div>
            </section>

            <section className="sectionHeader">
              <h2>Upcoming Events</h2>
              <p>Share events to earn points toward digital gift cards.</p>
            </section>

            {isLoadingEvents && <p>Loading events...</p>}
            {eventError && <p className="errorText">{eventError}</p>}
            {!isLoadingEvents && !eventError && events.length === 0 && (
              <section className="emptyState">
                <h3>No events yet.</h3>
                <p>Log in as a producer and create the first event.</p>
              </section>
            )}

            <div className="eventList">
              {events.map((event) => (
                <article className="eventCard" key={event.id}>
                  <EventFlyer event={event} />

                  <div className="eventInfo">
                    <div className="eventTop">
                      <span className="pill">{event.type}</span>
                      <span className="price">{event.price}</span>
                    </div>

                    <h3>{event.title}</h3>
                    <p className="venue">{event.venue}</p>
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
                <span className="price">{selectedEvent.price}</span>
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

              <div className="eventActions">
                <button
                  className="primaryBtn"
                  onClick={() => shareEvent(selectedEvent)}
                >
                  Share Event +{selectedEvent.points}
                </button>
                <button className="secondaryBtn">Tickets Coming Soon</button>
              </div>
            </div>
          </section>
        )}

       {activeTab === "producer" && !user && (
  <section className="panel">
    {renderAuthPanel(true)}
  </section>
)}

        {activeTab === "producer" && user && (
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

        {activeTab === "rewards" && (
          <section className="panel">
            <p className="eyebrow">Rewards</p>
            <h1>Turn sharing into gift cards.</h1>
            <p>
              Fans earn points by sharing events. Points can be redeemed for
              digital gift cards and ticket discounts.
            </p>

            <div className="rewardCard">
              <div>
                <h3>$5 Digital Gift Card</h3>
                <p>Redeem when you reach 500 points.</p>
              </div>
              <button className="secondaryBtn">Coming Soon</button>
            </div>

            <div className="rewardCard">
              <div>
                <h3>$10 Digital Gift Card</h3>
                <p>Redeem when you reach 1,000 points.</p>
              </div>
              <button className="secondaryBtn">Coming Soon</button>
            </div>
          </section>
        )}

{activeTab === "streetteam" && (
  <section className="panel">
    <p className="eyebrow">My Street Team</p>
    <h1>{fanProfile ? "Your fan profile." : "Create your fan profile."}</h1>
    <p>
      This is where fans track points, rewards, shares, visits, and events they
      helped promote.
    </p>

    {!fanProfile && (
      <div className="emptyState">
        <p>
          Save a fan profile so your points and shares stay connected to your
          account.
        </p>
      </div>
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
  </section>
)}
        {activeTab === "account" && (
          <>
            {user ? (
              <section className="panel">
                <p className="eyebrow">Account</p>
                <h1>You are logged in.</h1>
                <p>
                  Producer account: <strong>{user.email}</strong>
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