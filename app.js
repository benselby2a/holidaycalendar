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

const el = {
  personForm: document.getElementById("person-form"),
  holidayForm: document.getElementById("holiday-form"),
  peopleSummary: document.getElementById("people-summary"),
  allowanceTab: document.getElementById("allowance-tab"),
  holidaysTab: document.getElementById("holidays-tab"),
  allowanceSection: document.getElementById("allowance-section"),
  holidaysSection: document.getElementById("holidays-section"),
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

async function loadData() {
  if (!db) {
    setStatusMessage("Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in app.js.", true);
    return;
  }

  const [peopleRes, holidaysRes] = await Promise.all([
    db.from("people_allowance").select("*").order("name", { ascending: true }),
    db.from("holidays").select("*").order("start_date", { ascending: true }),
  ]);

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
  }));

  state.holidays = (holidaysRes.data || []).map((h) => ({
    id: h.id,
    location: h.location,
    startDate: h.start_date,
    endDate: h.end_date,
    days: Number(h.days),
    peopleDays: h.people_days || {},
  }));

  setStatusMessage("Connected to Supabase and synced.");
}

function renderPeopleSummary() {
  if (!state.people.length) {
    el.peopleSummary.innerHTML = "<p>No people added yet.</p>";
    el.peopleCheckboxes.innerHTML = "<p>Add people first.</p>";
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
      (p) => `<label><input type="checkbox" name="person" value="${p.name}" /> ${p.name}</label>`
    )
    .join("");
}

function renderHolidayTable() {
  const rowsForYear = holidaysForYear(state.year);
  if (!rowsForYear.length) {
    el.holidayTable.innerHTML = `<p>No holidays added for <strong>${state.year}</strong> yet.</p>`;
    return;
  }

  const rows = rowsForYear
    .map((h) => {
      const people = Object.entries(h.peopleDays)
        .filter(([, v]) => Number(v) > 0)
        .map(([k, v]) => `<span class="tag">${k}: ${v}</span>`)
        .join(" ");

      return `
      <tr>
        <td>${h.location}</td>
        <td>${h.startDate}</td>
        <td>${h.endDate}</td>
        <td>${h.days}</td>
        <td>${people || "-"}</td>
      </tr>`;
    })
    .join("");

  el.holidayTable.innerHTML = `
    <p>Showing holidays for <strong>${state.year}</strong></p>
    <table>
      <thead>
        <tr>
          <th>Trip</th>
          <th>Start</th>
          <th>End</th>
          <th>Days</th>
          <th>Who / Days</th>
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
      const names = Object.keys(h.peopleDays).filter((name) => Number(h.peopleDays[name]) > 0);
      if (!idx.has(iso)) idx.set(iso, new Set());
      for (const name of names) idx.get(iso).add(name);
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

      const people = hasHoliday ? Array.from(holidayIdx.get(iso)).slice(0, 2).join(", ") : "";
      node.innerHTML = `<span class="num">${day}</span>${hasBank ? '<span class="mini">Bank Holiday</span>' : ""}${people ? `<span class="mini">${people}</span>` : ""}`;
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

function toggleAppSection(section) {
  if (!el.allowanceSection || !el.holidaysSection || !el.allowanceTab || !el.holidaysTab) return;
  const isAllowance = section === "allowance";
  el.allowanceSection.classList.toggle("hidden", !isAllowance);
  el.holidaysSection.classList.toggle("hidden", isAllowance);
  el.allowanceTab.classList.toggle("active", isAllowance);
  el.holidaysTab.classList.toggle("active", !isAllowance);
  el.allowanceTab.setAttribute("aria-selected", isAllowance ? "true" : "false");
  el.holidaysTab.setAttribute("aria-selected", isAllowance ? "false" : "true");
}

async function upsertPerson(name, standard, additional) {
  const payload = { standard_days: standard, additional_days: additional };
  const existingRes = await db
    .from("people_allowance")
    .select("id,name")
    .eq("name", name)
    .maybeSingle();

  if (existingRes.error) throw existingRes.error;

  if (existingRes.data?.id) {
    const { error } = await db.from("people_allowance").update(payload).eq("id", existingRes.data.id);
    if (error) throw error;
    return;
  }

  const { error } = await db.from("people_allowance").insert({ name, ...payload });
  if (error) throw error;
}

async function addHoliday(payload) {
  const { error } = await db.from("holidays").insert(payload);
  if (error) throw error;
}

if (el.personForm) el.personForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db) return;

  const data = new FormData(e.currentTarget);
  const name = String(data.get("name") || "").trim();
  const standard = Number(data.get("standard"));
  const additional = Number(data.get("additional"));
  if (!name) return;

  try {
    await upsertPerson(name, standard, additional);
    await loadData();
    render();
    e.currentTarget.reset();
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

  const data = new FormData(e.currentTarget);
  const location = String(data.get("location") || "").trim();
  const startDate = String(data.get("startDate") || "");
  let endDate = String(data.get("endDate") || "");
  let days = Number(data.get("days") || 0);

  const selected = Array.from(document.querySelectorAll('input[name="person"]:checked')).map((n) => n.value);

  if (!location || !startDate || !selected.length) {
    setStatusMessage("Add location, start date, and select at least one person.", true);
    return;
  }

  if (!endDate && !days) {
    setStatusMessage("Add either end date or number of days.", true);
    return;
  }

  if (!endDate && days) {
    const s = parseDate(startDate);
    endDate = formatDate(addDays(s, Math.ceil(days) - 1));
  }

  if (!days && endDate) {
    const s = parseDate(startDate);
    const eDate = parseDate(endDate);
    const delta = Math.round((eDate - s) / (1000 * 60 * 60 * 24)) + 1;
    days = Math.max(0.5, delta);
  }

  const split = Number((days / selected.length).toFixed(2));
  const peopleDays = {};
  for (const name of selected) peopleDays[name] = split;

  try {
    await addHoliday({
      location,
      start_date: startDate,
      end_date: endDate,
      days,
      people_days: peopleDays,
    });
    await loadData();
    render();
    e.currentTarget.reset();
    setStatusMessage(`Saved holiday: ${location}.`);
  } catch (err) {
    const reason = err?.message || "Unknown error";
    setStatusMessage(`Could not save holiday in Supabase: ${reason}`, true);
    console.error("Save holiday error:", err);
  }
});

if (el.tableTab) el.tableTab.addEventListener("click", () => toggleView("table"));
if (el.calendarTab) el.calendarTab.addEventListener("click", () => toggleView("calendar"));
if (el.allowanceTab) el.allowanceTab.addEventListener("click", () => toggleAppSection("allowance"));
if (el.holidaysTab) el.holidaysTab.addEventListener("click", () => toggleAppSection("holidays"));
if (el.prevYear) el.prevYear.addEventListener("click", () => { state.year -= 1; render(); });
if (el.nextYear) el.nextYear.addEventListener("click", () => { state.year += 1; render(); });

(async function init() {
  await loadData();
  render();
})();
