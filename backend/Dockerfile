FROM python:3.12-slim

WORKDIR /app

COPY backend /app/backend
COPY data /app/data

ENV PYTHONPATH=/app/backend
ENV CARECALL_BACKEND_PORT=8000
EXPOSE 8000

CMD ["python", "-m", "app.server"]
