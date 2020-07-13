# SAT-API Deployment to OpenFaaS

This repository provides an example deployment of [SAT-API](https://github.com/sat-utils/sat-api) to an [OpenFaaS](https://www.openfaas.com/) stack, allowing use of SAT-API in any environment with access to a [Kubernetes](https://kubernetes.io/) cluster.

## Background

[SAT-API](https://github.com/sat-utils/sat-api) is a reference implementation of the STAC API specification. It is designed to be run on a serverless infrastructure with an ElasticSearch backing, as seen in the reference deployment at [SAT-API Deployment](https://github.com/sat-utils/sat-api-deployment). That example is written specifically for use on AWS Lambda with the AWS Managed ElasticSearch service and AWS Fargate for long-running jobs. While this may work for many use cases, there are other use cases for which that set of infrastructure choices is not ideal. The most obvious is local development, where the developer does not wish to deploy anything to AWS.

This repository, therefore, provides all the code necessary to run a self-hosted OpenFaaS and ElasticSearch/Kibana stack making use of Docker and the Docker Desktop implementation of Kubernetes. It is assumed that the user is relatively familiar with Kubernetes, Docker, and ElasticSearch, though 3rd party guides are referenced where helpful.

## Versioning

A major complication in working with STAC is that it is an immature specification and has major breaking changes from minor to minor revision. For example, [Franklin](https://github.com/azavea/franklin) is an API implementation of the 1.0-beta version of STAC that will not work with versions <=0.7. Even development versions of SAT-API (>0.3) intended for versions >=0.8 will not work with older specs. This is a problem because many data sources on the Internet use versions 0.6 and 0.7 of the spec. And SAT-API is itself part of a [software ecosystem](https://github.com/sat-utils) with multiple interdependencies (e.g. the [SAT-STAC](https://github.com/sat-utils/sat-stac) library, the [SAT-Search](https://github.com/sat-utils/sat-search) client) that all reference each other and break across versions.

Further complicating the matter, SAT-API is currently written for use with ElasticSearch \~6 using out of date npm libraries (e.g. elasticsearch.js instead of @elastic/elasticsearch), which in turn are unable to interface with the mainline ElasticSearch API (version 7). And there are enough difference between ES6 and ES7 that updating is not a simple matter of substituting out the libraries.

The bottom-line is that because of tight version constraints, the versions of software used in the example stack presented herein should not be changed lightly because things *will* break and you will need to debug the app itself.

## Major Assumptions

- The application stack is deployed to OpenFaaS on top of a local Kubernetes cluster backed by Docker Desktop.
- ElasticSearch and Kibana are deployed locally using docker-compose. They are kept external to the k8s cluster for the sake of easily migrating the setup to a production environment similar to SAT-API Deployment.

## Roadmap

1. Install Docker Desktop and Kubernetes. [Docs](https://docs.docker.com/docker-for-windows/install/).
2. Install OpenFaaS. [Walkthrough/notes](./notes/openfaas-install.md).
3. Build and deploy SAT-API to OpenFaaS.
4. Set up ingresses to make application accessible.
5. (optional) Test using public STAC data 
