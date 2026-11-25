FROM python:3.13-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
COPY pyproject.toml ./
COPY noriva_worker ./noriva_worker
RUN pip install --no-cache-dir .
USER nobody
CMD ["noriva-worker"]
