export class SmartStudyPlan {
  constructor({ subjectId, chapters = [], content = {}, state = {}, saveState = () => {} } = {}) {
    this.subjectId = subjectId;
    this.chapters = chapters;
    this.content = content;
    this.state = state;
    this.saveState = saveState;
    this.state.smartPlan ??= {};
    this.state.smartPlan.daily ??= { date: null, stage: "study", status: "open", tasks: [] };
    this.state.smartPlan.weekly ??= { week: null, status: "locked" };
    this.state.smartPlan.results ??= [];
    this.state.smartPlan.reviewTasks ??= [];
    this.state.smartPlan.dailyPlans ??= [];
    this.state.smartPlan.passThreshold ??= 80;
    this.state.smartPlan.topicState ??= {};
  }

  getLessons() {
    if (Array.isArray(this.chapters) && this.chapters.length) {
      return this.chapters.flatMap(chapter =>
        (chapter.lessons || []).map(lesson => ({
          ...lesson,
          chapterId: chapter.id,
          chapterTitle: chapter.title || chapter.name,
          unitId: chapter.id,
          unitTitle: chapter.title || chapter.name,
          sourceType: "book"
        }))
      );
    }
    return (this.content.units || []).flatMap(unit =>
      (unit.lessons || []).map(lesson => ({
        ...lesson,
        chapterId: unit.id,
        chapterTitle: unit.title || unit.name,
        unitId: unit.id,
        unitTitle: unit.title || unit.name,
        sourceType: "book"
      }))
    );
  }

  getQuestionSource(question) {
    return question.source || (question.ministry ? "ministry" : "book");
  }

  getQuestionsForLesson(lessonId, unitId) {
    const questions = this.content.questions || {};
    return [...(questions.ministry || []), ...(questions.book || []), ...(questions.exercises || [])]
      .filter(question => question.lessonId === lessonId || question.unitId === unitId || question.topicId === lessonId);
  }

  getQuestionsForTopic(topicId, chapterId) {
    const questions = this.content.questions || {};
    const all = [...(questions.ministry || []), ...(questions.book || []), ...(questions.exercises || [])];
    return all.filter(question =>
      question.topicId === topicId ||
      question.lessonId === topicId ||
      question.chapterId === chapterId ||
      (question.unitId === chapterId && !question.lessonId)
    );
  }

  getSourceCatalog() {
    if (Array.isArray(this.chapters) && this.chapters.length) {
      return this.chapters.map((chapter, chapterIndex) => ({
        id: chapter.id || `chapter-${chapterIndex}`,
        title: chapter.title || chapter.name || `الفصل ${chapterIndex + 1}`,
        chapterIndex,
        topics: (chapter.lessons || []).map((lesson, lessonIndex) => ({
          id: lesson.id || `${chapter.id || chapterIndex}-lesson-${lessonIndex}`,
          title: lesson.title || lesson.name || `موضوع ${lessonIndex + 1}`,
          chapterId: chapter.id || `chapter-${chapterIndex}`,
          chapterTitle: chapter.title || chapter.name || `الفصل ${chapterIndex + 1}`,
          pages: lesson.pages || chapter.pages || { from: 1, to: 1 },
          sourceType: this.getQuestionSource(lesson) === "ministry" ? "ministry" : "book",
          description: lesson.summary || lesson.description || lesson.title || lesson.name,
          difficulty: lesson.difficulty || "medium",
          questions: this.getQuestionsForLesson(lesson.id || `${chapter.id || chapterIndex}-lesson-${lessonIndex}`, chapter.id || `chapter-${chapterIndex}`)
        }))
      }));
    }

    return (this.content.units || []).map((unit, unitIndex) => ({
      id: unit.id || `unit-${unitIndex}`,
      title: unit.title || unit.name || `الفصل ${unitIndex + 1}`,
      chapterIndex: unitIndex,
      topics: (unit.lessons || []).map((lesson, lessonIndex) => ({
        id: lesson.id || `${unit.id || unitIndex}-lesson-${lessonIndex}`,
        title: lesson.title || lesson.name || `موضوع ${lessonIndex + 1}`,
        chapterId: unit.id || `unit-${unitIndex}`,
        chapterTitle: unit.title || unit.name || `الفصل ${unitIndex + 1}`,
        pages: lesson.pages || unit.pages || { from: 1, to: 1 },
        sourceType: "book",
        description: lesson.summary || lesson.description || lesson.title || lesson.name,
        difficulty: lesson.difficulty || "medium",
        questions: this.getQuestionsForLesson(lesson.id || `${unit.id || unitIndex}-lesson-${lessonIndex}`, unit.id || `unit-${unitIndex}`)
      }))
    }));
  }

  hasSourceGrounding() {
    const allQuestions = this.content.questions || {};
    const hasBookPages = Array.isArray(this.chapters) && this.chapters.some(chapter => (chapter.lessons || []).length)
      || Array.isArray(this.content.units) && this.content.units.some(unit => (unit.lessons || []).length);
    return Boolean(hasBookPages || (allQuestions.ministry || []).length || (allQuestions.book || []).length || (allQuestions.exercises || []).length);
  }

  getCurrentTopic() {
    const chapters = this.getSourceCatalog();
    for (const chapter of chapters) {
      for (const topic of chapter.topics) {
        const topicState = this.state.lessons?.[topic.id] || this.state.smartPlan.topicState?.[topic.id] || {};
        if (!topicState.completedAt && !topicState.completed) {
          return { ...topic, chapterTitle: chapter.title };
        }
      }
    }
    const fallback = chapters.flatMap(chapter => chapter.topics.map(topic => ({ ...topic, chapterTitle: chapter.title })));
    return fallback[0] || null;
  }

  createTopicTasks(topic) {
    if (!topic) return [];
    const relatedQuestions = (topic.questions || []).slice(0, 3);
    const baseTasks = [
      {
        id: `${topic.id}-read`,
        type: "reading",
        title: `اقرأ تعريف ${topic.title} من الكتاب`,
        sourceType: topic.sourceType || "book",
        chapterTitle: topic.chapterTitle,
        topicId: topic.id,
        topicTitle: topic.title,
        pages: topic.pages || { from: 1, to: 1 },
        status: "open"
      },
      {
        id: `${topic.id}-understand`,
        type: "understand",
        title: `افهم الفكرة الأساسية في ${topic.title} وراجع المثال`,
        sourceType: topic.sourceType || "book",
        chapterTitle: topic.chapterTitle,
        topicId: topic.id,
        topicTitle: topic.title,
        pages: topic.pages || { from: 1, to: 1 },
        status: "open"
      },
      {
        id: `${topic.id}-review`,
        type: "review",
        title: `راجع النقاط المهمة في ${topic.title} واحتفظ بالقانون أو التعريف`,
        sourceType: topic.sourceType || "book",
        chapterTitle: topic.chapterTitle,
        topicId: topic.id,
        topicTitle: topic.title,
        pages: topic.pages || { from: 1, to: 1 },
        status: "open"
      }
    ];

    if (relatedQuestions.length) {
      baseTasks.push({
        id: `${topic.id}-questions`,
        type: "questions",
        title: `حل ${relatedQuestions.length} سؤالاً مرتبطاً بـ ${topic.title}`,
        sourceType: relatedQuestions[0].source || "official",
        chapterTitle: topic.chapterTitle,
        topicId: topic.id,
        topicTitle: topic.title,
        pages: topic.pages || { from: 1, to: 1 },
        relatedQuestionIds: relatedQuestions.map(item => item.id || item.questionId || `${topic.id}-${Math.random()}`),
        status: "open"
      });
    }

    return baseTasks;
  }

  buildDailyPlan(date = new Date().toLocaleDateString("en-CA")) {
    const topic = this.getCurrentTopic();
    const existing = this.state.smartPlan.dailyPlans.find(plan => plan.date === date && plan.subjectId === this.subjectId);
    const tasks = topic ? this.createTopicTasks(topic) : [];
    const daily = existing || {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      date,
      subjectId: this.subjectId,
      topicId: topic?.id || null,
      chapterId: topic?.chapterId || null,
      stage: "study",
      status: topic ? "open" : "empty",
      tasks
    };

    daily.date = date;
    daily.subjectId = this.subjectId;
    daily.topicId = topic?.id || daily.topicId || null;
    daily.chapterId = topic?.chapterId || daily.chapterId || null;
    daily.stage = daily.stage || "study";
    daily.status = topic ? "open" : "empty";
    daily.tasks = daily.tasks?.length ? daily.tasks : tasks;

    this.state.smartPlan.daily = { ...this.state.smartPlan.daily, ...daily, subjectId: this.subjectId };
    if (!existing) this.state.smartPlan.dailyPlans.push(daily);
    this.saveState(this.state);
    return this.state.smartPlan.daily;
  }

  getSmartSnapshot() {
    const topic = this.getCurrentTopic();
    const daily = this.buildDailyPlan();
    const topicQuestions = topic ? this.getQuestionsForTopic(topic.id, topic.chapterId) : [];
    return {
      subjectId: this.subjectId,
      topic,
      chapterTitle: topic?.chapterTitle || "غير محدد",
      chapter: this.getSourceCatalog().find(chapter => chapter.id === (topic?.chapterId || "")) || null,
      tasks: daily.tasks || [],
      questions: topicQuestions,
      hasSourceGrounding: this.hasSourceGrounding(),
      sourceSummary: topic ? `${topic.chapterTitle} · ${topic.title} · صفحات ${topic.pages?.from || 1}–${topic.pages?.to || 1}` : "لا يوجد مصدر مهيأ بعد",
      status: daily.status,
      stage: daily.stage
    };
  }

  completeStudyStage(stage, date = new Date().toLocaleDateString("en-CA")) {
    const daily = this.buildDailyPlan(date);
    const next = { study: "reading", reading: "questions", questions: "quiz", quiz: "result", result: "complete" }[stage];
    daily.stage = next || stage;
    daily.status = daily.stage === "complete" ? "completed" : "open";
    const task = daily.tasks?.find(item => item.type === stage);
    if (task) task.status = "completed";
    if (stage === "questions") {
      const quizTask = daily.tasks?.find(item => item.type === "quiz");
      if (quizTask) quizTask.status = "open";
    }
    daily[`${stage}CompletedAt`] = new Date().toISOString();
    if (this.state.lessons && daily.topicId) {
      this.state.lessons[daily.topicId] ??= {};
      this.state.lessons[daily.topicId].completedAt = daily[`${stage}CompletedAt`];
      this.state.lessons[daily.topicId].status = "completed";
    }
    this.saveState(this.state);
    return daily;
  }

  markTaskComplete(taskId) {
    const daily = this.state.smartPlan.daily || this.buildDailyPlan();
    const task = daily.tasks?.find(item => item.id === taskId);
    if (task) task.status = "completed";
    const topicState = this.state.lessons?.[daily.topicId] || this.state.smartPlan.topicState?.[daily.topicId] || {};
    topicState.completed = true;
    topicState.completedAt = new Date().toISOString();
    if (daily.topicId) {
      this.state.lessons ??= {};
      this.state.lessons[daily.topicId] = topicState;
      this.state.smartPlan.topicState ??= {};
      this.state.smartPlan.topicState[daily.topicId] = topicState;
    }
    this.saveState(this.state);
    return task || null;
  }

  getQuestions(scope = "daily") {
    const questions = this.content.questions || {};
    const all = [...(questions.ministry || []), ...(questions.book || []), ...(questions.exercises || [])];
    const daily = this.state.smartPlan.daily || {};
    if (scope === "chapter") return all;
    if (scope === "weekly") {
      const completedTopicIds = new Set((this.state.smartPlan.dailyPlans || []).filter(plan => plan.status === "completed").map(plan => plan.topicId).filter(Boolean));
      return all.filter(question => completedTopicIds.has(question.topicId) || question.chapterId === daily.chapterId || question.lessonId === daily.topicId || question.unitId === daily.chapterId);
    }
    if (daily.topicId) return this.getQuestionsForTopic(daily.topicId, daily.chapterId).slice(0, 10);
    return all.slice(0, 10);
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
    return (this.state.smartPlan.reviewTasks || []).filter(task => task.status !== "completed");
  }
}
