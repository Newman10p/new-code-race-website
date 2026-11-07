FROM python:3.12-slim

WORKDIR /srv/ai-gateway

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Volume mount point for the SQLite usage DB (USAGE_DB_PATH=/data/usage.db).
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 8000
# --workers 1 keeps the in-memory rate limiter + SQLite single-writer; if you
# scale horizontally set REDIS_URL so all workers share the rate-limit state.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
