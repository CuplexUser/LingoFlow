# LibreTranslate for Google Cloud Run, used by the API for word lookups and by
# `npm run translate:language`. Deployed by .github/workflows/deploy-libretranslate.yml.
#
# The models are built into the image. The stock image downloads them on first start, and
# Cloud Run scales to zero, so every cold start would download them again.

FROM libretranslate/libretranslate:v1.9.6

# A model is installed for every pair of listed languages that Argos Translate has, so
# "en,es,ru" gives en<->es and en<->ru. To support another course, add its code
# (it, sv, fr, de), redeploy, and the API picks it up within an hour. Each language adds
# two models to the image and to memory; raise --memory if the service gets killed.
ARG LANGUAGES=en,es,ru
RUN ./venv/bin/python scripts/install_models.py --load_only_lang_codes "$LANGUAGES"

# LT_THREADS is the number of gunicorn worker processes, and each one loads every model,
# so one keeps memory down. Lookups are rare and cached by the API, so one is plenty.
ENV LT_LOAD_ONLY=$LANGUAGES \
    LT_UPDATE_MODELS=false \
    LT_THREADS=1 \
    LT_DISABLE_WEB_UI=true \
    LT_DISABLE_FILES_TRANSLATION=true

# The stock image listens on 5000; the deploy workflow sets Cloud Run's --port to match.
