.PHONY: help install install-backend install-frontend migrate run-backend run-frontend \
        test lint format seed superuser build up down logs spa-build serve-spa liara-deploy

PYTHON  ?= python3
BACKEND := backend
FRONTEND := frontend

help:
	@echo "APIForge — commands:"
	@echo "  make install        install backend + frontend deps"
	@echo "  make migrate        apply DB migrations"
	@echo "  make run-backend    Django ASGI server on :8000"
	@echo "  make run-frontend   Vite dev server on :5173"
	@echo "  make serve-spa      build the SPA and serve everything from :8000"
	@echo "  make test           pytest + ruff + tsc"
	@echo "  make seed           load demo data (user/projects/logs)"
	@echo "  make up | down      docker compose lifecycle"
	@echo "  make liara-deploy   build & deploy the single image to Liara"

install: install-backend install-frontend

install-backend:
	$(PYTHON) -m venv $(BACKEND)/.venv
	$(BACKEND)/.venv/bin/pip install --upgrade pip
	$(BACKEND)/.venv/bin/pip install -r $(BACKEND)/requirements-dev.txt

install-frontend:
	cd $(FRONTEND) && npm install

migrate:
	cd $(BACKEND) && .venv/bin/python manage.py migrate

run-backend:
	cd $(BACKEND) && .venv/bin/python manage.py runserver 0.0.0.0:8000

run-frontend:
	cd $(FRONTEND) && npm run dev

test:
	cd $(BACKEND) && .venv/bin/python -m pytest -q
	cd $(BACKEND) && .venv/bin/ruff check .
	cd $(FRONTEND) && npm run build

lint:
	cd $(BACKEND) && .venv/bin/ruff check .
	cd $(FRONTEND) && npm run typecheck

format:
	cd $(BACKEND) && .venv/bin/ruff check --fix .
	cd $(BACKEND) && .venv/bin/ruff format .

seed:
	cd $(BACKEND) && .venv/bin/python manage.py seed_demo

superuser:
	cd $(BACKEND) && .venv/bin/python manage.py createsuperuser

build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

spa-build:
	cd $(FRONTEND) && npm run build
	rm -rf $(BACKEND)/static/spa
	mkdir -p $(BACKEND)/static/spa
	cp -r $(FRONTEND)/dist/* $(BACKEND)/static/spa/

serve-spa:                 ## run Django as if it were the production image
	$(MAKE) spa-build
	cd $(BACKEND) && SERVE_SPA=true .venv/bin/python manage.py runserver 8000

liara-deploy:              ## build & deploy the single image to Liara
	liara deploy --platform docker --port 8000 --app apiforge
