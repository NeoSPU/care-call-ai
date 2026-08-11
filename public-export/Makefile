.PHONY: help secrets-check final-readiness public-export-check backend-test frontend-test frontend-build test docker-config demo-up demo-live-up demo-live-max-up demo-down demo-smoke demo-auth-smoke

help:
	@printf '%s\n' 'Care Call AI public demo commands:'
	@printf '%s\n' '  make secrets-check       Scan tracked files for tokens and real phone numbers'
	@printf '%s\n' '  make final-readiness     Run public no-call final demo readiness checks'
	@printf '%s\n' '  make public-export-check Validate sanitized public repo export policy'
	@printf '%s\n' '  make test                Run safety, backend, frontend, and build checks'
	@printf '%s\n' '  make backend-test        Run Python backend tests'
	@printf '%s\n' '  make frontend-test       Run frontend Vitest suite'
	@printf '%s\n' '  make frontend-build      Build the Next.js frontend'
	@printf '%s\n' '  make docker-config       Validate demo Docker compose config'
	@printf '%s\n' '  make demo-up             Start demo stack on frontend 3001 and backend 8001'
	@printf '%s\n' '  make demo-live-up        Start demo stack with live CALL-E enabled after explicit ACK'
	@printf '%s\n' '  make demo-live-max-up    Start live stack only when Max phone and ACK are set'
	@printf '%s\n' '  make demo-smoke          Check demo URLs after make demo-up'
	@printf '%s\n' '  make demo-auth-smoke     Check local login and protected frontend API proxy'
	@printf '%s\n' '  make demo-down           Stop the demo stack'

backend-test:
	PYTHONPATH=backend python3 -m unittest discover backend/tests

secrets-check:
	python3 scripts/secrets_check.py

final-readiness:
	CARECALL_READINESS_PROFILE=public python3 scripts/final_readiness_check.py

public-export-check:
	python3 scripts/public_export_check.py

frontend-test:
	npm --prefix frontend test -- --run

frontend-build:
	npm --prefix frontend run build

test: secrets-check final-readiness backend-test frontend-test frontend-build

docker-config:
	docker compose -f docker-compose.dev.yml config

demo-up:
	docker compose -f docker-compose.dev.yml up --build

demo-live-up:
	@if [ "$(LIVE_DEMO_ACK)" != "EXECUTE_LIVE_CALLS" ]; then \
		printf '%s\n' 'Refusing to start live-enabled backend.'; \
		printf '%s\n' 'Use only for the final approved demo call:'; \
		printf '%s\n' '  LIVE_DEMO_ACK=EXECUTE_LIVE_CALLS make demo-live-up'; \
		exit 2; \
	fi
	CARECALL_LIVE_CALLS_ENABLED=true CARECALL_MAX_LIVE_BATCH_SIZE=1 docker compose -f docker-compose.dev.yml up --build

demo-live-max-up:
	@if [ "$(LIVE_DEMO_ACK)" != "EXECUTE_LIVE_CALLS" ]; then \
		printf '%s\n' 'Refusing to start Max Neous live demo.'; \
		printf '%s\n' 'Use only for the final approved demo call:'; \
		printf '%s\n' '  CARECALL_DEMO_MAX_PHONE=+44... LIVE_DEMO_ACK=EXECUTE_LIVE_CALLS make demo-live-max-up'; \
		exit 2; \
	fi
	@if [ -z "$(CARECALL_DEMO_MAX_PHONE)" ]; then \
		printf '%s\n' 'Refusing to start Max Neous live demo without CARECALL_DEMO_MAX_PHONE.'; \
		printf '%s\n' 'Supply the approved local-only phone number in the shell:'; \
		printf '%s\n' '  CARECALL_DEMO_MAX_PHONE=+44... LIVE_DEMO_ACK=EXECUTE_LIVE_CALLS make demo-live-max-up'; \
		exit 2; \
	fi
	CARECALL_DEMO_MAX_PHONE="$(CARECALL_DEMO_MAX_PHONE)" CARECALL_LIVE_CALLS_ENABLED=true CARECALL_MAX_LIVE_BATCH_SIZE=1 docker compose -f docker-compose.dev.yml up --build

demo-down:
	docker compose -f docker-compose.dev.yml down

demo-smoke:
	curl -fsS http://127.0.0.1:8001/health >/dev/null
	curl -fsS -H "Authorization: Bearer $${CARECALL_BACKEND_API_TOKEN:-carecall-local-backend-token}" http://127.0.0.1:8001/preflight >/dev/null
	curl -fsSI http://127.0.0.1:3001/dashboard >/dev/null
	curl -fsSI http://127.0.0.1:3001/dashboard/preflight >/dev/null
	curl -fsSI http://127.0.0.1:3001/dashboard/orders/print >/dev/null
	@printf '%s\n' 'Care Call AI demo smoke passed on frontend 3001 and backend 8001.'

demo-auth-smoke:
	@cookie_file="$${TMPDIR:-/tmp}/carecall-auth-smoke.cookies"; \
	curl -fsSI http://127.0.0.1:3001/login >/dev/null; \
	curl -sSI http://127.0.0.1:3001/api/carecall/api/dashboard | grep -q '307 Temporary Redirect'; \
	curl -fsS -c "$$cookie_file" \
		-d "username=$${CARECALL_OPERATOR_USERNAME:-carecall-coordinator}&password=$${CARECALL_OPERATOR_PASSWORD:-carecall-demo-password}&next=/dashboard" \
		http://127.0.0.1:3001/api/auth/login >/dev/null; \
	curl -fsS -b "$$cookie_file" http://127.0.0.1:3001/api/carecall/api/dashboard >/dev/null; \
	printf '%s\n' 'Care Call AI auth smoke passed: login cookie and frontend API proxy are working.'
