.PHONY: help secrets-check judge-path-smoke backend-test frontend-test frontend-build test docker-config demo-up demo-down demo-smoke

COMPOSE_ENV_FILE := $(shell [ -f .env.local ] && printf '%s' '--env-file .env.local' || true)
CARECALL_BACKEND_API_TOKEN_FROM_ENV := $(shell [ -f .env.local ] && sed -n 's/^CARECALL_BACKEND_API_TOKEN=//p' .env.local | tail -n 1 || true)
CARECALL_SMOKE_TOKEN ?= $(if $(CARECALL_BACKEND_API_TOKEN_FROM_ENV),$(CARECALL_BACKEND_API_TOKEN_FROM_ENV),carecall-local-backend-token)

help:
	@printf '%s\n' 'Care Call AI public demo commands:'
	@printf '%s\n' '  make secrets-check       Scan tracked files for tokens and real phone numbers'
	@printf '%s\n' '  make judge-path-smoke    No-call smoke check against deployed frontend/backend'
	@printf '%s\n' '  make test                Run safety, backend, frontend, and build checks'
	@printf '%s\n' '  make backend-test        Run Python backend tests'
	@printf '%s\n' '  make frontend-test       Run frontend Vitest suite'
	@printf '%s\n' '  make frontend-build      Build the Next.js frontend'
	@printf '%s\n' '  make docker-config       Validate demo Docker compose config'
	@printf '%s\n' '  make demo-up             Start backend Docker service on port 8000'
	@printf '%s\n' '  make demo-smoke          Check demo URLs after make demo-up'
	@printf '%s\n' '  make demo-down           Stop the demo stack'

backend-test:
	PYTHONPATH=backend python3 -m unittest discover backend/tests

secrets-check:
	python3 scripts/secrets_check.py

judge-path-smoke:
	python3 scripts/judge_path_smoke.py

frontend-test:
	npm --prefix frontend test -- --run

frontend-build:
	npm --prefix frontend run build

test: secrets-check backend-test frontend-test frontend-build

docker-config:
	docker compose $(COMPOSE_ENV_FILE) -f docker-compose.dev.yml config

demo-up:
	CARECALL_BACKEND_HOST_PORT=8000 docker compose $(COMPOSE_ENV_FILE) -f docker-compose.dev.yml up backend --build

demo-down:
	docker compose $(COMPOSE_ENV_FILE) -f docker-compose.dev.yml down

demo-smoke:
	curl -fsS http://127.0.0.1:8000/health >/dev/null
	curl -fsS -H "Authorization: Bearer $(CARECALL_SMOKE_TOKEN)" http://127.0.0.1:8000/api/dashboard >/dev/null
	@printf '%s\n' 'Care Call AI public backend smoke passed on port 8000.'
