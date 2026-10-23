نسخة تجريبية عربية (قراءة فقط) — Church Attendance

1) افتح Supabase Dashboard > Project Settings > API (أو Connect > API Keys حسب إصدار لوحة التحكم).
2) انسخ Project URL وPublishable key (أو anon public key فقط).
3) افتح config.js باستخدام Notepad وضع القيمتين مكان YOUR_PROJECT_REF وYOUR_PUBLISHABLE_OR_ANON_KEY.
4) لا تضع أبداً service_role أو secret key في الملفات.
5) ارفع الملفات الخمسة إلى GitHub Repository خاص بالمشروع، ثم Settings > Pages > Deploy from a branch > main / root.
6) افتح رابط GitHub Pages وسجل دخولك بحساب Supabase Auth الموجود مسبقاً.
7) الصفحات الحالية: تسجيل الدخول، عرض الأطفال، عرض الحضور. تقرير البصمات غير المسجلة وإدارة الحسابات والتعديل ستحتاج Backend آمن قبل تفعيلها.

تنبيهات:
- صلاحيات القراءة الفعلية تعتمد على GRANTS وRLS الموجودة في Supabase. لا تنشر التطبيق لمستخدمين حقيقيين قبل اختبارات الصلاحيات النهائية.
- USERINFO: قد تكون قراءة الأعمدة مقيدة كما تم إعدادها سابقاً؛ تظهر رسالة خطأ إذا لم تسمح قاعدة البيانات بذلك.
- يُفضّل تفعيل HTTPS على GitHub Pages (مفعل افتراضياً).
- لا ترفع ملفات CSV أو Excel الخاصة بالأطفال إلى GitHub.
