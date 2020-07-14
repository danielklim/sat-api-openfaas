# Stand up ElasticSearch and Kibana

This is optional if you have an existing ElasticSearch and Kibana stack. However, that the stack *must* be version 6.X (6.8.0 at the time of this writing). Version 7.X *will not work without significant modifications to SAT-API*! If you wish to use an existing stack, you will need to change the connection parameters in the 'Deploy SAT-API' step.

*Note:* ElasticSearch and Kibana require significant system resources. It is recommended that you have at least 8GB of system memory in order to run this stack as well as the k8s/openfaas stack.

## Commands

```bash
# from repo root
docker-compose -f docker/es.docker-compose.yml up
```

There will be a bunch of log output, and if everything is OK, you should see something like:

```
stac_es | [2020-07-14T07:09:17,950][INFO ][o.e.c.r.a.AllocationService] [uWmbrVe] Cluster health status changed from [YELLOW] to [GREEN] (reason: [shards started [[.kibana_1][0]] ...]).
stac_kb | {"type":"log","@timestamp":"2020-07-14T07:09:18Z","tags":["status","plugin:spaces@6.8.10","info"],"pid":1,"state":"green","message":"Status changed from yellow to green - Ready","prevState":"yellow","prevMsg":"Waiting for Elasticsearch"}
```

At that point, you may bring the stack down (ctrl + c), then restart with the `-d` option to run it in the background (i.e. `docker-compose -f docker/es.docker-compose.yml up -d`)
