// Packing/itinerary screen, embedded in the Holiday Calendar app.
//
// Loaded as a classic script AFTER main.js, on purpose: it reuses main.js's
// already-authenticated `db` (Supabase client, same session) as a bare
// identifier rather than creating a second client. Everything else here is
// wrapped in this IIFE and only ever touches its own root element's
// subtree, so it can't collide with main.js's `state`/`el`/`render()`
// globals or its CSS.
//
// Trip identity (name/dates/destination) is NOT duplicated here — it lives
// in holidaycalendar.holidays, fetched fresh by id each time the screen
// opens. This module only owns packing-specific data, all keyed by
// holiday_id: travellers, trip_days (itinerary), packing_items,
// standard_items (household-wide), and trip_meta (season/trip_types/notes,
// the packing-specific fields that don't belong on holidaycalendar.holidays).
(function () {
  "use strict";

  if (window.PackingScreen) return;

  const APP_CONFIG = {
    supabaseUrl: "https://cnkznpkvwoqxaiywwmhr.supabase.co",
    supabaseSchema: "packing_list",
    householdId: "shared-household"
  };

  const CATEGORIES = ["Clothes", "Footwear", "Toiletries", "Health", "Tech", "Documents", "Food And Drink", "Other"];
  const SEASONS = ["Any", "Warm Climate", "Cool Climate"];
  const TRIP_TYPES = ["Beach Resort", "City", "Nature/Safari", "Activities", "Business", "Mountains"];
  const CATEGORY_KEYWORDS = {
    Clothes: ["shirt", "trouser", "jean", "jumper", "dress", "sock", "underwear", "coat", "jacket", "pyjama", "thermal", "short"],
    Footwear: ["shoe", "boot", "trainer", "sandal", "flip flop", "slipper"],
    Toiletries: ["toothbrush", "toothpaste", "shampoo", "soap", "razor", "deodorant", "shower gel", "hairbrush", "makeup"],
    Health: ["medication", "plaster", "first aid", "paracetamol", "ibuprofen", "vitamin", "repellent", "inhaler"],
    Tech: ["charger", "cable", "adaptor", "adapter", "laptop", "camera", "headphone", "power bank", "kindle"],
    Documents: ["passport", "ticket", "insurance", "licence", "license", "visa", "boarding", "booking"],
    "Food And Drink": ["snack", "water bottle", "coffee", "tea", "flask"]
  };

  const WHOAMI_KEY = "packing_list_whoami";
  const TOP_TAB_KEY = "packing_list_top_tab";
  const TABLE_ORDER = ["travellers", "trip_meta", "trip_days", "standard_items", "packing_items"];

  // Hardcoded on purpose: exactly two people ever use this app. Maps the
  // signed-in Supabase Auth email to a traveller name so opening a trip
  // defaults "I am" to whoever is actually logged in, without having to
  // reselect it every time.
  const KNOWN_USER_NAMES = {
    "[redacted-email-1]": "Ben",
    "[redacted-email-2]": "Louise"
  };

  let currentUserId = null;
  let currentUserEmail = null;

  const state = {
    holiday: null,
    loading: true,
    tripMeta: null,
    travellers: [],
    tripDays: [],
    items: [],
    standardItems: [],
    pending: [],
    conflictQueue: [],
    syncing: false,
    supabaseReachable: true,
    lastSyncError: "",
    lastSyncAt: null,
    lastAction: null,
    tab: "mine",
    whoami: null,
    sharedOwnerFilter: "all",
    editingStandardId: null,
    standardFilter: "",
    wizard: null,
    topTab: "itinerary"
  };

  let root = null;
  const el = {};
  let checkToastTimer = null;
  let standardFeedbackTimer = null;
  let suggestionActiveIndex = -1;
  let categoryManuallySet = false;
  // Bumped on every open() call; a stale continuation (e.g. this trip's
  // load is still in flight when the user backs out and opens a different
  // one) checks this before touching `el`/`state` so it can't write a
  // finished fetch's data into the new screen's DOM — cacheEls() re-points
  // every el.* entry at the new markup, but doesn't stop an old promise
  // chain from resuming and using those same shared references.
  let openToken = 0;
  // Whether the floating add-item panel is expanded (vs. collapsed to the
  // + FAB). Lives outside `state` since it's pure UI chrome, not data.
  let addPanelOpen = false;
  // Tracks the notes text last shown in the textarea, so renderTripNotes()
  // can tell "still matches what we last displayed" apart from "hasn't
  // been populated yet this open()" — null means the latter. Without this,
  // the very first render after opening a trip with saved notes compares
  // the still-empty textarea against state.tripMeta.notes, sees a mismatch,
  // and (wrongly, since isFocused is false) treats that as an unsaved user
  // edit — so the guard never fills the textarea and the notes look lost.
  let lastSyncedTripNotes = null;

  // ---------------------------------------------------------------------
  // Mount / lifecycle
  // ---------------------------------------------------------------------

  function ensureRoot() {
    if (root) return root;
    root = document.createElement("div");
    root.id = "pack-screen-root";
    root.className = "pack-screen hidden";
    document.body.appendChild(root);
    return root;
  }

  async function open(holidayId) {
    if (!holidayId) return;
    const myToken = ++openToken;
    lastSyncedTripNotes = null;
    addPanelOpen = false;

    ensureRoot();
    root.classList.remove("hidden");
    document.documentElement.classList.add("pack-screen-active");
    root.innerHTML = shellHtml();
    cacheEls();
    bindEvents();

    state.holiday = { id: holidayId, location: "", country: "", startDate: null, endDate: null, status: "" };
    state.loading = true;
    state.tab = "mine";
    state.sharedOwnerFilter = "all";
    state.topTab = localStorage.getItem(TOP_TAB_KEY) === "packing" ? "packing" : "itinerary";

    el.itemCategory.innerHTML = optionsHtml(CATEGORIES);
    el.standardCategoryInput.innerHTML = optionsHtml(CATEGORIES);
    el.settingsSeasonInput.innerHTML = optionsHtml(SEASONS);
    el.wizardSeasonInput.innerHTML = optionsHtml(SEASONS);
    el.settingsTypesInput.innerHTML = checkboxGridHtml("settings-type", TRIP_TYPES);
    el.wizardTypesInput.innerHTML = checkboxGridHtml("wizard-type", TRIP_TYPES);
    el.standardSeasonsInput.innerHTML = checkboxGridHtml("standard-season", SEASONS.filter((s) => s !== "Any"));
    el.standardTypesInput.innerHTML = checkboxGridHtml("standard-type", TRIP_TYPES);

    categoryManuallySet = false;
    await refreshCurrentUser();
    if (myToken !== openToken) return;
    await loadLocal(holidayId);
    if (myToken !== openToken) return;
    render();

    await fetchHolidayDetails(holidayId);
    if (myToken !== openToken) return;
    render();

    // Awaited (not fire-and-forget) so travellers pulled from the server —
    // not just whatever happened to be cached locally — are in state
    // before inferWhoami() runs. inferWhoami() auto-creates a traveller
    // when the signed-in account doesn't have one on this trip yet, so it
    // must only run once we've confirmed (via a completed sync) that they
    // genuinely don't exist remotely — calling it any earlier risks
    // creating a duplicate of a traveller someone else already added.
    await syncNow();
    if (myToken !== openToken) return;
    await inferWhoami();
    if (myToken !== openToken) return;

    state.loading = false;
    render();
    el.loading.hidden = true;
    el.main.hidden = false;

    // No periodic background sync — every mutation already triggers its
    // own sync right after saving.
  }

  function close() {
    if (!root) return;
    openToken++;
    root.classList.add("hidden");
    root.innerHTML = "";
    document.documentElement.classList.remove("pack-screen-active");
  }

  async function refreshCurrentUser() {
    if (!db) return;
    const { data: { session } } = await db.auth.getSession();
    currentUserId = session?.user?.id || null;
    currentUserEmail = (session?.user?.email || "").toLowerCase();
  }

  function inferredTravellerName() {
    if (!currentUserEmail) return null;
    return KNOWN_USER_NAMES[currentUserEmail] || null;
  }

  // "I am" is never picked by hand — it's derived from the signed-in
  // account (KNOWN_USER_NAMES) and, if that traveller isn't on this trip
  // yet, created automatically. Must only be called after syncNow() has
  // resolved at least once: creating a traveller here means "confirmed via
  // the server that they don't already exist on this trip", and calling it
  // against stale/empty local-cache-only data risks creating a duplicate
  // of a traveller that already exists remotely (e.g. a brand new device,
  // opened offline, for a trip someone else already set up).
  async function inferWhoami() {
    const inferredName = inferredTravellerName();

    if (inferredName) {
      const existing = tripTravellers(state.holiday.id).find((p) => canonicalKey(p.name) === canonicalKey(inferredName));
      if (existing) {
        state.whoami = existing.id;
        localStorage.setItem(whoamiKeyForHoliday(state.holiday.id), existing.id);
        return;
      }
      if (state.supabaseReachable) {
        const created = await addTraveller(inferredName);
        if (created) {
          state.whoami = created.id;
          localStorage.setItem(whoamiKeyForHoliday(state.holiday.id), created.id);
          return;
        }
      }
    }

    // Unrecognised account, or offline with nothing local yet — fall back
    // to whatever was last known for this trip, but never let the UI
    // present a choice.
    const stored = localStorage.getItem(whoamiKeyForHoliday(state.holiday.id));
    const people = tripTravellers(state.holiday.id);
    state.whoami = people.some((t) => t.id === stored) ? stored : null;
  }

  async function fetchHolidayDetails(holidayId) {
    // db's default schema is "holidaycalendar" (set at client
    // creation in main.js), so this is a same-schema, same-client read —
    // no header override needed, unlike the packing_list.* calls below.
    if (!db) return;
    const { data, error } = await db
      .from("holidays")
      .select("id,location,country,start_date,end_date,status")
      .eq("id", holidayId)
      .maybeSingle();

    if (!error && data) {
      state.holiday = {
        id: data.id,
        location: data.location,
        country: data.country,
        startDate: data.start_date,
        endDate: data.end_date,
        status: data.status
      };
    }

    await ensureTripMeta(holidayId);
  }

  async function ensureTripMeta(holidayId) {
    // trip_meta lives in packing_list, not holidaycalendar (db's
    // default schema) — goes through apiSelect like every other
    // packing_list table so it gets the right Accept-Profile header.
    const { data, error } = await apiSelect("trip_meta", { eq: { holiday_id: holidayId } });
    const row = data && data[0];

    if (!error && row) {
      state.tripMeta = row;
    } else if (!state.tripMeta) {
      state.tripMeta = {
        holiday_id: holidayId,
        household_id: APP_CONFIG.householdId,
        season: "Any",
        trip_types: [],
        notes: null,
        deleted_at: null,
        updated_at: new Date().toISOString(),
        updated_by: currentUserId
      };
    }
  }

  window.PackingScreen = { open, close };

  // ---------------------------------------------------------------------
  // Shell HTML — rendered once per open(), then everything below queries
  // within `root` rather than the document, and mutates in place.
  // ---------------------------------------------------------------------

  function shellHtml() {
    return `
      <header class="pack-topbar">
        <div class="pack-topbar-row">
          <button id="pack-back-btn" class="pack-back-link" type="button">Back to Trips</button>
        </div>
        <h1 id="pack-trip-title" class="pack-title">PackIt</h1>
        <p id="pack-trip-subtitle" class="pack-subtitle"></p>
        <div id="pack-trip-chips" class="chip-row"></div>
        <div class="progress-wrap">
          <div class="progress-track"><div id="pack-progress-bar" class="progress-bar"></div></div>
          <span id="pack-progress-text" class="progress-text"></span>
        </div>
      </header>

      <div id="pack-options-menu" class="options-menu" hidden>
        <button id="pack-undo-btn" class="icon-btn" type="button" disabled>Undo</button>
        <button id="pack-settings-btn" class="icon-btn" type="button">Trip Settings</button>
        <button id="pack-travellers-btn" class="icon-btn" type="button">Travellers</button>
        <button id="pack-wizard-btn" class="icon-btn" type="button">Packing Wizard</button>
        <button id="pack-standard-btn" class="icon-btn" type="button">Standard Items</button>
        <button id="pack-unpack-btn" class="icon-btn" type="button">Unpack Everything</button>
      </div>

      <div id="pack-loading" class="pack-loading">
        <div class="spinner" aria-label="Loading"></div>
      </div>

      <main class="pack-main" id="pack-main" hidden>
        <div class="tab-bar top-tab-bar">
          <button id="pack-top-tab-itinerary-btn" class="tab-btn is-active" type="button" data-top-tab="itinerary">Itinerary</button>
          <button id="pack-top-tab-packing-btn" class="tab-btn" type="button" data-top-tab="packing">Packing</button>
        </div>

        <div id="pack-top-pane-itinerary" class="pane">
          <div id="pack-itinerary-table-wrap"></div>
          <p id="pack-itinerary-empty" class="empty-note" hidden>Set trip dates in Holiday Calendar to plan each day.</p>

          <div class="card trip-notes">
            <label for="pack-trip-notes-input">Notes</label>
            <textarea id="pack-trip-notes-input" rows="4" placeholder="Anything else about this trip"></textarea>
            <div class="db-actions">
              <button id="pack-trip-notes-save-btn" class="icon-btn primary-btn" type="button" disabled>Save</button>
            </div>
          </div>
        </div>

        <div id="pack-top-pane-packing" class="pane" hidden>
          <div class="tab-bar packing-tab-bar">
            <button id="pack-tab-mine-btn" class="tab-btn is-active" type="button" data-tab="mine">My List</button>
            <button id="pack-tab-shared-btn" class="tab-btn" type="button" data-tab="shared">Shared</button>
            <button id="pack-tab-everyone-btn" class="tab-btn" type="button" data-tab="everyone">Everyone</button>
            <button id="pack-list-options-btn" class="icon-btn cog-btn" type="button" aria-label="List options" aria-haspopup="true" aria-expanded="false">⚙</button>
            <div id="pack-list-options-menu" class="list-options-menu" hidden>
              <button id="pack-remove-all-btn" class="icon-btn danger-btn" type="button">Remove All Items</button>
              <button id="pack-run-wizard-btn" class="icon-btn" type="button">Packing Wizard</button>
              <button id="pack-item-database-btn" class="icon-btn" type="button">Item Database</button>
            </div>
          </div>

          <div id="pack-pane-mine" class="pane">
            <div id="pack-mine-sections"></div>
            <p id="pack-mine-empty" class="empty-note" hidden>Nothing on your list yet. Run the packing wizard or add an item.</p>
          </div>

          <div id="pack-pane-shared" class="pane" hidden>
            <div id="pack-shared-owner-filter" class="chip-row filter-row"></div>
            <div id="pack-shared-sections"></div>
            <p id="pack-shared-empty" class="empty-note" hidden>No shared items yet.</p>
          </div>

          <div id="pack-pane-everyone" class="pane" hidden>
            <div id="pack-everyone-summary"></div>
          </div>
        </div>
      </main>

      <section class="card add-card" id="pack-add-card" hidden>
        <form id="pack-add-form" autocomplete="off">
          <div class="add-layout">
            <div class="add-quick-row">
              <input id="pack-item-entry" class="add-item-input" placeholder="Type item here" required
                autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="text" enterkeyhint="done" />
              <button id="pack-add-item-btn" class="add-submit-btn" type="submit">Add</button>
            </div>
            <div id="pack-item-options" class="item-options" hidden></div>
            <details class="add-more">
              <summary>More options</summary>
              <div class="add-row">
                <select id="pack-item-category" aria-label="Category"></select>
                <input id="pack-item-qty" type="number" min="1" max="99" value="1" aria-label="Quantity" />
              </div>
              <div class="add-row">
                <select id="pack-item-scope" aria-label="List">
                  <option value="personal">My list</option>
                  <option value="shared">Shared list</option>
                </select>
                <select id="pack-item-owner" aria-label="Owner"></select>
              </div>
            </details>
          </div>
        </form>
      </section>
      <button id="pack-add-fab-btn" class="add-fab-btn" type="button" aria-label="Add new item" hidden>＋</button>

      <div id="pack-trip-settings-modal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2>Trip Settings</h2>
            <button id="pack-close-settings-btn" class="icon-btn" type="button">✕</button>
          </div>
          <p class="muted-line">Name, dates and destination live in Holiday Calendar. These only affect the packing wizard.</p>
          <form id="pack-settings-form" class="stack-form" autocomplete="off">
            <label>Season
              <select id="pack-settings-season-input"></select>
            </label>
            <fieldset class="checkbox-grid">
              <legend>Trip type</legend>
              <div id="pack-settings-types-input"></div>
            </fieldset>
            <label>Notes
              <textarea id="pack-settings-notes-input" rows="2" placeholder="Optional"></textarea>
            </label>
            <div class="db-actions">
              <button class="icon-btn primary-btn" type="submit">Save</button>
            </div>
          </form>
        </div>
      </div>

      <div id="pack-travellers-modal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2>Travellers</h2>
            <button id="pack-close-travellers-btn" class="icon-btn" type="button">✕</button>
          </div>
          <ul id="pack-travellers-list" class="plain-list"></ul>
          <form id="pack-traveller-form" class="inline-form" autocomplete="off">
            <input id="pack-traveller-name-input" type="text" placeholder="Add traveller name" required />
            <button class="icon-btn primary-btn" type="submit">Add</button>
          </form>
          <p class="muted-line">Deleting a traveller keeps their items but marks them unassigned.</p>
        </div>
      </div>

      <div id="pack-day-edit-modal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2 id="pack-day-edit-title">Day</h2>
            <button id="pack-close-day-edit-btn" class="icon-btn" type="button">✕</button>
          </div>
          <div id="pack-day-edit-body"></div>
          <div class="db-actions">
            <button id="pack-day-save-btn" class="icon-btn primary-btn" type="button">Save</button>
            <button id="pack-day-cancel-btn" class="icon-btn" type="button">Cancel</button>
          </div>
        </div>
      </div>

      <div id="pack-wizard-modal" class="modal">
        <div class="modal-content wide">
          <div class="modal-header">
            <h2 id="pack-wizard-title">Packing Wizard</h2>
            <button id="pack-close-wizard-btn" class="icon-btn" type="button">✕</button>
          </div>

          <div id="pack-wizard-step-1" class="wizard-step">
            <p class="muted-line">Check the trip details the defaults will be based on.</p>
            <label>Season
              <select id="pack-wizard-season-input"></select>
            </label>
            <fieldset class="checkbox-grid">
              <legend>Trip type</legend>
              <div id="pack-wizard-types-input"></div>
            </fieldset>
            <p id="pack-wizard-days-note" class="muted-line"></p>
          </div>

          <div id="pack-wizard-step-2" class="wizard-step" hidden>
            <p class="muted-line">Who is going? Each person gets their own list.</p>
            <ul id="pack-wizard-travellers" class="plain-list"></ul>
          </div>

          <div id="pack-wizard-step-3" class="wizard-step" hidden>
            <p class="muted-line">Review the suggested items. Uncheck anything you do not need and adjust quantities.</p>
            <div id="pack-wizard-preview"></div>
            <p id="pack-wizard-preview-empty" class="empty-note" hidden>No standard items match this trip. Add some under Item Database.</p>
          </div>

          <div class="db-actions wizard-actions">
            <button id="pack-wizard-back-btn" class="icon-btn" type="button" hidden>Back</button>
            <button id="pack-wizard-next-btn" class="icon-btn primary-btn" type="button">Next</button>
            <button id="pack-wizard-apply-btn" class="icon-btn primary-btn" type="button" hidden>Add To Lists</button>
          </div>
        </div>
      </div>

      <div id="pack-standard-modal" class="modal">
        <div class="modal-content wide">
          <div class="modal-header">
            <h2>Item Database</h2>
            <button id="pack-close-standard-btn" class="icon-btn" type="button">✕</button>
          </div>
          <p class="muted-line">These defaults drive the packing wizard. <em>Per day</em> scales with trip length.</p>
          <div class="db-filter-wrap">
            <input id="pack-standard-filter-input" type="text" placeholder="Filter by name or category" autocomplete="off" />
            <button id="pack-add-standard-btn" class="icon-btn primary-btn" type="button">Add</button>
          </div>
          <div id="pack-standard-feedback" class="db-feedback" hidden>Updated</div>
          <ul id="pack-standard-list" class="plain-list"></ul>

          <div id="pack-standard-edit-popup" class="meal-edit-popup" hidden>
            <div class="meal-edit-popup-card">
              <h3 id="pack-standard-edit-title">Standard Item</h3>
              <form id="pack-standard-form" class="stack-form" autocomplete="off">
                <label>Name
                  <input id="pack-standard-name-input" type="text" required />
                </label>
                <div class="form-row">
                  <label>Category
                    <select id="pack-standard-category-input"></select>
                  </label>
                  <label>Applies to
                    <select id="pack-standard-applies-input">
                      <option value="person">Each person</option>
                      <option value="trip">Shared for trip</option>
                    </select>
                  </label>
                </div>
                <div class="form-row">
                  <label>Base qty
                    <input id="pack-standard-base-input" type="number" min="0" max="99" value="1" />
                  </label>
                  <label>Per day
                    <select id="pack-standard-perday-input">
                      <option value="0">N/A</option>
                      <option value="1">1 per day</option>
                      <option value="0.5">1 per 2 days</option>
                      <option value="0.3333333333333333">1 per 3 days</option>
                      <option value="0.2">1 per 5 days</option>
                    </select>
                  </label>
                  <label>Max qty
                    <input id="pack-standard-max-input" type="number" min="0" max="99" value="0" />
                  </label>
                </div>
                <fieldset class="checkbox-grid">
                  <legend>Seasons (none = all)</legend>
                  <div id="pack-standard-seasons-input"></div>
                </fieldset>
                <fieldset class="checkbox-grid">
                  <legend>Trip types (none = all)</legend>
                  <div id="pack-standard-types-input"></div>
                </fieldset>
                <label class="switch-row">
                  <input id="pack-standard-enabled-input" type="checkbox" checked />
                  <span>Enabled</span>
                </label>
                <div class="db-actions">
                  <button id="pack-standard-save-btn" class="icon-btn primary-btn" type="submit">Save</button>
                  <button id="pack-standard-delete-btn" class="icon-btn danger-btn" type="button" hidden>Delete</button>
                  <button id="pack-standard-cancel-btn" class="icon-btn" type="button">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      <div id="pack-check-toast" class="check-toast" hidden>
        <span id="pack-check-toast-text">Packed</span>
      </div>

      <div id="pack-conflict-modal" class="modal">
        <div class="modal-content">
          <div class="modal-header">
            <h2>Conflict Detected</h2>
            <button id="pack-close-conflict-btn" class="icon-btn" type="button">✕</button>
          </div>
          <p id="pack-conflict-message"></p>
          <div class="db-actions">
            <button id="pack-resolve-conflict-btn" class="icon-btn" type="button">OK</button>
          </div>
        </div>
      </div>`;
  }

  function cacheEls() {
    const q = (id) => root.querySelector(`#${id}`);

    el.backBtn = q("pack-back-btn");
    el.loading = q("pack-loading");
    el.main = q("pack-main");
    el.optionsMenu = q("pack-options-menu");
    el.undoBtn = q("pack-undo-btn");
    el.settingsBtn = q("pack-settings-btn");
    el.travellersBtn = q("pack-travellers-btn");
    el.wizardBtn = q("pack-wizard-btn");
    el.standardBtn = q("pack-standard-btn");
    el.unpackBtn = q("pack-unpack-btn");

    el.tripTitle = q("pack-trip-title");
    el.tripSubtitle = q("pack-trip-subtitle");
    el.tripChips = q("pack-trip-chips");
    el.progressBar = q("pack-progress-bar");
    el.progressText = q("pack-progress-text");

    el.topTabBtns = Array.from(root.querySelectorAll(".top-tab-bar .tab-btn"));
    el.topPaneItinerary = q("pack-top-pane-itinerary");
    el.topPanePacking = q("pack-top-pane-packing");

    el.tabBtns = Array.from(q("pack-top-pane-packing").querySelectorAll(".tab-bar .tab-btn"));
    el.paneMine = q("pack-pane-mine");
    el.paneShared = q("pack-pane-shared");
    el.paneEveryone = q("pack-pane-everyone");
    el.listOptionsBtn = q("pack-list-options-btn");
    el.listOptionsMenu = q("pack-list-options-menu");
    el.removeAllBtn = q("pack-remove-all-btn");
    el.runWizardBtn = q("pack-run-wizard-btn");
    el.itemDatabaseBtn = q("pack-item-database-btn");
    el.mineSections = q("pack-mine-sections");
    el.mineEmpty = q("pack-mine-empty");
    el.sharedSections = q("pack-shared-sections");
    el.sharedEmpty = q("pack-shared-empty");
    el.sharedOwnerFilter = q("pack-shared-owner-filter");
    el.everyoneSummary = q("pack-everyone-summary");

    el.itineraryTableWrap = q("pack-itinerary-table-wrap");
    el.itineraryEmpty = q("pack-itinerary-empty");

    el.tripNotesInput = q("pack-trip-notes-input");
    el.tripNotesSaveBtn = q("pack-trip-notes-save-btn");

    el.addCard = q("pack-add-card");
    el.addFabBtn = q("pack-add-fab-btn");
    el.addForm = q("pack-add-form");
    el.itemName = q("pack-item-entry");
    el.itemOptions = q("pack-item-options");
    el.itemCategory = q("pack-item-category");
    el.itemQty = q("pack-item-qty");
    el.itemScope = q("pack-item-scope");
    el.itemOwner = q("pack-item-owner");

    el.settingsModal = q("pack-trip-settings-modal");
    el.closeSettingsBtn = q("pack-close-settings-btn");
    el.settingsForm = q("pack-settings-form");
    el.settingsSeasonInput = q("pack-settings-season-input");
    el.settingsTypesInput = q("pack-settings-types-input");
    el.settingsNotesInput = q("pack-settings-notes-input");

    el.travellersModal = q("pack-travellers-modal");
    el.closeTravellersBtn = q("pack-close-travellers-btn");
    el.travellersList = q("pack-travellers-list");
    el.travellerForm = q("pack-traveller-form");
    el.travellerNameInput = q("pack-traveller-name-input");

    el.dayEditModal = q("pack-day-edit-modal");
    el.closeDayEditBtn = q("pack-close-day-edit-btn");
    el.dayEditTitle = q("pack-day-edit-title");
    el.dayEditBody = q("pack-day-edit-body");
    el.daySaveBtn = q("pack-day-save-btn");
    el.dayCancelBtn = q("pack-day-cancel-btn");

    el.wizardModal = q("pack-wizard-modal");
    el.closeWizardBtn = q("pack-close-wizard-btn");
    el.wizardStep1 = q("pack-wizard-step-1");
    el.wizardStep2 = q("pack-wizard-step-2");
    el.wizardStep3 = q("pack-wizard-step-3");
    el.wizardSeasonInput = q("pack-wizard-season-input");
    el.wizardTypesInput = q("pack-wizard-types-input");
    el.wizardDaysNote = q("pack-wizard-days-note");
    el.wizardTravellers = q("pack-wizard-travellers");
    el.wizardPreview = q("pack-wizard-preview");
    el.wizardPreviewEmpty = q("pack-wizard-preview-empty");
    el.wizardBackBtn = q("pack-wizard-back-btn");
    el.wizardNextBtn = q("pack-wizard-next-btn");
    el.wizardApplyBtn = q("pack-wizard-apply-btn");

    el.standardModal = q("pack-standard-modal");
    el.closeStandardBtn = q("pack-close-standard-btn");
    el.standardList = q("pack-standard-list");
    el.standardFilterInput = q("pack-standard-filter-input");
    el.addStandardBtn = q("pack-add-standard-btn");
    el.standardFeedback = q("pack-standard-feedback");
    el.standardEditPopup = q("pack-standard-edit-popup");
    el.standardEditTitle = q("pack-standard-edit-title");
    el.standardForm = q("pack-standard-form");
    el.standardNameInput = q("pack-standard-name-input");
    el.standardCategoryInput = q("pack-standard-category-input");
    el.standardAppliesInput = q("pack-standard-applies-input");
    el.standardBaseInput = q("pack-standard-base-input");
    el.standardPerDayInput = q("pack-standard-perday-input");
    el.standardMaxInput = q("pack-standard-max-input");
    el.standardSeasonsInput = q("pack-standard-seasons-input");
    el.standardTypesInput = q("pack-standard-types-input");
    el.standardEnabledInput = q("pack-standard-enabled-input");
    el.standardDeleteBtn = q("pack-standard-delete-btn");
    el.standardCancelBtn = q("pack-standard-cancel-btn");

    el.checkToast = q("pack-check-toast");
    el.checkToastText = q("pack-check-toast-text");

    el.conflictModal = q("pack-conflict-modal");
    el.conflictMessage = q("pack-conflict-message");
    el.closeConflictBtn = q("pack-close-conflict-btn");
    el.resolveConflictBtn = q("pack-resolve-conflict-btn");
  }

  function bindEvents() {
    el.backBtn.addEventListener("click", close);
    el.undoBtn.addEventListener("click", undoLastAction);
    el.settingsBtn.addEventListener("click", openSettingsModal);
    el.travellersBtn.addEventListener("click", openTravellersModal);
    el.wizardBtn.addEventListener("click", openWizard);
    el.standardBtn.addEventListener("click", openStandardModal);
    el.unpackBtn.addEventListener("click", unpackEverything);

    el.topTabBtns.forEach((btn) => btn.addEventListener("click", onTopTabClick));
    el.tabBtns.forEach((btn) => btn.addEventListener("click", () => setTab(btn.dataset.tab)));
    el.listOptionsBtn.addEventListener("click", toggleListOptionsMenu);
    el.removeAllBtn.addEventListener("click", () => { closeListOptionsMenu(); removeAllItems(); });
    el.runWizardBtn.addEventListener("click", () => { closeListOptionsMenu(); openWizard(); });
    el.itemDatabaseBtn.addEventListener("click", () => { closeListOptionsMenu(); openStandardModal(); });

    el.mineSections.addEventListener("click", onItemListClick);
    el.mineSections.addEventListener("change", onItemListChange);
    el.sharedSections.addEventListener("click", onItemListClick);
    el.sharedSections.addEventListener("change", onItemListChange);
    el.everyoneSummary.addEventListener("click", onItemListClick);
    el.everyoneSummary.addEventListener("change", onItemListChange);
    el.sharedOwnerFilter.addEventListener("click", onSharedFilterClick);
    el.itineraryTableWrap.addEventListener("click", onItineraryTableClick);
    el.tripNotesInput.addEventListener("input", updateTripNotesSaveState);
    el.tripNotesSaveBtn.addEventListener("click", onTripNotesSaveClick);

    el.addFabBtn.addEventListener("click", () => setAddPanelOpen(true));
    el.addForm.addEventListener("submit", onAddItemSubmit);
    el.itemName.addEventListener("input", renderNameSuggestions);
    el.itemName.addEventListener("keydown", onSuggestionKeyDown);
    el.itemOptions.addEventListener("click", onSuggestionClick);
    el.itemScope.addEventListener("change", updateOwnerSelectVisibility);
    el.itemCategory.addEventListener("change", () => { categoryManuallySet = true; });

    el.closeSettingsBtn.addEventListener("click", () => closeModal(el.settingsModal));
    el.settingsForm.addEventListener("submit", onSettingsFormSubmit);

    el.closeTravellersBtn.addEventListener("click", () => closeModal(el.travellersModal));
    el.travellerForm.addEventListener("submit", onTravellerFormSubmit);
    el.travellersList.addEventListener("click", onTravellersListClick);

    el.closeDayEditBtn.addEventListener("click", () => closeModal(el.dayEditModal));
    el.dayCancelBtn.addEventListener("click", () => closeModal(el.dayEditModal));
    el.daySaveBtn.addEventListener("click", onDaySaveClick);
    el.dayEditBody.addEventListener("change", onDayEditFieldChange);
    el.dayEditBody.addEventListener("click", onDayEditApplyAllClick);

    el.closeWizardBtn.addEventListener("click", () => closeModal(el.wizardModal));
    el.wizardNextBtn.addEventListener("click", wizardNext);
    el.wizardBackBtn.addEventListener("click", wizardBack);
    el.wizardApplyBtn.addEventListener("click", applyWizard);
    el.wizardTravellers.addEventListener("change", renderWizardTravellers);
    el.wizardPreview.addEventListener("change", onWizardPreviewChange);
    el.wizardPreview.addEventListener("click", onWizardPreviewClick);

    el.closeStandardBtn.addEventListener("click", () => closeModal(el.standardModal));
    el.addStandardBtn.addEventListener("click", () => openStandardEditor(null));
    el.standardFilterInput.addEventListener("input", () => {
      state.standardFilter = el.standardFilterInput.value.trim().toLowerCase();
      renderStandardList();
    });
    el.standardList.addEventListener("click", onStandardListClick);
    el.standardForm.addEventListener("submit", onStandardFormSubmit);
    el.standardDeleteBtn.addEventListener("click", deleteEditedStandardItem);
    el.standardCancelBtn.addEventListener("click", closeStandardEditor);

    el.closeConflictBtn.addEventListener("click", acknowledgeConflict);
    el.resolveConflictBtn.addEventListener("click", acknowledgeConflict);

    root.addEventListener("click", (e) => {
      if (!el.itemOptions.hidden && !e.target.closest(".add-layout")) hideSuggestions();
      if (addPanelOpen && !e.target.closest(".add-card") && !e.target.closest(".add-fab-btn")) {
        setAddPanelOpen(false);
      }
      if (!el.listOptionsMenu.hidden && !e.target.closest("#pack-list-options-btn") && !e.target.closest("#pack-list-options-menu")) {
        closeListOptionsMenu();
      }
    });

    root.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!el.standardEditPopup.hidden) return closeStandardEditor();
      const open = root.querySelector(".modal.is-open");
      if (open) closeModal(open);
      else if (!el.listOptionsMenu.hidden) closeListOptionsMenu();
      else if (addPanelOpen) setAddPanelOpen(false);
      else if (!el.optionsMenu.hidden) closeOptionsMenu();
    });
  }

  // ---------------------------------------------------------------------
  // Rendering — same shape as the standalone app, holiday_id in place of
  // trip_id, currentTrip() standing in for the old activeTrip().
  // ---------------------------------------------------------------------

  function currentTrip() {
    if (!state.holiday) return null;
    return {
      id: state.holiday.id,
      name: state.holiday.location,
      destination: state.holiday.country,
      start_date: state.holiday.startDate,
      end_date: state.holiday.endDate,
      season: state.tripMeta?.season || "Any",
      trip_types: state.tripMeta?.trip_types || [],
      notes: state.tripMeta?.notes || ""
    };
  }

  function render() {
    el.undoBtn.disabled = !state.lastAction;
    el.undoBtn.textContent = state.lastAction ? `Undo ${state.lastAction.label}` : "Undo";

    const trip = currentTrip();
    if (!trip) return;

    el.tripTitle.textContent = `PackIt - ${trip.name || "Trip"}`;
    const days = tripDays(trip);
    const bits = [trip.destination, formatTripDates(trip), days ? `${days} ${days === 1 ? "day" : "days"}` : ""].filter(Boolean);
    if (state.holiday.status) bits.push(state.holiday.status);
    el.tripSubtitle.textContent = bits.join(" · ") || "No dates set";

    const chips = [];
    if (trip.season && trip.season !== "Any") chips.push(trip.season);
    chips.push(...(trip.trip_types || []));
    el.tripChips.innerHTML = chips.map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join("");

    const items = tripItems(trip.id);
    const packed = items.filter((i) => i.packed).length;
    const pct = items.length ? Math.round((packed / items.length) * 100) : 0;
    el.progressBar.style.width = `${pct}%`;
    el.progressText.textContent = `${packed}/${items.length} packed`;

    renderOwnerSelect();
    applyTopTab();
    setTabButtons();
    renderMine();
    renderShared();
    renderEveryone();
    renderItinerary();
    renderTripNotes();
  }

  function applyTopTab() {
    el.topTabBtns.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.topTab === state.topTab));
    el.topPaneItinerary.hidden = state.topTab !== "itinerary";
    el.topPanePacking.hidden = state.topTab !== "packing";
    const onPacking = !state.loading && state.topTab === "packing";
    el.addFabBtn.hidden = !onPacking || addPanelOpen;
    el.addCard.hidden = !onPacking || !addPanelOpen;
    root.classList.toggle("add-panel-open", onPacking && addPanelOpen);
  }

  function setAddPanelOpen(open) {
    addPanelOpen = open;
    applyTopTab();
    if (open) el.itemName.focus();
    else hideSuggestions();
  }

  function setTopTab(tab) {
    state.topTab = tab === "packing" ? "packing" : "itinerary";
    localStorage.setItem(TOP_TAB_KEY, state.topTab);
    addPanelOpen = false;
    closeListOptionsMenu();
    applyTopTab();
  }

  function onTopTabClick(e) {
    const btn = e.target.closest("[data-top-tab]");
    if (!btn) return;
    setTopTab(btn.dataset.topTab);
  }

  function setTab(tab) {
    state.tab = tab;
    closeListOptionsMenu();
    setTabButtons();
    render();
  }

  function toggleListOptionsMenu() {
    const opening = el.listOptionsMenu.hidden;
    el.listOptionsMenu.hidden = !opening;
    el.listOptionsBtn.setAttribute("aria-expanded", String(opening));
  }

  function closeListOptionsMenu() {
    el.listOptionsMenu.hidden = true;
    el.listOptionsBtn.setAttribute("aria-expanded", "false");
  }

  function setTabButtons() {
    el.tabBtns.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.tab === state.tab));
    el.paneMine.hidden = state.tab !== "mine";
    el.paneShared.hidden = state.tab !== "shared";
    el.paneEveryone.hidden = state.tab !== "everyone";
  }


  function renderOwnerSelect() {
    const people = tripTravellers(state.holiday.id);
    el.itemOwner.innerHTML =
      `<option value="">Unassigned</option>` +
      people.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("");
    updateOwnerSelectVisibility();
  }

  function updateOwnerSelectVisibility() {
    el.itemOwner.hidden = el.itemScope.value !== "shared";
  }

  function renderMine() {
    const mine = tripItems(state.holiday.id).filter((i) => i.scope === "personal" && i.traveller_id === state.whoami);
    el.mineSections.innerHTML = groupedSectionsHtml(mine);
    el.mineEmpty.hidden = mine.length > 0;
  }

  function renderShared() {
    const people = tripTravellers(state.holiday.id);
    const shared = tripItems(state.holiday.id).filter((i) => i.scope === "shared");

    const filters = [{ id: "all", name: "All" }, ...people, { id: "unassigned", name: "Unassigned" }];
    el.sharedOwnerFilter.innerHTML = filters
      .map((f) => {
        const count =
          f.id === "all" ? shared.length
          : f.id === "unassigned" ? shared.filter((i) => !i.traveller_id).length
          : shared.filter((i) => i.traveller_id === f.id).length;
        const active = state.sharedOwnerFilter === f.id ? " is-active" : "";
        return `<button class="chip chip-btn${active}" type="button" data-owner-filter="${f.id}">${escapeHtml(f.name)} ${count}</button>`;
      })
      .join("");

    let visible = shared;
    if (state.sharedOwnerFilter === "unassigned") visible = shared.filter((i) => !i.traveller_id);
    else if (state.sharedOwnerFilter !== "all") visible = shared.filter((i) => i.traveller_id === state.sharedOwnerFilter);

    el.sharedSections.innerHTML = groupedSectionsHtml(visible, { showOwner: true });
    el.sharedEmpty.hidden = visible.length > 0;
  }

  function onSharedFilterClick(e) {
    const btn = e.target.closest("[data-owner-filter]");
    if (!btn) return;
    state.sharedOwnerFilter = btn.dataset.ownerFilter;
    renderShared();
  }

  function renderEveryone() {
    const people = tripTravellers(state.holiday.id);
    const items = tripItems(state.holiday.id);
    const blocks = [];

    for (const person of people) {
      const own = items.filter(
        (i) => (i.scope === "personal" && i.traveller_id === person.id) || (i.scope === "shared" && i.traveller_id === person.id)
      );
      const packed = own.filter((i) => i.packed).length;
      const pct = own.length ? Math.round((packed / own.length) * 100) : 0;
      blocks.push(`
        <details class="person-block card" ${own.length && packed < own.length ? "open" : ""}>
          <summary>
            <span class="person-name">${escapeHtml(person.name)}</span>
            <span class="person-count">${packed}/${own.length}</span>
            <span class="progress-track slim"><span class="progress-bar" style="width:${pct}%"></span></span>
          </summary>
          ${own.length ? `<ul class="item-list">${own.map((i) => itemRowHtml(i, { showOwner: false, compact: true })).join("")}</ul>` : `<p class="empty-note">Nothing assigned.</p>`}
        </details>`);
    }

    const unassigned = items.filter((i) => i.scope === "shared" && !i.traveller_id);
    if (unassigned.length) {
      blocks.push(`
        <details class="person-block card" open>
          <summary>
            <span class="person-name">Unassigned</span>
            <span class="person-count">${unassigned.length}</span>
            <span class="progress-track slim"><span class="progress-bar" style="width:0%"></span></span>
          </summary>
          <ul class="item-list">${unassigned.map((i) => itemRowHtml(i, { showOwner: true, compact: true })).join("")}</ul>
        </details>`);
    }

    el.everyoneSummary.innerHTML = blocks.length ? blocks.join("") : `<p class="empty-note">Add travellers to see who is packing what.</p>`;
  }

  function groupedSectionsHtml(items, opts = {}) {
    const byCategory = new Map();
    for (const item of items) {
      const key = CATEGORIES.includes(item.category) ? item.category : "Other";
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key).push(item);
    }

    return CATEGORIES.filter((c) => byCategory.has(c))
      .map((category) => {
        const rows = byCategory.get(category).sort(byItemSort);
        const packed = rows.filter((i) => i.packed).length;
        return `
          <section class="card section-card">
            <header class="section-head">
              <h3>${escapeHtml(category)}</h3>
              <span class="section-count">${packed}/${rows.length}</span>
            </header>
            <ul class="item-list">${rows.map((i) => itemRowHtml(i, opts)).join("")}</ul>
          </section>`;
      })
      .join("");
  }

  function byItemSort(a, b) {
    if (Boolean(a.packed) !== Boolean(b.packed)) return a.packed ? 1 : -1;
    if ((a.sort_order || 0) !== (b.sort_order || 0)) return (a.sort_order || 0) - (b.sort_order || 0);
    return (a.name || "").localeCompare(b.name || "");
  }

  function itemRowHtml(item, opts = {}) {
    const people = tripTravellers(item.holiday_id);
    const ownerSelect =
      opts.showOwner && !opts.compact
        ? `<select class="owner-select" data-owner-for="${item.id}" aria-label="Owner">
             <option value="">Unassigned</option>
             ${people.map((t) => `<option value="${t.id}"${t.id === item.traveller_id ? " selected" : ""}>${escapeHtml(t.name)}</option>`).join("")}
           </select>`
        : "";
    const ownerTag =
      opts.showOwner && opts.compact
        ? `<span class="owner-tag">${escapeHtml(travellerName(item.traveller_id) || "Unassigned")}</span>`
        : "";
    const sharedTag = item.scope === "shared" && !opts.showOwner ? `<span class="owner-tag">Shared</span>` : "";

    return `
      <li class="item-row${item.packed ? " is-packed" : ""}">
        <button class="item-main-btn" type="button" data-toggle-item="${item.id}">
          <span class="check-box">${item.packed ? "✓" : ""}</span>
          <span class="item-name">${escapeHtml(item.name)}</span>
          ${item.quantity > 1 ? `<span class="qty-badge">×${item.quantity}</span>` : ""}
          ${sharedTag}
          ${ownerTag}
        </button>
        ${
          opts.compact
            ? ""
            : `<div class="item-actions">
                 ${ownerSelect}
                 <button class="qty-btn" type="button" data-qty-down="${item.id}" aria-label="Decrease quantity">−</button>
                 <button class="qty-btn" type="button" data-qty-up="${item.id}" aria-label="Increase quantity">+</button>
                 <button class="delete-btn" type="button" data-delete-item="${item.id}" aria-label="Delete item">✕</button>
               </div>`
        }
      </li>`;
  }

  function onItemListClick(e) {
    const toggle = e.target.closest("[data-toggle-item]");
    if (toggle) return togglePacked(toggle.dataset.toggleItem);
    const up = e.target.closest("[data-qty-up]");
    if (up) return changeQuantity(up.dataset.qtyUp, 1);
    const down = e.target.closest("[data-qty-down]");
    if (down) return changeQuantity(down.dataset.qtyDown, -1);
    const del = e.target.closest("[data-delete-item]");
    if (del) return deleteItem(del.dataset.deleteItem);
  }

  function onItemListChange(e) {
    const owner = e.target.closest("[data-owner-for]");
    if (owner) setItemOwner(owner.dataset.ownerFor, owner.value || null);
  }

  // ---------------------------------------------------------------------
  // Itinerary
  // ---------------------------------------------------------------------

  function tripDateList(trip) {
    if (!trip?.start_date || !trip?.end_date) return [];
    const start = new Date(`${trip.start_date}T00:00:00Z`);
    const end = new Date(`${trip.end_date}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
    const dates = [];
    for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
      dates.push(new Date(t).toISOString().slice(0, 10));
    }
    return dates;
  }

  function dayRowFor(holidayId, dateStr) {
    return state.tripDays.find((d) => !d.deleted_at && d.holiday_id === holidayId && d.day_date === dateStr) || null;
  }

  function getOrCreateDayRow(holidayId, dateStr) {
    const existing = dayRowFor(holidayId, dateStr);
    if (existing) return existing;
    const row = {
      id: crypto.randomUUID(),
      holiday_id: holidayId,
      household_id: APP_CONFIG.householdId,
      day_date: dateStr,
      accommodation: null, transport: null, breakfast: null, lunch: null, dinner: null, notes: null,
      plan_all_day: false, plan_all_day_span: "morning_afternoon", plan_all_day_text: null,
      plan_morning: null, plan_afternoon: null, plan_evening: null,
      deleted_at: null, updated_at: new Date().toISOString(), updated_by: currentUserId
    };
    state.tripDays.push(row);
    return row;
  }

  function renderItinerary() {
    const trip = currentTrip();
    if (!trip) return;

    const dates = tripDateList(trip);
    if (!dates.length) {
      el.itineraryTableWrap.innerHTML = "";
      el.itineraryEmpty.hidden = false;
      return;
    }
    // The table itself is read-only (editing happens in the day-edit
    // popup, a separate piece of DOM) — safe to rebuild unconditionally,
    // there's never a focused input inside it to lose.
    el.itineraryEmpty.hidden = true;
    el.itineraryTableWrap.innerHTML = itineraryTableHtml(trip, dates);
  }

  function computeMergeRuns(dates, getValue) {
    const runStart = new Array(dates.length).fill(true);
    const rowSpan = new Array(dates.length).fill(1);
    let i = 0;
    while (i < dates.length) {
      const value = getValue(dates[i]);
      let j = i + 1;
      if (value) {
        while (j < dates.length && getValue(dates[j]) === value) j++;
      }
      rowSpan[i] = j - i;
      for (let k = i + 1; k < j; k++) runStart[k] = false;
      i = j;
    }
    return { runStart, rowSpan };
  }

  const DAY_FIELD_LABELS = {
    accommodation: "Accommodation",
    transport: "Transport",
    breakfast: "Breakfast",
    lunch: "Lunch",
    dinner: "Dinner",
    notes: "Notes"
  };

  // Column order: Day, Travel, Activities (Morning/Afternoon/Evening —
  // grouped under a shared header, contiguous so an all-day entry can
  // still use a single spanning <td>), Meals (Breakfast/Lunch/Dinner —
  // grouped under a shared header), Accommodation, Notes.
  const PLAN_SLOTS = ["morning", "afternoon", "evening"];
  const MEAL_FIELDS = ["breakfast", "lunch", "dinner"];

  function itineraryTableHtml(trip, dates) {
    const cell = (v) => escapeHtml(v || "—");
    const rowFor = (dateStr) => dayRowFor(trip.id, dateStr) || {};
    const hasText = (v) => Boolean((v || "").trim());

    // Skip a column entirely (header + cells) when no day in the trip has
    // anything in it — most trips only ever fill in a handful of these.
    const hasData = (field) => dates.some((d) => hasText(rowFor(d)[field]));
    const transportVisible = hasData("transport");
    const accommodationVisible = hasData("accommodation");
    const notesVisible = hasData("notes");
    const visibleMeals = MEAL_FIELDS.filter(hasData);

    // Each plan slot is checked independently, same as every other
    // column — a slot counts as "populated" either from its own field on
    // a non-all-day day, or from an all-day entry whose span visually
    // covers it (morning_afternoon covers morning+afternoon; full_day
    // covers all three). An empty all-day entry (toggled on, nothing
    // typed yet) contributes nothing either way.
    const slotVisible = { morning: false, afternoon: false, evening: false };
    for (const d of dates) {
      const row = rowFor(d);
      if (row.plan_all_day) {
        const span = row.plan_all_day_span === "full_day" ? "full_day" : "morning_afternoon";
        if (hasText(row.plan_all_day_text)) {
          slotVisible.morning = true;
          slotVisible.afternoon = true;
          if (span === "full_day") slotVisible.evening = true;
        }
        if (span !== "full_day" && hasText(row.plan_evening)) slotVisible.evening = true;
      } else {
        if (hasText(row.plan_morning)) slotVisible.morning = true;
        if (hasText(row.plan_afternoon)) slotVisible.afternoon = true;
        if (hasText(row.plan_evening)) slotVisible.evening = true;
      }
    }
    const visibleSlots = PLAN_SLOTS.filter((s) => slotVisible[s]);
    const hasAnyColumn = transportVisible || accommodationVisible || notesVisible || visibleMeals.length > 0 || visibleSlots.length > 0;

    if (!hasAnyColumn) {
      const rows = dates
        .map(
          (dateStr, i) => `
          <tr>
            <td class="day-table-date">
              <button type="button" class="edit-day-btn" data-edit-day="${dateStr}" aria-label="Edit ${escapeHtml(formatDayHeading(dateStr, i + 1))}">✎</button>
              ${escapeHtml(formatDayHeading(dateStr, i + 1))}
            </td>
            <td class="empty-hint">Click Edit to add Details</td>
          </tr>`
        )
        .join("");
      return `
        <div class="table-scroll">
          <table class="itinerary-table">
            <thead><tr><th>Day</th><th>Details</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    const mergedFields = [
      ...(transportVisible ? ["transport"] : []),
      ...visibleMeals,
      ...(accommodationVisible ? ["accommodation"] : []),
      ...(notesVisible ? ["notes"] : [])
    ];
    const merges = {};
    for (const field of mergedFields) {
      merges[field] = computeMergeRuns(dates, (dateStr) => rowFor(dateStr)[field] || "");
    }
    const mergeCell = (field, row, i) => {
      const { runStart, rowSpan } = merges[field];
      if (!runStart[i]) return "";
      const spanAttr = rowSpan[i] > 1 ? ` rowspan="${rowSpan[i]}"` : "";
      return `<td${spanAttr}>${cell(row[field])}</td>`;
    };

    // Morning/Afternoon/Evening are contiguous again (the Meals group sits
    // after them, not in between), so an all-day entry goes back to a
    // single spanning <td> across whichever of its covered slots are
    // actually visible columns.
    const activityCellsHtml = (row) => {
      if (!visibleSlots.length) return "";
      const allDay = Boolean(row.plan_all_day);
      const span = row.plan_all_day_span === "full_day" ? "full_day" : "morning_afternoon";
      if (!allDay) {
        const value = { morning: row.plan_morning, afternoon: row.plan_afternoon, evening: row.plan_evening };
        return visibleSlots.map((slot) => `<td>${cell(value[slot])}</td>`).join("");
      }
      const coveredSlots = (span === "full_day" ? PLAN_SLOTS : ["morning", "afternoon"]).filter((s) => visibleSlots.includes(s));
      let html = "";
      if (coveredSlots.length) {
        const spanAttr = coveredSlots.length > 1 ? ` colspan="${coveredSlots.length}"` : "";
        html += `<td${spanAttr} class="all-day-cell">${cell(row.plan_all_day_text)}</td>`;
      }
      if (span !== "full_day" && visibleSlots.includes("evening")) {
        html += `<td>${cell(row.plan_evening)}</td>`;
      }
      return html;
    };

    const rows = dates
      .map((dateStr, i) => {
        const row = rowFor(dateStr);
        return `
          <tr>
            <td class="day-table-date">
              <button type="button" class="edit-day-btn" data-edit-day="${dateStr}" aria-label="Edit ${escapeHtml(formatDayHeading(dateStr, i + 1))}">✎</button>
              ${escapeHtml(formatDayHeading(dateStr, i + 1))}
            </td>
            ${transportVisible ? mergeCell("transport", row, i) : ""}
            ${activityCellsHtml(row)}
            ${visibleMeals.map((field) => mergeCell(field, row, i)).join("")}
            ${accommodationVisible ? mergeCell("accommodation", row, i) : ""}
            ${notesVisible ? mergeCell("notes", row, i) : ""}
          </tr>`;
      })
      .join("");

    // Activities/Meals get a shared group header (colspan) over a second
    // header row listing just their own visible columns; everything else
    // (Day/Travel/Accommodation/Notes) spans both header rows instead —
    // unless neither group has anything visible, in which case skip the
    // second row entirely rather than render one that's empty.
    const hasGroupedColumns = visibleSlots.length > 0 || visibleMeals.length > 0;
    const slotLabel = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const soloHead = (visible, label) => (visible ? `<th${hasGroupedColumns ? ' rowspan="2"' : ""}>${label}</th>` : "");

    const headRow1 =
      `<th${hasGroupedColumns ? ' rowspan="2"' : ""}>Day</th>` +
      soloHead(transportVisible, DAY_FIELD_LABELS.transport) +
      (visibleSlots.length ? `<th colspan="${visibleSlots.length}">Activities</th>` : "") +
      (visibleMeals.length ? `<th colspan="${visibleMeals.length}">Meals</th>` : "") +
      soloHead(accommodationVisible, DAY_FIELD_LABELS.accommodation) +
      soloHead(notesVisible, DAY_FIELD_LABELS.notes);

    const headRow2 = hasGroupedColumns
      ? `<tr>${visibleSlots.map((s) => `<th>${slotLabel(s)}</th>`).join("")}${visibleMeals.map((f) => `<th>${DAY_FIELD_LABELS[f]}</th>`).join("")}</tr>`
      : "";

    return `
      <div class="table-scroll">
        <table class="itinerary-table">
          <thead><tr>${headRow1}</tr>${headRow2}</thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function formatDayHeading(dateStr, dayNumber) {
    const label = new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    return `Day ${dayNumber} · ${label}`;
  }

  // ---------------------------------------------------------------------
  // Trip notes — one free-text field per trip (trip_meta.notes, the same
  // field the old Trip Settings modal edited). Save is disabled until the
  // textarea's value actually differs from what's saved, and — same
  // reasoning as the itinerary fields — only gets its value refreshed
  // from state when it's both clean (no unsaved local edit) and not
  // focused, so a background sync can never silently overwrite something
  // the user is mid-typing, but still picks up a change synced in from
  // elsewhere once the field's left alone.
  // ---------------------------------------------------------------------

  function renderTripNotes() {
    if (!state.tripMeta) return;
    const saved = state.tripMeta.notes || "";
    // Nothing's been displayed yet this open() — always populate, since
    // there's no possibility of clobbering a user edit before one exists.
    if (lastSyncedTripNotes === null) {
      el.tripNotesInput.value = saved;
      lastSyncedTripNotes = saved;
      updateTripNotesSaveState();
      return;
    }
    const isDirty = el.tripNotesInput.value.trim() !== lastSyncedTripNotes.trim();
    const isFocused = document.activeElement === el.tripNotesInput;
    if (!isDirty && !isFocused) {
      el.tripNotesInput.value = saved;
      lastSyncedTripNotes = saved;
    }
    updateTripNotesSaveState();
  }

  function updateTripNotesSaveState() {
    const saved = (state.tripMeta?.notes || "").trim();
    el.tripNotesSaveBtn.disabled = el.tripNotesInput.value.trim() === saved;
  }

  async function onTripNotesSaveClick() {
    if (!state.tripMeta) return;
    const value = el.tripNotesInput.value.trim();
    state.tripMeta.notes = value || null;
    lastSyncedTripNotes = value;
    touch(state.tripMeta);
    await persistLocal();
    await enqueue(state.tripMeta, "trip_meta");
    updateTripNotesSaveState();
    showToast("Notes saved");
    syncNow();
  }

  // The table view's per-row edit popup builds its form from this.
  function dayFieldsBodyHtml(row) {
    const allDay = Boolean(row.plan_all_day);
    const span = row.plan_all_day_span === "full_day" ? "full_day" : "morning_afternoon";
    const showEveningField = !allDay || span === "morning_afternoon";
    const val = (v) => escapeHtml(v || "");

    const plansHtml = allDay
      ? `
        <div class="day-field-row">
          <select data-day-field="plan_all_day_span" aria-label="All day spans">
            <option value="morning_afternoon"${span === "morning_afternoon" ? " selected" : ""}>Morning + Afternoon</option>
            <option value="full_day"${span === "full_day" ? " selected" : ""}>Morning + Afternoon + Evening</option>
          </select>
        </div>
        <label>Plan
          <input type="text" data-day-field="plan_all_day_text" value="${val(row.plan_all_day_text)}" placeholder="What's happening" />
        </label>
        ${showEveningField ? `<label>Evening<input type="text" data-day-field="plan_evening" value="${val(row.plan_evening)}" placeholder="Evening plan" /></label>` : ""}`
      : `
        <div class="day-field-row three-col">
          <label>Morning<input type="text" data-day-field="plan_morning" value="${val(row.plan_morning)}" /></label>
          <label>Afternoon<input type="text" data-day-field="plan_afternoon" value="${val(row.plan_afternoon)}" /></label>
          <label>Evening<input type="text" data-day-field="plan_evening" value="${val(row.plan_evening)}" /></label>
        </div>`;

    return `
      <div class="day-field-row">
        <div class="field-with-action">
          <div class="field-with-action-head">
            <span class="field-label">Accommodation</span>
            <button type="button" class="apply-all-btn" data-apply-all-field="accommodation">Apply to all</button>
          </div>
          <input type="text" data-day-field="accommodation" value="${val(row.accommodation)}" placeholder="Hotel / Airbnb" />
        </div>
        <label>Transport<input type="text" data-day-field="transport" value="${val(row.transport)}" placeholder="Flight / train / taxi" /></label>
      </div>
      <div class="day-field-row three-col">
        <label>Breakfast<input type="text" data-day-field="breakfast" value="${val(row.breakfast)}" /></label>
        <label>Lunch<input type="text" data-day-field="lunch" value="${val(row.lunch)}" /></label>
        <label>Dinner<input type="text" data-day-field="dinner" value="${val(row.dinner)}" /></label>
      </div>
      <div class="day-plans">
        <div class="day-plans-head">
          <span class="day-plans-label">Plans</span>
          <label class="switch-row">
            <input type="checkbox" data-day-field="plan_all_day"${allDay ? " checked" : ""} />
            <span>All day</span>
          </label>
        </div>
        ${plansHtml}
      </div>
      <label>Notes<textarea data-day-field="notes" rows="2" placeholder="Anything else">${val(row.notes)}</textarea></label>`;
  }

  // The day-edit popup buffers all changes locally and only touches
  // state.tripDays when Save is clicked — Cancel (or the ✕/Escape/click-
  // outside paths, which all funnel through the same closeModal()) simply
  // discards whatever's in the form.
  let editingDayDate = null;

  function collectDayFieldsFromForm(container) {
    const values = {};
    container.querySelectorAll("[data-day-field]").forEach((input) => {
      const field = input.dataset.dayField;
      values[field] = input.type === "checkbox" ? input.checked : input.value.trim() || null;
    });
    return values;
  }

  function onItineraryTableClick(e) {
    const btn = e.target.closest("[data-edit-day]");
    if (!btn) return;
    openDayEditModal(btn.dataset.editDay);
  }

  function openDayEditModal(dateStr) {
    const trip = currentTrip();
    if (!trip) return;
    editingDayDate = dateStr;
    const dayNumber = tripDateList(trip).indexOf(dateStr) + 1;
    const row = dayRowFor(trip.id, dateStr) || {};
    el.dayEditTitle.textContent = formatDayHeading(dateStr, dayNumber);
    el.dayEditBody.innerHTML = `<div class="day-fields">${dayFieldsBodyHtml(row)}</div>`;
    openModal(el.dayEditModal);
  }

  // "All day" and its span selector are the only fields that change what
  // the rest of the form even looks like (morning/afternoon/evening vs. a
  // single combined field) — re-render just the popup's own body from
  // whatever's currently typed, without touching state.tripDays.
  function onDayEditFieldChange(e) {
    const field = e.target.dataset.dayField;
    if (field !== "plan_all_day" && field !== "plan_all_day_span") return;
    const container = el.dayEditBody.querySelector(".day-fields");
    if (!container) return;
    const pending = collectDayFieldsFromForm(container);
    container.innerHTML = dayFieldsBodyHtml(pending);
  }

  // "Apply to all" is a distinct, immediate bulk action (own toast, own
  // sync) rather than part of what Save/Cancel governs — matches how it
  // already behaved before this popup existed.
  async function onDayEditApplyAllClick(e) {
    const btn = e.target.closest("[data-apply-all-field]");
    if (!btn) return;
    const trip = currentTrip();
    if (!trip) return;
    const field = btn.dataset.applyAllField;
    const input = el.dayEditBody.querySelector(`[data-day-field="${field}"]`);
    if (!input) return;
    await applyFieldToAllDays(trip, field, input.value.trim() || null);
  }

  async function onDaySaveClick() {
    const trip = currentTrip();
    const container = el.dayEditBody.querySelector(".day-fields");
    if (!trip || !editingDayDate || !container) return closeModal(el.dayEditModal);

    const row = getOrCreateDayRow(trip.id, editingDayDate);
    Object.assign(row, collectDayFieldsFromForm(container));
    touch(row);

    await persistLocal();
    await enqueue(row, "trip_days");
    closeModal(el.dayEditModal);
    renderItinerary();
    showToast("Day saved");
    syncNow();
  }

  async function applyFieldToAllDays(trip, field, value) {
    const dates = tripDateList(trip);
    if (!dates.length) return;
    for (const dateStr of dates) {
      const row = getOrCreateDayRow(trip.id, dateStr);
      row[field] = value;
      touch(row);
      await enqueue(row, "trip_days");
    }
    await persistLocal();
    renderItinerary();
    showToast("Applied to all days");
    syncNow();
  }

  // ---------------------------------------------------------------------
  // Item mutations
  // ---------------------------------------------------------------------

  async function onAddItemSubmit(e) {
    e.preventDefault();
    const trip = currentTrip();
    if (!trip) return;
    const name = normalizeName(el.itemName.value);
    if (!name) return;

    const scope = el.itemScope.value === "shared" ? "shared" : "personal";
    const travellerId = scope === "shared" ? el.itemOwner.value || null : state.whoami;
    if (scope === "personal" && !travellerId) return showToast("Add a traveller first");

    const quantity = clampInt(el.itemQty.value, 1, 99, 1);
    // "More options" is collapsed by default, so most adds never touch the
    // category select — guess it from the name instead of silently taking
    // whatever the select's untouched first option happens to be. Once the
    // user has deliberately picked a category, respect it.
    const category = (categoryManuallySet ? el.itemCategory.value : guessCategory(name)) || el.itemCategory.value || "Other";

    const item = {
      id: crypto.randomUUID(), holiday_id: trip.id, household_id: APP_CONFIG.householdId,
      name, category, quantity, scope, traveller_id: travellerId,
      packed: false, packed_at: null, notes: null, source: "manual", standard_item_id: null, sort_order: 0,
      deleted_at: null, updated_at: new Date().toISOString(), updated_by: currentUserId
    };
    state.items.push(item);
    captureUndo("add", { itemId: item.id }, name);
    await persistLocal();
    await enqueue(item, "packing_items");

    el.itemName.value = "";
    el.itemQty.value = "1";
    el.itemCategory.value = "Clothes";
    categoryManuallySet = false;
    hideSuggestions();
    render();
    el.itemName.focus();
    showToast(`Added ${name}`);
    syncNow();
  }

  async function togglePacked(itemId) {
    const item = state.items.find((i) => i.id === itemId);
    if (!item) return;
    const nextPacked = !item.packed;
    captureUndo("pack", { itemId, previous: item.packed }, item.name);
    item.packed = nextPacked;
    item.packed_at = nextPacked ? new Date().toISOString() : null;
    touch(item);
    await persistLocal();
    await enqueue(item, "packing_items");
    render();
    showToast(`${item.name} ${nextPacked ? "packed" : "unpacked"}`);
    syncNow();
  }

  async function changeQuantity(itemId, delta) {
    const item = state.items.find((i) => i.id === itemId);
    if (!item) return;
    const next = clampInt((item.quantity || 1) + delta, 1, 99, 1);
    if (next === item.quantity) return;
    item.quantity = next;
    touch(item);
    await persistLocal();
    await enqueue(item, "packing_items");
    render();
    syncNow();
  }

  async function setItemOwner(itemId, travellerId) {
    const item = state.items.find((i) => i.id === itemId);
    if (!item) return;
    item.traveller_id = travellerId;
    touch(item);
    await persistLocal();
    await enqueue(item, "packing_items");
    render();
    showToast(`${item.name} → ${travellerName(travellerId) || "Unassigned"}`);
    syncNow();
  }

  async function deleteItem(itemId) {
    const item = state.items.find((i) => i.id === itemId);
    if (!item) return;
    captureUndo("delete", { itemId }, item.name);
    item.deleted_at = new Date().toISOString();
    touch(item);
    await persistLocal();
    await enqueue(item, "packing_items");
    render();
    showToast(`Removed ${item.name}`);
    syncNow();
  }

  async function unpackEverything() {
    closeOptionsMenu();
    const items = tripItems(state.holiday.id).filter((i) => i.packed);
    if (!items.length) return showToast("Nothing is packed yet");
    if (!confirm(`Mark ${items.length} item(s) as not packed?`)) return;

    captureUndo("unpackAll", { itemIds: items.map((i) => i.id) }, `${items.length} items`);
    for (const item of items) {
      item.packed = false;
      item.packed_at = null;
      touch(item);
      await enqueue(item, "packing_items");
    }
    await persistLocal();
    render();
    syncNow();
  }

  async function removeAllItems() {
    const trip = currentTrip();
    if (!trip) return;
    const items = tripItems(trip.id);
    if (!items.length) return showToast("No items to remove");
    if (!confirm(`Remove all ${items.length} item(s) from every list on this trip? This includes everyone's items, not just yours.`)) return;

    captureUndo("deleteAll", { itemIds: items.map((i) => i.id) }, `${items.length} items`);
    for (const item of items) {
      item.deleted_at = new Date().toISOString();
      touch(item);
      await enqueue(item, "packing_items");
    }
    await persistLocal();
    render();
    showToast(`Removed ${items.length} item${items.length === 1 ? "" : "s"}`);
    syncNow();
  }

  // ---------------------------------------------------------------------
  // Name suggestions
  // ---------------------------------------------------------------------

  function renderNameSuggestions() {
    const query = canonicalKey(el.itemName.value);
    if (query.length < 1) return hideSuggestions();
    const matches = state.standardItems.filter((s) => !s.deleted_at && canonicalKey(s.name).includes(query)).slice(0, 6);
    if (!matches.length) return hideSuggestions();

    suggestionActiveIndex = -1;
    el.itemOptions.innerHTML = matches
      .map((s) => `<button class="item-option" type="button" data-suggestion-name="${escapeHtml(s.name)}" data-suggestion-category="${escapeHtml(s.category)}">
           <span>${escapeHtml(s.name)}</span><span class="muted-line">${escapeHtml(s.category)}</span></button>`)
      .join("");
    el.itemOptions.hidden = false;
  }

  function onSuggestionClick(e) {
    const btn = e.target.closest("[data-suggestion-name]");
    if (!btn) return;
    applySuggestion(btn);
  }

  function applySuggestion(btn) {
    el.itemName.value = btn.dataset.suggestionName;
    if (CATEGORIES.includes(btn.dataset.suggestionCategory)) el.itemCategory.value = btn.dataset.suggestionCategory;
    hideSuggestions();
    el.itemName.focus();
  }

  function onSuggestionKeyDown(e) {
    if (el.itemOptions.hidden) return;
    const options = Array.from(el.itemOptions.querySelectorAll(".item-option"));
    if (!options.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      suggestionActiveIndex = (suggestionActiveIndex + step + options.length) % options.length;
      options.forEach((o, i) => o.classList.toggle("is-active", i === suggestionActiveIndex));
    } else if (e.key === "Enter" && suggestionActiveIndex >= 0) {
      e.preventDefault();
      applySuggestion(options[suggestionActiveIndex]);
    } else if (e.key === "Escape") {
      hideSuggestions();
    }
  }

  function hideSuggestions() {
    el.itemOptions.hidden = true;
    el.itemOptions.innerHTML = "";
    suggestionActiveIndex = -1;
  }

  function guessCategory(name) {
    const lower = (name || "").toLowerCase();
    const known = state.standardItems.find((s) => !s.deleted_at && canonicalKey(s.name) === canonicalKey(name));
    if (known && CATEGORIES.includes(known.category)) return known.category;
    for (const [category, words] of Object.entries(CATEGORY_KEYWORDS)) {
      if (words.some((w) => lower.includes(w))) return category;
    }
    return "Other";
  }

  // ---------------------------------------------------------------------
  // Trip settings (season / trip type / notes — everything else lives in
  // holidaycalendar.holidays, edited from that app's own modal)
  // ---------------------------------------------------------------------

  function openSettingsModal() {
    closeOptionsMenu();
    const trip = currentTrip();
    el.settingsSeasonInput.value = trip.season || "Any";
    setCheckboxGroup(el.settingsTypesInput, trip.trip_types || []);
    el.settingsNotesInput.value = trip.notes || "";
    openModal(el.settingsModal);
  }

  async function onSettingsFormSubmit(e) {
    e.preventDefault();
    state.tripMeta.season = el.settingsSeasonInput.value || "Any";
    state.tripMeta.trip_types = readCheckboxGroup(el.settingsTypesInput);
    state.tripMeta.notes = el.settingsNotesInput.value.trim() || null;
    touch(state.tripMeta);
    await persistLocal();
    await enqueue(state.tripMeta, "trip_meta");
    closeModal(el.settingsModal);
    render();
    showToast("Trip settings saved");
    syncNow();
  }

  // ---------------------------------------------------------------------
  // Travellers
  // ---------------------------------------------------------------------

  function openTravellersModal() {
    closeOptionsMenu();
    renderTravellersList();
    openModal(el.travellersModal);
    el.travellerNameInput.focus();
  }

  function renderTravellersList() {
    const people = tripTravellers(state.holiday.id);
    el.travellersList.innerHTML = people.length
      ? people.map((t) => `
        <li class="plain-row">
          <span>${escapeHtml(t.name)}</span>
          <span class="row-actions">
            <span class="muted-line">${travellerItemCount(t.id)} items</span>
            <button class="delete-btn" type="button" data-delete-traveller="${t.id}" aria-label="Remove traveller">✕</button>
          </span>
        </li>`).join("")
      : `<li class="empty-note">No travellers yet.</li>`;
  }

  async function onTravellerFormSubmit(e) {
    e.preventDefault();
    const name = normalizeName(el.travellerNameInput.value);
    if (!name || !state.holiday) return;
    await addTraveller(name);
    el.travellerNameInput.value = "";
    renderTravellersList();
    render();
  }

  async function addTraveller(name) {
    const people = tripTravellers(state.holiday.id);
    if (people.some((t) => canonicalKey(t.name) === canonicalKey(name))) {
      showToast(`${name} is already on this trip`);
      return null;
    }
    const person = {
      id: crypto.randomUUID(), holiday_id: state.holiday.id, household_id: APP_CONFIG.householdId,
      name, colour: null, sort_order: people.length * 10, deleted_at: null, updated_at: new Date().toISOString()
    };
    state.travellers.push(person);
    if (!state.whoami) {
      state.whoami = person.id;
      localStorage.setItem(whoamiKeyForHoliday(state.holiday.id), person.id);
    }
    await persistLocal();
    await enqueue(person, "travellers");
    syncNow();
    return person;
  }

  async function onTravellersListClick(e) {
    const btn = e.target.closest("[data-delete-traveller]");
    if (!btn) return;
    const person = state.travellers.find((t) => t.id === btn.dataset.deleteTraveller);
    if (!person) return;

    const personalItems = state.items.filter((i) => !i.deleted_at && i.scope === "personal" && i.traveller_id === person.id);
    const message = personalItems.length
      ? `Remove ${person.name}? Their ${personalItems.length} personal item(s) will be deleted and any shared items they own become unassigned.`
      : `Remove ${person.name}?`;
    if (!confirm(message)) return;

    person.deleted_at = new Date().toISOString();
    touch(person);
    await enqueue(person, "travellers");

    for (const item of personalItems) {
      item.deleted_at = person.deleted_at;
      touch(item);
      await enqueue(item, "packing_items");
    }
    for (const item of state.items.filter((i) => !i.deleted_at && i.scope === "shared" && i.traveller_id === person.id)) {
      item.traveller_id = null;
      touch(item);
      await enqueue(item, "packing_items");
    }

    if (state.whoami === person.id) state.whoami = null;
    await persistLocal();
    renderTravellersList();
    render();
    syncNow();
  }

  // ---------------------------------------------------------------------
  // Packing wizard
  // ---------------------------------------------------------------------

  function openWizard() {
    closeOptionsMenu();
    const trip = currentTrip();
    if (!trip) return;
    state.wizard = { step: 1, selectedTravellers: tripTravellers(trip.id).map((t) => t.id), preview: [] };

    el.wizardSeasonInput.value = trip.season && trip.season !== "Any" ? trip.season : "Any";
    setCheckboxGroup(el.wizardTypesInput, trip.trip_types || []);
    updateWizardDaysNote(trip);
    renderWizardStep();
    openModal(el.wizardModal);
  }

  function updateWizardDaysNote(trip) {
    const days = tripDays(trip);
    el.wizardDaysNote.textContent = days
      ? `${days} day${days === 1 ? "" : "s"} — per-day defaults will be scaled to match.`
      : "Set trip dates in Holiday Calendar so per-day defaults (like underwear) can be scaled.";
  }

  function renderWizardStep() {
    const step = state.wizard?.step || 1;
    el.wizardStep1.hidden = step !== 1;
    el.wizardStep2.hidden = step !== 2;
    el.wizardStep3.hidden = step !== 3;
    el.wizardBackBtn.hidden = step === 1;
    el.wizardNextBtn.hidden = step === 3;
    el.wizardApplyBtn.hidden = step !== 3;
    if (step === 2) renderWizardTravellers();
    if (step === 3) renderWizardPreview();
  }

  function renderWizardTravellers() {
    const people = tripTravellers(state.holiday.id);
    const selected = new Set(state.wizard?.selectedTravellers || []);
    el.wizardTravellers.querySelectorAll("input[data-traveller-id]").forEach((box) => {
      if (box.checked) selected.add(box.dataset.travellerId);
      else selected.delete(box.dataset.travellerId);
    });
    state.wizard.selectedTravellers = [...selected].filter((id) => people.some((p) => p.id === id));

    el.wizardTravellers.innerHTML = people.length
      ? people.map((t) => `
        <li class="plain-row">
          <label class="switch-row">
            <input type="checkbox" data-traveller-id="${t.id}"${selected.has(t.id) ? " checked" : ""} />
            <span>${escapeHtml(t.name)}</span>
          </label>
        </li>`).join("")
      : `<li class="empty-note">Add at least one traveller.</li>`;
  }

  function wizardBack() {
    if (!state.wizard) return;
    state.wizard.step = Math.max(1, state.wizard.step - 1);
    renderWizardStep();
  }

  async function wizardNext() {
    if (!state.wizard) return;
    const trip = currentTrip();

    if (state.wizard.step === 1) {
      state.tripMeta.season = el.wizardSeasonInput.value || "Any";
      state.tripMeta.trip_types = readCheckboxGroup(el.wizardTypesInput);
      touch(state.tripMeta);
      await persistLocal();
      await enqueue(state.tripMeta, "trip_meta");
      render();
      state.wizard.step = 2;
    } else if (state.wizard.step === 2) {
      renderWizardTravellers();
      if (!state.wizard.selectedTravellers.length) return showToast("Select at least one traveller");
      state.wizard.preview = buildWizardPreview();
      state.wizard.step = 3;
    }
    renderWizardStep();
  }

  function buildWizardPreview() {
    const trip = currentTrip();
    const days = tripDays(trip) || 1;
    const season = trip.season || "Any";
    const types = trip.trip_types || [];
    const rows = [];

    const matching = state.standardItems
      .filter((s) => !s.deleted_at && s.enabled !== false)
      .filter((s) => matchesSeason(s, season) && matchesTripType(s, types))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name));

    for (const std of matching) {
      const quantity = quantityForStandardItem(std, days);
      if (std.applies_to === "trip") {
        const exists = state.items.some((i) => !i.deleted_at && i.holiday_id === trip.id && i.standard_item_id === std.id && i.scope === "shared");
        rows.push({ key: `${std.id}:shared`, standardItemId: std.id, name: std.name, category: std.category, scope: "shared", travellerId: null, ownerLabel: "Shared", quantity, include: !exists, exists });
      } else {
        for (const travellerId of state.wizard.selectedTravellers) {
          const exists = state.items.some((i) => !i.deleted_at && i.holiday_id === trip.id && i.standard_item_id === std.id && i.traveller_id === travellerId && i.scope === "personal");
          rows.push({ key: `${std.id}:${travellerId}`, standardItemId: std.id, name: std.name, category: std.category, scope: "personal", travellerId, ownerLabel: travellerName(travellerId), quantity, include: !exists, exists });
        }
      }
    }
    return rows;
  }

  function quantityForStandardItem(std, days) {
    const base = Number(std.base_qty) || 0;
    const perDay = Number(std.per_day) || 0;
    let qty = base + Math.ceil(perDay * days);
    const max = Number(std.max_qty) || 0;
    if (max > 0) qty = Math.min(qty, max);
    return Math.max(1, qty);
  }

  function matchesSeason(std, season) {
    const list = (std.seasons || []).filter(Boolean);
    if (!list.length || list.includes("Any")) return true;
    if (!season || season === "Any") return false;
    return list.includes(season);
  }

  function matchesTripType(std, types) {
    const list = (std.trip_types || []).filter(Boolean);
    if (!list.length || list.includes("Any")) return true;
    return list.some((t) => types.includes(t));
  }

  function renderWizardPreview() {
    const rows = state.wizard?.preview || [];
    el.wizardPreviewEmpty.hidden = rows.length > 0;

    const groups = new Map();
    for (const row of rows) {
      const key = row.scope === "shared" ? "Shared list" : row.ownerLabel || "Unassigned";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    el.wizardPreview.innerHTML = [...groups.entries()]
      .map(([label, groupRows]) => {
        const included = groupRows.filter((r) => r.include).length;
        return `
          <section class="card section-card">
            <header class="section-head"><h3>${escapeHtml(label)}</h3><span class="section-count">${included} new</span></header>
            <ul class="item-list">
              ${groupRows.map((row) => `
                <li class="wizard-row${row.exists ? " is-existing" : ""}">
                  <label class="switch-row">
                    <input type="checkbox" data-preview-key="${row.key}"${row.include ? " checked" : ""}${row.exists ? " disabled" : ""} />
                    <span>${escapeHtml(row.name)}</span>
                  </label>
                  <span class="wizard-row-meta">
                    <span class="muted-line">${escapeHtml(row.category)}${row.exists ? " · already on list" : ""}</span>
                    <input class="qty-input" type="number" min="1" max="99" value="${row.quantity}" data-preview-qty="${row.key}"${row.exists ? " disabled" : ""} aria-label="Quantity" />
                    <button class="icon-btn cog-btn" type="button" data-edit-standard-from-wizard="${row.standardItemId}" aria-label="Edit ${escapeHtml(row.name)}'s wizard settings">⚙</button>
                  </span>
                </li>`).join("")}
            </ul>
          </section>`;
      })
      .join("");
  }

  function onWizardPreviewChange(e) {
    const box = e.target.closest("[data-preview-key]");
    if (box) {
      const row = state.wizard.preview.find((r) => r.key === box.dataset.previewKey);
      if (row) row.include = box.checked;
      return;
    }
    const qty = e.target.closest("[data-preview-qty]");
    if (qty) {
      const row = state.wizard.preview.find((r) => r.key === qty.dataset.previewQty);
      if (row) row.quantity = clampInt(qty.value, 1, 99, 1);
    }
  }

  // Opens the Item Database editor for one wizard row's underlying
  // standard item, so a rule spotted mid-review (wrong category, missing
  // a season/trip type, a per-day rate that's off) can be fixed on the
  // spot for future trips. Layers the standard-items modal on top of the
  // still-open wizard rather than closing it — this session's preview
  // (state.wizard.preview) intentionally isn't rebuilt afterward, so any
  // checkbox/quantity tweaks already made in this review aren't lost;
  // the edit only takes effect the next time the wizard runs.
  function onWizardPreviewClick(e) {
    const btn = e.target.closest("[data-edit-standard-from-wizard]");
    if (!btn) return;
    openStandardModal();
    openStandardEditor(btn.dataset.editStandardFromWizard);
  }

  async function applyWizard() {
    const trip = currentTrip();
    const rows = (state.wizard?.preview || []).filter((r) => r.include && !r.exists);
    if (!rows.length) {
      closeModal(el.wizardModal);
      return showToast("Nothing new to add");
    }

    const created = [];
    for (const row of rows) {
      const item = {
        id: crypto.randomUUID(), holiday_id: trip.id, household_id: APP_CONFIG.householdId,
        name: row.name, category: row.category, quantity: row.quantity, scope: row.scope, traveller_id: row.travellerId,
        packed: false, packed_at: null, notes: null, source: "wizard", standard_item_id: row.standardItemId, sort_order: 0,
        deleted_at: null, updated_at: new Date().toISOString(), updated_by: currentUserId
      };
      state.items.push(item);
      created.push(item.id);
      await enqueue(item, "packing_items");
    }

    captureUndo("wizard", { itemIds: created }, `${created.length} items`);
    await persistLocal();
    closeModal(el.wizardModal);
    render();
    showToast(`Added ${created.length} item${created.length === 1 ? "" : "s"}`);
    syncNow();
  }

  // ---------------------------------------------------------------------
  // Standard items
  // ---------------------------------------------------------------------

  function openStandardModal() {
    closeOptionsMenu();
    state.standardFilter = "";
    el.standardFilterInput.value = "";
    renderStandardList();
    openModal(el.standardModal);
  }

  function renderStandardList() {
    const query = state.standardFilter;
    const rows = state.standardItems
      .filter((s) => !s.deleted_at)
      .filter((s) => !query || canonicalKey(s.name).includes(query) || s.category.toLowerCase().includes(query))
      .sort((a, b) => (a.category || "").localeCompare(b.category || "") || (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name));

    el.standardList.innerHTML = rows.length ? rows.map(standardRowHtml).join("") : `<li class="empty-note">No standard items match.</li>`;
  }

  // Mirrors the "Per day" dropdown's own wording (openStandardEditor's
  // options are 0/1/0.5/1÷3/0.2) so the summary line reads the same way
  // the value was picked, instead of a raw decimal like "0.333.../day".
  function perDayLabel(perDay) {
    const n = Number(perDay) || 0;
    if (n === 1) return "1/day";
    if (n === 0.5) return "1/2 days";
    if (Math.abs(n - 1 / 3) < 1e-9) return "1/3 days";
    if (n === 0.2) return "1/5 days";
    return `${n}/day`;
  }

  function standardRowHtml(std) {
    const rule = [];
    if (Number(std.per_day) > 0) rule.push(perDayLabel(std.per_day));
    if (Number(std.base_qty) > 0) rule.push(`+${std.base_qty}`);
    if (Number(std.max_qty) > 0) rule.push(`max ${std.max_qty}`);
    const filters = [...(std.seasons || []), ...(std.trip_types || [])];

    return `
      <li class="plain-row standard-row${std.enabled === false ? " is-disabled" : ""}">
        <button class="standard-main" type="button" data-edit-standard="${std.id}">
          <span class="standard-name">${escapeHtml(std.name)}</span>
          <span class="muted-line">${escapeHtml(std.category)} · ${std.applies_to === "trip" ? "shared" : "per person"}${rule.length ? ` · ${escapeHtml(rule.join(" "))}` : ""}</span>
          ${filters.length ? `<span class="chip-row">${filters.map((f) => `<span class="chip">${escapeHtml(f)}</span>`).join("")}</span>` : ""}
        </button>
        <span class="row-actions">
          <label class="switch-row" title="Enabled">
            <input type="checkbox" data-toggle-standard="${std.id}"${std.enabled === false ? "" : " checked"} />
          </label>
        </span>
      </li>`;
  }

  function onStandardListClick(e) {
    const edit = e.target.closest("[data-edit-standard]");
    if (edit) return openStandardEditor(edit.dataset.editStandard);
    const toggle = e.target.closest("[data-toggle-standard]");
    if (toggle) return toggleStandardEnabled(toggle.dataset.toggleStandard, toggle.checked);
  }

  async function toggleStandardEnabled(id, enabled) {
    const std = state.standardItems.find((s) => s.id === id);
    if (!std) return;
    std.enabled = enabled;
    touch(std);
    await persistLocal();
    await enqueue(std, "standard_items");
    renderStandardList();
    showStandardFeedback(`${std.name} ${enabled ? "enabled" : "disabled"}`);
    syncNow();
  }

  function openStandardEditor(id) {
    state.editingStandardId = id;
    const std = id ? state.standardItems.find((s) => s.id === id) : null;

    el.standardEditTitle.textContent = std ? "Edit Standard Item" : "New Standard Item";
    el.standardNameInput.value = std?.name || "";
    el.standardCategoryInput.value = std?.category || "Other";
    el.standardAppliesInput.value = std?.applies_to || "person";
    el.standardBaseInput.value = std?.base_qty ?? 1;
    el.standardPerDayInput.value = std?.per_day ?? 0;
    el.standardMaxInput.value = std?.max_qty ?? 0;
    el.standardEnabledInput.checked = std ? std.enabled !== false : true;
    setCheckboxGroup(el.standardSeasonsInput, std?.seasons || []);
    setCheckboxGroup(el.standardTypesInput, std?.trip_types || []);
    el.standardDeleteBtn.hidden = !std;

    el.standardEditPopup.hidden = false;
    el.standardNameInput.focus();
  }

  function closeStandardEditor() {
    state.editingStandardId = null;
    el.standardEditPopup.hidden = true;
  }

  async function onStandardFormSubmit(e) {
    e.preventDefault();
    const name = normalizeName(el.standardNameInput.value);
    if (!name) return;

    const appliesTo = el.standardAppliesInput.value === "trip" ? "trip" : "person";
    const duplicate = state.standardItems.find((s) => !s.deleted_at && s.id !== state.editingStandardId && canonicalKey(s.name) === canonicalKey(name) && s.applies_to === appliesTo);
    if (duplicate) return showStandardFeedback(`${name} already exists`);

    const existing = state.editingStandardId ? state.standardItems.find((s) => s.id === state.editingStandardId) : null;
    const std = existing || { id: crypto.randomUUID(), household_id: APP_CONFIG.householdId, sort_order: 9999, deleted_at: null };

    std.name = name;
    std.category = el.standardCategoryInput.value || "Other";
    std.applies_to = appliesTo;
    std.base_qty = clampInt(el.standardBaseInput.value, 0, 99, 1);
    std.per_day = clampFloat(el.standardPerDayInput.value, 0, 10, 0);
    std.max_qty = clampInt(el.standardMaxInput.value, 0, 99, 0);
    std.seasons = readCheckboxGroup(el.standardSeasonsInput);
    std.trip_types = readCheckboxGroup(el.standardTypesInput);
    std.enabled = el.standardEnabledInput.checked;
    touch(std);

    if (!existing) state.standardItems.push(std);

    await persistLocal();
    await enqueue(std, "standard_items");
    closeStandardEditor();
    renderStandardList();
    showStandardFeedback(`Saved ${name}`);
    syncNow();
  }

  async function deleteEditedStandardItem() {
    const std = state.standardItems.find((s) => s.id === state.editingStandardId);
    if (!std) return;
    if (!confirm(`Delete the standard item "${std.name}"? Items already on a list are kept.`)) return;

    std.deleted_at = new Date().toISOString();
    touch(std);
    await persistLocal();
    await enqueue(std, "standard_items");
    closeStandardEditor();
    renderStandardList();
    showStandardFeedback(`Deleted ${std.name}`);
    syncNow();
  }

  function showStandardFeedback(message) {
    el.standardFeedback.textContent = message;
    el.standardFeedback.hidden = false;
    clearTimeout(standardFeedbackTimer);
    standardFeedbackTimer = setTimeout(() => { el.standardFeedback.hidden = true; }, 2000);
  }

  // ---------------------------------------------------------------------
  // Undo
  // ---------------------------------------------------------------------

  function captureUndo(type, payload, label) {
    state.lastAction = { type, payload, label: label || "" };
  }

  async function undoLastAction() {
    closeOptionsMenu();
    const action = state.lastAction;
    if (!action) return;
    state.lastAction = null;

    if (action.type === "add") {
      const item = state.items.find((i) => i.id === action.payload.itemId);
      if (item) { item.deleted_at = new Date().toISOString(); touch(item); await enqueue(item, "packing_items"); }
    } else if (action.type === "delete") {
      const item = state.items.find((i) => i.id === action.payload.itemId);
      if (item) { item.deleted_at = null; touch(item); await enqueue(item, "packing_items"); }
    } else if (action.type === "pack") {
      const item = state.items.find((i) => i.id === action.payload.itemId);
      if (item) { item.packed = action.payload.previous; item.packed_at = item.packed ? item.packed_at : null; touch(item); await enqueue(item, "packing_items"); }
    } else if (action.type === "wizard") {
      for (const id of action.payload.itemIds) {
        const item = state.items.find((i) => i.id === id);
        if (!item) continue;
        item.deleted_at = new Date().toISOString();
        touch(item);
        await enqueue(item, "packing_items");
      }
    } else if (action.type === "unpackAll") {
      for (const id of action.payload.itemIds) {
        const item = state.items.find((i) => i.id === id);
        if (!item) continue;
        item.packed = true;
        item.packed_at = new Date().toISOString();
        touch(item);
        await enqueue(item, "packing_items");
      }
    } else if (action.type === "deleteAll") {
      for (const id of action.payload.itemIds) {
        const item = state.items.find((i) => i.id === id);
        if (!item) continue;
        item.deleted_at = null;
        touch(item);
        await enqueue(item, "packing_items");
      }
    }

    await persistLocal();
    render();
    showToast("Undone");
    syncNow();
  }

  // ---------------------------------------------------------------------
  // Sync — reuses db (already authenticated by main.js). Same
  // local-first/queue pattern as the standalone app, just re-keyed to
  // holiday_id and scoped to whichever holiday is currently open.
  // ---------------------------------------------------------------------

  async function syncNow() {
    if (!db || state.syncing || !state.holiday) return;
    state.syncing = true;

    while (state.pending.length) {
      const index = findNextPendingIndex();
      const op = state.pending[index];
      const { error } = await apiUpsert(op.table, op.payload);
      if (error) {
        state.lastSyncError = `sync failed: ${error.message}`;
        break;
      }
      state.pending.splice(index, 1);
      await persistLocal();
    }

    const pulled = await pullAll();
    state.supabaseReachable = !pulled.error;
    if (pulled.error && state.lastSyncAt) state.lastSyncError = `connect failed: ${pulled.error.message}`;
    else if (!pulled.error) state.lastSyncError = "";
    if (!pulled.error) state.lastSyncAt = new Date().toISOString();
    if (!pulled.error) await persistLocal();

    state.syncing = false;
    render();
  }

  async function pullAll() {
    const holidayId = state.holiday.id;
    const [travellers, tripDaysRes, items, standards, meta] = await Promise.all([
      apiSelect("travellers", { eq: { holiday_id: holidayId, household_id: APP_CONFIG.householdId }, is: { deleted_at: "null" } }),
      apiSelect("trip_days", { eq: { holiday_id: holidayId, household_id: APP_CONFIG.householdId }, is: { deleted_at: "null" } }),
      apiSelect("packing_items", { eq: { holiday_id: holidayId, household_id: APP_CONFIG.householdId }, is: { deleted_at: "null" } }),
      apiSelect("standard_items", { eq: { household_id: APP_CONFIG.householdId }, is: { deleted_at: "null" } }),
      apiSelect("trip_meta", { eq: { holiday_id: holidayId } })
    ]);

    const error = travellers.error || tripDaysRes.error || items.error || standards.error || meta.error;
    if (error) return { error };

    const pendingByTable = buildPendingPayloadMap();
    state.travellers = mergeById(state.travellers, travellers.data || [], pendingByTable.travellers);
    state.tripDays = mergeById(state.tripDays, tripDaysRes.data || [], pendingByTable.trip_days);

    const merged = mergeById(state.items, items.data || [], pendingByTable.packing_items);
    detectConflicts(state.items, merged, pendingByTable.packing_items);
    state.items = merged;

    state.standardItems = mergeById(state.standardItems, standards.data || [], pendingByTable.standard_items);

    const remoteMeta = meta.data && meta.data[0];
    if (remoteMeta) {
      const pendingMeta = pendingByTable.trip_meta.get(holidayId);
      const remoteTs = Date.parse(remoteMeta.updated_at || 0) || 0;
      const localTs = Date.parse(state.tripMeta?.updated_at || 0) || 0;
      const pendingTs = Date.parse(pendingMeta?.updated_at || 0) || 0;
      if (!pendingMeta || Math.max(localTs, pendingTs) < remoteTs) state.tripMeta = remoteMeta;
    }

    return { error: null };
  }

  function findNextPendingIndex() {
    for (const table of TABLE_ORDER) {
      const index = state.pending.findIndex((op) => op.table === table);
      if (index >= 0) return index;
    }
    return 0;
  }

  function buildPendingPayloadMap() {
    const map = { travellers: new Map(), trip_meta: new Map(), trip_days: new Map(), packing_items: new Map(), standard_items: new Map() };
    for (const op of state.pending) {
      const bucket = map[op.table];
      if (!bucket) continue;
      const key = op.table === "trip_meta" ? op.payload?.holiday_id : op.payload?.id;
      if (key !== undefined && key !== null) bucket.set(key, op.payload);
    }
    return map;
  }

  function mergeById(local, remote, pendingById = new Map()) {
    const byId = new Map(local.map((row) => [row.id, row]));
    for (const row of remote) {
      const localRow = byId.get(row.id);
      const pendingPayload = pendingById.get(row.id);
      if (localRow && pendingPayload) {
        const remoteTs = Date.parse(row.updated_at || 0) || 0;
        const localTs = Date.parse(localRow.updated_at || 0) || 0;
        const pendingTs = Date.parse(pendingPayload.updated_at || 0) || 0;
        if (Math.max(localTs, pendingTs) >= remoteTs) continue;
      }
      byId.set(row.id, row);
    }
    const remoteIds = new Set(remote.map((row) => row.id));
    return [...byId.values()].filter((row) => remoteIds.has(row.id) || pendingById.has(row.id));
  }

  function detectConflicts(localItems, mergedItems, pendingById) {
    const localById = new Map(localItems.map((i) => [i.id, i]));
    for (const remote of mergedItems) {
      const local = localById.get(remote.id);
      if (!local) continue;
      const pendingPayload = pendingById.get(remote.id);
      if (!pendingPayload) continue;
      const remoteTs = Date.parse(remote.updated_at || 0) || 0;
      const localTs = Date.parse(local.updated_at || 0) || 0;
      if (remoteTs <= localTs) continue;
      if (!hasMaterialDifference(pendingPayload, remote)) continue;
      queueConflict(describeRemoteResolution(local, remote));
    }
  }

  function hasMaterialDifference(a, b) {
    return a.name !== b.name || a.quantity !== b.quantity || a.traveller_id !== b.traveller_id ||
      Boolean(a.packed) !== Boolean(b.packed) || Boolean(a.deleted_at) !== Boolean(b.deleted_at);
  }

  function describeRemoteResolution(local, remote) {
    const label = remote.name || local.name || "item";
    let summary = `${label}: updated to latest version`;
    if (!local.deleted_at && remote.deleted_at) summary = `${label}: removed`;
    else if (!local.packed && remote.packed) summary = `${label}: marked packed`;
    else if (local.packed && !remote.packed) summary = `${label}: marked not packed`;
    else if (local.traveller_id !== remote.traveller_id) summary = `${label}: now owned by ${travellerName(remote.traveller_id) || "nobody"}`;
    else if (local.quantity !== remote.quantity) summary = `${label}: quantity updated to ${remote.quantity}`;
    return { key: `conflict:${remote.id}:${remote.updated_at || ""}`, summary };
  }

  function queueConflict(entry) {
    if (state.conflictQueue.some((c) => c.key === entry.key)) return;
    state.conflictQueue.push(entry);
    showConflictSummary();
  }

  function showConflictSummary() {
    if (!state.conflictQueue.length) return;
    el.conflictMessage.textContent = state.conflictQueue.map((c) => c.summary).join("\n");
    openModal(el.conflictModal);
  }

  function acknowledgeConflict() {
    state.conflictQueue = [];
    closeModal(el.conflictModal);
  }

  async function enqueue(row, table) {
    state.pending.push({ table, payload: stripLocalFields(row, table) });
    await persistLocal();
  }

  function stripLocalFields(row, table) {
    const payload = { ...row };
    delete payload.created_at;
    if (table === "packing_items") delete payload.updated_by;
    return payload;
  }

  function touch(row) {
    row.updated_at = new Date().toISOString();
    if ("updated_by" in row || row.holiday_id || row.household_id) row.updated_by = currentUserId;
    return row;
  }

  // ---------------------------------------------------------------------
  // Supabase REST (via db's session/anon key, packing_list schema
  // by default; holidaycalendar reads use db directly instead)
  // ---------------------------------------------------------------------

  async function apiUpsert(table, payload) {
    return apiRequest({ table, method: "POST", query: { on_conflict: table === "trip_meta" ? "holiday_id" : "id" }, headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: Array.isArray(payload) ? payload : [payload] });
  }

  async function apiSelect(table, { columns = "*", eq = {}, is = {} } = {}) {
    const query = { select: columns };
    for (const [k, v] of Object.entries(eq)) query[k] = `eq.${encodeFilterValue(v)}`;
    for (const [k, v] of Object.entries(is)) query[k] = `is.${v}`;
    return apiRequest({ table, method: "GET", query });
  }

  async function apiRequest({ table, method, query = {}, headers = {}, body }) {
    if (!db) return { data: null, error: { message: "Supabase not configured" } };

    const { data: { session } } = await db.auth.getSession();
    const anonKey = typeof SUPABASE_ANON_KEY !== "undefined" ? SUPABASE_ANON_KEY : db.supabaseKey;
    const token = session?.access_token || anonKey;
    const qs = new URLSearchParams(query).toString();
    const url = `${APP_CONFIG.supabaseUrl}/rest/v1/${table}${qs ? `?${qs}` : ""}`;

    try {
      const res = await fetch(url, {
        method,
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Accept-Profile": APP_CONFIG.supabaseSchema,
          "Content-Profile": APP_CONFIG.supabaseSchema,
          ...headers
        },
        body: body ? JSON.stringify(body) : undefined
      });

      let data = null;
      const text = await res.text();
      if (text) {
        try { data = JSON.parse(text); } catch { data = null; }
      }
      if (!res.ok) return { data: null, error: { message: data?.message || data?.error || `${res.status} ${res.statusText}` } };
      return { data, error: null };
    } catch (err) {
      return { data: null, error: { message: err?.message || "network error" } };
    }
  }

  function encodeFilterValue(value) {
    return String(value).replaceAll(",", "\\,");
  }

  // ---------------------------------------------------------------------
  // Local persistence — one IndexedDB, keyed per holiday so re-opening the
  // same trip offline still shows cached data. standardItems is shared
  // (household-wide), not per-holiday.
  // ---------------------------------------------------------------------

  function idbKey(name, holidayId) {
    return `${name}:${holidayId}`;
  }

  async function loadLocal(holidayId) {
    const db = await getIdb();
    state.travellers = (await idbGet(db, "state", idbKey("travellers", holidayId))) || [];
    state.tripDays = (await idbGet(db, "state", idbKey("tripDays", holidayId))) || [];
    state.items = (await idbGet(db, "state", idbKey("items", holidayId))) || [];
    state.pending = (await idbGet(db, "state", idbKey("pending", holidayId))) || [];
    state.tripMeta = (await idbGet(db, "state", idbKey("tripMeta", holidayId))) || null;
    state.standardItems = (await idbGet(db, "state", "standardItems")) || [];
  }

  async function persistLocal() {
    const holidayId = state.holiday?.id;
    if (!holidayId) return;
    const db = await getIdb();
    await idbSet(db, "state", idbKey("travellers", holidayId), state.travellers);
    await idbSet(db, "state", idbKey("tripDays", holidayId), state.tripDays);
    await idbSet(db, "state", idbKey("items", holidayId), state.items);
    await idbSet(db, "state", idbKey("pending", holidayId), state.pending);
    await idbSet(db, "state", idbKey("tripMeta", holidayId), state.tripMeta);
    await idbSet(db, "state", "standardItems", state.standardItems);
  }

  let idbPromise = null;
  function getIdb() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open("holidaycalendar-pack-db", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("state");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return idbPromise;
  }

  function idbGet(db, store, key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbSet(db, store, key, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      const req = tx.objectStore(store).put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // ---------------------------------------------------------------------
  // Chrome: toasts, modals, add panel
  // ---------------------------------------------------------------------

  function showToast(message) {
    el.checkToastText.textContent = message;
    el.checkToast.hidden = false;
    clearTimeout(checkToastTimer);
    checkToastTimer = setTimeout(() => { el.checkToast.hidden = true; }, 2200);
  }

  function openModal(modal) {
    modal.classList.add("is-open");
    root.classList.add("modal-open");
  }

  function closeModal(modal) {
    modal.classList.remove("is-open");
    if (!root.querySelector(".modal.is-open")) root.classList.remove("modal-open");
  }

  function toggleOptionsMenu() {
    const opening = el.optionsMenu.hidden;
    el.optionsMenu.hidden = !opening;
    root.classList.toggle("options-menu-open", opening);
  }

  function closeOptionsMenu() {
    el.optionsMenu.hidden = true;
    root.classList.remove("options-menu-open");
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  function tripItems(holidayId) {
    return state.items.filter((i) => i.holiday_id === holidayId && !i.deleted_at);
  }

  function tripTravellers(holidayId) {
    return state.travellers
      .filter((t) => t.holiday_id === holidayId && !t.deleted_at)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || (a.name || "").localeCompare(b.name || ""));
  }

  function travellerName(travellerId) {
    if (!travellerId) return "";
    return state.travellers.find((t) => t.id === travellerId)?.name || "";
  }

  function travellerItemCount(travellerId) {
    return state.items.filter((i) => !i.deleted_at && i.traveller_id === travellerId).length;
  }

  function tripDays(trip) {
    if (!trip) return 0;
    return daysBetween(trip.start_date, trip.end_date);
  }

  function daysBetween(start, end) {
    if (!start || !end) return 0;
    const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
    if (Number.isNaN(ms) || ms < 0) return 0;
    return Math.round(ms / 86400000) + 1;
  }

  function formatTripDates(trip) {
    if (!trip.start_date) return "";
    const opts = { day: "numeric", month: "short" };
    const start = new Date(`${trip.start_date}T00:00:00`).toLocaleDateString("en-GB", opts);
    if (!trip.end_date) return start;
    const end = new Date(`${trip.end_date}T00:00:00`).toLocaleDateString("en-GB", { ...opts, year: "numeric" });
    return `${start} – ${end}`;
  }

  function whoamiKeyForHoliday(holidayId) {
    return `${WHOAMI_KEY}:${holidayId}`;
  }

  function optionsHtml(values) {
    return values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  }

  function checkboxGridHtml(name, values) {
    return values.map((v) => `
      <label class="switch-row">
        <input type="checkbox" name="${name}" value="${escapeHtml(v)}" />
        <span>${escapeHtml(v)}</span>
      </label>`).join("");
  }

  function setCheckboxGroup(container, values) {
    const set = new Set(values || []);
    container.querySelectorAll("input[type=checkbox]").forEach((box) => { box.checked = set.has(box.value); });
  }

  function readCheckboxGroup(container) {
    return Array.from(container.querySelectorAll("input[type=checkbox]")).filter((box) => box.checked).map((box) => box.value);
  }

  function normalizeName(value) {
    const compact = (value || "").trim().replace(/\s+/g, " ");
    if (!compact) return "";
    return compact.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  function canonicalKey(value) {
    return (value || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N}\s]/gu, "");
  }

  function clampInt(value, min, max, fallback) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function clampFloat(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  }

  // ---------------------------------------------------------------------
  // Intercept "PlanIt" links anywhere on the page. Left as real <a href>
  // navigation to the standalone app as a fallback if this script fails
  // to load — this listener just takes over when it's present.
  // ---------------------------------------------------------------------

  document.addEventListener("click", (e) => {
    const link = e.target.closest("a.pack-trip-link");
    if (!link) return;
    const href = link.getAttribute("href") || "";
    const match = href.match(/[?&]holiday=(\d+)/);
    if (!match) return;
    e.preventDefault();
    open(Number(match[1]));
  });
})();
