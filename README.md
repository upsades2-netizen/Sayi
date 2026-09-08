# Sayi

هذا مشروع ويب ثابت (HTML/CSS/JavaScript) لا يحتاج إلى Node.js أو Vite.

## التشغيل السريع

### Windows
1. افتح المجلد المشروع.
2. انقر نقرًا مزدوجًا على ملف start-local.bat
3. افتح المتصفح على:
   http://localhost:4173/index.html

### أو عبر موجه الأوامر
```bat
cd /path/to/Sayi
py -m http.server 4173
```
ثم افتح:
http://localhost:4173/index.html

## ملاحظات
- لا حاجة إلى npm أو Vite.
- المشروع يعمل كملفات ثابتة ويمكن نشره على GitHub Pages أو أي استضافة static.
- يجب فتحه عبر HTTP/HTTPS، وليس بالنقر على `index.html` مباشرة، حتى تعمل ES modules وIndexedDB وملفات PDF بثبات.

## مكتبة الكتب

من تبويب «الكتب» اختر «＋ إضافة كتاب». يقبل التطبيق ملفات PDF فقط، ويحفظ الملف محليًا في IndexedDB داخل المتصفح. لا يتم استخراج النص أو الفصول أو تشغيل OCR.

تظهر لكل كتاب أزرار «فتح» و«حذف»، ويفتح PDF داخل التطبيق باستخدام عارض المتصفح. ملفات الكتب ليست داخل مستودع المشروع ولا تحتاج إلى تعديل `app.js`.

## النشر

هذا مشروع static؛ ارفع الملفات الحالية كما هي إلى الاستضافة، مع الحفاظ على:

```text
index.html
app.js
store.js
styles.css
smart-study-plan.js
subject-study-engine.js
saai-logo.svg
content/
```

يجب أن يكون رابط النشر موجهاً إلى `index.html` أو إلى جذر المشروع. تخزين الكتب في IndexedDB خاص بكل متصفح وجهاز، لذلك لا تنتقل الكتب المضافة محليًا إلى جهاز آخر.
