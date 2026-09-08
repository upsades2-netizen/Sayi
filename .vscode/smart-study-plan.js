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
    this.state.smartPlan.dailyPlans ??= [];
    this.state.smartPlan.passThreshold ??= 80;
  }

  getLessons() {
    return (this.content.units || []).flatMap(unit =>
      (unit.lessons || []).map(lesson => ({ ...lesson, unitId: unit.id, unitTitle: unit.title }))
    );
  }

  getQuestionSource(question) {
    return question.source || (question.ministry ? "ministry" : "book");
  }

  getQuestionsForLesson(lessonId, unitId) {
    const questions = this.content.questions || {};
    return [...(questions.ministry || []), ...(questions.book || []), ...(questions.exercises || [])]
      .filter(question => question.lessonId === lessonId || question.unitId === unitId);
  }

  buildDailyPlan(date = new Date().toLocaleDateString("en-CA")) {
    const lessons = this.getLessons();
    const previous = this.state.smartPlan.daily || {};
    const current = lessons.find(lesson => !this.state.lessons?.[lesson.id]?.completedAt) || null;
    const existing = this.state.smartPlan.dailyPlans.find(plan => plan.date === date);
    const daily = existing || {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      date,
      subjectId: this.subjectId,
      lessonId: current?.id || null,
      unitId: current?.unitId || null,
      stage: previous.date === date ? previous.stage || "study" : "study",
      status: current ? "open" : "empty",
      tasks: current ? [
        { id: `${current.id}-reading`, type: "reading", title: `قراءة ${current.title}`, minutes: 30, status: "open" },
        { id: `${current.id}-questions`, type: "questions", title: "حل أسئلة الموضوع", minutes: 15, status: "open" },
        { id: `${current.id}-quiz`, type: "quiz", title: "اختبار يومي قصير", minutes: 10, status: "locked" }
      ] : []
    };
    if (!existing) this.state.smartPlan.dailyPlans.push(daily);
    this.state.smartPlan.daily = {
      ...daily,
      subjectId: this.subjectId
    };
    this.saveState(this.state);
    return this.state.smartPlan.daily;
  }

  completeStudyStage(stage, date = new Date().toLocaleDateString("en-CA")) {
    const daily = this.buildDailyPlan(date);
    const next = { study: "reading", reading: "questions", questions: "quiz", quiz: "result", result: "complete" }[stage];
    daily.stage = next || stage;
    daily.status = daily.stage === "complete" ? "completed" : "open";
    const task = daily.tasks?.find(item => item.type === stage);
    if (task) task.status = "completed";
    if (stage === "questions") daily.tasks?.find(item => item.type === "quiz") && (daily.tasks.find(item => item.type === "quiz").status = "open");
    daily[`${stage}CompletedAt`] = new Date().toISOString();
    this.saveState(this.state);
    return daily;
  }

  getQuestions(scope = "daily") {
    const questions = this.content.questions || {};
    const daily = this.state.smartPlan.daily || {};
    if (scope === "chapter") return [...(questions.ministry || []), ...(questions.book || []), ...(questions.exercises || [])];
    if (scope === "weekly") {
      const lessonIds = new Set(this.state.smartPlan.dailyPlans.filter(plan => plan.status === "completed").map(plan => plan.lessonId));
      return [...(questions.ministry || []), ...(questions.book || []), ...(questions.exercises || [])]
        .filter(question => lessonIds.has(question.lessonId) || question.unitId === daily.unitId);
    }
    return this.getQuestionsForLesson(daily.lessonId, daily.unitId).slice(0, 10);
  }

  recordQuizResult({ scope = "daily", score = 0, correct = 0, wrong = 0, weakTopics = [], errorsByTopic = {}, questionResults = [] } = {}) {
    const createdAt = new Date().toISOString();
    const result = { id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, subjectId: this.subjectId, scope, score, percentage: score, correct, wrong, weakTopics, errorsByTopic, questionResults, date: createdAt.slice(0, 10), createdAt };
    this.state.smartPlan.results.push(result);
    weakTopics.forEach(topic => this.state.smartPlan.reviewTasks.push({ id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, subjectId: this.subjectId, topic, sourceExamId: result.id, status: "open", createdAt }));
    if (scope === "chapter" && Number(score) < Number(this.state.smartPlan.passThreshold || 80)) {
      this.state.smartPlan.reviewPlan = {
        sourceExamId: result.id,
        status: "open",
        topics: weakTopics,
        tasks: weakTopics.map(topic => ({ id: `${result.id}-${topic}`, topic, title: `مراجعة ${topic}`, status: "open" }))
      };
    }
    if (scope === "daily") {
      const daily = this.state.smartPlan.daily;
      if (daily) {
        daily.quizResultId = result.id;
        daily.stage = "result";
        daily.status = "completed";
      }
    }
    if (scope === "weekly") this.state.smartPlan.weekly = { ...this.state.smartPlan.weekly, resultId: result.id, status: "completed" };
    this.saveState(this.state);
    return result;
  }

  buildWeeklyPlan(week = new Date().toLocaleDateString("en-CA").slice(0, 7)) {
    this.state.smartPlan.weekly = { ...this.state.smartPlan.weekly, week, status: "open" };
    this.saveState(this.state);
    return this.state.smartPlan.weekly;
  }

  getMastery() {
    const exam = [...(this.state.smartPlan.results || [])].reverse().find(result => result.scope === "chapter");
    if (!exam) return "needs-study";
    return Number(exam.score || 0) >= Number(this.state.smartPlan.passThreshold || 80) ? "mastered" : "needs-review";
  }

  getReviewTasks() {
    return this.state.smartPlan.reviewTasks.filter(task => task.status !== "completed");
  }
}
