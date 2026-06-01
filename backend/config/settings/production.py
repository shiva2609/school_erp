"""
Production settings for DigitalOcean App Platform deployment.
Usage: DJANGO_SETTINGS_MODULE=config.settings.production

All secrets MUST come from environment variables.
This file will CRASH on startup if critical env vars are missing — this is intentional.
"""

import os
from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401,F403

import dj_database_url


# ─── Security ───────────────────────────────────────────────────
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY')
if not SECRET_KEY:
    raise ImproperlyConfigured(
        'DJANGO_SECRET_KEY environment variable is REQUIRED in production. '
        'Generate one with: python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"'
    )

DEBUG = False

# Disable Django admin by default in production (multi-tenant data exposure). Set DJANGO_ADMIN_ENABLED=true to enable.
DJANGO_ADMIN_ENABLED = os.environ.get('DJANGO_ADMIN_ENABLED', 'false').lower() in (
    '1', 'true', 'yes',
)

ALLOWED_HOSTS = os.environ.get(
    'DJANGO_ALLOWED_HOSTS', '*'
).split(',')


# ─── Database (DigitalOcean Managed PostgreSQL) ────────────────
DATABASES = {
    'default': dj_database_url.config(
        conn_max_age=600,
        conn_health_checks=True,
        ssl_require=True,
    )
}


# ─── Security Headers ──────────────────────────────────────────
SECURE_SSL_REDIRECT = os.environ.get('SECURE_SSL_REDIRECT', 'True') == 'True'
SECURE_HSTS_SECONDS = 31536000       # 1 year
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
X_FRAME_OPTIONS = 'DENY'

# JWT cookies must be secure and cross-domain in production
SIMPLE_JWT['AUTH_COOKIE_SECURE'] = True
SIMPLE_JWT['AUTH_COOKIE_SAMESITE'] = 'None'
SESSION_COOKIE_SAMESITE = 'None'
CSRF_COOKIE_SAMESITE = 'None'
# ─── Storage (DigitalOcean Spaces / S3) ────────────────────────
USE_S3 = os.environ.get('USE_S3', 'True') == 'True'

if USE_S3:
    AWS_ACCESS_KEY_ID = os.environ.get('AWS_ACCESS_KEY_ID')
    AWS_SECRET_ACCESS_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY')
    AWS_STORAGE_BUCKET_NAME = os.environ.get('AWS_STORAGE_BUCKET_NAME')
    AWS_S3_ENDPOINT_URL = os.environ.get('AWS_S3_ENDPOINT_URL')
    AWS_S3_REGION_NAME = os.environ.get('AWS_S3_REGION_NAME', 'blr1')
    AWS_S3_OBJECT_PARAMETERS = {'CacheControl': 'max-age=86400'}
    AWS_DEFAULT_ACL = 'private'  # CRITICAL: All files private by default
    AWS_QUERYSTRING_AUTH = True   # Generate signed URLs for private files
    AWS_QUERYSTRING_EXPIRE = 3600  # Signed URLs expire in 1 hour

    # Static files — served publicly via CDN
    AWS_LOCATION = 'static'
    STATIC_URL = f'{AWS_S3_ENDPOINT_URL}/{AWS_STORAGE_BUCKET_NAME}/{AWS_LOCATION}/'
    STORAGES = {
        'default': {
            'BACKEND': 'config.storage_backends.PrivateMediaStorage',
        },
        'staticfiles': {
            'BACKEND': 'config.storage_backends.PublicStaticStorage',
        },
    }

    # Media URL base (actual URLs will be signed)
    MEDIA_URL = f'{AWS_S3_ENDPOINT_URL}/{AWS_STORAGE_BUCKET_NAME}/media/'


# ─── Sentry Error Tracking (optional but recommended) ──────────
SENTRY_DSN = os.environ.get('SENTRY_DSN')
if SENTRY_DSN:
    import sentry_sdk

    def _sentry_before_send(event, hint):
        """Drop cookies from request payload to reduce session/CSRF leakage."""
        req = event.get('request')
        if isinstance(req, dict) and req.get('cookies'):
            req['cookies'] = '[redacted]'
        return event

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        traces_sample_rate=0.1,  # 10% of requests for performance monitoring
        profiles_sample_rate=0.1,
        send_default_pii=False,
        before_send=_sentry_before_send,
    )
