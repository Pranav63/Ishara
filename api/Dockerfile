FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 ISHARA_DB=/data/ishara.db
COPY pyproject.toml ./
COPY ishara ./ishara
RUN pip install --no-cache-dir .
VOLUME /data
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn --factory ishara.main:create_app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
