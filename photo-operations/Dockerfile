FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /worker
COPY photo-operations/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && python -c "from PIL import features; assert features.check('webp')"
COPY photo-operations/worker.py photo-operations/runner.py ./
USER 65532:65532
CMD ["python", "runner.py"]
