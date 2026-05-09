const SUPABASE_URL = "https://tihctdvsekfanduisaop.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_eOQgde9zeKpa5ld1BH08JQ_irX2xVnb";

let db = null;
if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

const state = {
  people: [],
  holidays: [],
  year: new Date().getFullYear(),
  view: "table",
};

const HOLIDAY_STATUSES = ["ideation", "planning", "booked", "happened"];
const RECOGNIZED_COUNTRIES = [
  "Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda","Argentina","Armenia","Australia","Austria",
  "Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia",
  "Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Cabo Verde","Cambodia","Cameroon",
  "Canada","Central African Republic","Chad","Chile","China","Colombia","Comoros","Congo","Costa Rica","Cote d'Ivoire",
  "Croatia","Cuba","Cyprus","Czechia","Democratic Republic of the Congo","Denmark","Djibouti","Dominica","Dominican Republic",
  "Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","Fiji","Finland","France",
  "Gabon","Gambia","Georgia","Germany","Ghana","Greece","Grenada","Guatemala","Guinea","Guinea-Bissau","Guyana","Haiti",
  "Honduras","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan",
  "Kazakhstan","Kenya","Kiribati","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein",
  "Lithuania","Luxembourg","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Marshall Islands","Mauritania",
  "Mauritius","Mexico","Micronesia","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar","Namibia",
  "Nauru","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea","North Macedonia","Norway","Oman",
  "Pakistan","Palau","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia",
  "Rwanda","Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines","Samoa","San Marino","Sao Tome and Principe",
  "Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands","Somalia",
  "South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria","Tajikistan",
  "Tanzania","Thailand","Timor-Leste","Togo","Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Tuvalu","Uganda",
  "Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan","Vanuatu","Vatican City","Venezuela",
  "Vietnam","Yemen","Zambia","Zimbabwe","Palestine"
];

const el = {
  personForm: document.getElementById("person-form"),
  holidayForm: document.getElementById("holiday-form"),
  peopleSummary: document.getElementById("people-summary"),
  allowanceSummary: document.getElementById("allowance-summary"),
  addCountry: document.getElementById("add-country"),
  editCountry: document.getElementById("edit-country"),
  holidayHeatmap: document.getElementById("holiday-heatmap"),
  openAllowance: document.getElementById("open-allowance"),
  allowanceModal: document.getElementById("allowance-modal"),
  allowanceCancel: document.getElementById("allowance-cancel"),
  editModal: document.getElementById("edit-modal"),
  editHolidayForm: document.getElementById("edit-holiday-form"),
  editCancel: document.getElementById("edit-cancel"),
  peopleCheckboxes: document.getElementById("people-checkboxes"),
  holidayTable: document.getElementById("holiday-table"),
  tableTab: document.getElementById("table-tab"),
  calendarTab: document.getElementById("calendar-tab"),
  tableView: document.getElementById("table-view"),
  calendarView: document.getElementById("calendar-view"),
  prevYear: document.getElementById("prev-year"),
  nextYear: document.getElementById("next-year"),
  plannerYear: document.getElementById("planner-year"),
  calendarGrid: document.getElementById("calendar-grid"),
  monthTemplate: document.getElementById("month-template"),
};

function setStatusMessage(message, isError = false) {
  let node = document.getElementById("status-message");
  if (!node) {
    node = document.createElement("p");
    node.id = "status-message";
    node.style.marginTop = "10px";
    node.style.fontSize = "0.9rem";
    document.querySelector(".hero").appendChild(node);
  }
  node.style.color = isError ? "#a33a2b" : "#2d8f5d";
  node.textContent = message;
}

function populateCountrySelect(selectEl, selected = "United Kingdom") {
  if (!selectEl) return;
  selectEl.innerHTML = RECOGNIZED_COUNTRIES
    .map((country) => `<option value="${country}" ${country === selected ? "selected" : ""}>${country}</option>`)
    .join("");
}

window.addEventListener("error", (evt) => {
  const msg = evt?.message || "Unknown runtime error";
  setStatusMessage(`App error: ${msg}`, true);
});

window.addEventListener("unhandledrejection", (evt) => {
  const msg = evt?.reason?.message || String(evt?.reason || "Unknown promise rejection");
  setStatusMessage(`App error: ${msg}`, true);
});

function parseDate(dateText) {
  const [y, m, d] = dateText.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function todayIsoLocal() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function monthName(idx) {
  return new Date(2000, idx, 1).toLocaleDateString("en-GB", { month: "long" });
}

function dateRange(start, end) {
  const out = [];
  let cur = new Date(start);
  while (cur <= end) {
    out.push(new Date(cur));
    cur = addDays(cur, 1);
  }
  return out;
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function nthWeekdayOfMonth(year, monthIdx, weekday, nth) {
  const d = new Date(year, monthIdx, 1);
  let count = 0;
  while (d.getMonth() === monthIdx) {
    if (d.getDay() === weekday) {
      count++;
      if (count === nth) return new Date(d);
    }
    d.setDate(d.getDate() + 1);
  }
  return null;
}

function lastWeekdayOfMonth(year, monthIdx, weekday) {
  const d = new Date(year, monthIdx + 1, 0);
  while (d.getDay() !== weekday) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

function observedIfWeekend(date) {
  const d = new Date(date);
  if (d.getDay() === 6) return addDays(d, 2);
  if (d.getDay() === 0) return addDays(d, 1);
  return d;
}

function getBankHolidaysEnglandWales(year) {
  const easter = easterSunday(year);
  const goodFriday = addDays(easter, -2);
  const easterMonday = addDays(easter, 1);

  const raw = [
    { name: "New Year's Day", date: observedIfWeekend(new Date(year, 0, 1)) },
    { name: "Good Friday", date: goodFriday },
    { name: "Easter Monday", date: easterMonday },
    { name: "Early May Bank Holiday", date: nthWeekdayOfMonth(year, 4, 1, 1) },
    { name: "Spring Bank Holiday", date: lastWeekdayOfMonth(year, 4, 1) },
    { name: "Summer Bank Holiday", date: lastWeekdayOfMonth(year, 7, 1) },
    { name: "Christmas Day", date: new Date(year, 11, 25) },
    { name: "Boxing Day", date: new Date(year, 11, 26) },
  ];

  const christmas = new Date(year, 11, 25);
  const boxing = new Date(year, 11, 26);
  if (christmas.getDay() === 6) {
    raw[6].date = new Date(year, 11, 27);
    raw[7].date = new Date(year, 11, 28);
  } else if (christmas.getDay() === 0) {
    raw[6].date = new Date(year, 11, 27);
    raw[7].date = new Date(year, 11, 26);
  } else if (boxing.getDay() === 6) {
    raw[7].date = new Date(year, 11, 28);
  } else if (boxing.getDay() === 0) {
    raw[7].date = new Date(year, 11, 28);
  }

  return raw.map((x) => ({ ...x, iso: formatDate(x.date) }));
}

function holidayDaysForPerson(name) {
  return holidaysForYear(state.year).reduce((sum, h) => sum + (h.peopleDays[name] || 0), 0);
}

function holidayYear(holiday) {
  return parseDate(holiday.startDate).getFullYear();
}

function holidaysForYear(year) {
  return state.holidays.filter((h) => holidayYear(h) === year);
}

function tripLengthDays(holiday) {
  const s = parseDate(holiday.startDate);
  const e = parseDate(holiday.endDate);
  return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
}

function displayStatus(holiday) {
  if (holiday.endDate < todayIsoLocal()) return "completed";
  return holiday.status || "ideation";
}

async function loadData() {
  if (!db) {
    setStatusMessage("App is not configured.", true);
    return;
  }

  let peopleRes = await db.from("people_allowance").select("*").eq("allowance_year", state.year).order("name", { ascending: true });
  if (peopleRes.error && (String(peopleRes.error.code) === "PGRST204" || String(peopleRes.error.code) === "42703")) {
    peopleRes = await db.from("people_allowance").select("*").order("name", { ascending: true });
  }
  const holidaysRes = await db.from("holidays").select("*").order("start_date", { ascending: true });

  if (peopleRes.error || holidaysRes.error) {
    const reason = peopleRes.error?.message || holidaysRes.error?.message || "Unknown error";
    setStatusMessage(`Could not load data from Supabase: ${reason}`, true);
    return;
  }

  state.people = (peopleRes.data || []).map((p) => ({
    id: p.id,
    name: p.name,
    standard: Number(p.standard_days),
    additional: Number(p.additional_days),
    allowanceYear: Number(p.allowance_year || state.year),
  }));

  state.holidays = (holidaysRes.data || []).map((h) => ({
    id: h.id,
    location: h.location,
    country: h.country || "",
    startDate: h.start_date,
    endDate: h.end_date,
    daysOffWork: Number(h.days_off_work ?? h.days),
    status: h.status || "ideation",
    peopleDays: h.people_days || {},
  }));

}

function renderPeopleSummary() {
  if (!state.people.length) {
    el.peopleSummary.innerHTML = "<p>No people added yet.</p>";
    el.peopleCheckboxes.innerHTML = "<p>Add people first.</p>";
    if (el.allowanceSummary) el.allowanceSummary.innerHTML = "";
    return;
  }

  const rows = state.people
    .map((p) => {
      const planned = holidayDaysForPerson(p.name);
      const total = p.standard + p.additional;
      const remaining = total - planned;
      return `
      <tr>
        <td>${p.name}</td>
        <td>${p.standard}</td>
        <td>${p.additional}</td>
        <td>${total}</td>
        <td>${planned}</td>
        <td>${remaining}</td>
      </tr>`;
    })
    .join("");

  el.peopleSummary.innerHTML = `
    <p>Allowance for <strong>${state.year}</strong></p>
    <table>
      <thead>
        <tr>
          <th>Person</th>
          <th>Standard</th>
          <th>Additional</th>
          <th>Total Allowance</th>
          <th>Planned (${state.year})</th>
          <th>Remaining (${state.year})</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  el.peopleCheckboxes.innerHTML = state.people
    .map(
      (p) => `<label><input type="checkbox" name="person" value="${p.name}" checked /> ${p.name}</label>`
    )
    .join("");

  const summaryChips = state.people
    .map((p) => {
      const planned = holidayDaysForPerson(p.name);
      const total = p.standard + p.additional;
      const remaining = total - planned;
      return `<span class="allowance-chip"><strong>${p.name}</strong>: ${remaining} remaining (${state.year})</span>`;
    })
    .join("");
  if (el.allowanceSummary) el.allowanceSummary.innerHTML = `<div class="allowance-summary">${summaryChips}</div>`;
  renderHolidayHeatmap();
}

function renderHolidayHeatmap() {
  if (!el.holidayHeatmap) return;
  const year = state.year;
  const monthTotals = Array(12).fill(0);
  for (const h of holidaysForYear(year)) {
    const s = parseDate(h.startDate);
    const e = parseDate(h.endDate);
    for (const d of dateRange(s, e)) {
      if (d.getFullYear() !== year) continue;
      monthTotals[d.getMonth()] += 1;
    }
  }

  const maxVal = Math.max(...monthTotals, 1);
  const monthShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const bars = monthTotals
    .map((val, idx) => {
      const h = Math.round((val / maxVal) * 120);
      return `
      <div class="month-bar-wrap" title="${monthShort[idx]}: ${val} holiday day(s)">
        <div class="month-bar" style="height:${h}px"></div>
        <span class="month-val">${val}</span>
        <span class="month-label">${monthShort[idx]}</span>
      </div>`;
    })
    .join("");

  el.holidayHeatmap.innerHTML = `
    <div class="heatmap-wrap">
      <p><strong>Holiday Intensity By Month (${year})</strong></p>
      <div class="month-intensity-chart">${bars}</div>
      <div class="heatmap-legend">
        <span>Taller bar = more holiday days planned in that month</span>
      </div>
    </div>
  `;
}

function renderHolidayTable() {
  const rowsForYear = holidaysForYear(state.year);
  if (!rowsForYear.length) {
    el.holidayTable.innerHTML = `<p>No holidays added for <strong>${state.year}</strong> yet.</p>`;
    return;
  }

  const grouped = rowsForYear.reduce((acc, h) => {
    const monthKey = parseDate(h.startDate).toLocaleDateString("en-GB", { month: "long" });
    if (!acc[monthKey]) acc[monthKey] = [];
    acc[monthKey].push(h);
    return acc;
  }, {});

  const monthOrder = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const rows = monthOrder
    .filter((m) => grouped[m]?.length)
    .map((month) => {
      const monthRows = grouped[month].map((h) => {
      const benDays = Number(h.peopleDays?.Ben || 0);
      const louiseDays = Number(h.peopleDays?.Louise || 0);
      const statusLabel = displayStatus(h);
      const pastClass = statusLabel === "completed" ? "past-trip-row" : "";
      const tripLength = tripLengthDays(h);

      return `
      <tr class="${pastClass}">
        <td>${h.location}</td>
        <td>${h.country || "-"}</td>
        <td>${h.startDate}</td>
        <td>${h.endDate}</td>
        <td>${h.daysOffWork}</td>
        <td>${tripLength}</td>
        <td><span class="tag status-${statusLabel}">${statusLabel}</span></td>
        <td>${benDays || "-"}</td>
        <td>${louiseDays || "-"}</td>
        <td><button type="button" class="edit-trip" data-id="${h.id}">Edit</button></td>
      </tr>`;
      }).join("");

      return `
      <tr class="month-row">
        <td colspan="10"><strong>${month}</strong></td>
      </tr>
      ${monthRows}`;
    })
    .join("");

  el.holidayTable.innerHTML = `
    <p>Showing holidays for <strong>${state.year}</strong></p>
    <table>
      <thead>
        <tr>
          <th>Trip</th>
          <th>Country</th>
          <th>Start</th>
          <th>End</th>
          <th>Days Off Work</th>
          <th>Trip Length</th>
          <th>Status</th>
          <th>Ben</th>
          <th>Louise</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function buildHolidayDayIndex(year) {
  const idx = new Map();
  for (const h of state.holidays) {
    const start = parseDate(h.startDate);
    const end = parseDate(h.endDate);
    if (start.getFullYear() !== year && end.getFullYear() !== year) continue;

    for (const d of dateRange(start, end)) {
      if (d.getFullYear() !== year) continue;
      const iso = formatDate(d);
      if (!idx.has(iso)) idx.set(iso, []);
      idx.get(iso).push({
        id: h.id,
        location: h.location,
        isStart: iso === h.startDate,
        isEnd: iso === h.endDate,
      });
    }
  }
  return idx;
}

function renderCalendar() {
  const year = state.year;
  if (el.plannerYear) el.plannerYear.textContent = String(year);
  if (!el.calendarGrid) return;
  el.calendarGrid.innerHTML = "";

  const bankHolidays = getBankHolidaysEnglandWales(year);
  const bankSet = new Set(bankHolidays.map((x) => x.iso));
  const holidayIdx = buildHolidayDayIndex(year);

  for (let month = 0; month < 12; month++) {
    const frag = el.monthTemplate.content.cloneNode(true);
    frag.querySelector("h4").textContent = monthName(month);
    const daysGrid = frag.querySelector(".days-grid");

    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let weekday = first.getDay();
    weekday = weekday === 0 ? 7 : weekday;

    for (let i = 1; i < weekday; i++) {
      const empty = document.createElement("div");
      empty.className = "day empty";
      daysGrid.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const iso = formatDate(date);
      const node = document.createElement("div");
      node.className = "day";

      const hasBank = bankSet.has(iso);
      const hasHoliday = holidayIdx.has(iso);

      if (hasBank) node.classList.add("bank");
      if (hasHoliday) node.classList.add("holiday");

      const isLongWeekend =
        date.getDay() === 1 && bankSet.has(formatDate(addDays(date, -3))) ||
        date.getDay() === 5 && bankSet.has(formatDate(addDays(date, 3)));
      if (isLongWeekend) node.classList.add("long-weekend");

      let tripMarkup = "";
      if (hasHoliday) {
        const segment = holidayIdx.get(iso)[0];
        const holiday = state.holidays.find((h) => String(h.id) === String(segment.id));
        const statusLabel = holiday ? displayStatus(holiday) : "ideation";
        const prevIso = formatDate(addDays(date, -1));
        const nextIso = formatDate(addDays(date, 1));
        const prevSegments = holidayIdx.get(prevIso) || [];
        const nextSegments = holidayIdx.get(nextIso) || [];
        const hasPrevSameTrip = prevSegments.some((s) => s.id === segment.id);
        const hasNextSameTrip = nextSegments.some((s) => s.id === segment.id);
        let classes = "trip-pill";
        if (statusLabel === "completed") classes += " completed";
        if (!hasPrevSameTrip) classes += " start";
        if (!hasNextSameTrip) classes += " end";
        tripMarkup = `<span class="${classes}">${segment.isStart ? segment.location : ""}</span>`;
      }

      node.innerHTML = `<span class="num">${day}</span>${hasBank ? '<span class="mini">Bank Holiday</span>' : ""}${tripMarkup}`;
      if (isWeekend(date)) node.style.opacity = "0.9";
      daysGrid.appendChild(node);
    }

    el.calendarGrid.appendChild(frag);
  }
}

function render() {
  renderPeopleSummary();
  renderHolidayTable();
  renderCalendar();
}

function toggleView(view) {
  if (!el.tableView || !el.calendarView || !el.tableTab || !el.calendarTab) return;
  state.view = view;
  const table = view === "table";
  el.tableView.classList.toggle("hidden", !table);
  el.calendarView.classList.toggle("hidden", table);
  el.tableTab.classList.toggle("active", table);
  el.calendarTab.classList.toggle("active", !table);
  el.tableTab.setAttribute("aria-selected", table ? "true" : "false");
  el.calendarTab.setAttribute("aria-selected", table ? "false" : "true");
}

function openAllowanceModal() {
  if (!el.allowanceModal) return;
  el.allowanceModal.classList.remove("hidden");
}

function closeAllowanceModal() {
  if (!el.allowanceModal) return;
  el.allowanceModal.classList.add("hidden");
}

async function upsertPerson(name, standard, additional) {
  const payload = { standard_days: standard, additional_days: additional };
  let existingRes = await db
    .from("people_allowance")
    .select("id,name")
    .eq("name", name)
    .eq("allowance_year", state.year)
    .maybeSingle();

  if (existingRes.error && (String(existingRes.error.code) === "PGRST204" || String(existingRes.error.code) === "42703")) {
    existingRes = await db
      .from("people_allowance")
      .select("id,name")
      .eq("name", name)
      .maybeSingle();
  }

  if (existingRes.error) throw existingRes.error;

  if (existingRes.data?.id) {
    const { error } = await db.from("people_allowance").update(payload).eq("id", existingRes.data.id);
    if (error) throw error;
    return;
  }

  let insertRes = await db.from("people_allowance").insert({ name, allowance_year: state.year, ...payload });
  if (insertRes.error && (String(insertRes.error.code) === "PGRST204" || String(insertRes.error.code) === "42703")) {
    insertRes = await db.from("people_allowance").insert({ name, ...payload });
  }
  if (insertRes.error) throw insertRes.error;
}

async function changeYear(delta) {
  state.year += delta;
  await loadData();
  render();
}

async function addHoliday(payload) {
  const { error } = await db.from("holidays").insert(payload);
  if (!error) return;
  if (String(error.code) === "PGRST204" || String(error.code) === "42703") {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.status;
    delete fallbackPayload.country;
    delete fallbackPayload.days_off_work;
    const retry = await db.from("holidays").insert(fallbackPayload);
    if (retry.error) throw retry.error;
    return;
  }
  throw error;
}

async function updateHoliday(id, payload) {
  const { error } = await db.from("holidays").update(payload).eq("id", id);
  if (!error) return;
  if (String(error.code) === "PGRST204" || String(error.code) === "42703") {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.status;
    delete fallbackPayload.country;
    delete fallbackPayload.days_off_work;
    const retry = await db.from("holidays").update(fallbackPayload).eq("id", id);
    if (retry.error) throw retry.error;
    return;
  }
  throw error;
}

function openEditHolidayModal(holidayId) {
  const holiday = state.holidays.find((h) => String(h.id) === String(holidayId));
  if (!holiday || !el.editHolidayForm || !el.editModal) return;
  el.editHolidayForm.elements.holidayId.value = String(holiday.id);
  el.editHolidayForm.elements.location.value = holiday.location;
  populateCountrySelect(el.editCountry, holiday.country || "United Kingdom");
  el.editHolidayForm.elements.startDate.value = holiday.startDate;
  el.editHolidayForm.elements.endDate.value = holiday.endDate;
  el.editHolidayForm.elements.daysOffWork.value = String(holiday.daysOffWork);
  el.editHolidayForm.elements.status.value = HOLIDAY_STATUSES.includes(holiday.status) ? holiday.status : "ideation";
  el.editModal.classList.remove("hidden");
}

function closeEditHolidayModal() {
  if (!el.editModal) return;
  el.editModal.classList.add("hidden");
}

if (el.personForm) el.personForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db) return;
  const formEl = e.currentTarget;

  const data = new FormData(formEl);
  const name = String(data.get("name") || "").trim();
  const standard = Number(data.get("standard"));
  const additional = Number(data.get("additional"));
  if (!name) return;

  try {
    await upsertPerson(name, standard, additional);
    await loadData();
    render();
    if (formEl && typeof formEl.reset === "function") formEl.reset();
    setStatusMessage(`Saved allowance for ${name}.`);
  } catch (err) {
    const reason = err?.message || "Unknown error";
    setStatusMessage(`Could not save person in Supabase: ${reason}`, true);
    console.error("Save person error:", err);
  }
});

if (el.holidayForm) el.holidayForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db) return;
  const formEl = e.currentTarget;

  const data = new FormData(formEl);
  const location = String(data.get("location") || "").trim();
  const country = String(data.get("country") || "").trim();
  const startDate = String(data.get("startDate") || "");
  let endDate = String(data.get("endDate") || "");
  let daysOffWork = Number(data.get("daysOffWork") || 0);
  const status = String(data.get("status") || "ideation").toLowerCase();

  const selected = Array.from(document.querySelectorAll('input[name="person"]:checked')).map((n) => n.value);

  if (!location || !startDate || !selected.length) {
    setStatusMessage("Add location, start date, and select at least one person.", true);
    return;
  }

  if (!endDate && !daysOffWork) {
    setStatusMessage("Add either end date or days off work.", true);
    return;
  }

  if (!endDate && daysOffWork) {
    const s = parseDate(startDate);
    endDate = formatDate(addDays(s, Math.ceil(daysOffWork) - 1));
  }

  if (!daysOffWork) {
    daysOffWork = 1;
  }

  const split = Number((daysOffWork / selected.length).toFixed(2));
  const peopleDays = {};
  for (const name of selected) peopleDays[name] = split;
  const safeStatus = HOLIDAY_STATUSES.includes(status) ? status : "ideation";

  try {
    await addHoliday({
      location,
      country,
      start_date: startDate,
      end_date: endDate,
      days: daysOffWork,
      days_off_work: daysOffWork,
      status: safeStatus,
      people_days: peopleDays,
    });
    await loadData();
    render();
    if (formEl && typeof formEl.reset === "function") formEl.reset();
    setStatusMessage(`Saved holiday: ${location}.`);
  } catch (err) {
    const reason = err?.message || "Unknown error";
    setStatusMessage(`Could not save holiday in Supabase: ${reason}`, true);
    console.error("Save holiday error:", err);
  }
});

if (el.holidayTable) el.holidayTable.addEventListener("click", (e) => {
  const btn = e.target.closest("button.edit-trip");
  if (!btn) return;
  openEditHolidayModal(btn.dataset.id);
});

if (el.editCancel) el.editCancel.addEventListener("click", () => closeEditHolidayModal());
if (el.openAllowance) el.openAllowance.addEventListener("click", () => openAllowanceModal());
if (el.allowanceCancel) el.allowanceCancel.addEventListener("click", () => closeAllowanceModal());

if (el.editHolidayForm) el.editHolidayForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db) return;
  const form = e.currentTarget;
  const data = new FormData(form);
  const id = Number(data.get("holidayId"));
  const location = String(data.get("location") || "").trim();
  const country = String(data.get("country") || "").trim();
  const startDate = String(data.get("startDate") || "");
  const endDate = String(data.get("endDate") || "");
  const daysOffWork = Number(data.get("daysOffWork") || 0);
  const status = String(data.get("status") || "ideation").toLowerCase();
  const safeStatus = HOLIDAY_STATUSES.includes(status) ? status : "ideation";

  if (!id || !location || !startDate || !endDate || !daysOffWork) {
    setStatusMessage("Please complete all edit fields.", true);
    return;
  }

  try {
    await updateHoliday(id, {
      location,
      country,
      start_date: startDate,
      end_date: endDate,
      days: daysOffWork,
      days_off_work: daysOffWork,
      status: safeStatus,
    });
    await loadData();
    render();
    closeEditHolidayModal();
    setStatusMessage(`Updated holiday: ${location}.`);
  } catch (err) {
    const reason = err?.message || "Unknown error";
    setStatusMessage(`Could not update holiday in Supabase: ${reason}`, true);
  }
});

if (el.tableTab) el.tableTab.addEventListener("click", () => toggleView("table"));
if (el.calendarTab) el.calendarTab.addEventListener("click", () => toggleView("calendar"));
if (el.prevYear) el.prevYear.addEventListener("click", async () => { await changeYear(-1); });
if (el.nextYear) el.nextYear.addEventListener("click", async () => { await changeYear(1); });

(async function init() {
  populateCountrySelect(el.addCountry, "United Kingdom");
  populateCountrySelect(el.editCountry, "United Kingdom");
  await loadData();
  render();
})();
