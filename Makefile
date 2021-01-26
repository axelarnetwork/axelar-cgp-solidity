.PHONY: docker-image
docker-image:
	@docker build -t axelar/ethereum-bridge .

.PHONY: docker-image-ganache
docker-image-ganache:
	@docker build -t axelar/ganache-bridge -f ./Dockerfile-ganache .
