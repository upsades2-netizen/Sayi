import { addBook, getBookFile, listBooks, load, removeBook, save, updateBook } from "./store.js";
import { SubjectStudyEngine } from "./subject-study-engine.js";
import { SmartStudyPlan } from "./smart-study-plan.js";

window.addEventListener("sayi-save-error", () => alert("تعذر حفظ البيانات. قد تكون مساحة التخزين ممتلئة؛ جرّب حذف بعض البيانات أو استخدم متصفحًا آخر."));

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const colors = {
  green: "#276b51",
  teal: "#2c8b83",
  blue: "#4d77b9",
  sky: "#4b9ab3",
  purple: "#8067ae",
  pink: "#c8799c",
  rose: "#b76d75",
  orange: "#c9824b",
  amber: "#bd8b38",
  red: "#b7605d"
};

let data = load();
let books = [];
let activeBookUrl = null;
let activeView = "home";
let isRefreshingApp = false;
let isRenderingApp = false;

const refreshApp = () => {
  if (isRefreshingApp || isRenderingApp) return;
  isRefreshingApp = true;
  const scrollY = window.scrollY;
  try {
    render();
    showView(activeView);
    requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, behavior: "auto" });
    });
  } finally {
    isRefreshingApp = false;
  }
};

window.addEventListener("sayi-saved", refreshApp);

const uid = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const esc = x =>
  String(x || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));

const formatBookSize = bytes => {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميغابايت`;
};

const closePdfViewer = () => {
  const frame = $("#pdf-frame");
  if (frame) frame.removeAttribute("src");
  $("#pdf-viewer")?.setAttribute("hidden", "");
  if (activeBookUrl) {
    URL.revokeObjectURL(activeBookUrl);
    activeBookUrl = null;
  }
};

function renderBooks() {
  const root = $("#books-list");
  if (!root) return;
  if (!books.length) {
    root.innerHTML = `<section class="panel books-empty"><strong>لا توجد كتب بعد</strong><p>أضف ملف PDF واحداً ليظهر هنا.</p></section>`;
    return;
  }
  root.innerHTML = books.map(book => `<article class="book-card panel"><div class="book-card-info"><span class="book-icon" aria-hidden="true">PDF</span><div><h3>${esc(book.name)}</h3><p>${formatBookSize(book.size) || "حجم غير معروف"} · ${book.extractionStatus === "ready" ? `${book.pageCount} صفحة محللة` : "لم يُحلل بعد"}</p></div></div><div class="book-actions"><button class="primary" data-book-action="open" data-book-id="${esc(book.id)}">فتح</button><button class="soft-button" data-book-action="analyze" data-book-id="${esc(book.id)}">${book.extractionStatus === "ready" ? "إعادة التحليل" : "تحليل الكتاب"}</button><button class="soft-button" data-book-action="delete" data-book-id="${esc(book.id)}">حذف</button></div></article>`).join("");
}

async function isPdfFile(file) {
  if (!file) return false;
  const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return new TextDecoder().decode(header) === "%PDF-";
}

async function openPdfBook(id) {
  const book = books.find(item => item.id === id);
  if (!book) return;
  const file = await getBookFile(id);
  if (!file) throw new Error("تعذر العثور على ملف الكتاب");
  const url = URL.createObjectURL(file);
  closePdfViewer();
  activeBookUrl = url;
  $("#pdf-viewer-title").textContent = book.name;
  $("#pdf-frame").src = url;
  $("#pdf-viewer").removeAttribute("hidden");
  $("#pdf-viewer").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function handleBookFile(file) {
  if (!file) return;
  if (!(await isPdfFile(file))) {
    alert("يمكن إضافة ملفات PDF فقط.");
    return;
  }
  const book = { id: uid(), name: file.name, size: file.size, type: "application/pdf", createdAt: new Date().toISOString(), extractionStatus: "pending", pages: [] };
  await addBook(book, file);
  books.push(book);
  books.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  renderBooks();
}

async function extractPdfBook(bookId) {
  const book = books.find(item => item.id === bookId);
  if (!book) return;
  const file = await getBookFile(bookId);
  if (!file) throw new Error("تعذر العثور على ملف الكتاب");
  const pdfjs = await import("./pdfjs/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("./pdfjs/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str).join(" ").replace(/\s+/g, " ").trim();
    pages.push({ number, text, wordCount: text ? text.split(/\s+/).length : 0, extractedAt: new Date().toISOString() });
  }
  book.pageCount = pdf.numPages;
  book.pages = pages;
  book.extractionStatus = "ready";
  book.extractedAt = new Date().toISOString();
  await updateBook(book);
  renderBooks();
  renderSmartStudyPlan();
  alert(`تم تحليل ${pages.length} صفحة. افتح الخطة الذكية لاختيار الكتاب للدراسة.`);
}

async function loadBooks() {
  try {
    books = (await listBooks()).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  } catch (error) {
    books = [];
    console.warn("Books storage is unavailable", error);
    const root = $("#books-list");
    if (root) root.innerHTML = `<section class="panel books-empty"><strong>تعذر فتح مكتبة الكتب</strong><p>تأكد من السماح بالتخزين المحلي في المتصفح.</p></section>`;
    return;
  }
  renderBooks();
  renderSmartStudyPlan();
}

const weekDays = [
  ["saturday", "السبت"], ["sunday", "الأحد"], ["monday", "الاثنين"],
  ["tuesday", "الثلاثاء"], ["wednesday", "الأربعاء"], ["thursday", "الخميس"], ["friday", "الجمعة"]
];

// =========================
// البيانات
// =========================

function normalize() {
  data.subjects ??= [];
  data.tasks ??= [];
  data.legacyTasks ??= [];
  if (data.tasks.length) {
    data.legacyTasks.push(...data.tasks);
    data.tasks = [];
    save(data);
  }
  data.subjectState ??= {};
  data.smartPlanSubjectId ??= "";
  const validDays = new Set(weekDays.map(([key]) => key));
  const schedule = Array.isArray(data.weeklySchedule) ? data.weeklySchedule : [];
  const isNewSchedule = schedule.every(item => item && Array.isArray(item.tasks));
  let scheduleMigrated = false;

  if (!isNewSchedule) {
    const grouped = [];
    const legacy = Array.isArray(data.weeklyScheduleLegacy) ? data.weeklyScheduleLegacy : [];
    schedule.forEach(item => {
      if (!item || !validDays.has(item.day)) {
        if (item) legacy.push(item);
        return;
      }
      const subject = data.subjects.find(s =>
        (item.subjectId && s.id === item.subjectId) ||
        (item.subject && s.name === item.subject)
      );
      if (!subject || !(item.title || item.name)) {
        legacy.push(item);
        return;
      }
      let entry = grouped.find(x => x.day === item.day && x.subjectId === subject.id);
      if (!entry) {
        entry = { id: item.id || uid(), day: item.day, subjectId: subject.id, tasks: [] };
        grouped.push(entry);
      }
      entry.tasks.push({ id: item.id || uid(), title: String(item.title || item.name).trim(), done: !!item.done });
    });
    data.weeklySchedule = grouped;
    data.weeklyScheduleLegacy = legacy;
    scheduleMigrated = true;
  } else {
    data.weeklySchedule = schedule
      .filter(item => item && item.id && validDays.has(item.day) && item.subjectId)
      .map(item => ({
        ...item,
        tasks: item.tasks
          .filter(task => task && task.id && String(task.title || task.name || "").trim())
          .map(task => ({ ...task, title: String(task.title || task.name).trim(), done: !!task.done }))
      }));
  }
  data.studyPlan ??= { durationDays: 0, startedAt: null, activeMode: "natural", activity: {} };
  data.studyPlan.activity ??= {};
  if (data.studyPlan.activeMode === "basic") data.studyPlan.activeMode = "natural";
  data.studyPlan.durationDays = Math.max(Number(data.studyPlan.durationDays) || 0, 0);
  data.studyPlan.activeMode = ["natural", "fast", "slow"].includes(data.studyPlan.activeMode) ? data.studyPlan.activeMode : "natural";

  data.subjects.forEach(s => {
    s.chapters ??= [];
    s.totalLessons = Math.max(Number(s.totalLessons) || 0, ...s.chapters.map(c => (c.lessons || []).length), 0);
    s.durationDays = Number(s.durationDays) || 0;
    s.createdAt ??= new Date().toISOString();
    s.plan ??= null;
    if (s.plan && !["slow", "natural", "fast"].includes(s.plan.type)) s.plan = null;
    s.color = colors[s.color] ? s.color : "green";
    s.chapters.forEach(c => {
      c.lessons ??= [];
      c.totalLessons = Math.max(Number(c.totalLessons) || 0, c.lessons.length);
      c.lessons.forEach(l => { if (l.done && !l.completedAt) l.completedAt = null; });
    });
  });
  data.tasks.forEach(t => { t.done = !!t.done; });
  if (scheduleMigrated) save(data);
}

normalize();

const lessons = s => s.chapters.flatMap(c => c.lessons.map(l => ({ ...l, chapter: c.name, chapterId: c.id, subject: s.name, subjectId: s.id })));
const completed = s => s.chapters.reduce((n, c) => n + c.lessons.filter(l => l.done).length, 0);
const total = s => Math.max(Number(s.totalLessons) || 0, s.chapters.reduce((n, c) => n + c.lessons.length, 0));
const percent = s => total(s) ? Math.round(completed(s) / total(s) * 100) : 0;
const all = () => data.subjects.flatMap(lessons);
const allTotal = () => data.subjects.reduce((n, s) => n + total(s), 0);
const allDone = () => data.subjects.reduce((n, s) => n + completed(s), 0);

const overall = () =>
  allTotal()
    ? Math.round(allDone() / allTotal() * 100)
    : 0;

const todayKey = () =>
  new Date().toISOString().slice(0, 10);

const dateKey = d => d.toISOString().slice(0, 10);

// =========================
// نشاط اليوم
// =========================

const hasActivity = date =>
  (Number(data.studyPlan.activity[date]) || 0) > 0;

// سلسلة الأيام: تحسب الأيام المتتالية من اليوم (أو من أمس
// إذا لم يبدأ الطالب اليوم بعد، حتى لا تنكسر السلسلة قبل انتهاء اليوم)
const studyStreak = () => {
  const cursor = new Date();
  if (!hasActivity(dateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let count = 0;
  while (hasActivity(dateKey(cursor))) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return count;
};

const daysRemaining = s => {
  if (!s.durationDays) return 0;

  const started = new Date(s.createdAt || Date.now());
  const elapsed = Math.max(
    0,
    Math.floor((Date.now() - started.getTime()) / 86400000)
  );

  return Math.max(s.durationDays - elapsed, 0);
};

const studyPlan = (s, mode = "balanced") => {
  const requestedMode = mode;
  mode = { slow: "calm", natural: "balanced", fast: "intensive" }[mode] || mode;
  const remaining = Math.max(total(s) - completed(s), 0);
  const days = daysRemaining(s);

  if (!s.durationDays || !remaining || !days) {
    return {
      daily: 0,
      requiredDays: 0,
      reviewDays: days,
      mode: requestedMode,
      leftover: 0,
      complete: !remaining
    };
  }

  const timeShare = {
    calm: 1,
    balanced: 0.8,
    intensive: 0.6
  }[mode] || 0.8;
  const targetDays = Math.max(1, Math.ceil(days * timeShare));
  const daily = Math.max(1, Math.ceil(remaining / targetDays));
  const requiredDays = Math.ceil(remaining / daily);

  return {
    daily,
    requiredDays,
    reviewDays: Math.max(days - requiredDays, 0),
    mode: requestedMode,
    leftover: requestedMode === "slow"
      ? Math.max(remaining - daily * days, 0)
      : 0,
    complete: false
  };
};

const completedToday = s =>
  s.chapters.reduce(
    (count, c) => count + c.lessons.filter(l =>
      l.done && l.completedAt === todayKey()
    ).length,
    0
  );

const arabicNumber = value =>
  Number(value || 0).toLocaleString("ar-IQ");

const globalDaysRemaining = () => {
  const { durationDays, startedAt } = data.studyPlan;
  if (!durationDays) return 0;

  const elapsed = startedAt
    ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 86400000)
    : 0;

  return Math.max(durationDays - Math.max(elapsed, 0), 0);
};

const globalPlanStats = () => ({
  total: allTotal(),
  done: allDone(),
  remaining: Math.max(allTotal() - allDone(), 0),
  days: globalDaysRemaining()
});

const globalPlanDefinition = mode => {
  const { remaining, days } = globalPlanStats();
  const naturalDaily = Math.ceil(remaining / Math.max(days, 1));
  const daily = mode === "fast"
    ? Math.max(1, Math.ceil(naturalDaily * 1.4))
    : mode === "slow"
      ? Math.max(1, Math.floor(naturalDaily * 0.8))
      : naturalDaily;
  const requiredDays = daily ? Math.ceil(remaining / daily) : 0;

  return {
    mode,
    daily,
    requiredDays,
    reviewDays: Math.max(days - requiredDays, 0),
    leftover: mode === "slow"
      ? Math.max(remaining - daily * days, 0)
      : 0,
    valid: !!data.studyPlan.durationDays,
    complete: remaining === 0
  };
};

const planPattern = (remaining, daily, requiredDays) => {
  if (!remaining || !daily || !requiredDays) return [];
  const base = Math.floor(remaining / requiredDays);
  const extra = remaining % requiredDays;
  return Array.from({ length: requiredDays }, (_, index) =>
    base + (index < extra ? 1 : 0)
  );
};

const activityDays = () =>
  Object.values(data.studyPlan.activity)
    .map(Number)
    .filter(value => value > 0);

const progressSuggestion = () => {
  const stats = globalPlanStats();
  const values = activityDays();
  const natural = globalPlanDefinition("natural");
  if (!stats.days || !natural.daily || values.length < 3) {
    return { mode: null, average: 0, reason: "لم نملك بيانات كافية بعد، سنقترح خطة مبدئية." };
  }

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (average > natural.daily * 1.2) {
    return { mode: "fast", average, reason: "لأن متوسط إنجازك الحالي أعلى من الهدف." };
  }
  if (average < natural.daily * 0.8) {
    return { mode: "slow", average, reason: "لأن متوسط إنجازك الحالي أقل من الهدف، لذلك نقترح خطة أخف." };
  }
  return { mode: "natural", average, reason: "تقدمك قريب من المعدل المطلوب، لذلك نقترح الخطة الطبيعية." };
};

const distributeLessons = (target, subjects = data.subjects) => {
  const available = subjects.map(s => Math.max(total(s) - completed(s), 0));
  const totalAvailable = available.reduce((sum, value) => sum + value, 0);
  const result = available.map(() => 0);
  if (!target || !totalAvailable) return result;

  const amount = Math.min(target, totalAvailable);
  let assigned = 0;
  const fractions = available.map((value, index) => {
    const exact = amount * value / totalAvailable;
    const base = Math.min(Math.floor(exact), value);
    result[index] = base;
    assigned += base;
    return { index, fraction: exact - base };
  });

  fractions.sort((a, b) => b.fraction - a.fraction);
  for (const item of fractions) {
    if (assigned >= amount) break;
    if (result[item.index] < available[item.index]) {
      result[item.index] += 1;
      assigned += 1;
    }
  }

  return result;
};

const globalTodayGoal = () => {
  const stats = globalPlanStats();
  const plan = globalPlanDefinition(data.studyPlan.activeMode);
  if (!stats.remaining || !stats.days || !plan.valid) return 0;
  return Math.min(plan.daily, stats.remaining);
};

const allCompletedToday = () =>
  data.subjects.reduce((sum, s) => sum + completedToday(s), 0);

// =========================
// الحفظ + الرسم
// =========================

const persist = () => {
  save(data);
};

// =========================
// أيقونة كل مادة حسب اسمها
// =========================

function subjectIconMarkup(name = "") {
  const has = (...words) => words.some(w => name.includes(w));

  if (has("رياضيات", "حساب"))
    return `<circle cx="7" cy="6" r="1.3"/><path d="m7 7.3-4 13h4l3-9 3 9h4l-4-13"/>`;

  if (has("فيزياء"))
    return `<circle cx="12" cy="12" r="1.6"/><ellipse cx="12" cy="12" rx="9" ry="4"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(120 12 12)"/>`;

  if (has("كيمياء"))
    return `<path d="M9 3h6"/><path d="M10 3v6.5L4.8 18.2A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-2.8L14 9.5V3"/><path d="M8 15h8"/>`;

  if (has("أحياء", "احياء"))
    return `<path d="M5 21c0-9.5 6.2-15 15-15-1 9.5-5.5 15-15 15Z"/><path d="M7.5 18.5C10 15 13 12 17 8"/>`;

  if (has("عربي", "قواعد", "نصوص", "لغة عربية"))
    return `<path d="M4 20l1-4L15 6a2.5 2.5 0 0 1 3.5 3.5L8 20H4Z"/><path d="M13 8l3 3"/>`;

  if (has("انجليز", "إنجليز", "انكليزي", "إنكليزي", "انكليزية", "إنكليزية", "english"))
    return `<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.6 2.6 15.4 0 18"/><path d="M12 3c-2.6 2.6-2.6 15.4 0 18"/>`;

  if (has("كردي", "كورد", "kurd"))
    return `<path d="M5 5h14v14H5z"/><path d="M8 9h8M8 13h5M8 17h8"/>`;

  if (has("تاريخ"))
    return `<path d="M7 3h10"/><path d="M7 21h10"/><path d="M8 3c0 5 8 5 8 9s-8 4-8 9"/><path d="M16 3c0 5-8 5-8 9s8 4 8 9"/>`;

  if (has("جغرافيا"))
    return `<path d="m9 4-5 2v14l5-2 6 2 5-2V4l-5 2-6-2Z"/><path d="M9 4v14"/><path d="M15 6v14"/>`;

  if (has("دين", "اسلام", "إسلام", "قرآن", "قران"))
    return `<path d="M14.5 3a8.5 8.5 0 1 0 6.4 14.1A7 7 0 0 1 14.5 3Z"/>`;

  if (has("حاسوب", "حاسبات", "حاسبة", "برمجة"))
    return `<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8"/><path d="M12 16v4"/>`;

  if (has("فنية", "رسم"))
    return `<path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.6 1.6-1.4 0-.4-.2-.7-.4-1-.3-.3-.5-.6-.5-1 0-.8.7-1.4 1.6-1.4H16a4 4 0 0 0 4-4c0-5.2-3.6-9.2-8-9.2Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="7.8" r="1"/>`;

  if (has("رياضة", "بدنية"))
    return `<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M4.5 8.5l15 7"/><path d="M4.5 15.5l15-7"/>`;

  return `<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v18H6.5A2.5 2.5 0 0 1 4 18.5Z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H12v18h5.5a2.5 2.5 0 0 0 2.5-2.5Z"/>`;
}

// =========================
// بطاقات المواد
// =========================

function subjectCard(s) {
  const t = total(s);
  const d = completed(s);
  const p = percent(s);
  const remaining = Math.max(t - d, 0);
  const daily = s.durationDays
    ? Math.ceil(remaining / s.durationDays)
    : 0;

  return `
    <article
      class="subject-card clickable"
      data-detail="${s.id}"
      style="--subject:${colors[s.color]}"
    >
      <div class="subject-top">
        <span class="subject-icon"><svg viewBox="0 0 24 24">${subjectIconMarkup(s.name)}</svg></span>

        <div>
          <h3>${esc(s.name)}</h3>
          <p>${d} مكتمل من ${t} درس</p>
        </div>

        <button
          class="delete"
          data-delete-subject="${s.id}"
          aria-label="حذف المادة"
        >×</button>
      </div>

      <div class="progress">
        <span style="width:${p}%"></span>
      </div>

      <div class="subject-meta">
        <span>${p}% إنجاز</span>
        <span>${remaining} متبقٍ</span>
      </div>

      <div class="subject-actions">
        <button
          class="soft-button"
          data-add-chapter="${s.id}"
        >+ فصل</button>

        ${
          daily
            ? `<span class="soft-button">${daily} دروس/يوم</span>`
            : ""
        }
      </div>
    </article>
  `;
}

// =========================
// خطة الدراسة الذكية
// =========================

function smartPlanState(subjectId = "general") {
  const state = data.subjectState[subjectId] ??= { lessons: {}, items: {}, dailyTasks: [], exams: [], reviewTasks: [], smartPlan: {} };
  state.smartPlan ??= {};
  state.smartPlan.daily ??= { date: todayKey(), stage: "study", status: "open", subjectId };
  state.smartPlan.weekly ??= { week: "", status: "locked" };
  state.smartPlan.results ??= [];
  state.smartPlan.sourceBookId ??= "";
  state.smartPlan.pdfPageIndex ??= 0;
  return state.smartPlan;
}

function renderPdfStudyPanel(subjectId) {
  const root = $("#smart-plan-content");
  if (!root) return;
  const plan = smartPlanState(subjectId);
  const analyzed = books.filter(book => book.extractionStatus === "ready" && book.pages?.length);
  if (!analyzed.length) return;
  const selected = analyzed.find(book => book.id === plan.sourceBookId) || analyzed[0];
  plan.sourceBookId = selected.id;
  const pageIndex = Math.min(Number(plan.pdfPageIndex) || 0, selected.pages.length - 1);
  const page = selected.pages[pageIndex];
  root.insertAdjacentHTML("afterbegin", `<section class="panel pdf-study-panel"><div class="section-head"><div><p class="eyebrow dark">مصدر الخطة</p><h3>دراسة الكتاب بالتسلسل</h3></div><span>${pageIndex + 1} / ${selected.pages.length}</span></div><label>الكتاب<select data-pdf-book><option value="${esc(selected.id)}">${esc(selected.name)}</option>${analyzed.filter(book => book.id !== selected.id).map(book => `<option value="${esc(book.id)}">${esc(book.name)}</option>`).join("")}</select></label><div class="pdf-study-text"><strong>صفحة ${page.number}</strong><p>${esc(page.text || "هذه الصفحة صورة ولا يمكن استخراج نصها حاليًا. افتح PDF للقراءة اليدوية.")}</p></div><div class="smart-plan-actions"><button class="primary" data-pdf-study-action="complete" ${page.text ? "" : "disabled"}>إكمال قراءة الصفحة</button><button class="soft-button" data-book-action="open" data-book-id="${esc(selected.id)}">فتح الكتاب</button></div></section>`);
  save(data);
}

function buildSmartDailyPlan(subjectId = "general") {
  const plan = smartPlanState(subjectId);
  const engine = smartStudyEngine(subjectId);
  const contentLesson = engine.buildDailyPlan();
  const chapter = data.subjects.find(subject => subject.id === subjectId)?.chapters?.find(item => !item.lessons.every(lesson => lesson.done));
  if (!plan.date || plan.date !== todayKey()) {
    Object.assign(plan, { date: todayKey(), stage: "study", status: contentLesson.status, subjectId, lessonId: contentLesson.lessonId || null, chapterId: chapter?.id || null });
    save(data);
  }
  return plan;
}

function smartPlanStageLabel(stage) {
  return { study: "دراسة الجزء", reading: "إنهاء القراءة", questions: "حل الأسئلة", quiz: "اختبار اليوم", result: "النتيجة" }[stage] || stage;
}

function renderStudyQuiz(subjectId, scope) {
  const engine = smartStudyEngine(subjectId);
  const questions = engine.getQuestions(scope).slice(0, scope === "daily" ? 10 : 20);
  const root = $("#smart-plan-content");
  if (!root) return;
  if (!questions.length) {
    root.insertAdjacentHTML("beforeend", `<section class="panel smart-quiz"><h3>لا توجد أسئلة محلية</h3><p class="english-muted">أضف أسئلة الكتاب أو التمارين أو بنك الأسئلة الوزارية إلى مصدر المادة أولًا.</p></section>`);
    return;
  }
  root.insertAdjacentHTML("beforeend", `<form class="panel smart-quiz" data-study-quiz="${esc(subjectId)}|${esc(scope)}"><div class="section-head"><h3>${scope === "chapter" ? "اختبار نهاية الفصل" : scope === "weekly" ? "الاختبار الأسبوعي" : "الاختبار اليومي"}</h3><span>${questions.length} سؤال</span></div>${questions.map((question, index) => `<fieldset><legend>${index + 1}. ${esc(question.text || question.question || "سؤال من المصدر")}</legend>${(question.options || []).map((option, optionIndex) => `<label class="quiz-option"><input type="radio" name="q-${index}" value="${optionIndex}" required>${esc(option)}</label>`).join("")}</fieldset>`).join("")}<button class="primary" type="submit">حفظ النتيجة</button></form>`);
}

function questionAnswer(question) {
  if (Number.isInteger(question.answer)) return question.answer;
  if (Number.isInteger(question.correctAnswer)) return question.correctAnswer;
  const answer = question.answer || question.correctAnswer;
  return Array.isArray(question.options) ? question.options.indexOf(answer) : -1;
}

function saveStudyQuiz(form) {
  const [subjectId, scope] = form.dataset.studyQuiz.split("|");
  const engine = smartStudyEngine(subjectId);
  const questions = engine.getQuestions(scope).slice(0, scope === "daily" ? 10 : 20);
  let correct = 0;
  const errorsByTopic = {};
  const questionResults = questions.map((question, index) => {
    const selected = Number(new FormData(form).get(`q-${index}`));
    const isCorrect = selected === questionAnswer(question);
    if (isCorrect) correct++;
    if (!isCorrect) {
      const topic = question.topic || question.lessonTitle || question.unitTitle || "موضوع غير محدد";
      errorsByTopic[topic] = (errorsByTopic[topic] || 0) + 1;
    }
    return { questionId: question.id || `${scope}-${index}`, correct: isCorrect, source: question.source || (question.ministry ? "ministry" : "book") };
  });
  const wrong = questions.length - correct;
  const weakTopics = Object.keys(errorsByTopic);
  const result = engine.recordQuizResult({ scope, score: Math.round(correct / questions.length * 100), correct, wrong, weakTopics, errorsByTopic, questionResults });
  const plan = smartPlanState(subjectId);
  plan.lastResult = result;
  plan.lastRequestedExam = `${scope}-quiz`;
  save(data);
  renderSmartStudyPlan();
  alert(`النتيجة: ${result.score}%\n${weakTopics.length ? `تحتاج مراجعة: ${weakTopics.join("، ")}` : "أداء جيد"}`);
}

function renderSmartStudyPlan() {
  const root = $("#smart-plan-content");
  const home = $("#home-smart-plan-content");
  if (!root && !home) return;
  const selectedSubject = data.subjects.find(subject => subject.id === data.smartPlanSubjectId);
  const selectedSubjectId = selectedSubject?.id || "general";
  const plan = buildSmartDailyPlan(selectedSubjectId);
  const engine = subjectEngine(selectedSubjectId);
  const progress = engine.getProgress();
  const reviews = engine.getOpenReviews();
  const lesson = plan.lessonId ? engine.getLesson(plan.lessonId) : null;
  const content = lesson || { title: "لا يوجد محتوى منظم بعد", unitTitle: "غير محدد", pages: {} };
  const examMessage = plan.examMessage ? `<p class="smart-exam-message">${esc(plan.examMessage)}</p>` : "";
  const markup = `<div class="smart-plan-card"><div class="section-head"><div><p class="eyebrow dark">Today</p><h3>خطة اليوم</h3><p class="english-muted">${esc(content.unitTitle || "English")} · ${esc(content.title)}</p></div><span class="smart-stage">${smartPlanStageLabel(plan.stage)}</span></div><div class="smart-plan-details"><span><small>المادة</small><b>English</b></span><span><small>الفصل</small><b>${esc(content.unitTitle || "غير محدد")}</b></span><span><small>الجزء</small><b>${content.pages ? `ص ${content.pages.from || "-"}–${content.pages.to || "-"}` : "يحتاج محتوى"}</b></span><span><small>الوقت</small><b>30 دقيقة</b></span></div><p class="english-muted">${lesson ? "بعد الدراسة: حل أسئلة هذا الجزء ثم ابدأ اختبار اليوم." : "أضف بيانات الكتاب والأسئلة إلى content/english/data.json لتوليد خطة فعلية."}</p><div class="smart-plan-actions">${lesson ? `<button class="primary" data-smart-action="complete-study">بدء الدراسة</button>` : ""}<button class="soft-button" data-smart-action="advance-stage">${plan.stage === "quiz" ? "فتح اختبار اليوم" : "تسجيل المرحلة"}</button></div></div><div class="smart-plan-sections"><section class="panel"><h3>اختبار اليوم</h3><p class="english-muted">يظهر بعد إكمال دراسة الجزء وحل أسئلته. الأسئلة مأخوذة من محتوى اليوم فقط.</p><button class="soft-button" data-smart-action="daily-quiz" ${plan.stage !== "quiz" ? "disabled" : ""}>اختبار اليوم</button>${plan.lastRequestedExam === "daily-quiz" ? examMessage : ""}</section><section class="panel"><h3>خطة الأسبوع</h3><p class="english-muted">تتجمع نتائج محتوى الأسبوع قبل فتح الاختبار الأسبوعي.</p><button class="soft-button" data-smart-action="weekly-quiz">اختبار الأسبوع</button>${plan.lastRequestedExam === "weekly-quiz" ? examMessage : ""}</section><section class="panel"><h3>اختبارات الفصول</h3><p class="english-muted">أسئلة الكتاب والتمارين، والأسئلة الوزارية فقط عند توفرها فعليًا.</p><button class="soft-button" data-smart-action="chapter-quiz">اختبار الفصل</button>${plan.lastRequestedExam === "chapter-quiz" ? examMessage : ""}</section><section class="panel"><h3>المراجعة</h3><p class="english-muted">${reviews.length ? `${reviews.length} موضوع يحتاج مراجعة.` : "لا توجد مراجعات مفتوحة."}</p><button class="soft-button" data-smart-action="reviews">فتح المراجعة</button></section></div><section class="panel smart-progress-panel"><h3>التقدم</h3><div class="subject-engine-progress"><span><small>المحاضرات</small><b>${progress.lectures}%</b></span><span><small>الكتاب</small><b>${progress.book}%</b></span><span><small>الخطة</small><b>${progress.tasks}%</b></span><span><small>الاختبارات</small><b>${progress.exams}%</b></span><span><small>الإتقان</small><b>${progress.mastery}%</b></span></div></section>`;
  if (root) {
    root.innerHTML = markup.replaceAll("<b>English</b>", `<b>${esc(selectedSubject?.name || "غير محدد")}</b>`).replaceAll("content/english/data.json", "محتوى المادة المنظم");
    const options = data.subjects.map(subject => `<option value="${subject.id}" ${subject.id === data.smartPlanSubjectId ? "selected" : ""}>${esc(subject.name)}</option>`).join("");
    root.insertAdjacentHTML("afterbegin", `<label class="smart-subject-picker">المادة<select data-smart-subject><option value="">اختر مادة</option>${options}</select></label>`);
    renderPdfStudyPanel(selectedSubjectId);
    const latestExam = [...(plan.results || [])].reverse().find(result => result.scope === "chapter");
    if (latestExam) root.insertAdjacentHTML("beforeend", `<section class="panel smart-result"><h3>نتيجة اختبار الفصل</h3><strong>${latestExam.score}% · ${latestExam.score >= 80 ? "ناجح" : "يحتاج مراجعة"}</strong><p class="english-muted">نقاط القوة: ${esc((latestExam.strengths || []).join("، ") || "لا توجد بيانات بعد")}</p><p class="english-muted">نقاط الضعف: ${esc((latestExam.weakTopics || []).join("، ") || "لا توجد")}</p>${Object.entries(latestExam.errorsByTopic || {}).map(([topic, count]) => `<p class="english-muted">${esc(topic)}: ${count} خطأ</p>`).join("")}</section>`);
    if (plan.reviewPlan?.status === "open") root.insertAdjacentHTML("beforeend", `<section class="panel smart-result"><h3>خطة المراجعة</h3><p class="english-muted">الموضوعات: ${esc((plan.reviewPlan.topics || []).join("، ") || "الموضوعات التي أخطأت بها")}</p><button class="soft-button" data-smart-action="complete-reviews">إكمال المراجعة والسماح بإعادة الاختبار</button></section>`);
  }
  if (home) home.innerHTML = `<p class="english-muted">${lesson ? `${esc(selectedSubject?.name || "غير محدد")} · ${esc(content.unitTitle || content.title)} · ${smartPlanStageLabel(plan.stage)}` : "لا توجد خطة منظمة بعد."}</p><button class="soft-button" data-view="smart-plan">فتح خطة الدراسة</button>`;
}

// =========================
// الصفحة الرئيسية
// =========================

function renderHome() {
  const allLessons = all();
  const next = allLessons.find(l => !l.done) || allLessons[0];

  $("#next-lesson").innerHTML = next
    ? `
      <strong>${esc(next.name)}</strong>
      <span>
        ${esc(next.subject)} · ${esc(next.chapter)}
        ${next.today ? " · ضمن خطة اليوم" : ""}
      </span>
    `
    : `
      <strong>لا توجد دروس بعد</strong>
      <span>أضف مادة أو تفاصيل دروس لتبدأ.</span>
    `;

  $("#home-subjects").innerHTML =
    data.subjects.slice(0, 3).map(subjectCard).join("");

  $("#subjects-count").textContent =
    data.subjects.length.toLocaleString("ar-IQ");

  $("#smart-plan-count").textContent =
    (smartPlanState("general").status === "open" ? "١" : "٠");
}

// =========================
// المواد
// =========================

function renderSubjects() {
  $("#subjects").innerHTML =
    data.subjects.map(subjectCard).join("");

  $("#no-subjects").hidden =
    !!data.subjects.length;
}

function renderWeekly() {
  const root = $("#weekly-schedule");
  if (!root) return;

  root.innerHTML = `${!data.subjects.length ? `<div class="weekly-no-subjects"><strong>أضف مادة أولًا من صفحة المواد</strong><button class="text-button" data-view="subjects">الانتقال إلى المواد</button></div>` : ""}${weekDays.map(([key, label]) => {
    const items = data.weeklySchedule.filter(item => item.day === key);
    return `<article class="weekly-day">
      <div class="weekly-day-head"><div><strong>${label}</strong><small>${items.length ? `${items.length} مواد` : "لا توجد مواد"}</small></div><button class="text-button" data-open-weekly-day="${key}">+ إضافة مادة</button></div>
      <div class="weekly-subjects">${items.map(item => {
        const subject = data.subjects.find(s => s.id === item.subjectId);
        if (!subject) return "";
        return `<section class="weekly-subject" style="--subject:${colors[subject.color] || colors.green}">
          <div class="weekly-subject-head"><strong>${esc(subject.name)}</strong><button class="icon-button" data-delete-weekly-subject="${item.id}" aria-label="حذف المادة من الجدول">×</button></div>
          <ul class="weekly-task-list">${item.tasks.map(task => `<li class="weekly-task ${task.done ? "done" : ""}">
            <button class="weekly-check" data-weekly-toggle-task="${item.id}|${task.id}" aria-label="${task.done ? "إلغاء إكمال" : "تحديد كمكتملة"}">${task.done ? "✓" : ""}</button><span>${esc(task.title)}</span><button class="icon-button" data-delete-weekly-task="${item.id}|${task.id}" aria-label="حذف المهمة">×</button>
          </li>`).join("") || `<li class="weekly-empty">لا توجد مهام لهذه المادة بعد.</li>`}</ul>
          <form class="weekly-task-form" data-weekly-task-form="${item.id}"><input name="title" maxlength="80" required placeholder="اكتب مهمة جديدة"><button class="text-button" type="submit">+ إضافة مهمة</button></form>
        </section>`;
      }).join("") || `<p class="weekly-empty">لا توجد مواد في هذا اليوم.</p>`}</div>
    </article>`;
  }).join("")}`;
}

// =========================
// الإحصائيات
// =========================

function renderStats() {
  $("#stats-progress").textContent =
    overall() + "%";

  $("#stats-completed").textContent =
    allDone().toLocaleString("ar-IQ");

  $("#stats-remaining").textContent =
    Math.max(allTotal() - allDone(), 0)
      .toLocaleString("ar-IQ");

  $("#global-plan").innerHTML = renderGlobalPlan();
}

function globalPlanCard(mode) {
  const plan = globalPlanDefinition(mode);
  const labels = {
    slow: "وتيرة متأنية",
    natural: "وتيرة طبيعية",
    fast: "وتيرة سريعة"
  };
  const icons = {
    slow: '<path d="M4 12h16M7 8l-3 4 3 4M17 8l3 4-3 4"/>',
    natural: '<path d="M12 3v18M3 12h18M5 5l14 14M19 5 5 19"/>',
    fast: '<path d="M5 19 19 5M10 5h9v9"/>'
  };
  const selected = data.studyPlan.activeMode === mode;
  const description = !plan.valid
    ? "حدد مدة الخطة أولًا."
    : plan.complete
      ? "🎉 أكملت جميع المواد والدروس!"
      : plan.leftover
        ? `${plan.daily} دروس يوميًا · ${plan.requiredDays} يوم · ⚠️ تحتاج ${plan.requiredDays - globalPlanStats().days} أيام إضافية · التوزيع: ${planPattern(globalPlanStats().remaining, plan.daily, plan.requiredDays).join(" + ")}`
        : `${plan.daily} دروس يوميًا · ${plan.requiredDays} أيام · ${plan.reviewDays ? `⭐ ${plan.reviewDays} أيام للمراجعة` : "✅ مناسبة للمدة"} · التوزيع: ${planPattern(globalPlanStats().remaining, plan.daily, plan.requiredDays).join(" + ")}`;

  return `
    <article class="global-plan-card pace-card ${selected ? "selected" : ""}" data-global-plan="${mode}" data-select-global-plan="${mode}" tabindex="0" role="button" aria-pressed="${selected}">
      <span class="pace-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[mode]}</svg></span>
      <div class="pace-main"><strong>${labels[mode]}</strong><p>${mode === "natural" ? "وتيرة متوازنة تناسب أغلب الطلاب" : mode === "fast" ? "لمن يرغب بالإنجاز في وقت أقصر" : "لمن يفضل التعلم بعمق وثبات"}</p></div>
      <div class="pace-stat"><small>درس يومي</small><strong>${plan.daily || "-"}</strong></div>
      <div class="pace-stat"><small>الإنهاء المتوقع</small><strong>${plan.requiredDays ? `${plan.requiredDays} يوم` : "-"}</strong></div>
      ${selected ? '<span class="pace-selected">محددة</span>' : ""}
    </article>
  `;
}

function renderGlobalPlan() {
  const stats = globalPlanStats();
  const todayGoal = globalTodayGoal();
  const doneToday = allCompletedToday();
  const todayRemaining = Math.max(todayGoal - doneToday, 0);
  const todayPercent = todayGoal
    ? Math.min(Math.round(doneToday / todayGoal * 100), 100)
    : stats.remaining === 0
      ? 100
      : 0;
  const expired = stats.days === 0 && stats.remaining > 0 && data.studyPlan.durationDays;
  const message = stats.remaining === 0
    ? "🎉 أكملت جميع المواد والدروس!"
    : expired
      ? `⚠️ انتهت مدة الخطة وبقي ${stats.remaining} درس`
      : !data.studyPlan.durationDays
        ? "حدد مدة الخطة حتى نحسب لك خطة مناسبة."
        : "تتحدث الخطة تلقائيًا مع إنجازك اليومي.";
  const suggestion = progressSuggestion();
  const suggestionPlan = suggestion.mode
    ? globalPlanDefinition(suggestion.mode)
    : null;
  const suggestionMarkup = suggestion.mode && suggestion.mode !== data.studyPlan.activeMode
    ? `<strong>💡 اقتراحك الحالي: ${suggestion.mode === "fast" ? "وتيرة سريعة" : suggestion.mode === "slow" ? "وتيرة متأنية" : "وتيرة طبيعية"}</strong><p>${suggestionPlan.daily} دروس يوميًا. ${suggestion.reason}</p>`
    : `<p>${suggestion.reason}</p>`;

  return `
    <section class="panel global-plan" data-global-plan-section>
      <div class="section-head">
        <div>
          <h2>📅 الخطة الرئيسية</h2>
          <p>خطة واحدة تجمع كل موادك وتتكيف مع تقدمك.</p>
        </div>
        <label class="plan-duration">مدة الخطة
          <input type="number" min="0" max="3650" value="${data.studyPlan.durationDays || ""}" data-plan-duration aria-label="مدة الخطة بالأيام">
        </label>
      </div>
      <div class="global-summary">
        <div><strong data-global-total>${stats.total}</strong><small>مجموع الدروس</small></div>
        <div><strong data-global-done>${stats.done}</strong><small>دروس مكتملة</small></div>
        <div><strong data-global-remaining>${stats.remaining}</strong><small>دروس متبقية</small></div>
        <div><strong data-global-days>${stats.days || "-"}</strong><small>أيام متبقية</small></div>
      </div>
      <div class="global-plan-cards">
        <div class="plan-suggestion" data-plan-suggestion>${suggestion.mode && suggestion.mode !== data.studyPlan.activeMode ? "💡 لدينا اقتراح جديد لخطة تناسب تقدمك.<br>" : ""}${suggestionMarkup}</div>
        ${globalPlanCard("slow")}
        ${globalPlanCard("natural")}
        ${globalPlanCard("fast")}
      </div>
      <p class="global-plan-message" data-global-message>${message}</p>
      <section class="today-global-plan">
        <div class="section-head">
          <div><p class="eyebrow dark">خطة اليوم</p><h3>🎯 هدفك اليومي</h3></div>
          <strong class="today-plan-percent" data-global-today-percent>${todayPercent}%</strong>
        </div>
        <div class="today-plan-stats">
          <div><strong data-global-today-goal>${todayGoal}</strong><small>دروس مطلوبة</small></div>
          <div><strong data-global-today-done>${doneToday}</strong><small>تم إنجازها</small></div>
          <div><strong data-global-today-remaining>${todayRemaining}</strong><small>متبقي</small></div>
        </div>
        <div class="progress today-progress"><span data-global-today-progress style="width:${todayPercent}%"></span></div>
        <p class="today-plan-caption">أنجزت <span data-global-today-done-caption>${doneToday}</span> من هدف اليوم</p>
        <div class="plan-distribution" data-plan-distribution>
          ${renderDistribution(todayGoal)}
        </div>
      </section>
    </section>
  `;
}

function renderDistribution(target) {
  if (!target) return "";
  const distribution = distributeLessons(target);
  return data.subjects.map((s, index) => `
    <span>${esc(s.name)}: <strong>${distribution[index]}</strong></span>
  `).join("");
}

function updateGlobalPlan() {
  const section = $("[data-global-plan-section]");
  if (!section) return;

  const stats = globalPlanStats();
  const todayGoal = globalTodayGoal();
  const doneToday = allCompletedToday();
  const todayRemaining = Math.max(todayGoal - doneToday, 0);
  const todayPercent = todayGoal
    ? Math.min(Math.round(doneToday / todayGoal * 100), 100)
    : stats.remaining === 0 ? 100 : 0;

  section.querySelector("[data-global-total]").textContent = stats.total;
  section.querySelector("[data-global-done]").textContent = stats.done;
  section.querySelector("[data-global-remaining]").textContent = stats.remaining;
  section.querySelector("[data-global-days]").textContent = stats.days || "-";
  section.querySelector("[data-global-today-goal]").textContent = todayGoal;
  section.querySelector("[data-global-today-done]").textContent = doneToday;
  section.querySelector("[data-global-today-remaining]").textContent = todayRemaining;
  section.querySelector("[data-global-today-percent]").textContent = `${todayPercent}%`;
  section.querySelector("[data-global-today-done-caption]")?.replaceChildren(String(doneToday));
  section.querySelector("[data-global-today-progress]").style.width = `${todayPercent}%`;
  section.querySelector("[data-plan-distribution]").innerHTML = renderDistribution(todayGoal);
  const suggestion = progressSuggestion();
  const suggestionPlan = suggestion.mode
    ? globalPlanDefinition(suggestion.mode)
    : null;
  const suggestionMarkup = suggestion.mode && suggestion.mode !== data.studyPlan.activeMode
    ? `<strong>💡 اقتراحك الحالي: ${suggestion.mode === "fast" ? "وتيرة سريعة" : suggestion.mode === "slow" ? "وتيرة متأنية" : "وتيرة طبيعية"}</strong><p>${suggestionPlan.daily} دروس يوميًا. ${suggestion.reason}</p>`
    : `<p>${suggestion.reason}</p>`;
  section.querySelector(".global-plan-cards").innerHTML = [
    `<div class="plan-suggestion" data-plan-suggestion>${suggestion.mode && suggestion.mode !== data.studyPlan.activeMode ? "💡 لدينا اقتراح جديد لخطة تناسب تقدمك.<br>" : ""}${suggestionMarkup}</div>`,
    globalPlanCard("slow"),
    globalPlanCard("natural"),
    globalPlanCard("fast")
  ].join("");
  section.querySelector("[data-global-message]").textContent = stats.remaining === 0
    ? "🎉 أكملت جميع المواد والدروس!"
    : stats.days === 0 && data.studyPlan.durationDays
      ? `⚠️ انتهت مدة الخطة وبقي ${stats.remaining} درس`
      : !data.studyPlan.durationDays
        ? "حدد مدة الخطة حتى نحسب لك خطة مناسبة."
        : "تتحدث الخطة تلقائيًا مع إنجازك اليومي.";
}

// =========================
// الخيارات
// =========================

function renderOptions() {
  const options =
    '<option value="">بدون مادة محددة</option>' +
    data.subjects.map(s => `
      <option value="${esc(s.name)}">
        ${esc(s.name)}
      </option>
    `).join("");

  const taskSubject = $("#task-subject");
  if (taskSubject) taskSubject.innerHTML = options;

  const weeklySubject = $("#weekly-subject");
  if (weeklySubject) {
    weeklySubject.innerHTML = '<option value="">اختر مادة من موادك</option>' +
      data.subjects.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("");
    weeklySubject.disabled = !data.subjects.length;
    const empty = $("#weekly-no-subjects");
    if (empty) empty.hidden = !!data.subjects.length;
    const submit = $("#weekly-submit");
    if (submit) submit.disabled = !data.subjects.length;
  }
}

// =========================
// مسار السَعي (شريط التقدم الكلي)
// =========================

function renderHeroProgress() {
  const p = overall();
  const circumference = 2 * Math.PI * 48;
  const offset = circumference - (p / 100) * circumference;
  const caption = p >= 100
    ? "🎉 أكملت السَعي بين موادك"
    : p === 0
      ? "ابدأ أول شوط اليوم"
      : "تقدمك بين موادك ودروسك";

  $("#hero-progress").innerHTML = `
    <div class="circular-progress" role="img" aria-label="التقدم الكلي ${p}%">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle class="circular-progress-track" cx="60" cy="60" r="48"></circle>
        <circle class="circular-progress-value" cx="60" cy="60" r="48" style="stroke-dasharray:${circumference};stroke-dashoffset:${offset}"></circle>
      </svg>
      <strong>${arabicNumber(p)}٪</strong>
    </div>
    <div class="circular-progress-copy"><strong>التقدم الكلي</strong><p class="path-meta">${caption}</p></div>
  `;
}

// =========================
// English Smart Study
// =========================

const staticContent = {};
const contentKeyForSubject = subject => ({
  "الرياضيات": "mathematics", "الفيزياء": "physics", "الكيمياء": "chemistry", "الأحياء": "biology",
  "العربي": "arabic", "الإنكليزي": "english", "الإنجليزية": "english", "الإسلامية": "islamic"
}[subject?.name] || subject?.contentId || subject?.id);
async function loadStaticContent() {
  await Promise.all(data.subjects.map(async subject => {
    const key = contentKeyForSubject(subject);
    if (!key || staticContent[subject.id]) return;
    try {
      const response = await fetch(`../content/${encodeURIComponent(key)}/data.json`, { cache: "no-store" });
      if (response.ok) staticContent[subject.id] = await response.json();
    } catch (error) {
      console.warn(`تعذر تحميل محتوى ${key}`, error);
    }
  }));
}
const subjectEngine = subjectId => new SubjectStudyEngine({
  subjectId,
  content: staticContent[subjectId] || { subjectId, units: [], questions: { book: [], exercises: [], ministry: [] } },
  state: data.subjectState[subjectId] || (data.subjectState[subjectId] = { lessons: {}, items: {}, dailyTasks: [], exams: [], reviewTasks: [] }),
  saveState: state => { data.subjectState[subjectId] = state; save(data); }
});
const smartStudyEngine = subjectId => new SmartStudyPlan({
  subjectId,
  chapters: data.subjects.find(subject => subject.id === subjectId)?.chapters || [],
  content: staticContent[subjectId] || {},
  state: data.subjectState[subjectId] || (data.subjectState[subjectId] = { lessons: {}, items: {}, dailyTasks: [], exams: [], reviewTasks: [] }),
  saveState: state => { data.subjectState[subjectId] = state; save(data); }
});

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(error => {
      console.warn("Service worker registration failed", error);
    });
  });
}

/* legacy English import removed */
/*
async function englishRenderCanvas(page, rotation, variant) {
  const base = page.getViewport({ scale: 1, rotation });
  const scale = Math.min(3.2, Math.max(2.2, 2200 / Math.max(base.width, base.height)));
  const viewport = page.getViewport({ scale, rotation });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  await page.render({ canvasContext: context, viewport }).promise;
  if (variant === "color") return canvas;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < image.data.length; index += 4) {
    const gray = image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114;
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.65 + 128));
    const value = variant === "threshold" ? (contrasted > 178 ? 255 : 0) : contrasted;
    image.data[index] = value; image.data[index + 1] = value; image.data[index + 2] = value;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

async function englishOcrPage(page, worker) {
  const baseRotation = Number(page.rotate || 0) % 360;
  const probe = page.getViewport({ scale: 1, rotation: baseRotation });
  const rotations = probe.width > probe.height * 1.35 ? [baseRotation, (baseRotation + 90) % 360] : [baseRotation];
  const attempts = [
    { variant: "gray", psm: "6" },
    { variant: "threshold", psm: "6" },
    { variant: "gray", psm: "3" },
    { variant: "color", psm: "11" }
  ];
  let best = { text: "", confidence: 0, rotation: baseRotation, variant: "gray" };
  for (const rotation of rotations) {
    for (const attempt of attempts) {
      try {
        await worker.setParameters({ tessedit_pageseg_mode: attempt.psm, preserve_interword_spaces: "1" });
        const canvas = await englishRenderCanvas(page, rotation, attempt.variant);
        const result = await worker.recognize(canvas);
        const text = (result.data.text || "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
        const confidence = Number(result.data.confidence) || 0;
        const letters = (text.match(/[A-Za-z]/g) || []).length;
        const score = letters + confidence * 0.8;
        const bestScore = (best.text.match(/[A-Za-z]/g) || []).length + best.confidence * 0.8;
        if (score > bestScore) best = { text, confidence, rotation, variant: attempt.variant };
        if (letters >= 40 && confidence >= 65) return best;
      } catch (error) {
        console.warn("OCR attempt failed", { rotation, variant: attempt.variant, error });
      }
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
  }
  return best;
}

async function englishExtractPdf(file) {
  const pdfjs = await import("./pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "./pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  englishProgress("Reading PDF", 5);
  for (let index = 1; index <= pdf.numPages; index++) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    pages.push({ page: index, text: content.items.map(item => item.str).join(" ").replace(/\s+/g, " ").trim(), pdfPage: page });
    englishProgress("Extracting text", 5 + index / pdf.numPages * 25, `${index} / ${pdf.numPages}`);
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
  const emptyPages = pages.filter(page => page.text.replace(/\s/g, "").length < 40);
  const ocrIssues = [];
  if (emptyPages.length) {
    if (!globalThis.Tesseract) throw new Error("OCR engine is not available. Make sure the app is opened through the local server.");
    englishProgress(`OCR English (${emptyPages.length} pages)`, 32, `0 / ${emptyPages.length}`);
    const asset = name => new URL(name, location.href).href;
    const languagePath = new URL("./", location.href).href;
    const worker = await Tesseract.createWorker("eng", 1, { workerPath: asset("tesseract.worker.min.js"), corePath: asset("tesseract-core.wasm.js"), langPath: languagePath, logger: message => { if (message.status === "recognizing text") englishProgress("OCR English", 32 + (message.progress || 0) * 55); } });
    try {
      for (let index = 0; index < emptyPages.length; index++) {
        try {
          const result = await englishOcrPage(emptyPages[index].pdfPage, worker);
          emptyPages[index].text = result.text;
          emptyPages[index].ocrConfidence = result.confidence;
          emptyPages[index].ocrVariant = result.variant;
          if (result.text.replace(/\s/g, "").length < 20 || result.confidence < 35) {
            ocrIssues.push({ page: emptyPages[index].page, confidence: Math.round(result.confidence), reason: "Low OCR confidence" });
          }
        } catch (error) {
          console.warn("OCR page failed", emptyPages[index].page, error);
          ocrIssues.push({ page: emptyPages[index].page, confidence: 0, reason: "OCR failed after alternate attempts" });
          emptyPages[index].text = "";
        }
        englishProgress("OCR English", 32 + (index + 1) / emptyPages.length * 55, `${index + 1} / ${emptyPages.length}`);
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    } finally { await worker.terminate(); }
  }
  const usable = pages.filter(page => page.text.replace(/\s/g, "").length > 2);
  if (!usable.length) throw new Error("OCR could not read any page. The PDF may be very low-resolution, blank, encrypted, or contain no readable English characters.");
  englishProgress("Cleaning and classifying", 92);
  const book = englishBookFromPages(file.name, usable, ocrIssues);
  englishProgress("Ready for review", 100);
  return book;
}

function renderEnglishDashboard() {
  const root = $("#english-dashboard"); if (!root) return;
  const books = english().books;
  const sentences = books.flatMap(englishAllSentences);
  const mastered = sentences.filter(s => englishRecord(s, "memorization").status === "Mastered").length;
  const due = sentences.filter(s => englishDue(s, "writing") || englishDue(s, "vocabulary")).length;
  const last = english().activity[0];
  const goal = english().dailyGoal;
  const dayProgress = goal.date === englishToday() ? goal.completed : 0;
  const overallProgress = sentences.length ? Math.round(mastered / sentences.length * 100) : 0;
  const pendingWarning = english().pendingImport?.ocrIssues?.length ? `<div class="english-ocr-warning"><strong>Needs Review</strong><p>${english().pendingImport.ocrIssues.length} page(s) have low OCR confidence.</p><small>Pages: ${english().pendingImport.ocrIssues.map(issue => `${issue.page} (${issue.confidence}%)`).join(", ")}</small></div>` : "";
  root.innerHTML = `<section class="panel english-dashboard"><div class="section-head"><div><p class="eyebrow dark">English Learning</p><h2>English Smart Study</h2><p>جلسة قصيرة مبنية على ما يحتاج إلى مراجعة.</p></div><strong class="english-score">${overallProgress}%</strong></div><div class="english-study-grid"><div><strong>Today's Study</strong><div class="english-time-row"><span>Reading</span><b>8 min</b></div><div class="english-time-row"><span>Vocabulary</span><b>7 min</b></div><div class="english-time-row"><span>Writing</span><b>8 min</b></div><div class="english-time-row"><span>Review</span><b>7 min</b></div></div><div><strong>Daily Goal</strong><div class="progress"><span style="width:${Math.min(Math.round(dayProgress / Math.max(goal.minutes, 1) * 100), 100)}%"></span></div><p class="english-muted">${dayProgress} / ${goal.minutes} minutes</p><p class="english-muted">${due} items due · ${sentences.length - mastered} remaining</p></div></div><div class="english-actions"><button class="primary" data-english-action="start">Start Today's Study</button>${english().activeSession ? `<button class="soft-button" data-english-action="continue">Continue Study</button>` : ""}<button class="soft-button" data-english-action="mistakes">Review Mistakes</button></div><p class="english-muted">Last studied: ${esc(last?.title || "Nothing yet")}</p></section>${english().pendingImport ? `<section class="panel english-import-review"><div class="section-head"><div><h2>Review imported content</h2><p class="english-muted">Select a category before saving this book.</p>${pendingWarning}</div><button class="icon-button" data-english-action="discard-import">×</button></div>${english().pendingImport.sections.map((section, index) => `<div class="english-review-row"><div><strong>${esc(section.title)}</strong><small>Page ${section.page} · ${section.sentences.length} sentences</small></div><select data-english-category="${index}"><option value="Unclassified">Unclassified</option>${englishCategories.map(category => `<option value="${category}" ${section.category === category ? "selected" : ""}>${category}</option>`).join("")}</select></div>`).join("")}<button class="primary" data-english-action="confirm-import">Import</button></section>` : ""}`;
}

function renderEnglishBooks() {
  const root = $("#english-books"); if (!root) return;
  root.innerHTML = english().books.length ? `<div class="section-head"><h2>Your English content</h2><span class="english-muted">${english().books.length} book(s)</span></div>${english().books.map(book => { const stats = englishBookStats(book); const progress = stats.total ? Math.round(stats.memorization / stats.total * 100) : 0; const categories = [...new Set(book.sections.map(section => section.category))]; return `<article class="english-book panel"><div><p class="eyebrow dark">${esc(book.sourceName || "Imported book")}</p><h3>${esc(book.title)}</h3><p>${stats.total} sentences · ${progress}% mastered</p><div class="english-tags">${categories.map(category => `<span>${esc(category)}</span>`).join("")}</div></div><div class="progress"><span style="width:${progress}%"></span></div><div class="english-actions"><button class="primary" data-english-book="${book.id}">Study book</button><button class="soft-button" data-english-review-book="${book.id}">Details</button></div></article>`; }).join("")}` : `<section class="panel english-empty"><h3>ابدأ من هنا</h3><p>ثلاث خطوات بسيطة لتحويل كتابك إلى تدريب:</p><ol class="english-steps"><li><strong>ارفع الكتاب</strong><span>اضغط Import English Book واختر PDF، حتى لو كان مصوّرًا.</span></li><li><strong>راجع التصنيف</strong><span>عدّل Stories أو Literature أو غيرها قبل الحفظ.</span></li><li><strong>ابدأ الدراسة</strong><span>اقرأ، استمع، اكتب من الذاكرة، ثم راجع أخطاءك.</span></li></ol><p class="english-muted">يتم تشغيل OCR للصفحات المصوّرة محليًا، وقد يستغرق الكتاب الكبير وقتًا أطول.</p></section>`;
}

function renderEnglishEngineSummary() {
  const root = $("#english-engine-summary");
  if (!root) return;
  const engine = subjectEngine("english");
  const progress = engine.getProgress();
  const next = engine.getNextItem();
  const reviews = engine.getOpenReviews();
  const ready = staticContent.english?.units?.length > 0;
  root.innerHTML = `<section class="panel subject-engine-panel"><div class="section-head"><div><p class="eyebrow dark">Subject Study Engine</p><h3>Study pathway</h3><p class="english-muted">${ready ? "Prepared English content is available." : "أضف محتوى الكتاب المنظم إلى content/english/data.json لتفعيل الوحدات والأسئلة والاختبارات."}</p></div><strong class="english-score">${progress.mastery}%</strong></div><div class="subject-engine-progress"><span><small>Lectures</small><b>${progress.lectures}%</b></span><span><small>Book</small><b>${progress.book}%</b></span><span><small>Tasks</small><b>${progress.tasks}%</b></span><span><small>Exams</small><b>${progress.exams}%</b></span><span><small>Mastery</small><b>${progress.mastery}%</b></span></div><p class="english-muted">${next ? `Next lesson: ${esc(next.title)}` : "No structured lesson is loaded yet."} · ${reviews.length} review task(s)</p></section>`;
}

function renderEnglishStudy() { renderEnglishDashboard(); renderEnglishBooks(); renderEnglishEngineSummary(); }

function englishStart(book, sectionIndex = 0, sentenceIndex = 0, mode = "reading") {
  const section = book.sections[sectionIndex];
  const sentence = section?.sentences[sentenceIndex];
  if (!sentence) return;
  english().activeSession = { bookId: book.id, sectionIndex, sentenceIndex, mode, updatedAt: new Date().toISOString() };
  english().activity.unshift({ id: uid(), title: section.title, mode, at: new Date().toISOString() });
  english().activity = english().activity.slice(0, 20);
  save(data); renderEnglishSession(book);
}

function englishSessionBook() { return english().books.find(book => book.id === english().activeSession?.bookId); }

function renderEnglishSession(book = englishSessionBook()) {
  const root = $("#english-session"); if (!root || !book || !english().activeSession) return;
  const state = english().activeSession;
  const section = book.sections[state.sectionIndex];
  const sentence = section?.sentences[state.sentenceIndex];
  if (!sentence) return;
  root.hidden = false;
  const mode = state.mode;
  const reading = mode === "reading";
  const writing = mode === "writing";
  const hidden = mode === "memorization";
  const record = englishRecord(sentence, mode === "memorization" ? "memorization" : mode);
  root.innerHTML = `<div class="section-head"><div><p class="eyebrow dark">${esc(mode)} · ${esc(book.title)}</p><h2>${esc(section.title)}</h2></div><button class="icon-button" data-english-action="close-session" aria-label="Close">×</button></div><p class="english-muted">Sentence ${state.sentenceIndex + 1} / ${section.sentences.length} · ${record.status} · Level ${record.masteryLevel}/5</p>${reading ? `<div class="english-sentence">${esc(sentence.text)}</div><div class="english-actions"><button class="soft-button" data-english-action="listen">🔊 Listen</button><button class="soft-button" data-english-action="record">🎙 Record pronunciation</button></div>` : writing ? `<p class="english-prompt">Write the sentence from memory</p><button class="soft-button" data-english-action="reveal">Show sentence</button><div class="english-sentence ${state.revealed ? "" : "english-hidden"}">${esc(sentence.text)}</div><form class="english-writing-form" data-english-writing><textarea name="answer" rows="4" required placeholder="Type the sentence..."></textarea><button class="primary" type="submit">Check</button></form>${state.feedback ? `<div class="english-feedback ${state.feedback.exact ? "good" : "needs-review"}"><strong>Correct words: ${state.feedback.correct} / ${state.feedback.total}</strong><p>${state.feedback.exact ? "Excellent recall." : `Missing: ${esc(state.feedback.missing.join(", ") || "none")} · Extra: ${esc(state.feedback.extra.join(", ") || "none")}`}</p></div>` : ""}` : `<p class="english-prompt">Memorization level ${record.masteryLevel + 1}</p><div class="english-sentence ${record.masteryLevel > 1 ? "english-hidden-words" : ""}">${esc(record.masteryLevel >= 4 ? "Recall the sentence without looking." : sentence.text)}</div><button class="primary" data-english-action="memorize-check">I recalled it</button>`}<div class="english-session-nav"><button class="soft-button" data-english-action="previous" ${state.sentenceIndex === 0 ? "disabled" : ""}>Previous</button><button class="soft-button" data-english-action="next">Next</button>${reading ? `<button class="primary" data-english-action="writing">Writing</button>` : writing ? `<button class="primary" data-english-action="memorization">Memorization</button>` : ""}</div><p class="english-muted">Mastered: ${englishAllSentences(book).filter(item => englishRecord(item, "memorization").status === "Mastered").length} · Review: ${englishAllSentences(book).filter(item => englishDue(item, "memorization")).length}</p>`;
}

function englishReviewMistakes() {
  const root = $("#english-review"); if (!root) return;
  const items = english().books.flatMap(book => englishAllSentences(book).map(sentence => ({ ...sentence, book }))).filter(item => englishDue(item, "writing") || englishDue(item, "memorization") || englishRecord(item, "writing").status === "Review");
  root.hidden = false;
  root.innerHTML = `<div class="section-head"><h2>Mistakes</h2><button class="icon-button" data-english-action="close-review">×</button></div><p>${items.length} sentences need review</p>${items.length ? `<ul class="english-mistake-list">${items.map(item => `<li><span>${esc(item.text)}</span><button class="soft-button" data-english-book="${item.book.id}">Review</button></li>`).join("")}</ul>` : `<p class="english-muted">Nothing needs review today.</p>`}`;
}
*/

// =========================
// الرسم الرئيسي
// =========================

function render() {
  isRenderingApp = true;
  try {
    normalize();

    renderHeroProgress();

    const streak = studyStreak();
    $("#streak-count").textContent =
      streak === 1
        ? "يوم واحد"
        : streak === 2
          ? "يومان"
          : `${arabicNumber(streak)} أيام`;

    renderHome();
    renderSubjects();
    renderWeekly();
    renderStats();
    renderOptions();
    renderSmartStudyPlan();
    renderBooks();

    showView(activeView);
  } finally {
    isRenderingApp = false;
  }
}

// =========================
// التنقل
// =========================

function showView(view) {
  const previousView = activeView;
  activeView = view;

  $$(".view").forEach(x =>
    x.classList.toggle(
      "active",
      x.id === view + "-view"
    )
  );

  $$("[data-view]").forEach(x =>
    x.classList.toggle(
      "active",
      x.dataset.view === view
    )
  );

  $("#page-title").textContent = {
    home: "مرحبًا، طالب السَعي 👋",
    subjects: "موادك الدراسية",
    "smart-plan": "خطة الدراسة الذكية",
    weekly: "الجدول الأسبوعي",
    stats: "تقدّمك",
    books: "كتبي"
  }[view] || "سَعي";

  if (previousView !== view) {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }
}

// =========================
// تفاصيل المادة
// =========================

function planLabel(mode) {
  return {
    calm: "هادئة",
    balanced: "متوازنة",
    intensive: "مكثفة"
  }[mode];
}

function planCard(s, mode) {
  const plan = studyPlan(s, mode);
  const selected = s.plan?.type === mode;
  const labels = {
    slow: "وتيرة متأنية",
    natural: "وتيرة طبيعية",
    fast: "وتيرة سريعة"
  };
  const icons = {
    slow: '<path d="M4 12h16M7 8l-3 4 3 4M17 8l3 4-3 4"/>',
    natural: '<path d="M12 3v18M3 12h18M5 5l14 14M19 5 5 19"/>',
    fast: '<path d="M5 19 19 5M10 5h9v9"/>'
  };
  const message = plan.complete
    ? "🎉 أكملت جميع الدروس"
    : !s.durationDays
      ? "حدد مدة الدراسة حتى نقترح لك خطة مناسبة."
      : plan.leftover
        ? `${plan.daily} دروس يوميًا · ${plan.requiredDays} يوم · ⚠️ تحتاج ${plan.requiredDays - daysRemaining(s)} أيام إضافية`
        : plan.daily
          ? `${plan.daily} دروس يوميًا · ${plan.requiredDays} أيام لإنهاء الدروس · ${plan.reviewDays} أيام مراجعة`
        : "انتهت المدة المحددة لهذه المادة.";

  return `
    <article class="plan-card pace-card ${selected ? "selected" : ""}" data-plan="${mode}" data-select-subject-plan="${s.id}|${mode}" tabindex="0" role="button" aria-pressed="${selected}">
      <span class="pace-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[mode]}</svg></span>
      <div class="pace-main"><strong>${labels[mode]}</strong><p>${mode === "natural" ? "وتيرة متوازنة تناسب أغلب الطلاب" : mode === "fast" ? "لمن يرغب بالإنجاز في وقت أقصر" : "لمن يفضل التعلم بعمق وثبات"}</p></div>
      <div class="pace-stat"><small>درس يومي</small><strong>${plan.daily || "-"}</strong></div>
      <div class="pace-stat"><small>الإنهاء المتوقع</small><strong>${plan.requiredDays ? `${plan.requiredDays} يوم` : "-"}</strong></div>
      ${selected ? '<span class="pace-selected">محددة</span>' : ""}
    </article>
  `;
}

function renderPlan(s) {
  const remaining = Math.max(total(s) - completed(s), 0);
  const goal = studyPlan(s, s.plan?.type || "natural");
  const doneToday = completedToday(s);
  const goalDone = goal.complete ? 0 : goal.daily;
  const todayRemaining = Math.max(goalDone - doneToday, 0);
  const todayPercent = goalDone
    ? Math.min(Math.round(doneToday / goalDone * 100), 100)
    : goal.complete
      ? 100
      : 0;

  return `
    <section class="study-plan" data-plan-section>
      <div class="section-head">
        <div>
          <h3 data-plan-title>${remaining ? "📚 اختر وتيرة تناسب يومك" : "📚 وضع المراجعة"}</h3>
        </div>
        <span class="plan-days" data-plan-days>${s.durationDays ? `${daysRemaining(s)} يوم متبقٍ` : ""}</span>
      </div>
      <div class="plan-cards">
        ${planCard(s, "slow")}
        ${planCard(s, "natural")}
        ${planCard(s, "fast")}
      </div>
      <div class="today-plan" data-today-plan>
        <div class="section-head">
          <div><p class="eyebrow dark">خطة اليوم</p><strong>هدفك اليومي</strong></div>
          <span class="today-plan-percent" data-today-percent>${todayPercent}%</span>
        </div>
        <div class="today-plan-stats">
          <div><strong data-today-goal>${goalDone}</strong><small>دروس مطلوبة</small></div>
          <div><strong data-today-done>${doneToday}</strong><small>تم إنجازها</small></div>
          <div><strong data-today-remaining>${todayRemaining}</strong><small>متبقي</small></div>
        </div>
        <div class="progress today-progress"><span data-today-progress style="width:${todayPercent}%"></span></div>
      </div>
      <p class="plan-message" data-plan-message hidden></p>
      <span data-plan-remaining hidden>${remaining}</span>
    </section>
  `;
}

function updateDetailPlan(s) {
  const content = $("#detail-content");
  if (!content) return;

  const t = total(s);
  const d = completed(s);
  const r = Math.max(t - d, 0);
  const balanced = studyPlan(s, s.plan?.type || "natural");
  const doneToday = completedToday(s);
  const goal = balanced.complete ? 0 : balanced.daily;
  const todayRemaining = Math.max(goal - doneToday, 0);
  const todayPercent = goal
    ? Math.min(Math.round(doneToday / goal * 100), 100)
    : balanced.complete
      ? 100
      : 0;

  content.querySelector("[data-detail-percent]").textContent = `${percent(s)}%`;
  content.querySelector("[data-detail-completed]").textContent = d;
  content.querySelector("[data-detail-remaining]").textContent = r;
  content.querySelector("[data-detail-daily]").textContent = balanced.daily;
  content.querySelector("[data-detail-days]").textContent = s.durationDays
    ? daysRemaining(s)
    : "غير محدد";
  content.querySelector("[data-plan-title]").textContent = r
    ? "اختر وتيرة تناسب يومك"
    : "وضع المراجعة";
  content.querySelector("[data-today-done]").textContent = doneToday;
  content.querySelector("[data-today-goal]").textContent = goal;
  content.querySelector("[data-today-remaining]").textContent = todayRemaining;
  content.querySelector("[data-today-percent]").textContent = `${todayPercent}%`;
  content.querySelector("[data-today-progress]").style.width = `${todayPercent}%`;
  content.querySelector("[data-plan-days]").textContent = s.durationDays
    ? `${daysRemaining(s)} يوم متبقٍ`
    : "";

  ["slow", "natural", "fast"].forEach(mode => {
    const old = content.querySelector(`[data-plan="${mode}"]`);
    const next = document.createElement("div");
    next.innerHTML = planCard(s, mode).trim();
    old?.replaceWith(next.firstElementChild);
  });
}

function openDetail(id) {
  const s = data.subjects.find(x => x.id === id);
  if (!s) return;

  const t = total(s);
  const d = completed(s);
  const r = Math.max(t - d, 0);

  $("#detail-name").textContent = s.name;

  $("#detail-content").innerHTML = `
    <div
      class="progress"
      style="--subject:${colors[s.color]}"
    >
      <span data-detail-progress style="width:${percent(s)}%"></span>
    </div>

    <div class="detail-summary">

      <div>
        <strong data-detail-percent>${percent(s)}%</strong>
        <small>نسبة الإنجاز</small>
      </div>

      <div>
        <strong>${t}</strong>
        <small>إجمالي الدروس</small>
      </div>

      <div>
        <strong data-detail-completed>${d}</strong>
        <small>دروس مكتملة</small>
      </div>

      <div>
        <strong data-detail-remaining>${r}</strong>
        <small>دروس متبقية</small>
      </div>

      <div>
        <strong data-detail-daily>${studyPlan(s, s.plan?.type || "natural").daily}</strong>
        <small>درس يوميًا</small>
      </div>

      <div>
        <strong data-detail-days>${s.durationDays ? daysRemaining(s) : "غير محدد"}</strong>
        <small>أيام متبقية</small>
      </div>

    </div>

    ${renderPlan(s)}

    <div class="detail-tabs">
      <button
        type="button"
        class="active"
      >الدروس</button>
    </div>

    ${
      s.chapters.map(c => `
        <section
          class="chapter ${c === s.chapters[0] ? "expanded" : ""}"
          data-chapter-id="${c.id}"
        >

          <div class="chapter-head" data-chapter-toggle="${c.id}">
            <button class="chapter-toggle" type="button" aria-expanded="${c === s.chapters[0]}">▶</button>
            <h3>${esc(c.name)}</h3>
            <strong class="chapter-percent">${c.totalLessons ? Math.round(c.lessons.filter(l => l.done).length / c.totalLessons * 100) : 0}%</strong>
          </div>
          <div class="chapter-body">
            <div class="chapter-actions">
              <input class="chapter-total" type="number" min="1" value="${c.totalLessons}" data-chapter-total="${c.id}" aria-label="عدد الدروس في الفصل">
              <button class="soft-button" data-add-lesson="${s.id}|${c.id}">+ درس</button>
              <button class="soft-button complete-chapter" data-complete-chapter="${s.id}|${c.id}">✓ إكمال الفصل</button>
              <button class="delete" data-delete-chapter="${s.id}|${c.id}">×</button>
            </div>
            <div class="chapter-summary">
              <span><strong class="chapter-progress">${c.lessons.filter(l => l.done).length} / ${c.totalLessons}</strong><small>دروس مكتملة</small></span>
              <span><strong>${c.totalLessons}</strong><small>إجمالي الدروس</small></span>
              <span><strong class="chapter-percent-detail">${c.totalLessons ? Math.round(c.lessons.filter(l => l.done).length / c.totalLessons * 100) : 0}%</strong><small>نسبة الإنجاز</small></span>
              ${s.durationDays ? `<span><strong>${daysRemaining(s)}</strong><small>يوم متبقٍ</small></span>` : ""}
            </div>
            <div class="chapter-lessons">${c.lessons.map(l => `
            <div
              class="lesson-row ${l.done ? "done" : ""}"
            >

              <input
                type="checkbox"
                data-lesson="${s.id}|${c.id}|${l.id}"
                ${l.done ? "checked" : ""}
              >

              <div class="lesson-card-body">
                <strong>${esc(l.name)}</strong>

                ${
                  l.today
                    ? "<small>ضمن دروس اليوم</small>"
                    : ""
                }
              </div>

              <button
                class="delete"
                data-delete-lesson="${s.id}|${c.id}|${l.id}"
              >×</button>

            </div>
            `).join("") || `<p class="empty">لا توجد دروس في هذا الفصل بعد.</p>`}</div>
          </div>

        </section>
      `).join("")
      ||
      `
        <p class="empty">
          يمكنك إضافة تفاصيل الفصول والدروس لاحقًا.
        </p>
      `
    }

    <button
      class="primary wide quick-lesson"
      data-add-quick-lesson="${s.id}"
    >
      + إضافة درس لهذه المادة
    </button>
  `;

  // Initialize the first chapter open and keep the remaining chapters collapsed.
  $("#detail-content")
    .querySelectorAll(".chapter")
    .forEach((chapter, index) => {

      const toggle =
        chapter.querySelector(".chapter-toggle");

      const isOpen = index === 0;
      chapter.classList.toggle("expanded", isOpen);
      chapter.querySelector(".chapter-body").style.display = isOpen ? "" : "none";

      toggle.setAttribute(
        "aria-expanded",
        String(isOpen)
      );

      toggle.textContent = isOpen ? "▼" : "▶";
    });

  $("#subject-detail").showModal();
}

// =========================
// فتح النوافذ
// =========================

function openModal(name) {
  if (name === "weekly") {
    const form = $("#weekly-form");
    form.reset();
    form.querySelector('[name="day"]').value = "saturday";
    form.querySelector('[name="id"]').value = "";
    $("#weekly-modal-title").textContent = "إضافة إلى الجدول";
  }

  $("#" + name + "-modal").showModal();
}

// =========================
// الأزرار
// =========================

document.addEventListener("click", e => {

  const b =
    e.target.closest("button,[data-detail],[data-chapter-toggle],[data-select-subject-plan],[data-select-global-plan]");

  if (!b) return;

  if (b.dataset.bookAction) {
    if (b.dataset.bookAction === "close-viewer") {
      closePdfViewer();
      return;
    }
    const bookId = b.dataset.bookId;
    if (b.dataset.bookAction === "open") {
      b.disabled = true;
      openPdfBook(bookId).catch(error => alert(error.message || "تعذر فتح الكتاب.")).finally(() => { b.disabled = false; });
      return;
    }
    if (b.dataset.bookAction === "analyze") {
      b.disabled = true;
      extractPdfBook(b.dataset.bookId).catch(error => alert(error.message || "تعذر تحليل الكتاب.")).finally(() => { b.disabled = false; });
      return;
    }
    if (b.dataset.bookAction === "delete") {
      const book = books.find(item => item.id === bookId);
      if (!book || !confirm(`هل تريد حذف «${book.name}»؟`)) return;
      removeBook(bookId).then(() => {
        if (activeBookUrl && $("#pdf-viewer-title")?.textContent === book.name) closePdfViewer();
        books = books.filter(item => item.id !== bookId);
        renderBooks();
      }).catch(error => alert(error.message || "تعذر حذف الكتاب."));
      return;
    }
  }

  // إغلاق النافذة
  if (b.dataset.closeModal) {
    e.preventDefault();
    b.closest("dialog")?.close();
    return;
  }

  // التنقل
  if (b.dataset.view) {
    showView(b.dataset.view);
    return;
  }

  // فتح نافذة
  if (b.dataset.open) {
    openModal(b.dataset.open);
    return;
  }

  if (b.dataset.smartTaskComplete) {
    const selectedSubject = data.subjects.find(subject => subject.id === data.smartPlanSubjectId) || data.subjects[0] || null;
    const selectedSubjectId = selectedSubject?.id || "general";
    const smartEngine = smartStudyEngine(selectedSubjectId);
    const task = smartEngine.markTaskComplete(b.dataset.smartTaskComplete);
    if (task) {
      const plan = smartPlanState(selectedSubjectId);
      plan.stage = "study";
      plan.status = "open";
    }
    save(data);
    renderSmartStudyPlan();
    return;
  }

  if (b.dataset.smartAction) {
    const selectedSubject = data.subjects.find(subject => subject.id === data.smartPlanSubjectId);
    const selectedSubjectId = selectedSubject?.id || "general";
    const plan = smartPlanState(selectedSubjectId);
    const smartEngine = smartStudyEngine(selectedSubjectId);
    if (b.dataset.smartAction === "complete-study") smartEngine.completeStudyStage("study");
    if (b.dataset.smartAction === "advance-stage") smartEngine.completeStudyStage(plan.stage);
    if (b.dataset.smartAction === "complete-reviews" && plan.reviewPlan?.status === "open") {
      plan.reviewPlan.status = "completed";
      plan.reviewPlan.completedAt = new Date().toISOString();
      plan.reviewTasks?.forEach(task => { task.status = "completed"; });
    }
    if (["daily-quiz", "weekly-quiz", "chapter-quiz"].includes(b.dataset.smartAction)) {
      const scope = b.dataset.smartAction.replace("-quiz", "");
      const progress = subjectEngine(selectedSubjectId).getProgress();
      if (scope === "chapter" && progress.status === "needs-review" && plan.reviewPlan?.status !== "completed") {
        plan.examMessage = "أكمل خطة المراجعة أولًا ثم أعد اختبار الفصل.";
      } else if (scope === "chapter" && !["needs-chapter-exam", "needs-review"].includes(progress.status)) {
        plan.examMessage = "أكمل محتوى الفصل والخطة اليومية أولًا.";
      } else {
        plan.lastRequestedExam = b.dataset.smartAction;
        plan.stage = "quiz";
        plan.availableQuestions = smartEngine.getQuestions(scope);
        plan.examMessage = plan.availableQuestions.length ? "" : "لا توجد أسئلة منظمة مضافة لهذا الاختبار بعد.";
      }
    }
    if (b.dataset.smartAction === "reviews") plan.reviewOpenedAt = new Date().toISOString();
    save(data);
    renderSmartStudyPlan();
    if (["daily-quiz", "weekly-quiz", "chapter-quiz"].includes(b.dataset.smartAction) && plan.availableQuestions?.length) renderStudyQuiz(selectedSubjectId, b.dataset.smartAction.replace("-quiz", ""));
    return;
  }

  if (b.dataset.pdfStudyAction === "complete") {
    const selectedSubjectId = data.smartPlanSubjectId || data.subjects[0]?.id;
    const plan = smartPlanState(selectedSubjectId);
    const book = books.find(item => item.id === plan.sourceBookId);
    if (book?.pages?.[plan.pdfPageIndex]) {
      book.pages[plan.pdfPageIndex].completedAt = new Date().toISOString();
      plan.pdfPageIndex += 1;
      plan.pdfReadingCompleted = plan.pdfPageIndex >= book.pages.length;
      save(data);
      renderSmartStudyPlan();
    }
    return;
  }

  if (b.dataset.openWeeklyDay) {
    openModal("weekly");
    $("#weekly-form [name=day]").value = b.dataset.openWeeklyDay;
    return;
  }

  if (b.dataset.weeklyToggleTask) {
    const [entryId, taskId] = b.dataset.weeklyToggleTask.split("|");
    const entry = data.weeklySchedule.find(x => x.id === entryId);
    const task = entry?.tasks.find(x => x.id === taskId);
    if (!task) return;
    task.done = !task.done;
    persist();
    return;
  }

  if (b.dataset.deleteWeeklyTask) {
    const [entryId, taskId] = b.dataset.deleteWeeklyTask.split("|");
    const entry = data.weeklySchedule.find(x => x.id === entryId);
    if (!entry) return;
    entry.tasks = entry.tasks.filter(x => x.id !== taskId);
    persist();
    return;
  }

  if (b.dataset.deleteWeeklySubject) {
    data.weeklySchedule = data.weeklySchedule.filter(x => x.id !== b.dataset.deleteWeeklySubject);
    persist();
    return;
  }

  if (b.dataset.viewSubjects) {
    showView("subjects");
    return;
  }

  // تفاصيل المادة
  if (b.dataset.detail) {
    openDetail(b.dataset.detail);
    return;
  }

  // اختيار الخطة العامة
  if (b.dataset.selectGlobalPlan) {
    data.studyPlan.activeMode = b.dataset.selectGlobalPlan;
    save(data);
    $("#global-plan").innerHTML = renderGlobalPlan();
    return;
  }

  // اختيار خطة المادة دون تغيير الخطة العامة
  if (b.dataset.selectSubjectPlan) {
    const [subjectId, mode] = b.dataset.selectSubjectPlan.split("|");
    const subject = data.subjects.find(s => s.id === subjectId);
    if (!subject) return;

    subject.plan = {
      type: mode,
      dailyLessons: studyPlan(subject, mode).daily
    };

    save(data);
    updateDetailPlan(subject);
    return;
  }

  // فتح / إغلاق الفصل
  if (b.dataset.chapterToggle || b.classList.contains("chapter-toggle")) {

    if (b.closest(".chapter-actions")) return;

    const chapter = b.closest(".chapter");
    const body = chapter.querySelector(".chapter-body");
    const toggle = chapter.querySelector(".chapter-toggle");

    const isOpen =
      toggle.getAttribute("aria-expanded") === "true";

    body.style.display = isOpen ? "none" : "";
    chapter.classList.toggle("expanded", !isOpen);

    toggle.setAttribute(
      "aria-expanded",
      String(!isOpen)
    );

    toggle.textContent =
      isOpen ? "▶" : "▼";

    return;
  }

  // اختيار اللون
  if (b.dataset.selectColor) {

    const form = b.closest("form");
    const input =
      form?.querySelector("[name=color]");

    if (input) {
      input.value =
        b.dataset.selectColor;

      form
        .querySelectorAll("[data-select-color]")
        .forEach(x =>
          x.classList.toggle(
            "selected",
            x === b
          )
        );
    }

    return;
  }

  // إضافة درس سريع
  if (b.dataset.addQuickLesson) {

    const subject =
      data.subjects.find(
        s => s.id === b.dataset.addQuickLesson
      );

    if (!subject) return;

    const chapter =
      subject.chapters[0];

    $("#lesson-form [name=subjectId]").value =
      subject.id;

    $("#lesson-form [name=chapterId]").value =
      chapter
        ? chapter.id
        : "__quick__";

    $("#subject-detail").close();

    openModal("lesson");

    return;
  }

  // إضافة فصل
  if (b.dataset.addChapter) {

    $("#chapter-form [name=subjectId]").value =
      b.dataset.addChapter;

    openModal("chapter");

    return;
  }

  // إضافة درس لفصل
  if (b.dataset.addLesson) {

    const [s, c] =
      b.dataset.addLesson.split("|");

    $("#lesson-form [name=subjectId]").value = s;
    $("#lesson-form [name=chapterId]").value = c;

    $("#subject-detail").close();

    openModal("lesson");

    return;
  }

  // حذف مادة
  if (b.dataset.deleteSubject) {

    data.subjects =
      data.subjects.filter(
        x => x.id !== b.dataset.deleteSubject
      );

    persist();
    return;
  }
// إكمال / إلغاء إكمال الفصل
if (b.dataset.completeChapter) {

  const [sId, cId] =
    b.dataset.completeChapter.split("|");

  const subject =
    data.subjects.find(s => s.id === sId);

  if (!subject) return;

  const chapter =
    subject.chapters.find(c => c.id === cId);

  if (!chapter) return;

  chapter.lessons ??= [];

  const allChapterDone =
    chapter.lessons.length > 0 &&
    chapter.lessons.every(l => l.done);

  chapter.lessons.forEach(l => {
    l.done = !allChapterDone;
  });

  save(data);

  // تحديث الدروس بدون إعادة رسم التطبيق كاملًا
  const chapterEl =
    document.querySelector(
      `.chapter[data-chapter-id="${cId}"]`
    );

  if (!chapterEl) return;

  const done =
    chapter.lessons.filter(l => l.done).length;

  const p =
    chapter.totalLessons
      ? Math.round(
          done / chapter.totalLessons * 100
        )
      : 0;

  chapterEl
    .querySelectorAll(".lesson-row")
    .forEach((row, index) => {

      const lesson =
        chapter.lessons[index];

      if (!lesson) return;

      row.classList.toggle(
        "done",
        lesson.done
      );

      const checkbox =
        row.querySelector(
          'input[type="checkbox"]'
        );

      if (checkbox) {
        checkbox.checked = lesson.done;
      }
    });

  const progressEl =
    chapterEl.querySelector(
      ".chapter-progress"
    );

  if (progressEl) {
    progressEl.textContent =
      `${done} / ${chapter.totalLessons} دروس مكتملة · ${p}%`;
  }

  chapterEl.querySelector(".chapter-percent").textContent = `${p}%`;
  chapterEl.querySelector(".chapter-percent-detail").textContent = `${p}%`;

  const button =
    chapterEl.querySelector(
      ".complete-chapter"
    );

  if (button) {
    button.textContent =
      allChapterDone
        ? "✓ إكمال الفصل"
        : "↩ إلغاء إكمال الفصل";
  }

  renderHeroProgress();
  $("#stats-progress").textContent = `${overall()}%`;
  $("#stats-completed").textContent = arabicNumber(allDone());
  $("#stats-remaining").textContent = arabicNumber(
    Math.max(allTotal() - allDone(), 0)
  );
  updateGlobalPlan();

  return;
}
  // حذف فصل
  if (b.dataset.deleteChapter) {

    const [s, c] =
      b.dataset.deleteChapter.split("|");

    const subject =
      data.subjects.find(
        x => x.id === s
      );

    if (!subject) return;

    subject.chapters =
      subject.chapters.filter(
        x => x.id !== c
      );

    $("#subject-detail").close();

    persist();
    return;
  }

  // حذف درس
  if (b.dataset.deleteLesson) {

    const [s, c, l] =
      b.dataset.deleteLesson.split("|");

    const subject =
      data.subjects.find(
        x => x.id === s
      );

    if (!subject) return;

    const chapter =
      subject.chapters.find(
        x => x.id === c
      );

    if (!chapter) return;

    chapter.lessons =
      chapter.lessons.filter(
        x => x.id !== l
      );

    save(data);

    // تحديث النافذة فقط
    if ($("#subject-detail").open) {
      openDetail(s);
    }

    return;
  }
});

// =========================
// تحديد الدروس والمهام
// =========================

document.addEventListener("change", e => {

  if (e.target.matches("[data-pdf-book]")) {
    const subjectId = data.smartPlanSubjectId || data.subjects[0]?.id;
    const plan = smartPlanState(subjectId);
    plan.sourceBookId = e.target.value;
    plan.pdfPageIndex = 0;
    save(data);
    renderSmartStudyPlan();
    return;
  }

  if (e.target.matches("[data-smart-subject]")) {
    data.smartPlanSubjectId = e.target.value;
    save(data);
    renderSmartStudyPlan();
    return;
  }

  if (e.target.id === "book-input") {
    const file = e.target.files?.[0];
    if (!file) return;
    const input = e.target;
    input.disabled = true;
    (async () => {
      try {
        await handleBookFile(file);
      } catch (error) { alert(error.message || "تعذر حفظ الكتاب."); }
      finally { input.disabled = false; input.value = ""; }
    })();
    return;
  }

  // الدرس
  if (e.target.dataset.lesson) {

    const [sId, cId, lId] =
      e.target.dataset.lesson.split("|");

    const subject =
      data.subjects.find(
        s => s.id === sId
      );

    if (!subject) return;

    const chapter =
      subject.chapters.find(
        c => c.id === cId
      );

    if (!chapter) return;

    const lesson =
      chapter.lessons.find(
        l => l.id === lId
      );

    if (!lesson) return;

    // حفظ حالة الدرس
    const previousCompletedAt = lesson.completedAt;
    lesson.done =
      e.target.checked;

    lesson.completedAt = lesson.done
      ? todayKey()
      : null;

    const activityDay = lesson.done
      ? todayKey()
      : previousCompletedAt || todayKey();
    data.studyPlan.activity[activityDay] = Math.max(
      0,
      Number(data.studyPlan.activity[activityDay] || 0) + (lesson.done ? 1 : -1)
    );
    if (!data.studyPlan.activity[activityDay]) {
      delete data.studyPlan.activity[activityDay];
    }

    // حفظ فقط
    // بدون render
    // وبدون إغلاق النافذة
    save(data);

    const row =
      e.target.closest(".lesson-row");

    if (row) {
      row.classList.toggle(
        "done",
        lesson.done
      );
    }

    const detailProgress =
      document.querySelector("[data-detail-progress]");

    if (detailProgress) {
      detailProgress.style.width = `${percent(subject)}%`;
    }

    updateDetailPlan(subject);
    renderHeroProgress();
    const streakAfterToggle = studyStreak();
    $("#streak-count").textContent =
      streakAfterToggle === 1
        ? "يوم واحد"
        : streakAfterToggle === 2
          ? "يومان"
          : `${arabicNumber(streakAfterToggle)} أيام`;
    $("#stats-progress").textContent = `${overall()}%`;
    $("#stats-completed").textContent = arabicNumber(allDone());
    $("#stats-remaining").textContent = arabicNumber(
      Math.max(allTotal() - allDone(), 0)
    );
    updateGlobalPlan();

    // تحديث معلومات الفصل فقط
    const chapterEl =
      document.querySelector(
        `.chapter[data-chapter-id="${cId}"]`
      );

    if (chapterEl) {

      const progressEl =
        chapterEl.querySelector(
          ".chapter-progress"
        );

      if (progressEl) {

        const done =
          chapter.lessons.filter(
            l => l.done
          ).length;

        const p =
          chapter.totalLessons
            ? Math.round(
                done /
                chapter.totalLessons *
                100
              )
            : 0;

        progressEl.textContent =
          `${done} / ${chapter.totalLessons} دروس مكتملة · ${p}%`;

        chapterEl.querySelector(".chapter-percent").textContent = `${p}%`;
        chapterEl.querySelector(".chapter-percent-detail").textContent = `${p}%`;
      }
    }

    return;
  }

  if (e.target.hasAttribute("data-plan-duration")) {
    const durationDays = Math.max(
      Number(e.target.value) || 0,
      0
    );

    const durationChanged = durationDays !== data.studyPlan.durationDays;
    data.studyPlan.durationDays = durationDays;
    if (durationDays && (durationChanged || !data.studyPlan.startedAt)) {
      data.studyPlan.startedAt = new Date().toISOString();
    }
    if (!durationDays) data.studyPlan.startedAt = null;
    save(data);
    $("#global-plan").innerHTML = renderGlobalPlan();
    return;
  }

  // عدد دروس الفصل
  if (e.target.dataset.chapterTotal) {

    const chapterId =
      e.target.dataset.chapterTotal;

    const totalLessons =
      Math.max(
        Number(e.target.value) || 1,
        1
      );

    const subject =
      data.subjects.find(s =>
        s.chapters.some(
          c => c.id === chapterId
        )
      );

    if (!subject) return;

    const chapter =
      subject.chapters.find(
        c => c.id === chapterId
      );

    if (!chapter) return;

    chapter.totalLessons =
      totalLessons;

    chapter.lessons ??= [];

    // إضافة الدروس الناقصة فقط
    while (
      chapter.lessons.length <
      totalLessons
    ) {

      const index =
        chapter.lessons.length;

      chapter.lessons.push({
        id: uid(),
        name: `درس ${index + 1}`,
        done: false
      });
    }

    // حذف الزائد
    if (
      chapter.lessons.length >
      totalLessons
    ) {
      chapter.lessons.splice(
        totalLessons
      );
    }

    save(data);

    // تحديث الفصل نفسه فقط
    const chapterEl =
      document.querySelector(
        `.chapter[data-chapter-id="${chapterId}"]`
      );

    if (!chapterEl) return;

    const toggle =
      chapterEl.querySelector(
        ".chapter-toggle"
      );

    const wasOpen =
      toggle?.getAttribute(
        "aria-expanded"
      ) === "true";

    // نحذف الدروس القديمة
    chapterEl
      .querySelectorAll(".lesson-row")
      .forEach(row => row.remove());

    // نضيف الدروس الجديدة
    chapter.lessons.forEach(l => {

      chapterEl.querySelector(".chapter-lessons").insertAdjacentHTML(
        "beforeend",
        `
          <div
            class="lesson-row ${l.done ? "done" : ""}"
            ${wasOpen ? "" : 'style="display:none"'}
          >

            <input
              type="checkbox"
              data-lesson="${subject.id}|${chapter.id}|${l.id}"
              ${l.done ? "checked" : ""}
            >

            <div>
              <strong>${esc(l.name)}</strong>

              ${
                l.today
                  ? "<small>ضمن دروس اليوم</small>"
                  : ""
              }
            </div>

            <button
              class="delete"
              data-delete-lesson="${subject.id}|${chapter.id}|${l.id}"
            >×</button>

          </div>
        `
      );
    });

    // تحديث عدد الإنجاز
    const progressEl =
      chapterEl.querySelector(
        ".chapter-progress"
      );

    if (progressEl) {

      const done =
        chapter.lessons.filter(
          l => l.done
        ).length;

      const p =
        chapter.totalLessons
          ? Math.round(
              done /
              chapter.totalLessons *
              100
            )
          : 0;

      progressEl.textContent =
        `${done} / ${chapter.totalLessons} دروس مكتملة · ${p}%`;

      chapterEl.querySelector(".chapter-percent").textContent = `${p}%`;
      chapterEl.querySelector(".chapter-percent-detail").textContent = `${p}%`;
      chapterEl.querySelector(".chapter-summary span:first-child strong").textContent = `${done} / ${chapter.totalLessons}`;
      chapterEl.querySelector(".chapter-summary span:nth-child(2) strong").textContent = chapter.totalLessons;
    }

    return;
  }
});

// =========================
// نموذج المادة
// =========================

const subjectPreset = $("#subject-preset");
const customSubjectField = $("#custom-subject-field");
const customSubjectName = $("#custom-subject-name");
const presetColors = {
  "الرياضيات": "blue",
  "الفيزياء": "teal",
  "الكيمياء": "orange",
  "الأحياء": "green",
  "العربي": "rose",
  "الإنكليزي": "purple",
  "الإسلامية": "amber",
  "الكردي": "sky",
  "التاريخ": "red",
  "الجغرافيا": "teal",
  "الحاسوب": "blue"
};

subjectPreset.addEventListener("change", () => {
  const custom = subjectPreset.value === "custom";
  customSubjectField.hidden = !custom;
  customSubjectName.required = custom;
  if (!custom) customSubjectName.value = "";

  const color = presetColors[subjectPreset.value] || "green";
  $("#subject-form [name=color]").value = color;
  $$("#subject-form [data-select-color]").forEach(swatch =>
    swatch.classList.toggle("selected", swatch.dataset.selectColor === color)
  );
});

$("#subject-form").addEventListener(
  "input",
  () => {

    const f =
      new FormData(
        $("#subject-form")
      );

    const t =
      +f.get("totalLessons");

    const d =
      +f.get("durationDays");

    $("#daily-goal-preview").textContent =
      t && d
        ? `خطة مقترحة: نحو ${Math.ceil(t / d)} دروس يوميًا لمدة ${d} يومًا.`
        : "أدخل إجمالي الدروس والمدة ليظهر هدفك اليومي.";
  }
);

$("#subject-form").onsubmit = e => {

  e.preventDefault();

  activeView = "subjects";

  const f =
    new FormData(e.target);

  const count =
    +f.get("chapterCount") || 0;

  const name =
    f.get("subjectPreset") === "custom"
      ? f.get("customName").trim()
      : f.get("subjectPreset");

  if (!name) {
    subjectPreset.focus();
    return;
  }

  data.subjects.push({
    id: uid(),
    name,
    color: f.get("color"),
    totalLessons:
      +f.get("totalLessons"),

    durationDays:
      +f.get("durationDays") || 0,

    chapters:
      Array.from(
        { length: count },
        (_, i) => ({
          id: uid(),
          name: `الفصل ${i + 1}`,
          lessons: []
        })
      )
  });

  e.target.reset();
  customSubjectField.hidden = true;
  customSubjectName.required = false;
  $("#subject-form [name=color]").value = "green";
  $$("#subject-form [data-select-color]").forEach(swatch =>
    swatch.classList.toggle("selected", swatch.dataset.selectColor === "green")
  );

  $("#daily-goal-preview").textContent =
    "أدخل إجمالي الدروس والمدة ليظهر هدفك اليومي.";

  $("#subject-modal").close();

  persist();
};

// =========================
// نموذج المهمة
// =========================

$("#weekly-form").onsubmit = e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const day = f.get("day");
  const subjectId = f.get("subjectId");
  if (!day || !subjectId) return;
  const subject = data.subjects.find(x => x.id === subjectId);
  if (!subject) return;

  if (!data.weeklySchedule.some(x => x.day === day && x.subjectId === subjectId)) {
    data.weeklySchedule.push({ id: uid(), day, subjectId, tasks: [] });
  }

  $("#weekly-modal").close();
  persist();
};

document.addEventListener("submit", e => {
  const quiz = e.target.closest("[data-study-quiz]");
  if (quiz) {
    e.preventDefault();
    saveStudyQuiz(quiz);
    return;
  }
  const form = e.target.closest("[data-weekly-task-form]");
  if (!form) return;
  e.preventDefault();
  const entry = data.weeklySchedule.find(x => x.id === form.dataset.weeklyTaskForm);
  const input = form.elements.title;
  const title = input.value.trim();
  if (!entry || !title) return;
  entry.tasks.push({ id: uid(), title, done: false });
  persist();
});

// =========================
// نموذج الفصل
// =========================

$("#chapter-form").onsubmit = e => {

  e.preventDefault();

  const f =
    new FormData(e.target);

  const subject =
    data.subjects.find(
      s => s.id === f.get("subjectId")
    );

  if (!subject) return;

  const totalLessons =
    Math.max(
      +f.get("totalLessons") || 1,
      1
    );

  subject.chapters.push({
    id: uid(),
    name: f.get("name").trim(),
    totalLessons,

    lessons:
      Array.from(
        { length: totalLessons },
        (_, index) => ({
          id: uid(),
          name: `درس ${index + 1}`,
          done: false
        })
      )
  });

  e.target.reset();

  $("#chapter-modal").close();

  persist();
};

// =========================
// نموذج الدرس
// =========================

$("#lesson-form").onsubmit = e => {

  e.preventDefault();

  const f =
    new FormData(e.target);

  const s =
    data.subjects.find(
      s => s.id === f.get("subjectId")
    );

  if (!s) return;

  let chapter =
    s.chapters.find(
      c => c.id === f.get("chapterId")
    );

  if (!chapter) {

    chapter = {
      id: uid(),
      name: "دروس المادة",
      totalLessons: 0,
      lessons: []
    };

    s.chapters.push(chapter);
  }

  chapter.lessons.push({
    id: uid(),
    name: f.get("name").trim(),
    done: false,
    today:
      f.get("today") === "on"
  });

  chapter.totalLessons =
    Math.max(
      Number(chapter.totalLessons) || 0,
      chapter.lessons.length
    );

  s.totalLessons =
    Math.max(
      Number(s.totalLessons) || 0,
      lessons(s).length
    );

  e.target.reset();

  $("#lesson-modal").close();

  persist();
};

// =========================
// التاريخ
// =========================

$("#today-date").textContent =
  new Intl.DateTimeFormat(
    "ar-IQ",
    {
      weekday: "long",
      day: "numeric",
      month: "long"
    }
  ).format(new Date());

// =========================
// التشغيل
// =========================

loadStaticContent().finally(() => render());
loadBooks();
window.addEventListener("beforeunload", closePdfViewer);