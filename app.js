import { load, save } from "./store.js";
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)], colors = { green: "#276b51", teal: "#2c8b83", blue: "#4d77b9", sky: "#4b9ab3", purple: "#8067ae", pink: "#c8799c", rose: "#b76d75", orange: "#c9824b", amber: "#bd8b38", red: "#b7605d" };
let data = load(), activeView = "home";
const uid = () => crypto.randomUUID(), esc = x => String(x || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
function normalize() { data.subjects ??= [];
data.tasks ??= [];
data.subjects.forEach(s => { s.chapters ??= [];
s.totalLessons = Math.max(Number(s.totalLessons) || 0, ...s.chapters.map(c => (c.lessons || []).length), 0);
s.durationDays = Number(s.durationDays) || 0;
s.color = colors[s.color] ? s.color : "green";
s.chapters.forEach(c => {
	c.lessons ??= [];
	c.totalLessons = Math.max(Number(c.totalLessons) || 0, c.lessons.length);
}) });
data.tasks.forEach(t => { t.done = !!t.done }) } normalize();
const lessons = s => s.chapters.flatMap(c => c.lessons.map(l => ({ ...l, chapter: c.name, chapterId: c.id, subject: s.name, subjectId: s.id }))), completed = s => lessons(s).filter(l => l.done).length, total = s => Math.max(Number(s.totalLessons) || 0, lessons(s).length), percent = s => total(s) ? Math.round(completed(s) / total(s) * 100) : 0, all = () => data.subjects.flatMap(lessons), allTotal = () => data.subjects.reduce((n, s) => n + total(s), 0), allDone = () => data.subjects.reduce((n, s) => n + completed(s), 0), overall = () => allTotal() ? Math.round(allDone() / allTotal() * 100) : 0, persist = () => { save(data);
render() };
function subjectCard(s) { let t = total(s), d = completed(s), p = percent(s), remaining = Math.max(t - d, 0), daily = s.durationDays ? Math.ceil(remaining / s.durationDays) : 0;
return `<article class="subject-card clickable" data-detail="${s.id}" style="--subject:${colors[s.color]}"><div class="subject-top"><span class="subject-icon">▱</span><div><h3>${esc(s.name)}</h3><p>${d} مكتمل من ${t} درس</p></div><button class="delete" data-delete-subject="${s.id}" aria-label="حذف المادة">×</button></div><div class="progress"><span style="width:${p}%"></span></div><div class="subject-meta"><span>${p}% إنجاز</span><span>${remaining} متبقٍ</span></div><div class="subject-actions"><button class="soft-button" data-add-chapter="${s.id}">+ فصل</button>${daily ? `<span class="soft-button">${daily} دروس/يوم</span>` : ""}</div></article>` } function renderTasks(target, empty) { let el = $(target);
if (!el) return;
el.innerHTML = data.tasks.map(t => `<li class="task-row ${t.done ? "done" : ""}"><input type="checkbox" data-task="${t.id}" ${t.done ? "checked" : ""}><span>${esc(t.name)}${t.subject ? `<small>${esc(t.subject)}${t.chapter ? ` · ${esc(t.chapter)}` : ""} · ${esc(t.priority || "متوسطة")}</small>` : ""}</span><button class="delete" data-delete-task="${t.id}" aria-label="حذف المهمة">×</button></li>`).join("");
$(empty).hidden = !!data.tasks.length } function renderHome() { let next = all().find(l => !l.done) || all()[0];
$("#next-lesson").innerHTML = next ? `<strong>${esc(next.name)}</strong><span>${esc(next.subject)} · ${esc(next.chapter)}${next.today ? " · ضمن خطة اليوم" : ""}</span>` : "<strong>لا توجد دروس بعد</strong><span>أضف مادة أو تفاصيل دروس لتبدأ.</span>";
$("#home-subjects").innerHTML = data.subjects.slice(0, 3).map(subjectCard).join("");
$("#subjects-count").textContent = data.subjects.length.toLocaleString("ar-IQ") } function renderSubjects() { $("#subjects").innerHTML = data.subjects.map(subjectCard).join("");
$("#no-subjects").hidden = !!data.subjects.length } function renderStats() { $("#stats-progress").textContent = overall() + "%";
$("#stats-completed").textContent = allDone().toLocaleString("ar-IQ");
$("#stats-remaining").textContent = Math.max(allTotal() - allDone(), 0).toLocaleString("ar-IQ") } function renderOptions() { $("#task-subject").innerHTML = '<option value="">بدون مادة</option>' + data.subjects.map(s => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join("") } function render() { normalize();
$("#all-progress").textContent = overall() + "%";
$("#study-time").textContent = "٠ د";
renderTasks("#tasks", "#no-tasks");
renderTasks("#tasks-full", "#no-tasks-full");
renderHome();
renderSubjects();
renderStats();
renderOptions();
showView(activeView) } function showView(view) { activeView = view;
$$('.view').forEach(x => x.classList.toggle('active', x.id === view + '-view'));
$$('[data-view]').forEach(x => x.classList.toggle('active', x.dataset.view === view));
$("#page-title").textContent = { home: "مرحبًا، طالب السَعي 👋", subjects: "موادك الدراسية", tasks: "مهامك", stats: "تقدّمك" }[view] || "سَعي";

window.scrollTo({ top: 0, behavior: "smooth" }) } function openDetail(id) { let s = data.subjects.find(x => x.id === id);if (!s) return;
let t = total(s), d = completed(s), r = Math.max(t - d, 0), daily = s.durationDays ? Math.ceil(r / s.durationDays) : 0, finish = s.durationDays ? new Date(Date.now() + s.durationDays * 86400000).toLocaleDateString("ar-IQ") : "غير محدد";
$("#detail-name").textContent = s.name;
$("#detail-content").innerHTML = `<div class="progress" style="--subject:${colors[s.color]}"><span style="width:${percent(s)}%"></span></div><div class="detail-summary"><div><strong>${percent(s)}%</strong><small>نسبة الإنجاز</small></div><div><strong>${t}</strong><small>إجمالي الدروس</small></div><div><strong>${d}</strong><small>المكتمل</small></div><div><strong>${r}</strong><small>المتبقي</small></div><div><strong>${daily || "—"}</strong><small>المطلوب يوميًا</small></div><div><strong>${finish}</strong><small>الموعد المتوقع</small></div></div><div class="detail-tabs"><button class="active">نظرة عامة</button><button>الدروس</button><button>الخطة</button><button>الإحصائيات</button></div>${s.chapters.map(c => `<section class="chapter"><div class="chapter-head">
  <button class="chapter-toggle" type="button" aria-expanded="true">▼</button>
  <h3>${esc(c.name)}</h3>${esc(c.name)}</h3><div class="chapter-actions"><button class="soft-button" data-add-lesson="${s.id}|${c.id}">+ درس</button><button class="delete" data-delete-chapter="${s.id}|${c.id}">×</button></div></div>${c.lessons.map(l => `<div class="lesson-row ${l.done ? "done" : ""}"><input type="checkbox" data-lesson="${s.id}|${c.id}|${l.id}" ${l.done ? "checked" : ""}><div><strong>${esc(l.name)}</strong>${l.today ? "<small>ضمن دروس اليوم</small>" : ""}</div><button class="delete" data-delete-lesson="${s.id}|${c.id}|${l.id}">×</button></div>`).join("") || '<small>لا توجد تفاصيل دروس بعد.</small>'}</section>`).join("") || '<p class="empty">يمكنك إضافة تفاصيل الفصول والدروس لاحقًا.</p>'}<button class="primary wide quick-lesson" data-add-quick-lesson="${s.id}">+ إضافة درس لهذه المادة</button>`;
	s.chapters.forEach((chapter, index) => {
	  const heading = $("#detail-content").querySelectorAll(".chapter h3")[index];
	if (heading) {
		const completedLessons = chapter.lessons.filter(lesson => lesson.done).length;
		const progress = chapter.totalLessons ? Math.round(completedLessons / chapter.totalLessons * 100) : 0;
		heading.insertAdjacentHTML("beforeend", ` <small>${completedLessons} / ${chapter.totalLessons} دروس مكتملة · ${progress}%</small><input class="chapter-total" type="number" min="1" value="${chapter.totalLessons}" data-chapter-total="${chapter.id}" aria-label="عدد الدروس في الفصل">`);
	}
	});

$("#subject-detail").showModal() } function openModal(name) { $("#" + name + "-modal").showModal() } document.addEventListener("click", e => { let b = e.target.closest("button,[data-detail]");
if (!b) return;
if (b.dataset.closeModal) { e.preventDefault();
b.closest("dialog")?.close();
return } if (b.dataset.view) { showView(b.dataset.view);
return } if (b.dataset.open) { openModal(b.dataset.open);
return } if (b.dataset.detail) { openDetail(b.dataset.detail);
return } if (b.dataset.selectColor)if (b.dataset.detail) {
  openDetail(b.dataset.detail);
  return;
}

if (b.classList.contains("chapter-toggle")) {
  const chapter = b.closest(".chapter");
  const lessons = chapter.querySelectorAll(".lesson-row");
  const isOpen = b.getAttribute("aria-expanded") === "true";

  lessons.forEach(lesson => {
    lesson.style.display = isOpen ? "none" : "";
  });

  b.setAttribute("aria-expanded", String(!isOpen));
  b.textContent = isOpen ? "▶" : "▼";
  return;
} { let form = b.closest("form"), input = form?.querySelector("[name=color]");
if (input) { input.value = b.dataset.selectColor;    
form.querySelectorAll("[data-select-color]").forEach(x => x.classList.toggle("selected", x === b)) } return } if (b.dataset.addQuickLesson) { let subject = data.subjects.find(s => s.id === b.dataset.addQuickLesson);
let chapter = subject.chapters[0];
$("#lesson-form [name=subjectId]").value = subject.id;
$("#lesson-form [name=chapterId]").value = chapter ? chapter.id : "__quick__";
$("#subject-detail").close();
openModal("lesson");
return } if (b.dataset.addChapter) { $("#chapter-form [name=subjectId]").value = b.dataset.addChapter;
openModal("chapter");
return } if (b.dataset.addLesson) { let [s, c] = b.dataset.addLesson.split("|");
$("#lesson-form [name=subjectId]").value = s;
$("#lesson-form [name=chapterId]").value = c;
$("#subject-detail").close();
openModal("lesson");
return } if (b.dataset.deleteTask) { data.tasks = data.tasks.filter(x => x.id !== b.dataset.deleteTask);
persist() } if (b.dataset.deleteSubject) { data.subjects = data.subjects.filter(x => x.id !== b.dataset.deleteSubject);
persist() } if (b.dataset.deleteChapter) { let [s, c] = b.dataset.deleteChapter.split("|");
let subject = data.subjects.find(x => x.id === s);
subject.chapters = subject.chapters.filter(x => x.id !== c);
$("#subject-detail").close();
persist() } if (b.dataset.deleteLesson) { let [s, c, l] = b.dataset.deleteLesson.split("|");
let chapter = data.subjects.find(x => x.id === s).chapters.find(x => x.id === c);
chapter.lessons = chapter.lessons.filter(x => x.id !== l);
persist() } });
document.addEventListener("change", e => { if (e.target.dataset.task) { let t = data.tasks.find(x => x.id === e.target.dataset.task);
t.done = e.target.checked;
persist() } if (e.target.dataset.lesson) { let [s, c, l] = e.target.dataset.lesson.split("|");
let lesson = data.subjects.find(x => x.id === s).chapters.find(x => x.id === c).lessons.find(x => x.id === l);
lesson.done = e.target.checked;
persist();
if ($("#subject-detail").open) openDetail(s);
} });
document.addEventListener("change", e => {
	if (!e.target.dataset.chapterTotal) return;
	const chapterId = e.target.dataset.chapterTotal;
	const totalLessons = Math.max(Number(e.target.value) || 1, 1);
	const subject = data.subjects.find(item => item.chapters.some(chapter => chapter.id === chapterId));
	const chapter = subject?.chapters.find(item => item.id === chapterId);
	if (!chapter) return;
	chapter.totalLessons = totalLessons;
	chapter.lessons = Array.from({ length: totalLessons }, (_, index) => ({
		id: chapter.lessons[index]?.id || uid(),
		name: `درس ${index + 1}`,
		done: chapter.lessons[index]?.done || false
	}));
	persist();
	if ($("#subject-detail").open) openDetail(subject.id);
});
$("#subject-form").addEventListener("input", () => { let f = new FormData($("#subject-form")), t = +f.get("totalLessons"), d = +f.get("durationDays");
$("#daily-goal-preview").textContent = t && d ? `خطة مقترحة: نحو ${Math.ceil(t / d)} دروس يوميًا لمدة ${d} يومًا.` : "أدخل إجمالي الدروس والمدة ليظهر هدفك اليومي." });
$("#subject-form").onsubmit = e => { e.preventDefault();
activeView = "subjects";
let f = new FormData(e.target), count = +f.get("chapterCount") || 0;
data.subjects.push({ id: uid(), name: f.get("name").trim(), color: f.get("color"), totalLessons: +f.get("totalLessons"), durationDays: +f.get("durationDays") || 0, chapters: Array.from({ length: count }, (_, i) => ({ id: uid(), name: `الفصل ${i + 1}`, lessons: [] })) });
e.target.reset();
$("#daily-goal-preview").textContent = "أدخل إجمالي الدروس والمدة ليظهر هدفك اليومي.";
$("#subject-modal").close();
persist() };
$("#task-form").onsubmit = e => { e.preventDefault();
let f = new FormData(e.target);
data.tasks.unshift({ id: uid(), name: f.get("name").trim(), subject: f.get("subject"), chapter: f.get("chapter").trim(), date: f.get("date"), duration: +f.get("duration") || 0, priority: f.get("priority"), done: false });
e.target.reset();
$("#task-modal").close();
persist() };
$("#chapter-form").onsubmit = e => { e.preventDefault();
let f = new FormData(e.target), subject = data.subjects.find(s => s.id === f.get("subjectId")), totalLessons = Math.max(+f.get("totalLessons") || 1, 1);
subject.chapters.push({ id: uid(), name: f.get("name").trim(), totalLessons, lessons: Array.from({ length: totalLessons }, (_, index) => ({ id: uid(), name: `درس ${index + 1}`, done: false })) });
e.target.reset();
$("#chapter-modal").close();
persist() };
$("#lesson-form").onsubmit = e => { e.preventDefault();
let f = new FormData(e.target), s = data.subjects.find(s => s.id === f.get("subjectId")), chapter = s.chapters.find(c => c.id === f.get("chapterId"));
if (!chapter) { chapter = { id: uid(), name: "دروس المادة", lessons: [] };
s.chapters.push(chapter) } chapter.lessons.push({ id: uid(), name: f.get("name").trim(), done: false, today: f.get("today") === "on" });
s.totalLessons = Math.max(s.totalLessons || 0, lessons(s).length);
e.target.reset();
$("#lesson-modal").close();
persist() };
$("#today-date").textContent = new Intl.DateTimeFormat("ar-IQ", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
render();