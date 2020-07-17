# Deploy to AWS EKS

One major benefit of this stack is that it can be deployed with minimal changes to any Kubernetes environment (provided there are sufficient cluster resources) ranging from bare-metal minikube and Docker Desktop k8s to managed, cloud-based solutions (e.g. GCP, EKS, DigitalOcean). 

This document provides a partial walkthrough for deploying to Amazon EKS. It will reference the steps involved in deploying locally for many steps, then elaborate on the deltas specific to EKS (i.e. you will need to refer to other docs in this repo). Additionally, you should refer to the official [deploy guide](https://aws.amazon.com/blogs/opensource/deploy-openfaas-aws-eks/) for elaboration on some of these steps.

## High-level differences from a dev environment

The biggest differences have to do with (1) networking and security; and (2) provisioning the AWS specific versions of local infrastructure (e.g. ECR, Manged ElasticSearch). In the first regard, while OpenFaaS comes with some basic security enabled, there are obvious things you will need to configure yourself (e.g. don't make the control plane public). 

At a high level, the additional steps here are:

- Install OpenFaaS and nginx-ingress
- (optional) Setup EKS cluster autoscaling
- Configure AWS ELB in lieu of the local "loadbalancer"
- Configure ingresses to interact properly with the AWS ELB for our use case
- Set up whitelists in the ingress for the OpenFaaS control plane
- Set up SSH tunnel to enable use of secured OpenFaaS control plane
- Set up SSH tunnel to interact with the remote Kibana console
- Push container images to remote repo (viz. AWS ECS)

## Assumptions

- an existing EKS cluster. For instructions, one good guide is ["Getting started with EKS"](https://docs.aws.amazon.com/eks/latest/userguide/getting-started.html).
- an existing AWS ElasticSearch cluster 
- familiarity with the AWS cli tool, AWS console and kubectl
- aws cli tool and kubectl configured to interact with AWS and EKS
- familiarity with AWS VPCs and basic networking

## Steps

### Deploying OpenFaaS and nginx-ingress

For the most part, this is identical to the dev environment, with a few EKS specific changes.

#### Install OpenFaaS (always pull images)

In the local environment, you typically don't want to pull OpenFaaS function images from a remote repo so we set `--function-pull-policy IfNotPresent`. When deploying to EKS, you will want to always check for the latest image; otherwise, you will have to always update your image tags (which can be annoying to script) or if using the 'latest' tag, manually purge images any time there is an update. Delta:

```bash
arkade install openfaas --function-pull-policy Always
```

#### Install nginx-ingress (set externalTrafficPolicy)

Because there will be an ELB in front of the cluster, unless configured properly, the nginx ingress controller and function containers will not see the real IPs of requests, which means white-listing will not work. To fix this, one of the required steps is to set the externalTrafficPolicy property when installing the nginx controller. [Details](https://kubernetes.io/docs/tutorials/services/source-ip/#source-ip-for-services-with-typenodeport).

```bash
helm install default stable/nginx-ingress --set controller.service.externalTrafficPolicy=Local

# if an nginx-ingress controller already exists, use:
helm upgrade [RELEASENAME] stable/nginx-ingress --set controller.service.externalTrafficPolicy=Local
```

###### References
- [k8s docs](https://kubernetes.io/docs/tutorials/services/source-ip/#source-ip-for-services-with-typenodeport)
- [k8s proxy settings](https://github.com/kubernetes/kubernetes/issues/73810)
- [digital ocean docs](https://www.digitalocean.com/community/questions/using-digitalocean-loadbalancer-how-to-get-real-ip)
- [helm docs](https://github.com/helm/charts/issues/15694)
- [ovh docs](https://docs.ovh.com/gb/en/kubernetes/getting-source-ip-behind-loadbalancer/)
- [k8s subreddit](https://www.reddit.com/r/kubernetes/comments/dnhsq2/nginx_ingress_and_xrealip/)

### Cluster autoscaling

*Optional Step*

Out of the box, EKS doesn't autoscale the number of (EC2) nodes within a cluster. Because OpenFaaS and all of the required accoutrements can get rather large in number before functions are even deployed, you will want to enable cluster autoscaling so it can add and reduce the number of nodes you use on-demand.

Note that this is an optional step since you *could* just set the number of desired nodes to a suitably high number and let them always run. However, if you ever get to a point where you've deployed more functions (i.e. pods) then can be handled by your node count, pods will start failing and require you to debug your setup. Note also that if you turn on autoscaling, more nodes will be started (up to the max node count you set on your cluster) as you deploy more and more functions, which will cost money. Once load is reduced, they will scale down, but the cost is something to always be congnizant of.

##### Steps

This is a paraphrase of the instructions provided at the official [EKS docs](https://docs.aws.amazon.com/eks/latest/userguide/cluster-autoscaler.html). There are more steps than those covered here, but these are the minimum you must do for our purposes.

1. Add autoscaling permissions to your EKS cluster's IAM role. Just follow the instructions in the "Node group IAM policy" of the docs.

2. Obtain the kubernetes version being used by your EKS cluster. You can view this from the EKS area of your AWS console. This will be a number like 1.16 or 1.18 (the most recent at the time of this writing).

3. Visit the [autoscaler releases](https://github.com/kubernetes/autoscaler/releases) page and find the most release of "Cluster Autoscaler" applicable to your major version. For example, if your cluster is using version 1.18, the most recent version might be "Cluster Autoscaler 1.18.1". 

4. In the following code, replace `"AUTOSCALER_VER"` with the version from step 3 (e.g. `AUTOSCALER_VER="1.18.1"`). Then, run the code.

```bash
AUTOSCALER_VER="AUTOSCALER_VER"

kubectl apply -f https://raw.githubusercontent.com/kubernetes/autoscaler/master/cluster-autoscaler/cloudprovider/aws/examples/cluster-autoscaler-autodiscover.yaml

kubectl -n kube-system annotate deployment.apps/cluster-autoscaler cluster-autoscaler.kubernetes.io/safe-to-evict="false"

kubectl -n kube-system edit deployment.apps/cluster-autoscaler

kubectl -n kube-system set image deployment.apps/cluster-autoscaler cluster-autoscaler=us.gcr.io/k8s-artifacts-prod/autoscaling/cluster-autoscaler:v$AUTOSCALER_VER
```

5. Confirm the autoscaler is working by viewing the autoscaler logs:

```bash
kubectl -n kube-system logs -f deployment.apps/cluster-autoscaler
```

After several minutes, you should see entries like the following.

```sh
I0717 05:42:40.737292       1 static_autoscaler.go:192] Starting main loop
I0717 05:42:40.737619       1 utils.go:590] No pod using affinity / antiaffinity found in cluster, disabling affinity predicate for this loop
I0717 05:42:40.737635       1 filter_out_schedulable.go:65] Filtering out schedulables
I0717 05:42:40.737677       1 filter_out_schedulable.go:130] 0 other pods marked as unschedulable can be scheduled.
I0717 05:42:40.737706       1 filter_out_schedulable.go:130] 0 other pods marked as unschedulable can be scheduled.
I0717 05:42:40.737715       1 filter_out_schedulable.go:90] No schedulable pods
I0717 05:42:40.737734       1 static_autoscaler.go:334] No unschedulable pods
I0717 05:42:40.737746       1 static_autoscaler.go:381] Calculating unneeded nodes
I0717 05:42:40.737832       1 scale_down.go:437] Scale-down calculation: ignoring 2 nodes unremovable in the last 5m0s
I0717 05:42:40.737895       1 static_autoscaler.go:440] Scale down status: unneededOnly=false lastScaleUpTime=2020-07-15
02:43:37.555956698 +0000 UTC m=+1655.482103852 lastScaleDownDeleteTime=2020-07-15 02:16:40.493923968 +0000 UTC m=+38.420071034 lastScaleDownFailTime=2020-07-15 02:16:40.49392404 +0000 UTC m=+38.420071109 scaleDownForbidden=false isDeleteInProgress=false scaleDownInCooldown=false
I0717 05:42:40.737922       1 static_autoscaler.go:453] Starting scale down
I0717 05:42:40.737958       1 scale_down.go:785] No candidates for scale down
I0717 05:42:41.878245       1 node_instances_cache.go:156] Start refreshing
```

If you see any permission errors, you should recheck your IAM permissions from step 1. Once you start loading your functions, this output will change to reflect nodes being started up. Additionally, you will see additional EC2 instance via the EC2 area in the AWS console.

###### References
[autoscaler releases](https://github.com/kubernetes/autoscaler/releases)
[eks docs](https://docs.aws.amazon.com/eks/latest/userguide/cluster-autoscaler.html)

### Configure Ingresses

This step should be undertaken after OpenFaaS and nginx are deployed to EKS. At that point, you are ready to deploy the EKS specifics ingresses, examples of which are available [here](../manifests/eks/ingress.yml). The two main differences from the local ingresses are:

- "nginx.ingress.kubernetes.io/whitelist-source-range: 10.0.0.0/8,192.168.0.0/16" annotation on the gateway ingress. This means that only requests from the 10.0.0.0/8 and 192.168.0.0/16 subnets will be allowed access to the gateway (i.e. OpenFaaS control plane). Set the value of this to whatever subnet your bastion box is on.
- "host: stac.my-domain.com". This should be set to whatever domain name you will be using to access the STAC service. If you don't have a domain, you can change this to the AWS DNS entry for your ELB, which can be viewed using `kubectl get svc -A  | grep LoadBalancer`. 

#### References

[troubleshooting ingress-nginx whitelist](https://github.com/kubernetes/ingress-nginx/issues/2096)

### Configure AWS ELB

After OpenFaaS and nginx are deployed and the first ingresses are applied, you will be able to run `kubectl get ingress -A` and see the application and the gateway ingresses with external IPs. Additionally, you should run `kubectl get svc -A  | grep nginx` and verify the nginx-ingress LoadBalancer and ClusterIP are functioning properly.You will know they are if the LoadBalancer has an AWS DNS entry (e.g. XXX.us-east-1.elb.amazonaws.com) for its external IP.

We can now configure the ELB to pass along proxy parameters so nginx can see the real source IP of requests rather than the ELB's internal IP.

```bash

# get LoadBalancerName
# if you have multiple loadbalancers, get rid of the grep and read through the descriptions to see which is the correct one. Alternatively, use the AWS Console
ELBNAME=$(aws elb describe-load-balancers | grep LoadBalancerName | sed 's/"LoadBalancerName": "\(.*\)",/\1/')

# ensure ProxyProtocolPolicyType exists
aws elb describe-load-balancer-policy-types | grep ProxyProtocolPolicyType

# create and attach policy
aws elb create-load-balancer-policy --load-balancer-name $ELBNAME --policy-name k8s-ppp --policy-type-name ProxyProtocolPolicyType --policy-attributes AttributeName=ProxyProtocol,AttributeValue=true

PORTS=( 80 443 )
for $PORT in "${PORTS[@]}"; do:
	aws elb set-load-balancer-policies-for-backend-server --load-balancer-name $ELBNAME --instance-port $PORT --policy-names k8s-ppp
done

# NOTES:
# - add/change PORTS as needed 
# - if you have existing appended policies on your ELB, be sure to append them to the --policy-names argument. See the docs (in references) for more info
```

###### References
- [ELB proxy docs](https://docs.aws.amazon.com/elasticloadbalancing/latest/classic/enable-proxy-protocol.html)

### Enable proxy protocol in nginx

Finally, we need to configure nginx-ingress to properly receive the proxy params being sent by the ELB. This involves two steps. First, we need to add an annotation to the controller to tell it to expect proxy params:

```bash
NGINX_CONTROLLER_NAME=$(kubectl get svc -A | grep nginx | grep LoadBalancer | awk '{print $2}')

kubectl annotate --overwrite svc/$NGINX_CONTROLLER_NAME service.beta.kubernetes.io/aws-load-balancer-proxy-protocol="*"
```

Second, we need to provide a config map with information about the network. You will need to edit the example provided at 'manifests/eks/nginx-proxy-configmap.yaml':

- replace `NGINX_CONTROLLER_NAME` with the value of `$NGINX_CONTROLLER_NAME` from the previous step.
- replace `REAL_IP_CIDRS` with the IP/network address of the external load balancer ([docs](https://kubernetes.github.io/ingress-nginx/user-guide/miscellaneous/)). For example, if the external address of the ELB is 34.203.1.10, and its internal IP is 192.168.1.200, you would set this entry to: `34.203.1.10,192.168.1.0/8`.

Once it is edited, it can be applied to the cluster as follows:

```bash
kubectl apply -f manifests/eks/nginx-proxy-configmap.yaml
```

At this point, all the networking for ELB and EKS is complete. You may verify that everything is working by viewing the logs from the nginx controller on EKS.

```bash
NGINX_POD_NAME=$(kubectl get pod -A | grep $NGINX_CONTROLLER_NAME | awk '{print $2}')
kubectl logs $NGINX_POD_NAME -n default -f
```

After starting the logs, using an Internet browser attempt to visit the root of your domain (http//your-domain.com/) which you (should have) edited in the ingress section to point at the OpenFaaS gateway. A couple things should happen to confirm that all the previous steps were completed successfully.

1. In your browser, you should see a "403 Forbidden" response. If you see a 50X type response, or a different type of 40X response, then the nginx whitelist may not be functioning correctly.

2. In the kubectl log output, you should see a connection attempt. You should see the IP of the host you are attempting to connect from in the first column (e.g. '67.180.82.94'). Without all of the ELB and ingress reconfiguration above, this IP would most likely be the internal IP of the ELB instead, which would make the whitelisting ineffective.

```sh
2020/07/17 04:36:25 [error] 640#640: *1164765 access forbidden by rule, client: 67.180.82.94, server: _, request: "GET /ui/ HTTP/1.1", host: "openfaas.test.geosite.io"
67.180.82.94 - - [17/Jul/2020:04:36:25 +0000] "GET /ui/ HTTP/1.1" 403 185 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.116 Safari/537.36 Edg/83.0.478.64" 451 0.000 [openfaas-gateway-8080] [] - - - - 16f151a95f3dcbdbd6533a7843747774
```

At this point, your OpenFaaS gateway is relatively secure since it can only be accessed from inside your VPC, and there is the out-of-the-box basicauth to pass through after that.

###### References
- [nginx proxy protocol docs](https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/configmap/#use-proxy-protocol)
- [sample gist](https://gist.github.com/janeczku/2a091bb5f1909b47985c44f39e4f47fa)

### Set up ECR

Before you can deploy your first functions, you must set up a container repository that the EKS cluster can pull your functions (i.e docker images) from. The easiest solution is to use AWS ECR, though you could use any other container repo as well (e.g. Gitlab, Google container registry). However, you may need to set up additional auth if your registry is private, so we will simply use ECR here.

##### Steps

[INCOMPLETE]

### Access the OpenFaaS control plane

To access the OpenFaaS control plane, we will use a bastion host to pivot into your VPC. There are several options here. 

1. If you already have a secure host in the same VPC as your EKS cluster and can access it via SSH, you can simply use that.

2. If you do not have an existing bastion host, you can follow the official AWS instructions to [set up a bastion host](https://docs.aws.amazon.com/quickstart/latest/linux-bastion/welcome.html). You should use the instructions for setting up in an existing VPC.

3. As an alternative to the tutorial, you can also simply set up a EC2 host in the EKS VPC and use that.

Once your host is ready, you can use a command like the following to set up an SSH tunnel to your OpenFaaS gateway.

```bash
ssh -L LOCAL_PORT:EKS_INTERNAL_IP:80 -i ~/path/to/ssh/key/rsa.key -N user@bastion.box.com &
```

Obviously, the correct arguments must be subsituted in:

- `LOCAL_PORT`: port you will use via your browser
- `EKS_INTERNAL_IP`: the IP address of one of the interfaces on your EKS cluster. You can find these via the 'Network Interfaces' tab in your AWS EC2 console. Look for the interface with the 'Description' field matching the name of your EKS cluster. For example, for a cluster named 'test-cluster', there should be several interfaces with the description 'Amazon EKS test-cluster'. Use the 'Primary private IPv4 IP' in the details for that interface.

Once you have successfully established the SSH tunnel, point your web browser at the tunnel to access the OpenFaaS gateway. For example, if you set LOCAL_PORT to 8000, you should visit [http://localhost:8000](http://localhost:8000). You should receive a basicauth login prompt.

To get the password, execute the following:

```bash
kubectl get secret -n openfaas basic-auth -o jsonpath="{.data.basic-auth-password}" | base64 --decode; echo
```

You should be able to log in as user 'admin' and the password you just obtained. From there, the console may be used as documented in the [OpenFaaS docs](https://docs.openfaas.com/tutorials/test-drive/).

### Access Kibana

This guide assumes that you have an existing ElasticSearch cluster that will store the ingested STAC data. Note that this cluster must use ElasticSearch version 6.8 for SAT-API~0.3.0. Additionally, this cluster *should not be publically accessible*  (i.e. accessible only from within your VPC) unless you have a very good reason to make it public. If you do not have an existing cluster, you can follow the [official guide](https://docs.aws.amazon.com/elasticsearch-service/latest/developerguide/es-gsg.html) to set one up now.

Assuming the cluster is properly secured, you will need to pivot through a bastion box to access the Kibana dashboard, similar to the OpenFaaS control plane. Use the following: 

```bash
ssh -L LOCAL_PORT:VPC_ENDPOINT:443 -i ~/path/to/ssh/key/rsa.key -N user@bastion.box.com &
```

- `LOCAL_PORT`: use a different port from the one used to access the OpenFaaS control plane. That way, you can access both that and the Kibana dashboard.
- `VPC_ENDPOINT`: use the 'VPC endpoint' from the ElasticSearch console in your AWS console.

Note that this tunnel is routed to port 443 on the ES cluster since by default, managed ES uses 443 for HTTPS communication rather than the default 9200 used by local ES deployments. Once the tunnel is established, (assuming you used port 8001 for LOCAL_PORT), point your browser at [http://localhost:8001/_plugin/kibana/](http://localhost:8001/_plugin/kibana/). From here, you can interact with the items and collections ingested by SAT-API.