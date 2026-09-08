export class SmartStudyPlan {
  constructor({ subjectId, chapters = [], content = {}, state = {}, saveState = () => {} } = {}) {
    this.subjectId = subjectId;
    this.chapters = chapters;
    this.content = content;
    this.state = state;
    this.saveState = saveState;
    this.state.smartPlan ??= {};
    this.state.smartPlan.daily ??= { date: null, stage: "study", status: "open" };
    this.state.smartPlan.weekly ??= { week: null, status: "locked" };
    this.state.smartPlan.results ??= [];
    this.state.smartPlan.reviewTasks ??= [];
  }

  buildDailyPlan(date = new Date().toLocaleDateString("en-CA")) {
    const lessons = this.content.units?.flatMap(unit => (unit.lessons || []).map(lesson => ({ ...lesson, unitId: unit.id, unitTitle: unit.title }))) || [];
    const current = lessons.find(lesson => !this.state.lessons?.[lesson.id]?.completedAt) || null;
    this.state.smartPlan.daily = {
      ...this.state.smartPlan.daily,
      date,
      subjectId: this.subjectId,
      lessonId: current?.id || null,
      unitId: current?.unitId || null,
      stage: this.state.smartPlan.daily.stage || "study",
      status: current ? "open" : "empty"
    };
    this.saveState(this.state);
    return this.state.smartPlan.daily;
  }

  completeStudyStage(stage, date = new Date().toLocaleDateString("en-CA")) {
    const daily = this.buildDailyPlan(date);
    const next = { study: "reading", reading: "questions", questions: "quiz", quiz: "result", result: "complete" }[stage];
    daily.stage = next || stage;
    daily.status = daily.stage === "complete" ? "completed" : "open";
    daily[`${stage}CompletedAt`] = new Date().toISOString();
    this.saveState(this.state);
    return daily;
  }

  getQuestions(scope = "daily") {
    const questions = this.content.questions || {};
    if (scope === "chapter") return [...(questions.book || []), ...(questions.exercises || []), ...(questions.ministry || [])];
    if (scope === "weekly") return [...(questions.book || []), ...(questions.exercises || [])];
    return [...(questions.book || []), ...(questions.exercises || [])].filter(question => question.lessonId === this.state.smartPlan.daily.lessonId || question.unitId === this.state.smartPlan.daily.unitId);
  }

  recordQuizResult({ scope = "daily", score = 0, correct = 0, wrong = 0, weakTopics = [] } = {}) {
    const result = { id: crypto.randomUUID(), scope, score, correct, wrong, weakTopics, createdAt: new Date().toISOString() };
    this.state.smartPlan.results.push(result);
    weakTopics.forEach(topic => this.state.smartPlan.reviewTasks.push({ id: crypto.randomUUID(), subjectId: this.subjectId, topic, sourceExamId: result.id, status: "open", createdAt: result.createdAt }));
    this.saveState(this.state);
    return result;
  }

  buildWeeklyPlan(week = new Date().toLocaleDateString("en-CA").slice(0, 7)) {
    this.state.smartPlan.weekly = { ...this.state.smartPlan.weekly, week, status: "open" };
    this.saveState(this.state);
    return this.state.smartPlan.weekly;
  }

  getMastery() {
    const results = this.state.smartPlan.results || [];
    if (!results.length) return "needs-study";
    const average = results.reduce((sum, result) => sum + Number(result.score || 0), 0) / results.length;
    return average >= 85 ? "mastered" : average >= 60 ? "needs-review" : "needs-study";
  }

  getReviewTasks() {
    return this.state.smartPlan.reviewTasks.filter(task => task.status !== "completed");
  }
}
