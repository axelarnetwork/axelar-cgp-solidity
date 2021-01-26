.PHONY: docker-image
docker-image:
	@docker build -t axelar/ethereum-bridge .

.PHONY: docker-ganache
docker-ganache:
	@docker build -t axelar/ganache-bridge -f ./Dockerfile-ganache .