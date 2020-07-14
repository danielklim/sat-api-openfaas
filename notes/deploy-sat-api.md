# Deploy SAT-API to OpenFaaS

##### Versions

- @sat-utils/api^0.3.X
- @sat-utils/ingest^0.3.X
- @sat-utils/api-lib^[0.3.1](https://github.com/danielklim/sat-api/releases/download/v0.3.1/api-lib.tgz)
- elasticsearch.js\~16.7.0
- http-aws-es\~6.0.0

*Note:* Versioning is super important because there are breaking changes in the elasticsearch javascript library (i.e. @elastic/elasticsearch *will not work*) as well as between @sat-utils 0.3 and >=0.4.

## Commands

```bash
# from repo root
cd app
faas-cli build -f ./sat-api.yml
faas-cli deploy -f ./sat-api.yml
```

You should now be able to check the web-ui and see the api and ingest functions listed, with status 'ready'. Alternatively, you can check using the cli tool: `faas-cli list --gateway http://localhost`
