import { load, save } from "./store.js";

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
let activeView = "home";

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
  data.studyLog ??= [];
  const validDays = new Set(weekDays.map(([key]) => key));
  const schedule = Array.isArray(data.weeklySchedule) ? data.weeklySchedule : [];
  const isNewSchedule = schedule.every(item => item && Array.isArray(item.tasks));
  let scheduleMigrated = false;

  if (!isNewSchedule) {
    const grouped = [];
    const legacy = Array.isArray(data.weeklyScheduleLegacy)
      ? data.weeklyScheduleLegacy
      : [];
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

      let entry = grouped.find(x =>
        x.day === item.day && x.subjectId === subject.id
      );
      if (!entry) {
        entry = { id: uid(), day: item.day, subjectId: subject.id, tasks: [] };
        grouped.push(entry);
      }
      entry.tasks.push({
        id: item.id || uid(),
        title: String(item.title || item.name).trim(),
        done: !!item.done
      });
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
          .map(task => ({
            ...task,
            title: String(task.title || task.name).trim(),
            done: !!task.done
          }))
      }));
  }
  data.studyLog = data.studyLog
    .filter(e => e && e.date)
    .map(e => ({
      id: e.id || uid(),
      subject: e.subject || "",
      minutes: Math.max(Number(e.minutes) || 0, 0),
      date: e.date
    }))
    .filter(e => e.minutes > 0);
  data.studyPlan ??= {
    durationDays: 0,
    startedAt: null,
    activeMode: "natural",
    activity: {}
  };
  data.studyPlan.activity ??= {};
  if (data.studyPlan.activeMode === "basic") {
    data.studyPlan.activeMode = "natural";
  }
  data.studyPlan.durationDays = Math.max(
    Number(data.studyPlan.durationDays) || 0,
    0
  );
  data.studyPlan.activeMode = ["natural", "fast", "slow"].includes(
    data.studyPlan.activeMode
  ) ? data.studyPlan.activeMode : "natural";

  data.subjects.forEach(s => {
    s.chapters ??= [];

    s.totalLessons = Math.max(
      Number(s.totalLessons) || 0,
      ...s.chapters.map(c => (c.lessons || []).length),
      0
    );

    s.durationDays = Number(s.durationDays) || 0;
    s.createdAt ??= new Date().toISOString();
    s.plan ??= null;
    if (s.plan && !["slow", "natural", "fast"].includes(s.plan.type)) {
      s.plan = null;
    }
    s.color = colors[s.color] ? s.color : "green";

    s.chapters.forEach(c => {
      c.lessons ??= [];
      c.totalLessons = Math.max(
        Number(c.totalLessons) || 0,
        c.lessons.length
      );

      c.lessons.forEach(l => {
        if (l.done && !l.completedAt) l.completedAt = null;
      });
    });
  });

  data.tasks.forEach(t => {
    t.done = !!t.done;
  });

  if (scheduleMigrated) save(data);
}

normalize();

const lessons = s =>
  s.chapters.flatMap(c =>
    c.lessons.map(l => ({
      ...l,
      chapter: c.name,
      chapterId: c.id,
      subject: s.name,
      subjectId: s.id
    }))
  );

const completed = s =>
  s.chapters.reduce(
    (n, c) => n + c.lessons.filter(l => l.done).length,
    0
  );

const total = s =>
  Math.max(
    Number(s.totalLessons) || 0,
    s.chapters.reduce((n, c) => n + c.lessons.length, 0)
  );

const percent = s =>
  total(s)
    ? Math.round(completed(s) / total(s) * 100)
    : 0;

const all = () =>
  data.subjects.flatMap(lessons);

const allTotal = () =>
  data.subjects.reduce((n, s) => n + total(s), 0);

const allDone = () =>
  data.subjects.reduce((n, s) => n + completed(s), 0);

const overall = () =>
  allTotal()
    ? Math.round(allDone() / allTotal() * 100)
    : 0;

const todayKey = () =>
  new Date().toISOString().slice(0, 10);

const dateKey = d => d.toISOString().slice(0, 10);

// =========================
// وقت الدراسة الحقيقي
// =========================

const minutesFor = date =>
  data.studyLog.reduce(
    (sum, e) => sum + (e.date === date ? e.minutes : 0),
    0
  );

const todayStudyMinutes = () => minutesFor(todayKey());

const hasActivity = date =>
  (Number(data.studyPlan.activity[date]) || 0) > 0 ||
  minutesFor(date) > 0;

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
  render();
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
// المهام
// =========================

function renderTasks(target, empty) {
  const el = $(target);
  if (!el) return;

  el.innerHTML = data.tasks.map(t => `
    <li class="task-row ${t.done ? "done" : ""}">
      <input
        type="checkbox"
        data-task="${t.id}"
        ${t.done ? "checked" : ""}
      >

      <span>
        ${esc(t.name)}

        ${
          t.subject
            ? `
              <small>
                ${esc(t.subject)}
                ${t.chapter ? ` · ${esc(t.chapter)}` : ""}
                · ${esc(t.priority || "متوسطة")}
              </small>
            `
            : ""
        }
      </span>

      <button
        class="delete"
        data-delete-task="${t.id}"
        aria-label="حذف المهمة"
      >×</button>
    </li>
  `).join("");

  const emptyEl = $(empty);
  if (emptyEl) {
    emptyEl.hidden = !!data.tasks.length;
  }
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

  $("#tasks-count").textContent =
    data.tasks.length.toLocaleString("ar-IQ");
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

  $("#task-subject").innerHTML = options;

  const studytimeSubject = $("#studytime-subject");
  if (studytimeSubject) studytimeSubject.innerHTML = options;

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
// الرسم الرئيسي
// =========================

function render() {
  normalize();

  renderHeroProgress();

  $("#study-time").textContent =
    `${arabicNumber(todayStudyMinutes())} د`;

  const streak = studyStreak();
  $("#streak-count").textContent =
    streak === 1
      ? "يوم واحد"
      : streak === 2
        ? "يومان"
        : `${arabicNumber(streak)} أيام`;

  renderTasks("#tasks", "#no-tasks");
  renderTasks("#tasks-full", "#no-tasks-full");

  renderHome();
  renderSubjects();
  renderWeekly();
  renderStats();
  renderOptions();

  showView(activeView);
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
    tasks: "مهامك",
    weekly: "الجدول الأسبوعي",
    stats: "تقدّمك"
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

  if (name === "studytime") {
    const dateInput = $("#studytime-form [name=date]");
    if (dateInput && !dateInput.value) dateInput.value = todayKey();
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

  // حذف مهمة
  if (b.dataset.deleteTask) {

    data.tasks =
      data.tasks.filter(
        x => x.id !== b.dataset.deleteTask
      );

    persist();
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

  // المهمة
  if (e.target.dataset.task) {

    const task =
      data.tasks.find(
        t => t.id === e.target.dataset.task
      );

    if (!task) return;

    task.done =
      e.target.checked;

    // حفظ فقط بدون render
    save(data);

    e.target
      .closest(".task-row")
      ?.classList.toggle(
        "done",
        task.done
      );

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

$("#task-form").onsubmit = e => {

  e.preventDefault();

  const f =
    new FormData(e.target);

  data.tasks.unshift({
    id: uid(),
    name: f.get("name").trim(),
    subject: f.get("subject"),
    chapter: f.get("chapter").trim(),
    date: f.get("date"),
    duration:
      +f.get("duration") || 0,
    priority:
      f.get("priority"),
    done: false
  });

  e.target.reset();

  $("#task-modal").close();

  persist();
};

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
// نموذج تسجيل وقت الدراسة
// =========================

$("#studytime-form").onsubmit = e => {

  e.preventDefault();

  const f =
    new FormData(e.target);

  const minutes =
    Math.max(+f.get("minutes") || 0, 1);

  data.studyLog.unshift({
    id: uid(),
    subjectId: "",
    subject: f.get("subject") || "",
    minutes,
    date: f.get("date") || todayKey()
  });

  e.target.reset();

  $("#studytime-modal").close();

  persist();
};

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

render();