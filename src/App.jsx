import { useEffect, useState } from "react";
import "./App.css";

const starterEvents = [
  {
    id: 1,
    title: "Comedy Night at The Hive",
    type: "Comedy",
    venue: "Grand Strand Brewing",
    city: "Myrtle Beach, SC",
    date: "Fri, May 10",
    time: "8:00 PM",
    price: "$15",
    points: 25,
    flyerImage: "",
    flyerName: "",
  },
  {
    id: 2,
    title: "Local Band Showcase",
    type: "Music",
    venue: "The Backyard Stage",
    city: "Conway, SC",
    date: "Sat, May 11",
    time: "7:30 PM",
    price: "$10",
    points: 20,
    flyerImage: "",
    flyerName: "",
  },
  {
    id: 3,
    title: "Buzzed Bee Live",
    type: "Game Show",
    venue: "Harry the Hats",
    city: "Surfside Beach, SC",
    date: "Sun, May 12",
    time: "7:00 PM",
    price: "Free",
    points: 15,
    flyerImage: "",
    flyerName: "",
  },
];

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

function App() {
  const [activeTab, setActiveTab] = useState("fan");
  const [selectedEvent, setSelectedEvent] = useState(null);

  const [points, setPoints] = useState(() =>
    loadSavedValue("streetTeamPoints", 120)
  );
  const [events, setEvents] = useState(() =>
    loadSavedValue("streetTeamEvents", starterEvents)
  );
  const [totalShares, setTotalShares] = useState(() =>
    loadSavedValue("streetTeamShares", 0)
  );

  const [form, setForm] = useState(emptyForm);
  const [editingEventId, setEditingEventId] = useState(null);
  const [editForm, setEditForm] = useState(emptyEditForm);

  useEffect(() => {
    localStorage.setItem("streetTeamPoints", JSON.stringify(points));
  }, [points]);

  useEffect(() => {
    localStorage.setItem("streetTeamEvents", JSON.stringify(events));
  }, [events]);

  useEffect(() => {
    localStorage.setItem("streetTeamShares", JSON.stringify(totalShares));
  }, [totalShares]);

  function goToTab(tabName) {
    setSelectedEvent(null);
    setActiveTab(tabName);
  }

  function openEvent(event) {
    setSelectedEvent(event);
    setActiveTab("event");
  }

  function shareEvent(event) {
    setPoints((currentPoints) => currentPoints + event.points);
    setTotalShares((currentShares) => currentShares + 1);
    alert(`Shared "${event.title}" and earned ${event.points} points!`);
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

    if (file.size > 2 * 1024 * 1024) {
      alert("For this demo, use a flier image under 2MB. The real app will use cloud storage.");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (mode === "edit") {
        setEditForm((currentForm) => ({
          ...currentForm,
          flyerImage: reader.result,
          flyerName: file.name,
        }));
      } else {
        setForm((currentForm) => ({
          ...currentForm,
          flyerImage: reader.result,
          flyerName: file.name,
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
      }));
    } else {
      setForm((currentForm) => ({
        ...currentForm,
        flyerImage: "",
        flyerName: "",
      }));
    }
  }

  function createEvent(event) {
    event.preventDefault();

    if (!form.title || !form.venue || !form.city || !form.date || !form.time) {
      alert("Fill out the event name, venue, city, date, and time first.");
      return;
    }

    const isFree = !form.price || Number(form.price) === 0;

    const newEvent = {
      id: Date.now(),
      title: form.title,
      type: form.type,
      venue: form.venue,
      city: form.city,
      date: formatDate(form.date),
      time: formatTime(form.time),
      price: isFree ? "Free" : `$${form.price}`,
      points: isFree ? 15 : 25,
      flyerImage: form.flyerImage,
      flyerName: form.flyerName,
    };

    setEvents((currentEvents) => [newEvent, ...currentEvents]);
    setForm(emptyForm);
    setSelectedEvent(null);
    setActiveTab("fan");
    alert("Event created. It is now live on the fan side.");
  }

  function startEdit(event) {
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
    });
  }

  function cancelEdit() {
    setEditingEventId(null);
    setEditForm(emptyEditForm);
  }

  function saveEventChanges(event) {
    event.preventDefault();

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

    setEvents((currentEvents) =>
      currentEvents.map((item) =>
        item.id === editingEventId
          ? {
              ...item,
              title: editForm.title,
              type: editForm.type,
              venue: editForm.venue,
              city: editForm.city,
              date: editForm.date,
              time: editForm.time,
              price: isFree ? "Free" : `$${editForm.price}`,
              points: isFree ? 15 : 25,
              flyerImage: editForm.flyerImage,
              flyerName: editForm.flyerName,
            }
          : item
      )
    );

    cancelEdit();
    alert("Event updated.");
  }

  function deleteEvent(eventId) {
    const eventToDelete = events.find((event) => event.id === eventId);
    const confirmed = window.confirm(
      `Delete "${eventToDelete?.title || "this event"}"?`
    );

    if (!confirmed) return;

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

  return (
    <div className="app">
      <header className="topbar">
        <div className="logoWrap">
          <img
  className="brandHeaderLogo"
  src="/assets/header-logo.png"
  alt="Street Team"
/>
          <div className="tagline">Find shows. Share shows. Earn rewards.</div>
        </div>

        <nav className="tabs">
          <button
            className={activeTab === "fan" || activeTab === "event" ? "tab active" : "tab"}
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

        {activeTab === "producer" && (
          <section className="panel">
            <p className="eyebrow">Producer Dashboard</p>
            <h1>Manage your events.</h1>
            <p>
              Create, edit, delete, and update fliers. This is where producers
              control what fans see.
            </p>

            <div className="producerGrid">
              <div className="miniCard">
                <strong>{events.length}</strong>
                <span>Active Events</span>
              </div>
              <div className="miniCard">
                <strong>{totalShares}</strong>
                <span>Total Shares</span>
              </div>
              <div className="miniCard">
                <strong>{totalShares * 25}</strong>
                <span>Estimated Reach</span>
              </div>
            </div>

            <section className="managerSection">
              <div className="sectionHeader smallHeader">
                <h2>Your Events</h2>
                <p>Edit test events, fix typos, replace fliers, or delete old ones.</p>
              </div>

              <div className="manageList">
                {events.map((event) => (
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
                              <img src={editForm.flyerImage} alt="Flier preview" />
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
                <p>Add a new show to the fan side.</p>
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
                    <button className="secondaryBtn" type="button" onClick={removeFlyer}>
                      Remove Flier
                    </button>
                  </div>
                </div>
              )}

              <button className="primaryBtn wide" type="submit">
                Publish Event
              </button>

              <p className="helperText">
                This demo saves small fliers locally. The real app will use
                Supabase storage so producers can upload full-size images.
              </p>
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
      </main>
    </div>
  );
}

export default App;