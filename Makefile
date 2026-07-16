.PHONY: setup up down logs ps seed

setup:
	@[ -f .env ] || { cp .env.example .env; echo "created .env"; }
	@[ -f apps/api/.env ] || { cp apps/api/.env.example apps/api/.env; echo "created apps/api/.env"; }
	pnpm install:all

up:
	docker compose up -d --wait
	docker compose ps

down:
	docker compose down

logs:
	docker compose logs -f

ps:
	docker compose ps

seed:
	@echo "seed: not implemented yet (see M2-08)"
