const SUPABASE_URL = "https://cnkznpkvwoqxaiywwmhr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_xlNQ_QudJNUlMLjWpr0iJA_YgO87tox";
const HIDE_COMPLETED_STORAGE_KEY = "holidayPlanner.hideCompletedTrips";
const SELECTED_YEAR_STORAGE_KEY = "holidayPlanner.selectedYear";
const HEATMAP_FREE_STORAGE_KEY = "holidayPlanner.heatmapShowFree";
let statusToastTimer = null;
const inHub = window !== window.parent;

let db = null;
if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: "holidaycalendar" },
  });
}

if (inHub) {
  document.documentElement.setAttribute("data-hub", "");
}

function defaultPlannerYear() {
  return new Date().getFullYear();
}

function readSelectedYearPref() {
  try {
    const raw = window.localStorage.getItem(SELECTED_YEAR_STORAGE_KEY);
    if (raw === null || raw.trim() === "") return null;
    const year = Number(raw);
    return Number.isInteger(year) ? year : null;
  } catch (_) {
    return null;
  }
}

function writeSelectedYearPref(year) {
  try {
    window.localStorage.setItem(SELECTED_YEAR_STORAGE_KEY, String(year));
  } catch (_) {
    // Ignore localStorage access issues.
  }
}

function readHideCompletedPref() {
  try {
    return window.localStorage.getItem(HIDE_COMPLETED_STORAGE_KEY) === "1";
  } catch (_) {
    return false;
  }
}

function writeHideCompletedPref(value) {
  try {
    window.localStorage.setItem(HIDE_COMPLETED_STORAGE_KEY, value ? "1" : "0");
  } catch (_) {
    // Ignore localStorage access issues (private mode, browser policy, etc.)
  }
}

function readHeatmapFreePref() {
  try {
    return window.localStorage.getItem(HEATMAP_FREE_STORAGE_KEY) === "1";
  } catch (_) {
    return false;
  }
}

function writeHeatmapFreePref(value) {
  try {
    window.localStorage.setItem(HEATMAP_FREE_STORAGE_KEY, value ? "1" : "0");
  } catch (_) {
    // Ignore localStorage access issues.
  }
}

const state = {
  people: [],
  peopleNames: [],
  holidays: [],
  bankHolidays: [],
  year: readSelectedYearPref() ?? defaultPlannerYear(),
  hideCompleted: readHideCompletedPref(),
  showHeatmapFree: readHeatmapFreePref(),
  view: "table",
};

const HOLIDAY_STATUSES = ["planning", "booked", "happened"];
const BASE_YEAR = new Date().getFullYear();
const YEAR_MIN = BASE_YEAR - 2;
const YEAR_MAX = BASE_YEAR + 3;
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
  peopleForm: document.getElementById("people-form"),
  peopleList: document.getElementById("people-list"),
  peopleModal: document.getElementById("people-modal"),
  peopleCancel: document.getElementById("people-cancel"),
  openPeople: document.getElementById("open-people"),
  openAddHoliday: document.getElementById("open-add-holiday"),
  personForm: document.getElementById("person-form"),
  holidayForm: document.getElementById("holiday-form"),
  holidayAllowanceWarning: document.getElementById("holiday-allowance-warning"),
  peopleSummary: document.getElementById("people-summary"),
  allowanceYearLabel: document.getElementById("allowance-year-label"),
  allowancePerson: document.getElementById("allowance-person"),
  allowanceSummary: document.getElementById("allowance-summary"),
  addCountry: document.getElementById("add-country"),
  editCountry: document.getElementById("edit-country"),
  holidayHeatmap: document.getElementById("holiday-heatmap"),
  holidayBurndown: document.getElementById("holiday-burndown"),
  holidayTodos: document.getElementById("holiday-todos"),
  nextBigHolidayHero: document.getElementById("next-big-holiday-hero"),
  openAllowance: document.getElementById("open-allowance"),
  allowanceModal: document.getElementById("allowance-modal"),
  allowanceCancel: document.getElementById("allowance-cancel"),
  addHolidayModal: document.getElementById("add-holiday-modal"),
  addHolidayCancel: document.getElementById("add-holiday-cancel"),
  editModal: document.getElementById("edit-modal"),
  editHolidayForm: document.getElementById("edit-holiday-form"),
  removeHoliday: document.getElementById("remove-holiday"),
  editCancel: document.getElementById("edit-cancel"),
  peopleCheckboxes: document.getElementById("people-checkboxes"),
  editPeopleCheckboxes: document.getElementById("edit-people-checkboxes"),
  holidayTable: document.getElementById("holiday-table"),
  tableTab: document.getElementById("table-tab"),
  calendarTab: document.getElementById("calendar-tab"),
  tableView: document.getElementById("table-view"),
  calendarView: document.getElementById("calendar-view"),
  hideCompleted: document.getElementById("hide-completed"),
  yearSelect: document.getElementById("year-select"),
  openBankHolidays: document.getElementById("open-bank-holidays"),
  bankHolidaysModal: document.getElementById("bank-holidays-modal"),
  bankHolidaysCancel: document.getElementById("bank-holidays-cancel"),
  bankHolidayForm: document.getElementById("bank-holiday-form"),
  bankHolidayList: document.getElementById("bank-holiday-list"),
  plannerYear: document.getElementById("planner-year"),
  calendarGrid: document.getElementById("calendar-grid"),
  monthTemplate: document.getElementById("month-template"),
};

function setStatusMessage(message, isError = false) {
  let node = document.getElementById("status-toast");
  if (!node) {
    node = document.createElement("div");
    node.id = "status-toast";
    node.className = "status-toast hidden";
    document.body.appendChild(node);
  }

  if (statusToastTimer) {
    clearTimeout(statusToastTimer);
    statusToastTimer = null;
  }

  node.classList.remove("hidden", "error", "success");
  node.classList.add(isError ? "error" : "success");
  node.textContent = message;
  statusToastTimer = window.setTimeout(() => {
    node.classList.add("hidden");
  }, isError ? 4500 : 3000);
}

function populateCountrySelect(selectEl, selected = "United Kingdom") {
  if (!selectEl) return;
  selectEl.innerHTML = RECOGNIZED_COUNTRIES
    .map((country) => `<option value="${country}" ${country === selected ? "selected" : ""}>${country}</option>`)
    .join("");
}

function inferCountryFromLocation(locationText) {
  const text = String(locationText || "").trim().toLowerCase();
  if (!text) return null;
  for (const country of RECOGNIZED_COUNTRIES) {
    const countryLc = country.toLowerCase();
    if (text.includes(countryLc) || countryLc.includes(text)) return country;
  }
  return null;
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

function ordinalSuffix(day) {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  const mod10 = day % 10;
  if (mod10 === 1) return "st";
  if (mod10 === 2) return "nd";
  if (mod10 === 3) return "rd";
  return "th";
}

function formatDayMonth(dateText) {
  if (!dateText) return "";
  const date = parseDate(dateText);
  const day = date.getDate();
  const month = date.toLocaleDateString("en-GB", { month: "long" });
  return `${day}${ordinalSuffix(day)} ${month}`;
}

function todayIsoLocal() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function setHolidayFormStatusDefault() {
  if (!el.holidayForm || !el.holidayForm.elements.status) return;
  const statusManual = el.holidayForm.dataset.statusManual === "true";
  if (statusManual) return;
  const endDate = String(el.holidayForm.elements.endDate?.value || "");
  if (!endDate) return;
  el.holidayForm.elements.status.value = endDate < todayIsoLocal() ? "happened" : "planning";
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
  return calcTripLength(holiday.startDate, holiday.endDate, holiday.startHalf || "am", holiday.endHalf || "pm");
}

function getBankHolidaySet(year) {
  const custom = state.bankHolidays
    .filter((h) => Number(h.holidayYear) === year)
    .map((h) => h.holidayDate);
  if (custom.length) return new Set(custom);
  return new Set(getBankHolidaysEnglandWales(year).map((x) => x.iso));
}

function getBankHolidayNameMap(year) {
  const custom = state.bankHolidays
    .filter((h) => Number(h.holidayYear) === year)
    .sort((a, b) => a.holidayDate.localeCompare(b.holidayDate));
  if (custom.length) {
    const map = new Map();
    for (const h of custom) map.set(h.holidayDate, h.name);
    return map;
  }
  const defaults = getBankHolidaysEnglandWales(year);
  return new Map(defaults.map((h) => [h.iso, h.name]));
}

function bankHolidayNamesInRange(startDateText, endDateText) {
  const start = parseDate(startDateText);
  const end = parseDate(endDateText);
  if (end < start) return [];
  const out = [];
  const seen = new Set();
  const holidayMapByYear = new Map();
  for (const d of dateRange(start, end)) {
    const year = d.getFullYear();
    if (!holidayMapByYear.has(year)) holidayMapByYear.set(year, getBankHolidayNameMap(year));
    const iso = formatDate(d);
    const name = holidayMapByYear.get(year).get(iso);
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

function getNextBigHoliday() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return state.holidays
    .filter((h) => parseDate(h.startDate) >= today)
    .filter((h) => tripLengthDays(h) > 7)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] || null;
}

function businessDaysOffWork(startDateText, endDateText, startHalf = "am", endHalf = "pm") {
  if (!startDateText || !endDateText) return 0;
  const start = parseDate(startDateText);
  const end = parseDate(endDateText);
  if (end < start) return 0;

  const bankByYear = new Map();
  const isBankHoliday = (date) => {
    const year = date.getFullYear();
    if (!bankByYear.has(year)) bankByYear.set(year, getBankHolidaySet(year));
    return bankByYear.get(year).has(formatDate(date));
  };

  let count = 0;
  for (const d of dateRange(start, end)) {
    const weekend = isWeekend(d);
    const bank = isBankHoliday(d);
    if (!weekend && !bank) count += 1;
  }
  if (count === 0) return 0;
  const startIsWorkday = !isWeekend(start) && !isBankHoliday(start);
  const endIsWorkday = !isWeekend(end) && !isBankHoliday(end);
  if (startIsWorkday && startHalf === "pm") count -= 0.5;
  if (endIsWorkday && endHalf === "am") count -= 0.5;
  return Math.max(0, count);
}

function calcTripLength(startDateText, endDateText, startHalf = "am", endHalf = "pm") {
  if (!startDateText || !endDateText) return 0;
  const s = parseDate(startDateText);
  const e = parseDate(endDateText);
  if (e < s) return 0;
  let total = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
  if (startHalf === "pm") total -= 0.5;
  if (endHalf === "am") total -= 0.5;
  return Math.max(0, total);
}

function displayStatus(holiday) {
  if (holiday.endDate < todayIsoLocal()) return "completed";
  const normalized = String(holiday.status || "").toLowerCase();
  if (normalized === "ideation") return "planning";
  return HOLIDAY_STATUSES.includes(normalized) ? normalized : "planning";
}

async function loadData() {
  if (!db) {
    setStatusMessage("App is not configured.", true);
    return;
  }

  let peopleDirectoryRes = await db.from("people").select("*").order("name", { ascending: true });
  if (peopleDirectoryRes.error && (String(peopleDirectoryRes.error.code) === "42P01" || String(peopleDirectoryRes.error.code) === "PGRST204")) {
    peopleDirectoryRes = { data: [], error: null };
  }
  let peopleRes = await db.from("people_allowance").select("*").order("name", { ascending: true });
  const holidaysRes = await db.from("holidays").select("*").order("start_date", { ascending: true });
  let bankHolidaysRes = await db.from("bank_holidays").select("*").order("holiday_date", { ascending: true });
  if (bankHolidaysRes.error && (String(bankHolidaysRes.error.code) === "PGRST204" || String(bankHolidaysRes.error.code) === "42P01" || String(bankHolidaysRes.error.code) === "42703")) {
    bankHolidaysRes = { data: [], error: null };
  }

  if (peopleRes.error || holidaysRes.error || bankHolidaysRes.error || peopleDirectoryRes.error) {
    const reason = peopleRes.error?.message || holidaysRes.error?.message || bankHolidaysRes.error?.message || peopleDirectoryRes.error?.message || "Unknown error";
    setStatusMessage(`Could not load data from Supabase: ${reason}`, true);
    return;
  }

  const allPeopleRows = (peopleRes.data || []).map((p) => ({
    id: p.id,
    name: p.name,
    standard: Number(p.standard_days),
    additional: Number(p.additional_days),
    allowanceYear: Number(p.allowance_year || state.year),
  }));
  const directoryNames = (peopleDirectoryRes.data || []).map((p) => p.name);
  const fallbackNames = allPeopleRows.map((p) => p.name);
  state.peopleNames = Array.from(new Set([...directoryNames, ...fallbackNames])).sort((a, b) => a.localeCompare(b));
  state.people = allPeopleRows.filter((p) => p.allowanceYear === state.year || Number.isNaN(p.allowanceYear));

  state.holidays = (holidaysRes.data || []).map((h) => ({
    id: h.id,
    location: h.location,
    country: h.country || "",
    startDate: h.start_date,
    endDate: h.end_date,
    startHalf: h.start_half || "am",
    endHalf: h.end_half || "pm",
    daysOffWork: Number(h.days_off_work ?? h.days),
    status: (String(h.status || "").toLowerCase() === "ideation") ? "planning" : (h.status || "planning"),
    peopleDays: h.people_days || {},
  }));
  state.bankHolidays = (bankHolidaysRes.data || []).map((h) => ({
    id: h.id,
    holidayYear: Number(h.holiday_year),
    holidayDate: h.holiday_date,
    name: h.name,
  }));
  if (!state.bankHolidays.some((h) => h.holidayYear === state.year)) {
    const defaults = getBankHolidaysEnglandWales(state.year).map((h) => ({
      holiday_year: state.year,
      holiday_date: h.iso,
      name: h.name,
    }));
    const saveDefaults = await db.from("bank_holidays").upsert(defaults, { onConflict: "holiday_year,holiday_date" });
    if (!saveDefaults.error) {
      const refreshed = await db.from("bank_holidays").select("*").eq("holiday_year", state.year).order("holiday_date", { ascending: true });
      if (!refreshed.error) {
        state.bankHolidays = state.bankHolidays
          .filter((h) => h.holidayYear !== state.year)
          .concat((refreshed.data || []).map((h) => ({
            id: h.id,
            holidayYear: Number(h.holiday_year),
            holidayDate: h.holiday_date,
            name: h.name,
          })));
      }
    }
  }

}

function renderPeopleList() {
  if (!el.peopleList) return;
  if (!state.peopleNames.length) {
    el.peopleList.innerHTML = "<p>No people added yet.</p>";
    return;
  }
  el.peopleList.innerHTML = `
    <table>
      <thead><tr><th>Person</th><th>Action</th></tr></thead>
      <tbody>
        ${state.peopleNames.map((name) => `<tr><td>${name}</td><td><button type="button" class="remove-person" data-name="${name}">Remove</button></td></tr>`).join("")}
      </tbody>
    </table>
  `;
}

function renderPeopleSummary() {
  if (!state.peopleNames.length) {
    el.peopleSummary.innerHTML = "<p>No people added yet.</p>";
    el.peopleCheckboxes.innerHTML = "<p>Add people first.</p>";
    if (el.allowanceSummary) el.allowanceSummary.innerHTML = "";
    return;
  }

  const allowanceByName = new Map(state.people.map((p) => [p.name, p]));
  const rows = state.peopleNames
    .map((name) => {
      const allowance = allowanceByName.get(name);
      const standard = allowance ? allowance.standard : 0;
      const additional = allowance ? allowance.additional : 0;
      const planned = holidayDaysForPerson(name);
      const total = standard + additional;
      const remaining = total - planned;
      const remainingClass = remaining < 0 ? "remaining-negative" : "";
      return `
      <tr>
        <td>${name}</td>
        <td>${standard}</td>
        <td>${additional}</td>
        <td>${total}</td>
        <td>${planned}</td>
        <td class="${remainingClass}">${remaining}</td>
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

  renderPeopleCheckboxes();

  const summaryChips = state.peopleNames
    .map((name) => {
      const allowance = allowanceByName.get(name);
      const standard = allowance ? allowance.standard : 0;
      const additional = allowance ? allowance.additional : 0;
      const planned = holidayDaysForPerson(name);
      const total = standard + additional;
      const remaining = total - planned;
      const remainingClass = remaining < 0 ? "remaining-negative" : "";
      return `<span class="allowance-chip"><strong>${name}</strong>: <span class="${remainingClass}">${remaining}</span> remaining</span>`;
    })
    .join("");
  if (el.allowanceSummary) el.allowanceSummary.innerHTML = `<div class="allowance-summary">${summaryChips}</div>`;
  if (el.allowanceYearLabel) el.allowanceYearLabel.textContent = String(state.year);
  if (el.allowancePerson) {
    const prevSelected = el.allowancePerson.value;
    el.allowancePerson.innerHTML = state.peopleNames.map((name) => `<option value="${name}">${name}</option>`).join("");
    if (prevSelected && state.peopleNames.includes(prevSelected)) {
      el.allowancePerson.value = prevSelected;
    }
  }
  syncAllowanceEditorFromSelection();
}

function renderPeopleCheckboxes(selectedNames = null) {
  const selectedSet = new Set(selectedNames || state.peopleNames);
  const addMarkup = state.peopleNames
    .map((name) => `<label><input type="checkbox" name="person" value="${name}" ${selectedSet.has(name) ? "checked" : ""} /> ${name}</label>`)
    .join("");
  const editMarkup = state.peopleNames
    .map((name) => `<label><input type="checkbox" name="editPerson" value="${name}" ${selectedSet.has(name) ? "checked" : ""} /> ${name}</label>`)
    .join("");
  if (el.peopleCheckboxes) el.peopleCheckboxes.innerHTML = addMarkup;
  if (el.editPeopleCheckboxes) el.editPeopleCheckboxes.innerHTML = editMarkup;
}

function syncAllowanceEditorFromSelection() {
  if (!el.personForm || !el.allowancePerson) return;
  const selectedName = String(el.allowancePerson.value || "");
  if (!selectedName) return;
  const existing = state.people.find((p) => p.name === selectedName);
  const standard = existing ? existing.standard : 28;
  const additional = existing ? existing.additional : 0;
  if (el.personForm.elements.standard) el.personForm.elements.standard.value = String(standard);
  if (el.personForm.elements.additional) el.personForm.elements.additional.value = String(additional);
}

function updateHolidayAllowanceWarning() {
  if (!el.holidayForm || !el.holidayAllowanceWarning) return;
  const daysOffWorkRaw = Number(el.holidayForm.elements.daysOffWork?.value || 0);
  const daysOffWork = Number.isFinite(daysOffWorkRaw) ? daysOffWorkRaw : 0;
  const selectedPeople = Array.from(el.holidayForm.querySelectorAll('input[name="person"]:checked')).map((n) => n.value);
  if (!selectedPeople.length || daysOffWork <= 0) {
    el.holidayAllowanceWarning.classList.add("hidden");
    el.holidayAllowanceWarning.textContent = "";
    return;
  }

  const allowanceByName = new Map(state.people.map((p) => [p.name, Number(p.standard || 0) + Number(p.additional || 0)]));
  const breaches = [];
  for (const name of selectedPeople) {
    const totalAllowance = Number(allowanceByName.get(name) || 0);
    const alreadyPlanned = Number(holidayDaysForPerson(name) || 0);
    const projected = alreadyPlanned + daysOffWork;
    const overBy = Number((projected - totalAllowance).toFixed(2));
    if (overBy > 0) breaches.push(`${name} (+${overBy})`);
  }

  if (!breaches.length) {
    el.holidayAllowanceWarning.classList.add("hidden");
    el.holidayAllowanceWarning.textContent = "";
    return;
  }

  el.holidayAllowanceWarning.textContent = `Allowance warning: ${breaches.join(", ")} would exceed available allowance.`;
  el.holidayAllowanceWarning.classList.remove("hidden");
}


function renderHolidayHeatmap() {
  if (!el.holidayHeatmap) return;
  const year = state.year;
  const PLOT_H = 280;  // ← Taller chart
  const HEATMAP_COLORS = ["#0057b8", "#d50000", "#2d8f5d", "#6a2ca0", "#e07b00", "#008a8a"];
  const colorFor = (name) => HEATMAP_COLORS[Math.max(0, state.peopleNames.indexOf(name)) % HEATMAP_COLORS.length];
  const fmtDays = (d) => (Number.isInteger(d) ? String(d) : d.toFixed(1));
  const showFree = state.showHeatmapFree;

  // Per person, per (start) month: days off work, plus the free (weekend/bank-holiday)
  // portion of each trip (= trip length minus days off work). Half days stay fractional.
  const monthPeople = Array.from({ length: 12 }, () => ({}));
  for (const h of holidaysForYear(year)) {
    const monthIdx = parseDate(h.startDate).getMonth();
    const tripLen = Math.max(0, tripLengthDays(h));
    const off = Number(h.daysOffWork || 0);
    const free = Math.max(0, tripLen - off);
    for (const [name, days] of Object.entries(h.peopleDays || {})) {
      const w = Number(days) || 0;
      if (w <= 0) continue;
      const slot = monthPeople[monthIdx][name] || (monthPeople[monthIdx][name] = { worked: 0, free: 0 });
      slot.worked += w;
      slot.free += free;
    }
  }
  const peopleInChart = state.peopleNames.filter((n) => monthPeople.some((m) => (m[n]?.worked || 0) > 0));

  // Scale to the tallest single bar (worked, plus free when shown), not the month sum.
  let maxBar = 1;
  for (const m of monthPeople) {
    for (const slot of Object.values(m)) {
      maxBar = Math.max(maxBar, slot.worked + (showFree ? slot.free : 0));
    }
  }
  // Pick a tidy axis step (1/2/5 × 10ⁿ) that fits the displayed maximum.
  const rough = maxBar / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(rough || 1)));
  const frac = rough / pow;
  const step = (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10) * pow;
  const niceMax = Math.max(step, Math.ceil(maxBar / step) * step);
  const ticks = [];
  for (let v = 0; v <= niceMax + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);

  const todayDate = parseDate(todayIsoLocal());
  const isPastMonth = (idx) => new Date(year, idx + 1, 0) < todayDate;

  const monthShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthFull = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  const yTickMarkup = ticks
    .map((v) => `<span style="bottom:${((v / niceMax) * PLOT_H).toFixed(2)}px">${fmtDays(v)}</span>`)
    .join("");
  const yGridMarkup = ticks
    .map((v) => `<span class="y-grid-line" style="bottom:${((v / niceMax) * PLOT_H).toFixed(2)}px"></span>`)
    .join("");

  const bars = monthShort
    .map((label, idx) => {
      const perPerson = monthPeople[idx];
      const past = isPastMonth(idx);
      const personBars = peopleInChart
        .filter((n) => (perPerson[n]?.worked || 0) > 0)
        .map((n) => {
          const { worked, free } = perPerson[n];
          const workedH = (worked / niceMax) * PLOT_H;
          const freeH = showFree ? (free / niceMax) * PLOT_H : 0;
          const freeSeg = freeH > 0
            ? `<div class="seg seg-free" style="height:${freeH.toFixed(2)}px;--seg-color:${colorFor(n)}"></div>`
            : "";
          return `<div class="person-bar"><div class="seg seg-worked" style="height:${workedH.toFixed(2)}px;background:${colorFor(n)}"></div>${freeSeg}</div>`;
        })
        .join("");
      return `<div class="month-bar-wrap${past ? " month-past" : ""}" data-month="${idx}"><div class="month-group">${personBars}</div></div>`;
    })
    .join("");

  const monthLabels = monthShort
    .map((label, idx) => `<span class="${isPastMonth(idx) ? "month-past" : ""}">${label}</span>`)
    .join("");

  const legendPeople = peopleInChart.length
    ? peopleInChart.map((n) => `<span><span class="legend-swatch" style="background:${colorFor(n)}"></span>${n}</span>`).join("")
    : `<span>No holiday booked yet for ${year}</span>`;
  const freeLegend = showFree
    ? `<span><span class="legend-swatch legend-free"></span>Weekend / bank holiday</span>`
    : "";

  el.holidayHeatmap.innerHTML = `
    <div class="heatmap-wrap">
      <div class="heatmap-head">
        <p><strong>Days Off Work By Month</strong></p>
        <label class="heatmap-values-toggle">
          <input type="checkbox" id="heatmap-free-check" ${showFree ? "checked" : ""} />
          Include weekends &amp; bank holidays
        </label>
      </div>
      <div class="intensity-chart-wrap" style="--plot-h:${PLOT_H}px">
        <div class="intensity-y-axis" aria-hidden="true">
          <span class="y-axis-title">Days</span>
          ${yTickMarkup}
        </div>
        <div class="intensity-plot-wrap">
          <div class="intensity-plot">
            <div class="intensity-y-grid" aria-hidden="true">${yGridMarkup}</div>
            <div class="month-intensity-chart">${bars}</div>
          </div>
          <div class="month-labels">${monthLabels}</div>
          <div class="heatmap-tooltip" hidden></div>
        </div>
      </div>
      <div class="heatmap-legend">
        ${legendPeople}
        ${freeLegend}
      </div>
    </div>
  `;

  // --- Interactivity: real-time hover tooltip + free-days toggle ---
  const chart = el.holidayHeatmap.querySelector(".month-intensity-chart");
  const plotWrap = el.holidayHeatmap.querySelector(".intensity-plot-wrap");
  const tip = el.holidayHeatmap.querySelector(".heatmap-tooltip");

  if (chart && plotWrap && tip) {
    const showTip = (e) => {
      const wrap = e.target.closest(".month-bar-wrap");
      if (!wrap) {
        tip.hidden = true;
        return;
      }
      const idx = Number(wrap.dataset.month);
      const perPerson = monthPeople[idx];
      const participants = peopleInChart.filter((n) => (perPerson[n]?.worked || 0) > 0);
      let totalOff = 0;
      const rows = participants.length
        ? participants
            .map((n) => {
              const { worked, free } = perPerson[n];
              totalOff += worked;
              const freeBit = showFree && free > 0 ? ` <span class="tip-muted">+${fmtDays(free)} free</span>` : "";
              return `<div class="tip-row"><span class="tip-dot" style="background:${colorFor(n)}"></span>${n}: <strong>${fmtDays(worked)}</strong> off${freeBit}</div>`;
            })
            .join("")
        : `<div class="tip-row tip-muted">No holiday booked</div>`;
      const totalRow = participants.length ? `<div class="tip-row tip-total">Total off: <strong>${fmtDays(totalOff)}</strong></div>` : "";
      tip.innerHTML = `<div class="tip-date">${monthFull[idx]}${isPastMonth(idx) ? " (past)" : ""}</div>${rows}${totalRow}`;
      tip.hidden = false;

      const plotRect = plotWrap.getBoundingClientRect();
      const tipW = tip.offsetWidth;
      let left = e.clientX - plotRect.left + 14;
      if (left + tipW > plotRect.width) left = e.clientX - plotRect.left - tipW - 14;
      tip.style.left = `${Math.max(0, left)}px`;
      tip.style.top = `${Math.max(0, e.clientY - plotRect.top - 8)}px`;
    };
    chart.addEventListener("pointermove", showTip);
    chart.addEventListener("pointerdown", showTip);
    chart.addEventListener("pointerleave", () => { tip.hidden = true; });
  }

  const freeCheck = el.holidayHeatmap.querySelector("#heatmap-free-check");
  if (freeCheck) {
    freeCheck.addEventListener("change", () => {
      state.showHeatmapFree = freeCheck.checked;
      writeHeatmapFreePref(freeCheck.checked);
      renderHolidayHeatmap();
    });
  }
}

function renderHolidayBurndown() {
  if (!el.holidayBurndown) return;
  const year = state.year;
  const peopleNames = state.peopleNames;

  if (!peopleNames.length) {
    el.holidayBurndown.innerHTML = "";
    return;
  }

  const allowanceByName = new Map(state.people.map((p) => [p.name, p.standard + p.additional]));
  const holidaysThisYear = holidaysForYear(year).sort((a, b) => a.startDate.localeCompare(b.startDate));

  const today = todayIsoLocal();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const yearStartDate = parseDate(yearStart);
  const yearEndDate = parseDate(yearEnd);
  const totalYearDays = Math.round((yearEndDate - yearStartDate) / (1000 * 60 * 60 * 24));

  // Wide aspect so the SVG scales to fill the full panel width (viewBox-driven,
  // matching the bold framing of the intensity chart above).
  const W = 1000, H = 320, padL = 52, padR = 18, padT = 34, padB = 34;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const offsetForDate = (dateStr) => {
    const clamped = dateStr < yearStart ? yearStart : dateStr > yearEnd ? yearEnd : dateStr;
    return Math.round((parseDate(clamped) - yearStartDate) / (1000 * 60 * 60 * 24));
  };
  const xForOffset = (off) => padL + (off / totalYearDays) * chartW;
  const xFor = (dateStr) => xForOffset(offsetForDate(dateStr));

  const maxAllowance = Math.max(...peopleNames.map((n) => allowanceByName.get(n) || 0), 10);
  const yMax = Math.ceil(maxAllowance / 5) * 5 + 5;

  const yFor = (v) => padT + chartH - Math.max(0, Math.min(v / yMax, 1)) * chartH;

  // Bold, saturated palette consistent with --blue / --red used elsewhere.
  const COLORS = ["#0057b8", "#d50000", "#2d8f5d", "#6a2ca0", "#e07b00", "#008a8a"];

  const todayInYear = today >= yearStart && today <= yearEnd;
  const todayOffset = offsetForDate(today <= yearEnd ? today : yearEnd);

  // Per-person model: remaining balance at any day offset.
  const people = peopleNames.map((name, idx) => {
    const allowance = allowanceByName.get(name) || 0;
    const color = COLORS[idx % COLORS.length];
    const events = holidaysThisYear
      .filter((h) => Number(h.peopleDays?.[name] || 0) > 0)
      .map((h) => ({
        days: Number(h.peopleDays[name]),
        startOffset: offsetForDate(h.startDate),
        endOffset: offsetForDate(h.endDate),
      }))
      .sort((a, b) => a.startOffset - b.startOffset);

    // Consumption ramps linearly across each trip's days rather than dropping all at once.
    const balanceAtOffset = (off) => {
      let bal = allowance;
      for (const ev of events) {
        if (off >= ev.endOffset) {
          bal -= ev.days;
        } else if (off > ev.startOffset) {
          const span = ev.endOffset - ev.startOffset;
          bal -= ev.days * (span > 0 ? (off - ev.startOffset) / span : 1);
        }
      }
      return bal;
    };

    return { name, idx, allowance, color, events, balanceAtOffset };
  });

  // Burndown lines: usage slopes down across each trip's span; solid up to today, dotted after.
  const linesMarkup = people.map((p) => {
    // Vertex path of (offset, balance): flat between trips, sloped during each trip.
    const verts = [{ off: 0, bal: p.allowance }];
    let balance = p.allowance;
    for (const ev of p.events) {
      verts.push({ off: ev.startOffset, bal: balance });
      balance -= ev.days;
      verts.push({ off: ev.endOffset, bal: balance });
    }
    verts.push({ off: totalYearDays, bal: balance });

    // Split the path at today, interpolating a vertex on any segment that straddles it.
    const tOff = todayOffset;
    const solidPts = [];
    const dottedPts = [];
    const addToSide = (off, bal) => {
      const pt = `${xForOffset(off).toFixed(1)},${yFor(bal).toFixed(1)}`;
      if (off <= tOff) solidPts.push(pt);
      if (off >= tOff) dottedPts.push(pt);
    };

    addToSide(verts[0].off, verts[0].bal);
    for (let i = 1; i < verts.length; i++) {
      const a = verts[i - 1];
      const b = verts[i];
      if (a.off < tOff && b.off > tOff && b.off !== a.off) {
        const t = (tOff - a.off) / (b.off - a.off);
        addToSide(tOff, a.bal + (b.bal - a.bal) * t);
      }
      addToSide(b.off, b.bal);
    }

    const poly = (pts, dash) =>
      pts.length >= 2
        ? `<polyline points="${pts.join(" ")}" fill="none" stroke="${p.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"${dash ? ' stroke-dasharray="2,7"' : ""}/>`
        : "";

    return poly(solidPts, false) + poly(dottedPts, true);
  }).join("");

  // Y grid + ticks: dashed lines matching the intensity chart's grid.
  const Y_STEPS = 5;
  const yAxis = Array.from({ length: Y_STEPS + 1 }, (_, i) => {
    const val = Math.round((i / Y_STEPS) * yMax);
    const y = yFor(val);
    return `<line x1="${padL}" y1="${y}" x2="${padL + chartW}" y2="${y}" stroke="rgba(17,17,17,0.25)" stroke-width="1" stroke-dasharray="4,4"/>
            <text x="${padL - 8}" y="${y + 4}" font-size="13" text-anchor="end" fill="#4f4f4f" font-family="inherit">${val}</text>`;
  }).join("");

  // X axis: month labels along the bottom.
  const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const xAxis = MONTH_SHORT.map((label, i) => {
    const x = xFor(formatDate(new Date(year, i, 1)));
    return `<text x="${x}" y="${padT + chartH + 20}" font-size="12" text-anchor="middle" fill="#4f4f4f" font-family="inherit">${label}</text>`;
  }).join("");

  // Bold black L-frame (left + bottom axis) echoing the bordered bars, with a rotated "Days" title.
  const yMid = padT + chartH / 2;
  const frame = `
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + chartH}" stroke="#111" stroke-width="2"/>
    <line x1="${padL}" y1="${padT + chartH}" x2="${padL + chartW}" y2="${padT + chartH}" stroke="#111" stroke-width="2"/>
    <text x="13" y="${yMid}" transform="rotate(-90 13 ${yMid})" font-size="12" font-weight="700" text-anchor="middle" fill="#333" font-family="inherit">Days</text>`;

  // Today marker
  const todayLine = todayInYear
    ? `<line x1="${xForOffset(todayOffset)}" y1="${padT}" x2="${xForOffset(todayOffset)}" y2="${padT + chartH}" stroke="var(--red)" stroke-width="2" stroke-dasharray="5,4"/>`
    : "";

  // Transparent overlay + crosshair guide drive the hover tooltip.
  const overlay = `<rect id="burndown-overlay" x="${padL}" y="${padT}" width="${chartW}" height="${chartH}" fill="transparent" style="cursor:crosshair"/>`;
  const guide = `<line id="burndown-guide" x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + chartH}" stroke="#111" stroke-width="1" stroke-dasharray="2,3" opacity="0" pointer-events="none"/>`;

  const swatches = peopleNames.map((name, idx) => {
    const color = COLORS[idx % COLORS.length];
    return `<span><span class="legend-swatch" style="background:${color}"></span>${name}</span>`;
  }).join("");

  el.holidayBurndown.innerHTML = `
    <div class="burndown-wrap">
      <p><strong>Holiday Allowance Burndown (${year})</strong></p>
      <div class="burndown-chart-scroll">
        <svg class="burndown-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Remaining holiday allowance burned down over ${year}">
          ${yAxis}
          ${frame}
          ${xAxis}
          ${todayLine}
          ${linesMarkup}
          ${guide}
          ${overlay}
        </svg>
        <div class="burndown-tooltip" hidden></div>
      </div>
      <div class="heatmap-legend">
        ${swatches}
      </div>
    </div>
  `;

  // --- Interactivity: hover tooltip + toggle ---
  const svg = el.holidayBurndown.querySelector(".burndown-svg");
  const overlayEl = el.holidayBurndown.querySelector("#burndown-overlay");
  const guideEl = el.holidayBurndown.querySelector("#burndown-guide");
  const tip = el.holidayBurndown.querySelector(".burndown-tooltip");
  const scrollWrap = el.holidayBurndown.querySelector(".burndown-chart-scroll");

  if (svg && overlayEl && guideEl && tip && scrollWrap) {
    const moveHandler = (clientX) => {
      const rect = svg.getBoundingClientRect();
      const scale = rect.width / W;
      const xSvg = Math.max(padL, Math.min(padL + chartW, (clientX - rect.left) / scale));
      const fraction = (xSvg - padL) / chartW;
      const off = Math.round(fraction * totalYearDays);

      guideEl.setAttribute("x1", xSvg);
      guideEl.setAttribute("x2", xSvg);
      guideEl.setAttribute("opacity", "0.6");

      const dateIso = formatDate(addDays(yearStartDate, off));
      const rows = people.map((p) => {
        const remaining = p.balanceAtOffset(off);
        return `<div class="tip-row"><span class="tip-dot" style="background:${p.color}"></span>${p.name}: <strong>${Number(remaining.toFixed(2))}</strong> left</div>`;
      }).join("");

      tip.innerHTML = `<div class="tip-date">${formatDayMonth(dateIso)}</div>${rows}`;
      tip.hidden = false;

      // Position the tooltip near the cursor within the scroll wrap, flipping side near the right edge.
      const wrapRect = scrollWrap.getBoundingClientRect();
      const tipW = tip.offsetWidth;
      let left = clientX - wrapRect.left + scrollWrap.scrollLeft + 14;
      if (left + tipW > scrollWrap.scrollLeft + wrapRect.width) {
        left = clientX - wrapRect.left + scrollWrap.scrollLeft - tipW - 14;
      }
      tip.style.left = `${Math.max(0, left)}px`;
      tip.style.top = `8px`;
    };

    overlayEl.addEventListener("pointermove", (e) => moveHandler(e.clientX));
    overlayEl.addEventListener("pointerdown", (e) => moveHandler(e.clientX));
    overlayEl.addEventListener("pointerleave", () => {
      guideEl.setAttribute("opacity", "0");
      tip.hidden = true;
    });
  }
}

function renderHolidayTodos() {
  if (!el.holidayTodos) return;
  const rowsForYear = holidaysForYear(state.year);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const twoMonthsOut = new Date(today.getFullYear(), today.getMonth() + 2, today.getDate());
  const sixMonthsOut = new Date(today.getFullYear(), today.getMonth() + 6, today.getDate());
  const plannedNotBooked = rowsForYear
    .filter((h) => {
      const status = String(displayStatus(h)).toLowerCase();
      if (status !== "planning") return false;
      const start = parseDate(h.startDate);
      return start >= today && start <= sixMonthsOut;
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  if (!plannedNotBooked.length) {
    el.holidayTodos.innerHTML = "";
    return;
  }

  const todoMarkup = `<ul class="todo-list">
      ${plannedNotBooked.map((h) => {
        const isUrgent = parseDate(h.startDate) <= twoMonthsOut;
        const urgentMarkup = isUrgent ? ' <span class="todo-urgent-subtitle">Potential Manatee Holiday Chaos!</span>' : "";
        return `<li><strong>${h.location}</strong>: ${formatDayMonth(h.startDate)}${h.startDate === h.endDate ? "" : ` to ${formatDayMonth(h.endDate)}`}${urgentMarkup}</li>`;
      }).join("")}
    </ul>`;

  el.holidayTodos.innerHTML = `
    <div class="holiday-todos">
      <p class="todo-section-title"><strong>To Do</strong> - planned but not booked (${plannedNotBooked.length})</p>
      ${todoMarkup}
    </div>
  `;
}

function renderNextBigHolidayHero() {
  if (!el.nextBigHolidayHero) return;
  const nextBigHoliday = getNextBigHoliday();
  if (!nextBigHoliday) {
    el.nextBigHolidayHero.innerHTML = `
      <span class="countdown-label">Next Big Holiday Countdown</span>
      <span class="countdown-value">No upcoming big holiday found</span>
    `;
    return;
  }
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = parseDate(nextBigHoliday.startDate);
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysUntil = Math.round((start - today) / msPerDay);
  const countdownText = daysUntil === 0 ? "Starts today" : `${daysUntil} day${daysUntil === 1 ? "" : "s"} to go`;
  el.nextBigHolidayHero.innerHTML = `
    <span class="countdown-label">Next Big Holiday Countdown</span>
    <span class="countdown-destination">${nextBigHoliday.location}</span>
    <span class="countdown-value">${countdownText}</span>
  `;
}

function renderHolidayTable() {
  const rowsForYear = holidaysForYear(state.year)
    .filter((h) => !state.hideCompleted || displayStatus(h) !== "completed");
  if (!rowsForYear.length) {
    el.holidayTable.innerHTML = `<p>No holidays to show for <strong>${state.year}</strong>.</p>`;
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
      const startDisplay = formatDayMonth(h.startDate);
      const endDisplay = formatDayMonth(h.endDate);
      const isSingleDayTrip = h.startDate === h.endDate;
      const daysOffWork = Number(h.daysOffWork || 0);
      const bankHolidayNames = daysOffWork === 0 ? bankHolidayNamesInRange(h.startDate, h.endDate) : [];
      const lengthLabel = `${tripLength} day${tripLength === 1 ? "" : "s"}`;
      const durationMeta = bankHolidayNames.length
        ? `${lengthLabel}, ${bankHolidayNames.join(", ")}`
        : lengthLabel;
      const mobileDateMarkup = isSingleDayTrip
        ? `<span>${startDisplay}</span><span>(${durationMeta})</span>`
        : `<span>${startDisplay}</span><span>to</span><span>${endDisplay}</span><span>(${durationMeta})</span>`;
      const showIndividualPeopleDays = benDays !== louiseDays;

      return `
      <tr class="${pastClass}">
        <td>${h.location}</td>
        <td><span class="tag status-${statusLabel}">${statusLabel}</span></td>
        <td>${h.country || "-"}</td>
        <td>${startDisplay}</td>
        <td>${endDisplay}</td>
        <td>${daysOffWork}</td>
        <td>${tripLength}</td>
        <td>${benDays || "-"}</td>
        <td>${louiseDays || "-"}</td>
        <td><button type="button" class="edit-trip" data-id="${h.id}">Edit</button></td>
      </tr>
      <tr class="trip-row-mobile ${pastClass}">
        <td colspan="10">
          <div class="trip-mobile-card">
            <div class="trip-mobile-row trip-mobile-title">
              <strong>${h.location}</strong>
              <span class="trip-mobile-actions-inline">
                <span class="tag trip-mobile-status-tag status-${statusLabel}">${statusLabel}</span>
                <button type="button" class="edit-trip trip-mobile-edit" data-id="${h.id}">Edit</button>
              </span>
            </div>
            <div class="trip-mobile-row trip-mobile-dates">
              ${mobileDateMarkup}
            </div>
            ${showIndividualPeopleDays ? "" : `<div class="trip-mobile-row trip-mobile-meta"><span>Days off: <strong>${h.daysOffWork}</strong></span></div>`}
            <div class="trip-mobile-row trip-mobile-people">
              ${showIndividualPeopleDays ? `<span>Ben: <strong>${benDays || "-"}</strong></span><span>Louise: <strong>${louiseDays || "-"}</strong></span>` : ""}
            </div>
          </div>
        </td>
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
          <th>Status</th>
          <th>Country</th>
          <th>Start</th>
          <th>End</th>
          <th>Days Off Work</th>
          <th>Trip Length</th>
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
    if (state.hideCompleted && displayStatus(h) === "completed") continue;
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
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const bankSet = getBankHolidaySet(year);
  const holidayIdx = buildHolidayDayIndex(year);

  for (let month = 0; month < 12; month++) {
    if (state.hideCompleted) {
      const monthEnd = new Date(year, month + 1, 0);
      if (monthEnd < today) continue;
    }

    const frag = el.monthTemplate.content.cloneNode(true);
    frag.querySelector("h4").textContent = monthName(month);
    const daysGrid = frag.querySelector(".days-grid");

    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let weekday = first.getDay();
    weekday = weekday === 0 ? 7 : weekday;

    const tripLabelAnchors = new Map();
    const tripBestRun = new Map();
    const visualRowForDay = (d) => Math.floor((weekday - 1 + (d - 1)) / 7);
    for (let d = 1; d <= daysInMonth; ) {
      const iso = formatDate(new Date(year, month, d));
      const segs = holidayIdx.get(iso) || [];
      const tripId = segs[0]?.id || null;
      if (!tripId) {
        d += 1;
        continue;
      }
      const row = visualRowForDay(d);
      const runStart = d;
      let runEnd = d;
      while (runEnd + 1 <= daysInMonth) {
        const nextDay = runEnd + 1;
        if (visualRowForDay(nextDay) !== row) break;
        const nextIso = formatDate(new Date(year, month, nextDay));
        const nextSegs = holidayIdx.get(nextIso) || [];
        if (!nextSegs.some((s) => s.id === tripId)) break;
        runEnd = nextDay;
      }
      const runLen = runEnd - runStart + 1;
      const best = tripBestRun.get(tripId);
      if (!best || runLen > best.runLen) {
        const anchorDay = runLen >= 3 ? runStart + 1 : runStart;
        tripBestRun.set(tripId, { day: anchorDay, runLen: runEnd - anchorDay + 1 });
      }
      d = runEnd + 1;
    }
    for (const [tripId, info] of tripBestRun.entries()) {
      tripLabelAnchors.set(`${tripId}:${info.day}`, info.runLen);
    }

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

      let tripMarkup = "";
      if (hasHoliday) {
        const segment = holidayIdx.get(iso)[0];
        const holiday = state.holidays.find((h) => String(h.id) === String(segment.id));
        const statusLabel = holiday ? displayStatus(holiday) : "planning";
        node.classList.add(`day-status-${statusLabel}`);
        const prevIso = formatDate(addDays(date, -1));
        const nextIso = formatDate(addDays(date, 1));
        const prevSegments = holidayIdx.get(prevIso) || [];
        const nextSegments = holidayIdx.get(nextIso) || [];
        const hasPrevSameTrip = prevSegments.some((s) => s.id === segment.id);
        const hasNextSameTrip = nextSegments.some((s) => s.id === segment.id);
        let classes = "trip-pill";
        classes += ` status-${statusLabel}`;
        if (statusLabel === "completed") classes += " completed";
        if (!hasPrevSameTrip) classes += " start";
        if (!hasNextSameTrip) classes += " end";
        const labelSpan = tripLabelAnchors.get(`${segment.id}:${day}`);
        if (labelSpan) {
          node.classList.add("has-trip-label");
          const fullName = String(segment.location || "").replace(/"/g, "&quot;");
          tripMarkup = `<span class="${classes}" style="--trip-span:${labelSpan}" title="${fullName}" aria-label="${fullName}" tabindex="0">${segment.location}</span>`;
        }
      }

      node.innerHTML = `<span class="num">${day}</span>${tripMarkup}`;
      if (isWeekend(date)) node.style.opacity = "0.9";
      daysGrid.appendChild(node);
    }

    el.calendarGrid.appendChild(frag);
  }
}

function render() {
  if (el.hideCompleted) el.hideCompleted.checked = state.hideCompleted;
  renderYearSelect();
  renderNextBigHolidayHero();
  renderPeopleSummary();
  renderHolidayHeatmap();
  renderHolidayBurndown();
  renderHolidayTodos();
  renderHolidayTable();
  renderCalendar();
}

function renderYearSelect() {
  if (!el.yearSelect) return;
  const years = [];
  for (let year = YEAR_MIN; year <= YEAR_MAX; year += 1) years.push(year);
  el.yearSelect.innerHTML = years
    .map((year) => `<option value="${year}" ${year === state.year ? "selected" : ""}>${year}</option>`)
    .join("");
  el.yearSelect.value = String(state.year);
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
  syncAllowanceEditorFromSelection();
  el.allowanceModal.classList.remove("hidden");
}

function closeAllowanceModal() {
  if (!el.allowanceModal) return;
  el.allowanceModal.classList.add("hidden");
}

function openAddHolidayModal() {
  if (!el.addHolidayModal) return;
  if (el.holidayForm) {
    el.holidayForm.dataset.endDateManual = "false";
    el.holidayForm.dataset.countryManual = "false";
    el.holidayForm.dataset.statusManual = "false";
    const currentYear = new Date().getFullYear();
    if (state.year > currentYear) {
      const midYearIso = `${state.year}-07-01`;
      if (el.holidayForm.elements.startDate) el.holidayForm.elements.startDate.value = midYearIso;
      if (el.holidayForm.elements.endDate) el.holidayForm.elements.endDate.value = midYearIso;
      const startHalf = el.holidayForm.elements.startHalf?.value || "am";
      const endHalf = el.holidayForm.elements.endHalf?.value || "pm";
      if (el.holidayForm.elements.tripLength) {
        el.holidayForm.elements.tripLength.value = String(calcTripLength(midYearIso, midYearIso, startHalf, endHalf));
      }
      if (el.holidayForm.elements.daysOffWork) {
        el.holidayForm.elements.daysOffWork.value = String(businessDaysOffWork(midYearIso, midYearIso, startHalf, endHalf));
      }
    }
    setHolidayFormStatusDefault();
  }
  el.addHolidayModal.classList.remove("hidden");
}

function closeAddHolidayModal() {
  if (!el.addHolidayModal) return;
  if (el.holidayForm && typeof el.holidayForm.reset === "function") {
    el.holidayForm.reset();
    el.holidayForm.dataset.endDateManual = "false";
    el.holidayForm.dataset.countryManual = "false";
    el.holidayForm.dataset.statusManual = "false";
    if (el.holidayForm.elements.tripLength) el.holidayForm.elements.tripLength.value = "";
    if (el.holidayForm.elements.daysOffWork) el.holidayForm.elements.daysOffWork.value = "";
    if (el.addCountry) el.addCountry.value = "United Kingdom";
  }
  if (el.holidayAllowanceWarning) {
    el.holidayAllowanceWarning.textContent = "";
    el.holidayAllowanceWarning.classList.add("hidden");
  }
  el.addHolidayModal.classList.add("hidden");
}

function openPeopleModal() {
  if (!el.peopleModal) return;
  renderPeopleList();
  el.peopleModal.classList.remove("hidden");
}

function closePeopleModal() {
  if (!el.peopleModal) return;
  el.peopleModal.classList.add("hidden");
}

function renderBankHolidayList() {
  if (!el.bankHolidayList) return;
  const rows = state.bankHolidays
    .filter((h) => h.holidayYear === state.year)
    .sort((a, b) => a.holidayDate.localeCompare(b.holidayDate))
    .map((h) => `
      <tr>
        <td>${formatDayMonth(h.holidayDate)}</td>
        <td>${h.name}</td>
        <td><button type="button" class="delete-bank-holiday" data-id="${h.id}">Delete</button></td>
      </tr>`)
    .join("");

  if (!rows) {
    el.bankHolidayList.innerHTML = `<p>No custom bank holidays set for ${state.year}. UK defaults will be used.</p>`;
    return;
  }

  el.bankHolidayList.innerHTML = `
    <table>
      <thead><tr><th>Date</th><th>Name</th><th>Action</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function openBankHolidaysModal() {
  if (!el.bankHolidaysModal) return;
  renderBankHolidayList();
  el.bankHolidaysModal.classList.remove("hidden");
}

function closeBankHolidaysModal() {
  if (!el.bankHolidaysModal) return;
  el.bankHolidaysModal.classList.add("hidden");
}

async function addBankHoliday(name, holidayDate) {
  const payload = {
    holiday_year: state.year,
    holiday_date: holidayDate,
    name,
  };
  const { error } = await db.from("bank_holidays").upsert(payload, { onConflict: "holiday_year,holiday_date" });
  if (error) throw error;
}

async function deleteBankHoliday(id) {
  const { error } = await db.from("bank_holidays").delete().eq("id", id);
  if (error) throw error;
}

async function addPersonDirectory(name) {
  const { error } = await db.from("people").insert({ name });
  if (error) throw error;
}

async function removePersonDirectory(name) {
  const [delPeople, delAllowances] = await Promise.all([
    db.from("people").delete().eq("name", name),
    db.from("people_allowance").delete().eq("name", name),
  ]);
  if (delPeople.error) throw delPeople.error;
  if (delAllowances.error && String(delAllowances.error.code) !== "42P01") throw delAllowances.error;
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

async function setYear(year) {
  const nextYear = Number(year);
  if (!Number.isInteger(nextYear) || nextYear === state.year) return;
  state.year = nextYear;
  writeSelectedYearPref(nextYear);
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
    delete fallbackPayload.start_half;
    delete fallbackPayload.end_half;
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
    delete fallbackPayload.start_half;
    delete fallbackPayload.end_half;
    const retry = await db.from("holidays").update(fallbackPayload).eq("id", id);
    if (retry.error) throw retry.error;
    return;
  }
  throw error;
}

async function deleteHoliday(id) {
  const { error } = await db.from("holidays").delete().eq("id", id);
  if (error) throw error;
}

function openEditHolidayModal(holidayId) {
  const holiday = state.holidays.find((h) => String(h.id) === String(holidayId));
  if (!holiday || !el.editHolidayForm || !el.editModal) return;
  el.editHolidayForm.elements.holidayId.value = String(holiday.id);
  el.editHolidayForm.elements.location.value = holiday.location;
  populateCountrySelect(el.editCountry, holiday.country || "United Kingdom");
  el.editHolidayForm.elements.startDate.value = holiday.startDate;
  el.editHolidayForm.elements.startHalf.value = holiday.startHalf || "am";
  el.editHolidayForm.elements.endDate.value = holiday.endDate;
  el.editHolidayForm.elements.endHalf.value = holiday.endHalf || "pm";
  el.editHolidayForm.elements.tripLength.value = String(tripLengthDays(holiday));
  el.editHolidayForm.elements.daysOffWork.value = String(holiday.daysOffWork);
  const editStatus = String(holiday.status || "").toLowerCase() === "ideation" ? "planning" : holiday.status;
  el.editHolidayForm.elements.status.value = HOLIDAY_STATUSES.includes(editStatus) ? editStatus : "planning";
  el.editHolidayForm.dataset.endDateManual = "true";
  const selectedPeople = Object.entries(holiday.peopleDays || {})
    .filter(([, days]) => Number(days) > 0)
    .map(([name]) => name);
  renderPeopleCheckboxes(selectedPeople.length ? selectedPeople : state.peopleNames);
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
    if (el.allowancePerson) el.allowancePerson.value = name;
    syncAllowanceEditorFromSelection();
    setStatusMessage(`Saved allowance for ${name}.`);
  } catch (err) {
    const reason = err?.message || "Unknown error";
    setStatusMessage(`Could not save person in Supabase: ${reason}`, true);
    console.error("Save person error:", err);
  }
});

if (el.allowancePerson) {
  el.allowancePerson.addEventListener("change", () => {
    syncAllowanceEditorFromSelection();
  });
}

if (el.holidayForm) el.holidayForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db) return;
  const formEl = e.currentTarget;

  const data = new FormData(formEl);
  const location = String(data.get("location") || "").trim();
  const country = String(data.get("country") || "").trim();
  const startDate = String(data.get("startDate") || "");
  const startHalf = String(data.get("startHalf") || "am");
  let endDate = String(data.get("endDate") || "");
  const endHalf = String(data.get("endHalf") || "pm");
  const status = String(data.get("status") || "planning").toLowerCase();

  const selected = Array.from(formEl.querySelectorAll('input[name="person"]:checked')).map((n) => n.value);

  if (!location || !startDate || !selected.length) {
    setStatusMessage("Add location, start date, and select at least one person.", true);
    return;
  }

  if (!endDate) {
    setStatusMessage("Add an end date.", true);
    return;
  }
  const tripLength = calcTripLength(startDate, endDate, startHalf, endHalf);
  const daysOffWork = businessDaysOffWork(startDate, endDate, startHalf, endHalf);
  if (tripLength <= 0) {
    setStatusMessage("Invalid half-day selection for this date range.", true);
    return;
  }

  const peopleDays = {};
  for (const name of selected) peopleDays[name] = Number(daysOffWork.toFixed(2));
  const safeStatus = HOLIDAY_STATUSES.includes(status) ? status : "planning";

  try {
    await addHoliday({
      location,
      country,
      start_date: startDate,
      start_half: startHalf,
      end_date: endDate,
      end_half: endHalf,
      days: tripLength,
      days_off_work: daysOffWork,
      status: safeStatus,
      people_days: peopleDays,
    });
    await loadData();
    render();
    if (formEl && typeof formEl.reset === "function") formEl.reset();
    formEl.dataset.endDateManual = "false";
    formEl.dataset.countryManual = "false";
    formEl.dataset.statusManual = "false";
    closeAddHolidayModal();
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
if (el.openPeople) el.openPeople.addEventListener("click", () => openPeopleModal());
if (el.openAddHoliday) el.openAddHoliday.addEventListener("click", () => openAddHolidayModal());
if (el.peopleCancel) el.peopleCancel.addEventListener("click", () => closePeopleModal());
if (el.openAllowance) el.openAllowance.addEventListener("click", () => openAllowanceModal());
if (el.allowanceCancel) el.allowanceCancel.addEventListener("click", () => closeAllowanceModal());
if (el.addHolidayCancel) el.addHolidayCancel.addEventListener("click", () => closeAddHolidayModal());
if (el.openBankHolidays) el.openBankHolidays.addEventListener("click", () => openBankHolidaysModal());
if (el.bankHolidaysCancel) el.bankHolidaysCancel.addEventListener("click", () => closeBankHolidaysModal());

if (el.bankHolidayForm) el.bankHolidayForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db) return;
  const data = new FormData(e.currentTarget);
  const name = String(data.get("name") || "").trim();
  const holidayDate = String(data.get("holidayDate") || "");
  if (!name || !holidayDate) return;
  try {
    await addBankHoliday(name, holidayDate);
    await loadData();
    render();
    renderBankHolidayList();
    e.currentTarget.reset();
    setStatusMessage(`Saved bank holiday: ${name}.`);
  } catch (err) {
    const reason = err?.message || "Unknown error";
    setStatusMessage(`Could not save bank holiday: ${reason}`, true);
  }
});

if (el.bankHolidayList) el.bankHolidayList.addEventListener("click", async (e) => {
  const btn = e.target.closest("button.delete-bank-holiday");
  if (!btn || !db) return;
  try {
    await deleteBankHoliday(Number(btn.dataset.id));
    await loadData();
    render();
    renderBankHolidayList();
    setStatusMessage("Deleted bank holiday.");
  } catch (err) {
    const reason = err?.message || "Unknown error";
    setStatusMessage(`Could not delete bank holiday: ${reason}`, true);
  }
});

if (el.peopleForm) el.peopleForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db) return;
  const data = new FormData(e.currentTarget);
  const name = String(data.get("name") || "").trim();
  if (!name) return;
  try {
    await addPersonDirectory(name);
    await loadData();
    render();
    renderPeopleList();
    e.currentTarget.reset();
    setStatusMessage(`Added person: ${name}.`);
  } catch (err) {
    const reason = err?.message || "Unknown error";
    setStatusMessage(`Could not add person: ${reason}`, true);
  }
});

if (el.peopleList) el.peopleList.addEventListener("click", async (e) => {
  const btn = e.target.closest("button.remove-person");
  if (!btn || !db) return;
  const name = btn.dataset.name;
  try {
    await removePersonDirectory(name);
    await loadData();
    render();
    renderPeopleList();
    setStatusMessage(`Removed person: ${name}.`);
  } catch (err) {
    const reason = err?.message || "Unknown error";
    setStatusMessage(`Could not remove person: ${reason}`, true);
  }
});

if (el.holidayForm) {
  el.holidayForm.dataset.endDateManual = "false";
  el.holidayForm.dataset.countryManual = "false";
  el.holidayForm.dataset.statusManual = "false";
  const syncAddForm = () => {
    const start = el.holidayForm.elements.startDate.value;
    const end = el.holidayForm.elements.endDate.value;
    const startHalf = el.holidayForm.elements.startHalf.value || "am";
    const endHalf = el.holidayForm.elements.endHalf.value || "pm";
    if (!start) return;

    if (start && end) {
      el.holidayForm.elements.tripLength.value = String(calcTripLength(start, end, startHalf, endHalf));
      el.holidayForm.elements.daysOffWork.value = String(businessDaysOffWork(start, end, startHalf, endHalf));
    } else {
      el.holidayForm.elements.tripLength.value = "";
      el.holidayForm.elements.daysOffWork.value = "";
    }
    updateHolidayAllowanceWarning();
  };
  el.holidayForm.elements.startDate.addEventListener("change", () => {
    const endManual = el.holidayForm.dataset.endDateManual === "true";
    if (!endManual && el.holidayForm.elements.startDate.value) {
      el.holidayForm.elements.endDate.value = el.holidayForm.elements.startDate.value;
    }
    syncAddForm();
  });
  el.holidayForm.elements.endDate.addEventListener("change", () => {
    const end = el.holidayForm.elements.endDate.value;
    el.holidayForm.dataset.endDateManual = end ? "true" : "false";
    syncAddForm();
    setHolidayFormStatusDefault();
  });
  if (el.holidayForm.elements.status) {
    for (const node of el.holidayForm.querySelectorAll('input[name="status"]')) {
      node.addEventListener("change", () => {
        el.holidayForm.dataset.statusManual = "true";
      });
    }
  }
  if (el.holidayForm.elements.country) {
    el.holidayForm.elements.country.addEventListener("change", () => {
      el.holidayForm.dataset.countryManual = "true";
    });
  }
  if (el.holidayForm.elements.location) {
    el.holidayForm.elements.location.addEventListener("input", () => {
      const countryManual = el.holidayForm.dataset.countryManual === "true";
      if (countryManual) return;
      const inferred = inferCountryFromLocation(el.holidayForm.elements.location.value);
      if (inferred && el.holidayForm.elements.country) {
        el.holidayForm.elements.country.value = inferred;
      }
    });
  }
  el.holidayForm.addEventListener("change", (evt) => {
    const target = evt.target;
    if (target && target.matches('input[name="person"]')) {
      updateHolidayAllowanceWarning();
    }
  });
  for (const node of el.holidayForm.querySelectorAll('input[name="startHalf"], input[name="endHalf"]')) {
    node.addEventListener("change", () => syncAddForm());
  }
}

if (el.editHolidayForm) {
  el.editHolidayForm.dataset.endDateManual = "true";
  const syncEditForm = () => {
    const start = el.editHolidayForm.elements.startDate.value;
    const end = el.editHolidayForm.elements.endDate.value;
    const startHalf = el.editHolidayForm.elements.startHalf.value || "am";
    const endHalf = el.editHolidayForm.elements.endHalf.value || "pm";
    if (!start) return;

    if (start && end) {
      el.editHolidayForm.elements.tripLength.value = String(calcTripLength(start, end, startHalf, endHalf));
      el.editHolidayForm.elements.daysOffWork.value = String(businessDaysOffWork(start, end, startHalf, endHalf));
    } else {
      el.editHolidayForm.elements.tripLength.value = "";
      el.editHolidayForm.elements.daysOffWork.value = "";
    }
  };
  el.editHolidayForm.elements.startDate.addEventListener("change", () => {
    const endManual = el.editHolidayForm.dataset.endDateManual === "true";
    if (!endManual && el.editHolidayForm.elements.startDate.value) {
      el.editHolidayForm.elements.endDate.value = el.editHolidayForm.elements.startDate.value;
    }
    syncEditForm();
  });
  el.editHolidayForm.elements.endDate.addEventListener("change", () => {
    const end = el.editHolidayForm.elements.endDate.value;
    el.editHolidayForm.dataset.endDateManual = end ? "true" : "false";
    syncEditForm();
  });
  for (const node of el.editHolidayForm.querySelectorAll('input[name="startHalf"], input[name="endHalf"]')) {
    node.addEventListener("change", () => syncEditForm());
  }
}

if (el.editHolidayForm) el.editHolidayForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db) return;
  const form = e.currentTarget;
  const data = new FormData(form);
  const id = Number(data.get("holidayId"));
  const location = String(data.get("location") || "").trim();
  const country = String(data.get("country") || "").trim();
  const startDate = String(data.get("startDate") || "");
  const startHalf = String(data.get("startHalf") || "am");
  const endDate = String(data.get("endDate") || "");
  const endHalf = String(data.get("endHalf") || "pm");
  const status = String(data.get("status") || "planning").toLowerCase();
  const safeStatus = HOLIDAY_STATUSES.includes(status) ? status : "planning";
  const tripLength = calcTripLength(startDate, endDate, startHalf, endHalf);
  const daysOffWork = businessDaysOffWork(startDate, endDate, startHalf, endHalf);
  const selected = Array.from(el.editHolidayForm.querySelectorAll('input[name="editPerson"]:checked')).map((n) => n.value);

  if (!id || !location || !startDate || !endDate || !tripLength) {
    setStatusMessage("Please complete all edit fields.", true);
    return;
  }
  if (!selected.length) {
    setStatusMessage("Select at least one person for this holiday.", true);
    return;
  }
  const peopleDays = {};
  for (const name of selected) peopleDays[name] = Number(daysOffWork.toFixed(2));

  try {
    await updateHoliday(id, {
      location,
      country,
      start_date: startDate,
      start_half: startHalf,
      end_date: endDate,
      end_half: endHalf,
      days: tripLength,
      days_off_work: daysOffWork,
      status: safeStatus,
      people_days: peopleDays,
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

if (el.removeHoliday) el.removeHoliday.addEventListener("click", async () => {
  if (!db || !el.editHolidayForm) return;
  const id = Number(el.editHolidayForm.elements.holidayId.value);
  if (!id) return;
  const ok = window.confirm("Remove this trip? This cannot be undone.");
  if (!ok) return;
  try {
    await deleteHoliday(id);
    await loadData();
    render();
    closeEditHolidayModal();
    setStatusMessage("Trip removed.");
  } catch (err) {
    const reason = err?.message || "Unknown error";
    setStatusMessage(`Could not remove trip: ${reason}`, true);
  }
});

if (el.tableTab) el.tableTab.addEventListener("click", () => toggleView("table"));
if (el.calendarTab) el.calendarTab.addEventListener("click", () => toggleView("calendar"));
if (el.hideCompleted) el.hideCompleted.addEventListener("change", (e) => {
  state.hideCompleted = Boolean(e.target.checked);
  writeHideCompletedPref(state.hideCompleted);
  render();
});
if (el.yearSelect) el.yearSelect.addEventListener("change", async (e) => {
  await setYear(e.target.value);
  renderBankHolidayList();
});

function setAuthedUI(authed) {
  const gate = document.getElementById("auth-gate");
  const app = document.getElementById("app-main");
  if (gate) gate.classList.toggle("hidden", authed);
  if (app) app.classList.toggle("hidden", !authed);
}

function showUserInfo(session) {
  const userEmailEl = document.getElementById("user-email");
  if (userEmailEl) {
    userEmailEl.textContent = session?.user?.email || "";
  }
}

// Sign-out — wired unconditionally so it works even if db init has issues
document.getElementById("sign-out-btn")?.addEventListener("click", async () => {
  if (db) {
    await db.auth.signOut();
  }
  // Clear Supabase localStorage keys as fallback
  Object.keys(localStorage).forEach(k => {
    if (k.startsWith("sb-")) localStorage.removeItem(k);
  });
  setAuthedUI(false);
  showUserInfo(null);
  location.reload();
});

(async function init() {
  if (!db) return;

  const signInForm = document.getElementById("sign-in-form");
  const authError = document.getElementById("auth-error");

  if (signInForm) {
    signInForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (authError) authError.textContent = "";
      const email = document.getElementById("sign-in-email").value;
      const password = document.getElementById("sign-in-password").value;
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error && authError) authError.textContent = error.message;
    });
  }

  let dataLoaded = false;
  async function loadAppData() {
    if (dataLoaded) return;
    dataLoaded = true;
    try {
      populateCountrySelect(el.addCountry, "United Kingdom");
      populateCountrySelect(el.editCountry, "United Kingdom");
      await loadData();
      render();
    } catch (err) {
      console.error("[MHP] loadAppData error:", err);
    }
  }

  db.auth.onAuthStateChange((_event, session) => {
    if (session) {
      setAuthedUI(true);
      showUserInfo(session);
      // Defer to avoid Supabase internal lock in Safari
      setTimeout(() => loadAppData(), 0);
    } else {
      setAuthedUI(false);
      showUserInfo(null);
    }
  });

  const { data: { session } } = await db.auth.getSession();
  if (session) {
    setAuthedUI(true);
    showUserInfo(session);
    await loadAppData();
  } else {
    setAuthedUI(false);
  }
})();
