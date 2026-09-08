export class SubjectStudyEngine {
  constructor({ subjectId, content = {}, state = {}, saveState = () => {} } = {}) {
    this.subjectId = subjectId || content.subjectId || "unknown";
    this.content = content;
    this.state = state;
    this.saveState = saveState;
    this.state.lessons ??= {};
    this.state.items ??= {};
    this.state.dailyTasks ??= [];
    this.state.exams ??= [];
    this.state.reviewTasks ??= [];
  }

  getUnits() {
    return Array.isArray(this.content.units) ? this.content.units : [];
  }

  getLessons() {
    return this.getUnits().flatMap(unit =>
      (unit.lessons || []).map(lesson => ({ ...lesson, unitId: unit.id, unitTitle: unit.title }))
    );
  }

  getLesson(lessonId) {
    return this.getLessons().find(lesson => lesson.id === lessonId) || null;
  }

  getLessonState(lessonId) {
    this.state.lessons[lessonId] ??= { status: "new", progress: 0, completedAt: null };
    return this.state.lessons[lessonId];
  }

  getItemState(itemId) {
    this.state.items[itemId] ??= {};
    return this.state.items[itemId];
  }

  getLessonProgress(lesson) {
    const items = (lesson.items || []).length;
    const state = this.getLessonState(lesson.id);
    if (!items) return state.progress || 0;
    const completed = (lesson.items || []).filter(item => this.getItemState(item.id).mastered).length;
    return Math.round(completed / items * 100);
  }

  getProgress() {
    const lessons = this.getLessons();
    const completedLessons = lessons.filter(lesson => this.getLessonState(lesson.id).status === "completed").length;
    const bookProgress = lessons.length
      ? Math.round(lessons.reduce((sum, lesson) => sum + this.getLessonProgress(lesson), 0) / lessons.length)
      : 0;
    const tasks = this.state.dailyTasks;
    const completedTasks = tasks.filter(task => task.status === "completed").length;
    const exams = this.state.exams;
    const examProgress = exams.length ? Math.round(exams.reduce((sum, exam) => sum + (exam.score || 0), 0) / exams.length) : 0;
    const masteryItems = Object.values(this.state.items);
    const mastery = masteryItems.length ? Math.round(masteryItems.filter(item => item.mastered).length / masteryItems.length * 100) : 0;
    return {
      lectures: lessons.length ? Math.round(completedLessons / lessons.length * 100) : 0,
      book: bookProgress,
      tasks: tasks.length ? Math.round(completedTasks / tasks.length * 100) : 0,
      exams: examProgress,
      mastery
    };
  }

  getNextItem() {
    return this.getLessons().find(lesson => this.getLessonState(lesson.id).status !== "completed") || null;
  }

  markLessonComplete(lessonId) {
    const state = this.getLessonState(lessonId);
    state.status = "completed";
    state.progress = 100;
    state.completedAt = new Date().toISOString();
    this.saveState(this.state);
    return state;
  }

  updateItemProgress(itemId, result = {}) {
    const state = this.getItemState(itemId);
    Object.assign(state, result, { updatedAt: new Date().toISOString() });
    if (result.correct === true) state.correctCount = (state.correctCount || 0) + 1;
    if (result.correct === false) state.wrongCount = (state.wrongCount || 0) + 1;
    if (result.mastered === true) state.mastered = true;
    this.saveState(this.state);
    return state;
  }

  createDailyTask(task) {
    const record = { id: task.id || crypto.randomUUID(), status: "new", createdAt: new Date().toISOString(), ...task };
    this.state.dailyTasks.push(record);
    this.saveState(this.state);
    return record;
  }

  recordExam(exam) {
    const record = { id: exam.id || crypto.randomUUID(), createdAt: new Date().toISOString(), ...exam };
    this.state.exams.push(record);
    const weakTopics = exam.weakTopics || [];
    weakTopics.forEach(topic => this.state.reviewTasks.push({ id: crypto.randomUUID(), topic, sourceExamId: record.id, status: "open", createdAt: record.createdAt }));
    this.saveState(this.state);
    return record;
  }

  getOpenReviews() {
    return this.state.reviewTasks.filter(task => task.status !== "completed");
  }
}
