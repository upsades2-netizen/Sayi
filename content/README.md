# Static study content

These files contain prepared book content only. Student progress must remain in `sayi-v1` under `subjectState`.

Each `data.json` may contain:

```json
{
  "schemaVersion": 1,
  "subjectId": "english",
  "title": "English",
  "units": [
    {
      "id": "unit-1",
      "title": "Unit 1",
      "lessons": [
        {
          "id": "lesson-1",
          "title": "Lesson title",
          "topics": [],
          "pages": {"from": 1, "to": 2},
          "items": [],
          "vocabulary": [],
          "grammar": [],
          "reading": [],
          "listening": [],
          "memorization": [],
          "exercises": [],
          "questions": []
        }
      ]
    }
  ],
  "questions": {
    "book": [],
    "exercises": [],
    "ministry": []
  }
}
```

Only verified ministry questions belong in `questions.ministry`. Empty arrays are intentional until real source content is added.
