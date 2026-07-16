.PHONY: up down logs ps seed

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
