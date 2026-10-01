# راهنمای دیپلوی روی Liara (ایران)

این پروژه با **یک ایمیج داکر** روی Liara بالا می‌آید: هم بک‌اند (Django + ASGI)، هم فرانت (React)، هم WebSocket — همه روی **یک پورت**.

```
                       https://<app>.liara.run
                                  │
                    ┌─────────────▼──────────────┐
                    │  daphne (ASGI)  :8000       │
                    │  ├── /api/*     DRF        │
   قالب اجرا  ───►  │  ├── /gateway/* API key    │
   (Dockerfile)     │  ├── /ws/logs/*  Channels   │
                    │  └── /*          React SPA  │
                    └───┬──────────────┬─────────┘
                   PostgreSQL       Redis (اختیاری ولی توصیه‌شده)
```

---

## گام ۱ — نصب Liara CLI

```bash
npm install -g @liara/cli
liara login          # با ایمیل ایرانی وارد شو
liara whoami         # بررسی لاگین
```

## گام ۲ — ساخت اپلیکیشن

از داخل ریشه‌ی مخزن (همان پوشه‌ای که `liara.json` دارد):

```bash
liara create apiforge --platform docker --port 8000
```

> اگر قبلاً اپ ساخته‌ای، این گام را رد کن. دقت کن که دستور از **ریشه‌ی پروژه** اجرا شود.

## گام ۳ — دیتابیس و Redis

```bash
# دیتابیس PostgreSQL (پلن رایگان Liara)
liara db create apiforge-db --plan g5
liara db env apiforge-db            # رشتهٔ اتصال را چاپ می‌کند

# Redis برای rate-limit مشترک بین workerها و WebSocket
liara redis create apiforge-redis --plan g5
liara redis env apiforge-redis
```

خروجی هر دستور چیزی شبیه این است:

```
postgresql://USER:PASSWORD@db-xxx.iran.liara.run:5432/apiforge_db
redis://rediss://:PASSWORD@redis-xxx.iran.liara.run:6379
```

## گام ۴ — تنظیم متغیرهای محیطی

کلیدهای تصادفی بساز (بدون فاصله و کوتاه نباشد):

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"   # DJANGO_SECRET_KEY
python -c "import secrets; print(secrets.token_urlsafe(24))"   # POSTGRES_PASSWORD
```

سپس:

```bash
liara env set \
  DJANGO_SETTINGS_MODULE=config.settings.production \
  DJANGO_DEBUG=false \
  DJANGO_SECRET_KEY="<کلید-تصادفی-تولیدشده>" \
  DJANGO_ALLOWED_HOSTS="*.liara.run,liara.run,<دامنه-شما>" \
  DJANGO_CSRF_TRUSTED_ORIGINS="https://<app>.liara.run" \
  CORS_ALLOWED_ORIGINS="https://<app>.liara.run" \
  DATABASE_URL="<رشته-اتصال-پستگرس>" \
  REDIS_URL="<آدرس-ردیس>" \
  GATEWAY_BASE_URL="https://<app>.liara.run" \
  SERVE_SPA=true \
  RUN_MIGRATIONS=true \
  ALLOW_PRIVATE_UPSTREAM=false

liara env list          # بررسی
```

> اگر از `DATABASE_URL` استفاده نمی‌کنی، به‌جای آن
> `POSTGRES_HOST / POSTGRES_PORT / POSTGRES_DB / POSTGRES_USER / POSTGRES_PASSWORD`
> را ست کن — هر دو حالت در `config/settings/base.py` پشتیبانی می‌شود.

## گام ۵ — دیپلوی

```bash
liara deploy --platform docker --port 8000 --app apiforge
```

بعد از چند دقیقه (بیلد Node + نصب پکیج‌های پایتون) آدرس می‌گیری:

```
https://apiforge.liara.run
```

- رابط کاربری: <https://apiforge.liara.run>
- مستندات Swagger: <https://apiforge.liara.run/api/docs/>
- بررسی سلامت: <https://apiforge.liara.run/api/health/>

## گام ۶ — داده‌ی نمونه و ادمین

```bash
liara ssh --app apiforge            # اگر پلن شما SSH دارد

python manage.py createsuperuser
python manage.py seed_demo           # کاربر demo@apiforge.dev / DemoPass!234
```

اگر SSH نداشتی، یک‌بار این متغیرها را ست کن و دوباره دیپلوی کن (بعد از آن می‌توانی حذفشان کنی):

```bash
liara env set CREATE_SUPERUSER=true DJANGO_SUPERUSER_PASSWORD="<رمز-قوی>" SEED_DEMO=true
liara deploy --platform docker --port 8000 --app apiforge
```

## گام ۷ — دامنهٔ .ir

```bash
liara domain add apiforge.ir                    # پس از خرید/ اتصال DNS
liara domain verify apiforge.ir
```

پس از فعال شدن دامنه:

```bash
liara env set \
  DJANGO_ALLOWED_HOSTS="apiforge.ir,www.apiforge.ir,*.liara.run" \
  DJANGO_CSRF_TRUSTED_ORIGINS="https://apiforge.ir,https://www.apiforge.ir" \
  CORS_ALLOWED_ORIGINS="https://apiforge.ir,https://www.apiforge.ir" \
  GATEWAY_BASE_URL="https://apiforge.ir"
liara deploy --platform docker --port 8000 --app apiforge
```

رکورد DNS مورد نیاز (راهنمای Liara برای دامنهٔ ایرانی):

| نوع | نام | مقدار |
|---|---|---|
| `CNAME` | `@` | `cname.liara.zone` |
| `CNAME` | `www` | `cname.liara.zone` |

> گواهی SSL به‌صورت خودکار توسط Liara صادر می‌شود؛ نیازی به Let's Encrypt دستی نیست.

---

## استقرار خودکار با GitHub Actions

بعد از push کردن مخزن به گیت‌هاب، می‌توانی دیپلوی را خودکار کنی. در **Settings → Secrets** این‌ها را اضافه کن:

| Secret | مقدار |
|---|---|
| `LIARA_API_KEY` | از `liara token` |
| `LIARA_APP_ID` | شناسهٔ اپلیکیشن (از `liara apps` یا پنل لیارا) |
| `LIARA_REGION` | `iran` |

و فایل `.github/workflows/deploy-liara.yml` را از این مخزن بردار — روی push به شاخهٔ `main` دیپلوی می‌کند.

---

## عیب‌یابی

| مشکل | راه‌حل |
|---|---|
| `DisallowedHost` | `DJANGO_ALLOWED_HOSTS` را با دامنه‌ی واقعی به‌روز کن |
| `400 Bad Request` روی لاگین | `DJANGO_CSRF_TRUSTED_ORIGINS` و `CORS_ALLOWED_ORIGINS` |
| دیتابیس وصل نمی‌شود | رشتهٔ اتصال را با `liara db env <name>` دوباره بگیر و در `DATABASE_URL` بگذار |
| WebSocket وصل نمی‌شود | معمولاً `REDIS_URL` تنظیم نشده؛ در آن صورت channel layer در حافظهٔ هر worker است و با چند worker رویدادها گم می‌شوند |
| صفحه‌ی سفید / `503 frontend bundle is missing` | بیلد فرانت شکست خورده؛ `liara logs --app apiforge` را ببین |
| خطای `no matching distribution` در بیلد | نسخهٔ پایتون یا پکیج‌ها را بررسی کن (`backend/requirements.txt`) |
| می‌خواهم لاگ‌ها را ببینم | `liara logs --app apiforge --follow` |

اجرای محلی همان ایمیج برای اطمینان قبل از دیپلوی:

```bash
docker build -t apiforge .
docker run --rm -p 8000:8000 \
  -e SERVE_SPA=true \
  -e DJANGO_ALLOWED_HOSTS='*' \
  apiforge
```

## نکته‌های عملی برای ایران

- **پلن رایگان Liara** برای این پروژه کافی است: ۳ پروژه، دیتابیس کوچک و ترافیک کم.
- **CDN خارجی** در README پروژه لازم نیست؛ اگر خواستی دارایی‌های استاتیک را از Liara CDN سرو کنی، `WHITENOISE_ROOT` را به مسیر دیست نگه دار (پیش‌فرض همین کار را می‌کند).
- **کش**: چون SQLite/PostgreSQL ایران است و کاربر هم داخل ایران، تأخیر شبکه ناچیز است؛ به همین دلیل rate-limit روی Redis (هم‌دیتاسنتر) نگه داشته شده.
