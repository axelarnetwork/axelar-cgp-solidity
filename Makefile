.PHONY: docker-image
docker-image:
	@docker build -t axelar/ethereum-bridge .
