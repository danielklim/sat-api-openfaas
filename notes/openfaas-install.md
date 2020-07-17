# OpenFaaS Installation & Usage

## Installation

For the most part, installation proceeds per the [official deploy-to-k8s guide](https://docs.openfaas.com/deployment/kubernetes/).

##### Requirements

- Working k8s cluster (e.g. Docker Desktop with k8s enabled)
- [Helm 3](https://helm.sh/docs/intro/install/)

### Install 'arkade' and 'faas-cli'

```bash
curl -sL https://cli.openfaas.com | sudo sh
curl -SLsf https://dl.get-arkade.dev/ | sudo sh
```

### Deploy openfaas to the k8s cluster

The one important argument not mentioned in the stock documents is `--function-pull-policy IfNotPresent`. Without this argument, k8s will attempt to pull images from a remote container repo (Dockerhub by default) everytime you deploy, which means you *must* push your application container any time you make changes to the application, which is problematic when large numbers of changes are being made and tested, such as during development. Adding this argument allows k8s to use local images, which means you can just build the Docker image locally and immediately deploy.

```bash
arkade install openfaas --function-pull-policy IfNotPresent
```

Get the login password for the web-ui:

```bash
kubectl get secret -n openfaas basic-auth -o jsonpath="{.data.basic-auth-password}" | base64 --decode;
```

Next deviation from the stock docs: deploy k8s ingresses so the openfaas deployment is accessible at `localhost` without using kubectl port-forwarding. Notes that this uses the 'ingress-nginx' helm chart maintained by the kubernetes team, NOT the one from the nginx team, which uses completely different annotation syntax:

```bash
# relative to repo root
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install k8s-nginx ingress-nginx/ingress-nginx
kubectl apply -f manifests/ingress.yml
```

Finally, authenticate faas-cli with the server so you can run CLI commands against the openfaas deployment. This must be run after the ingresses are deployed:

```bash
PASSWORD=$(kubectl get secret -n openfaas basic-auth -o jsonpath="{.data.basic-auth-password}" | base64 --decode; echo)
echo -n $PASSWORD | faas-cli login --gateway http://localhost --username admin --password-stdin
```

At this point, your openfaas deployment is ready to use. You should be able to:

1. login to the web-ui at [http://localhost](http://localhost) as `admin:[password from earlier]` (assuming nothing else is bound to port 80)
2. run faas-cli commands such as `faas-cli version`

If anything goes wrong or you wish to change settings, use the following to clear the openfaas install and restart fresh.

```bash
kubectl delete all --all -n openfaas
kubectl delete all --all -n openfaas-fn
```

## References

### nginx-ingress

- [Differences between nginxinc/kubernetes-ingress (bad) and kubernetes/ingress-nginx (good)](https://github.com/nginxinc/kubernetes-ingress/blob/master/docs/nginx-ingress-controllers.md)
- [ingress-nginx repo](https://github.com/kubernetes/ingress-nginx/)
- [ingress-nginx path matching](https://kubernetes.github.io/ingress-nginx/user-guide/ingress-path-matching/)
- [ingress-nginx rewrite](https://kubernetes.github.io/ingress-nginx/examples/rewrite/)
- [ingress-nginx annotations](https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/annotations/)