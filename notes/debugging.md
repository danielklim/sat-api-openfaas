# Debugging openfaas functions

The key thing to remember when debugging openfaas functions is that they are just docker containers. This means that you can debug core functionality prior to deploying to openfaas/k8s like any other docker container.

## Debugging pre-deployment

A docker-compose file is provided at [docker/debug.docker-compose.yml](docker/debug.docker-compose.yml) to stand up debugging instances of the SAT-API api and ingest containers.

\[INCOMPLETE\]

## Debugging post-deployment

Debugging that must be done post-deployment to the cluster (e.g. I/O through the openfaas gateway) can be facilitated using the following snippets.

##### Info about the openfaas api gateway

```bash
kubectl describe svc -n openfaas -l component=gateway
```

\[INCOMPLETE\]


```bash
PODNAME=$(kubectl get pod -l faas_function=ingest -n openfaas-fn | grep ingest | awk '{print $1}')
```
