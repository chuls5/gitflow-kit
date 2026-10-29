.PHONY: verify hooks
# Runs every local check CI runs.
verify:
	./scripts/verify.sh

hooks:
	git config core.hooksPath .githooks && git config commit.template .gitmessage
