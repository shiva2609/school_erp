"""
Django settings for School ERP backend.
Base settings — shared between local and production.
"""

import os
from pathlib import Path
from datetime import timedelta

from corsheaders.defaults import default_headers

# Build paths inside the project like this: BASE_DIR / 'subdir'.
# Note: BASE_DIR points to the 'backend/' directory (two levels up from this file now)
BASE_DIR = Path(__file__).resolve().parent.parent.parent


# ─── Application Definition ────────────────────────────────────

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt.token_blacklist',  # B8: Token blacklisting
    'corsheaders',
    'tenants',
    'accounts',
    'students',
    'attendance',
    'timetable',
    'fees',
    'expenses',
    'homework',
    'notifications',
    'announcements',
    'reports',
    'staff',
    'transport',
    'academics',
    'inventory',
    'library',
    'document_templates',
    'storages',
]

AUTH_USER_MODEL = 'accounts.User'

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'tenants.middleware.TenantMiddleware',  # F1: Tenant isolation
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# ─── Password Validation ───────────────────────────────────────

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]


# ─── Internationalization ──────────────────────────────────────

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Kolkata'
USE_I18N = True
USE_TZ = True


# ─── Static & Media Files ──────────────────────────────────────
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# ─── REST Framework ────────────────────────────────────────────

REST_FRAMEWORK = {
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle'
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '1000/day',
        'user': '10000/day',
        'login': '5/m',
        'password_reset': '10/h',
    },
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'accounts.authentication.CookieJWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
}


# ─── JWT ────────────────────────────────────────────────────────

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,  # B8: Auto-blacklist old refresh tokens
    'AUTH_COOKIE': 'access_token',
    'AUTH_COOKIE_REFRESH': 'refresh_token',
    'AUTH_COOKIE_HTTP_ONLY': True,
    'AUTH_COOKIE_PATH': '/',
    'AUTH_COOKIE_SAMESITE': 'Lax',
}


# ─── CORS ───────────────────────────────────────────────────────

CORS_ALLOWED_ORIGINS = os.environ.get(
    'CORS_ALLOWED_ORIGINS', 'http://localhost:3000'
).split(',')
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = (*default_headers, 'x-school-origin-host')

CSRF_TRUSTED_ORIGINS = os.environ.get(
    'CSRF_TRUSTED_ORIGINS', 'http://localhost:3000'
).split(',')
CSRF_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_HTTP_ONLY = False  # Allowed for frontend to read CSRF token


# ─── Online payments (Razorpay) — optional; disabled unless flag + keys are set ───
# When ready: set ONLINE_PAYMENTS_ENABLED=true and provide key id/secret; configure
# the same webhook URL in Razorpay Dashboard → Webhooks.
ONLINE_PAYMENTS_ENABLED = os.environ.get('ONLINE_PAYMENTS_ENABLED', '').lower() in (
    '1', 'true', 'yes',
)
RAZORPAY_KEY_ID = os.environ.get('RAZORPAY_KEY_ID', '').strip()
RAZORPAY_KEY_SECRET = os.environ.get('RAZORPAY_KEY_SECRET', '').strip()
RAZORPAY_WEBHOOK_SECRET = os.environ.get('RAZORPAY_WEBHOOK_SECRET', '').strip()

# Django admin (/admin/): default on for local dev; production settings override to off unless explicitly enabled.
DJANGO_ADMIN_ENABLED = os.environ.get('DJANGO_ADMIN_ENABLED', 'true').lower() in (
    '1', 'true', 'yes',
)

# CSV student import — max upload size (bytes)
STUDENT_CSV_IMPORT_MAX_BYTES = int(os.environ.get('STUDENT_CSV_IMPORT_MAX_BYTES', str(5 * 1024 * 1024)))

# Password reset emails (configure EMAIL_* in production)
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'webmaster@localhost')
FRONTEND_BASE_URL = os.environ.get('FRONTEND_BASE_URL', 'http://localhost:3000').rstrip('/')
FRONTEND_PASSWORD_RESET_PATH = os.environ.get('FRONTEND_PASSWORD_RESET_PATH', '/reset-password')

# When True, signed-in users with a tenant must use a hostname that matches a tenants.Domain row for that tenant.
TENANT_HOST_ENFORCEMENT = os.environ.get('TENANT_HOST_ENFORCEMENT', 'true').lower() in (
    '1', 'true', 'yes',
)
# When API is on a different host than the Next.js app, the browser sends X-School-Origin-Host; use it for Domain checks.
TENANT_TRUST_ORIGIN_HOST_HEADER = os.environ.get('TENANT_TRUST_ORIGIN_HOST_HEADER', 'true').lower() in (
    '1', 'true', 'yes',
)
# Signed MFA login challenge (seconds).
MFA_CHALLENGE_MAX_AGE = int(os.environ.get('MFA_CHALLENGE_MAX_AGE', '600'))
MFA_ISSUER_NAME = os.environ.get('MFA_ISSUER_NAME', 'School ERP')

# Optional: restrict homework attachment URLs to these hosts (lowercase), e.g. "cdn.example.com,your-bucket.s3.amazonaws.com"
_raw_hosts = os.environ.get('HOMEWORK_ATTACHMENT_ALLOWED_HOSTS', '').strip()
HOMEWORK_ATTACHMENT_ALLOWED_HOSTS = [
    h.strip().lower() for h in _raw_hosts.split(',') if h.strip()
] or None


# ─── Logging ────────────────────────────────────────────────────

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{asctime} {levelname} {name} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'loggers': {
        'django': {'handlers': ['console'], 'level': 'WARNING'},
        'accounts': {'handlers': ['console'], 'level': 'INFO'},
        'fees': {'handlers': ['console'], 'level': 'INFO'},
        'students': {'handlers': ['console'], 'level': 'INFO'},
        'tenants': {'handlers': ['console'], 'level': 'INFO'},
    },
}

# ─── Celery ─────────────────────────────────────────────────────

CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', os.environ.get('REDIS_URL', 'redis://localhost:6379/0'))
CELERY_RESULT_BACKEND = os.environ.get('CELERY_RESULT_BACKEND', os.environ.get('REDIS_URL', 'redis://localhost:6379/0'))
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE

# Fix for DigitalOcean / Heroku managed secure Redis (rediss://)
if CELERY_BROKER_URL.startswith('rediss://'):
    CELERY_BROKER_USE_SSL = {'ssl_cert_reqs': 'none'}
    CELERY_REDIS_BACKEND_USE_SSL = {'ssl_cert_reqs': 'none'}

# Requires Celery Beat process: `celery -A config beat -l info`
from celery.schedules import crontab

CELERY_BEAT_SCHEDULE = {
    'automatic-fee-reminder-notifications': {
        'task': 'fees.tasks.automatic_fee_reminder_notifications',
        'schedule': crontab(day_of_month=1, hour=8, minute=30),
    },
    'publish-scheduled-announcements': {
        'task': 'announcements.tasks.publish_scheduled_announcements',
        'schedule': crontab(minute='*/5'),
    },
}
