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

const uid = () => crypto.randomUUID();

const esc = x =>
  String(x || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));

// =========================
// البيانات
// =========================

function normalize() {
  data.subjects ??= [];
  data.tasks ??= [];

  data.subjects.forEach(s => {
    s.chapters ??= [];

    s.totalLessons = Math.max(
      Number(s.totalLessons) || 0,
      ...s.chapters.map(c => (c.lessons || []).length),
      0
    );

    s.durationDays = Number(s.durationDays) || 0;
    s.color = colors[s.color] ? s.color : "green";

    s.chapters.forEach(c => {
      c.lessons ??= [];
      c.totalLessons = Math.max(
        Number(c.totalLessons) || 0,
        c.lessons.length
      );
    });
  });

  data.tasks.forEach(t => {
    t.done = !!t.done;
  });
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

// =========================
// الحفظ + الرسم
// =========================

const persist = () => {
  save(data);
  render();
};

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
        <span class="subject-icon">▱</span>

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
}

// =========================
// الخيارات
// =========================

function renderOptions() {
  $("#task-subject").innerHTML =
    '<option value="">بدون مادة</option>' +
    data.subjects.map(s => `
      <option value="${esc(s.name)}">
        ${esc(s.name)}
      </option>
    `).join("");
}

// =========================
// الرسم الرئيسي
// =========================

function render() {
  normalize();

  $("#all-progress").textContent =
    overall() + "%";

  $("#study-time").textContent = "٠ د";

  renderTasks("#tasks", "#no-tasks");
  renderTasks("#tasks-full", "#no-tasks-full");

  renderHome();
  renderSubjects();
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

function openDetail(id) {
  const s = data.subjects.find(x => x.id === id);
  if (!s) return;

  const t = total(s);
  const d = completed(s);
  const r = Math.max(t - d, 0);

  const daily = s.durationDays
    ? Math.ceil(r / s.durationDays)
    : 0;

  const finish = s.durationDays
    ? new Date(
        Date.now() +
        s.durationDays * 86400000
      ).toLocaleDateString("ar-IQ")
    : "غير محدد";

  $("#detail-name").textContent = s.name;

  $("#detail-content").innerHTML = `
    <div
      class="progress"
      style="--subject:${colors[s.color]}"
    >
      <span style="width:${percent(s)}%"></span>
    </div>

    <div class="detail-summary">

      <div>
        <strong>${percent(s)}%</strong>
        <small>نسبة الإنجاز</small>
      </div>

      <div>
        <strong>${t}</strong>
        <small>إجمالي الدروس</small>
      </div>

      <div>
        <strong>${d}</strong>
        <small>دروس مكتملة</small>
      </div>

      <div>
        <strong>${r}</strong>
        <small>دروس متبقية</small>
      </div>

      <div>
        <strong>${daily}</strong>
        <small>درس يوميًا</small>
      </div>

      <div>
        <strong>${finish}</strong>
        <small>تاريخ الإكمال</small>
      </div>

    </div>

    <div class="detail-tabs">
      <button
        type="button"
        class="active"
      >الدروس</button>
    </div>

    ${
      s.chapters.map(c => `
        <section
          class="chapter"
          data-chapter-id="${c.id}"
        >

          <div class="chapter-head">

            <button
              class="chapter-toggle"
              type="button"
              aria-expanded="false"
            >▶</button>

            <h3>
              ${esc(c.name)}

              <small class="chapter-progress">
                ${
                  c.lessons.filter(l => l.done).length
                } / ${c.totalLessons}
                دروس مكتملة ·
                ${
                  c.totalLessons
                    ? Math.round(
                        c.lessons.filter(l => l.done).length /
                        c.totalLessons * 100
                      )
                    : 0
                }%
              </small>

              <input
                class="chapter-total"
                type="number"
                min="1"
                value="${c.totalLessons}"
                data-chapter-total="${c.id}"
                aria-label="عدد الدروس في الفصل"
              >
            </h3>

            <div class="chapter-actions">

              <button
                class="soft-button"
                data-add-lesson="${s.id}|${c.id}"
              >+ درس</button>

              <button
                class="delete"
                data-delete-chapter="${s.id}|${c.id}"
              >×</button>

            </div>

          </div>

          ${c.lessons.map(l => `
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
          `).join("")}

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

  // إغلاق جميع الفصول عند فتح النافذة
  $("#detail-content")
    .querySelectorAll(".chapter")
    .forEach(chapter => {

      const toggle =
        chapter.querySelector(".chapter-toggle");

      chapter
        .querySelectorAll(".lesson-row")
        .forEach(row => {
          row.style.display = "none";
        });

      toggle.setAttribute(
        "aria-expanded",
        "false"
      );

      toggle.textContent = "▶";
    });

  $("#subject-detail").showModal();
}

// =========================
// فتح النوافذ
// =========================

function openModal(name) {
  $("#" + name + "-modal").showModal();
}

// =========================
// الأزرار
// =========================

document.addEventListener("click", e => {

  const b =
    e.target.closest("button,[data-detail]");

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

  // تفاصيل المادة
  if (b.dataset.detail) {
    openDetail(b.dataset.detail);
    return;
  }

  // فتح / إغلاق الفصل
  if (b.classList.contains("chapter-toggle")) {

    const chapter = b.closest(".chapter");
    const lessonRows =
      chapter.querySelectorAll(".lesson-row");

    const isOpen =
      b.getAttribute("aria-expanded") === "true";

    lessonRows.forEach(row => {
      row.style.display =
        isOpen ? "none" : "";
    });

    b.setAttribute(
      "aria-expanded",
      String(!isOpen)
    );

    b.textContent =
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
    lesson.done =
      e.target.checked;

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
      }
    }

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

      chapterEl.insertAdjacentHTML(
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
    }

    return;
  }
});

// =========================
// نموذج المادة
// =========================

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

  data.subjects.push({
    id: uid(),
    name: f.get("name").trim(),
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