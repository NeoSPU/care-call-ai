ifneq (,$(wildcard .env))
include .env
export
endif

.PHONY: help secrets-check final-readiness backend-test frontend-test frontend-build frontend-deps test docker-config demo-up demo-down demo-smoke demo-auth-smoke

help:
	@printf '%s\n' 'Care Call AI public demo commands:'
	@printf '%s\n' '  make secrets-check       Scan tracked files for tokens and real phone numbers'
	@printf '%s\n' '  make final-readiness     Run public no-call final demo readiness checks'
	@printf '%s\n' '  make test                Run safety, backend, frontend, and build checks'
	@printf '%s\n' '  make backend-test        Run Python backend tests'
	@printf '%s\n' '  make frontend-test       Run frontend Vitest suite'
	@printf '%s\n' '  make frontend-build      Build the Next.js frontend'
	@printf '%s\n' '  make docker-config       Validate demo Docker compose config'
	@printf '%s\n' '  make demo-up             Start backend API in Docker on port 8000'
	@printf '%s\n' '  python3 scripts/run_frontend_from_env.py  Start frontend locally on port 3000'
	@printf '%s\n' '  make demo-smoke          Check demo URLs after make demo-up'
	@printf '%s\n' '  make demo-auth-smoke     Check local login and protected frontend API proxy'
	@printf '%s\n' '  make demo-down           Stop the demo stack'

backend-test:
	PYTHONPATH=backend python3 -m unittest discover backend/tests

secrets-check:
	python3 scripts/secrets_check.py

final-readiness:
	python3 scripts/final_readiness_check.py

frontend-test:
	npm --prefix frontend test -- --run

frontend-build:
	npm --prefix frontend run build

frontend-deps:
	@if [ ! -d frontend/node_modules ]; then \
		printf '%s\n' 'Installing frontend dependencies...'; \
		npm --prefix frontend ci --no-audit --no-fund; \
	fi

test: secrets-check final-readiness backend-test frontend-test frontend-build

docker-config:
	docker compose -f docker-compose.dev.yml config

demo-up:
	docker compose -f docker-compose.dev.yml up -d --build backend

demo-down:
	docker compose -f docker-compose.dev.yml down

demo-smoke:
	curl -fsS http://127.0.0.1:8000/health >/dev/null
	curl -fsS -H "Authorization: Bearer $${CARECALL_BACKEND_API_TOKEN:-carecall-local-backend-token}" http://127.0.0.1:8000/preflight >/dev/null
	curl -fsSI http://127.0.0.1:3000/dashboard >/dev/null
	curl -fsSI http://127.0.0.1:3000/dashboard/preflight >/dev/null
	curl -fsSI http://127.0.0.1:3000/dashboard/orders/print >/dev/null
	@printf '%s\n' 'Care Call AI demo smoke passed on frontend 3000 and backend 8000.'

demo-auth-smoke:
	@cookie_file="$${TMPDIR:-/tmp}/carecall-auth-smoke.cookies"; \
	curl -fsSI http://127.0.0.1:3000/login >/dev/null; \
	curl -sSI http://127.0.0.1:3000/api/carecall/api/dashboard | grep -q '307 Temporary Redirect'; \
	curl -fsS -c "$$cookie_file" \
		-d "username=$${CARECALL_OPERATOR_USERNAME:-carecall-coordinator}&password=$${CARECALL_OPERATOR_PASSWORD:-carecall-demo-password}&next=/dashboard" \
		http://127.0.0.1:3000/api/auth/login >/dev/null; \
	curl -fsS -b "$$cookie_file" http://127.0.0.1:3000/api/carecall/api/dashboard >/dev/null; \
	printf '%s\n' 'Care Call AI auth smoke passed: login cookie and frontend API proxy are working.'
