# Changelog

## [2.3.1](https://github.com/frndchagas/coolify-mcp/compare/coolify-mcp-v2.3.0...coolify-mcp-v2.3.1) (2026-08-24)


### Bug Fixes

* **docs:** follow upstream main branch ([#52](https://github.com/frndchagas/coolify-mcp/issues/52)) ([5b4f0cd](https://github.com/frndchagas/coolify-mcp/commit/5b4f0cdf108909f03afc9bf3589eea2b98a4c5e4))

## [2.3.0](https://github.com/frndchagas/coolify-mcp/compare/coolify-mcp-v2.2.1...coolify-mcp-v2.3.0) (2026-08-24)


### Features

* target Coolify v4.3.10 API ([#50](https://github.com/frndchagas/coolify-mcp/issues/50)) ([0588faf](https://github.com/frndchagas/coolify-mcp/commit/0588fafab83c9e062ee19f4edb930c46d8797520))


### Bug Fixes

* **ci:** exclude demo scripts from linting ([16ecdf1](https://github.com/frndchagas/coolify-mcp/commit/16ecdf1ab187455ec9f16146470f6b0afcec9b54))
* **ci:** exclude demo scripts from linting ([ed4f05d](https://github.com/frndchagas/coolify-mcp/commit/ed4f05d410a0f67a5f6646e6b486ec4570e6625b))
* isolate stateless MCP server requests ([#49](https://github.com/frndchagas/coolify-mcp/issues/49)) ([79d226c](https://github.com/frndchagas/coolify-mcp/commit/79d226c96b689419944b2869df88b664f99a0977))

## [2.2.1](https://github.com/frndchagas/coolify-mcp/compare/coolify-mcp-v2.2.0...coolify-mcp-v2.2.1) (2026-08-06)


### Bug Fixes

* never emit contradictory status hints in diagnoseApp ([1a7a1c9](https://github.com/frndchagas/coolify-mcp/commit/1a7a1c9adca4acd1b0a795a819289d88d10a7ed4))
* never emit contradictory status hints in diagnoseApp ([b8d3f43](https://github.com/frndchagas/coolify-mcp/commit/b8d3f4394d96ef8b52468d83b56ae536601559a0))

## [2.2.0](https://github.com/frndchagas/coolify-mcp/compare/coolify-mcp-v2.1.1...coolify-mcp-v2.2.0) (2026-08-06)


### Features

* declare MCP annotations on every tool and add glama.json ([ead911e](https://github.com/frndchagas/coolify-mcp/commit/ead911e26419f02e3f06293d85a8c9ef2061c422))
* declare MCP annotations on every tool and add glama.json ([80aa1ed](https://github.com/frndchagas/coolify-mcp/commit/80aa1ed8bddadb41a8e25065b2bc451faac5f64f))

## [2.1.1](https://github.com/frndchagas/coolify-mcp/compare/coolify-mcp-v2.1.0...coolify-mcp-v2.1.1) (2026-08-06)


### Bug Fixes

* unwrap Coolify's {count, deployments} list envelope ([d53c338](https://github.com/frndchagas/coolify-mcp/commit/d53c338a028a8df780f709fba07e7e4e27a6894b))
* unwrap Coolify's {count, deployments} list envelope ([287eeee](https://github.com/frndchagas/coolify-mcp/commit/287eeeeff62e8a8873400e4b4f592a5ba5090745))

## [2.1.0](https://github.com/frndchagas/coolify-mcp/compare/coolify-mcp-v2.0.0...coolify-mcp-v2.1.0) (2026-08-05)


### Features

* accept environment_name or environment_uuid on create tools ([0440c6c](https://github.com/frndchagas/coolify-mcp/commit/0440c6c49f450e788dde7f60ef0312140136233c))
* accept environment_name or environment_uuid on create tools ([4dc964f](https://github.com/frndchagas/coolify-mcp/commit/4dc964ff946d7e056d07b8625e5761330aab33ed))

## [2.0.0](https://github.com/frndchagas/coolify-mcp/compare/coolify-mcp-v1.4.0...coolify-mcp-v2.0.0) (2026-08-05)


### ⚠ BREAKING CHANGES

* deployments that relied on the HTTP transport listening on all interfaces must now set MCP_HTTP_TOKEN (recommended) or MCP_HTTP_HOST=0.0.0.0 explicitly.

### Features

* batch operations, server diagnostics, and health check ([d01d37b](https://github.com/frndchagas/coolify-mcp/commit/d01d37b9c969c5152e8e362079d34865b0de60c9))
* batch operations, server diagnostics, and health check ([416ab4d](https://github.com/frndchagas/coolify-mcp/commit/416ab4d06550654dd9ef7c107fe7169769e09070))
* secure defaults for the HTTP transport ([ce50adc](https://github.com/frndchagas/coolify-mcp/commit/ce50adc0c5cb2ba49de3ebbbbcf4ec8c6fcb3539))

## [1.4.0](https://github.com/frndchagas/coolify-mcp/compare/coolify-mcp-v1.3.0...coolify-mcp-v1.4.0) (2026-08-05)


### Features

* bundled Coolify docs search and one-click MCPB bundle ([7ab9837](https://github.com/frndchagas/coolify-mcp/commit/7ab9837e525d24709dca1441573e0c683fd006e0))
* bundled Coolify docs search and one-click MCPB bundle ([05bb7d6](https://github.com/frndchagas/coolify-mcp/commit/05bb7d60b8d7eda3db212b8ecf5555f98b704171))

## [1.3.0](https://github.com/frndchagas/coolify-mcp/compare/coolify-mcp-v1.2.1...coolify-mcp-v1.3.0) (2026-08-05)


### Features

* ask the human before destructive deletes via MCP elicitation ([656edfe](https://github.com/frndchagas/coolify-mcp/commit/656edfe339835dea3e7438cce67e8228d5ebecff))
* ask the human before destructive deletes via MCP elicitation ([e81d702](https://github.com/frndchagas/coolify-mcp/commit/e81d7020fe95a14af2e0ba22f8221351ac0c4afb))

## [1.2.1](https://github.com/frndchagas/coolify-mcp/compare/coolify-mcp-v1.2.0...coolify-mcp-v1.2.1) (2026-08-05)


### Bug Fixes

* expose resource_uuid for service storages and add module dispatch tests ([bdc096e](https://github.com/frndchagas/coolify-mcp/commit/bdc096e56fd1b0bf0c51b2127232a2dd059fdba8))
* expose resource_uuid for service storages and add module dispatch tests ([6667f68](https://github.com/frndchagas/coolify-mcp/commit/6667f68119e680e9eea8903ef971bc714e287028))

## [1.2.0](https://github.com/frndchagas/coolify-mcp/compare/coolify-mcp-v1.1.0...coolify-mcp-v1.2.0) (2026-08-05)


### Features

* add deploy wait mode and diagnoseApp diagnostics tool ([8872024](https://github.com/frndchagas/coolify-mcp/commit/8872024d15a41576b121ac07dab353df70bc18cf))
* add deploy wait mode and diagnoseApp diagnostics tool ([458f69b](https://github.com/frndchagas/coolify-mcp/commit/458f69b405ae6592038443787dd075a3ce16c6e9))

## [1.1.0](https://github.com/frndchagas/coolify-mcp/compare/coolify-mcp-v1.0.0...coolify-mcp-v1.1.0) (2026-08-05)


### Features

* cover databases, services, backups, storages, scheduled tasks, teams and infra endpoints ([3105785](https://github.com/frndchagas/coolify-mcp/commit/31057857397a034a2f854ada653af27f67f0504d))
* cover databases, services, backups, storages, scheduled tasks, teams and infra endpoints ([84ac978](https://github.com/frndchagas/coolify-mcp/commit/84ac978b217b3eab99e1bb44608955ce33b073c9))

## [1.0.0](https://github.com/frndchagas/coolify-mcp/compare/coolify-mcp-v0.2.0...coolify-mcp-v1.0.0) (2026-08-05)


### ⚠ BREAKING CHANGES

* createPublicApplication, createPrivateGithubAppApplication, createPrivateDeployKeyApplication, createDockerfileApplication and createDockerImageApplication were replaced by createApplication with a type parameter.
* createDockerComposeApplication was removed — Coolify v4.1 removed POST /applications/dockercompose. Docker Compose deployments are now services: use createService with docker_compose_raw.

### Features

* consolidate application creation into a single createApplication tool ([fff3f13](https://github.com/frndchagas/coolify-mcp/commit/fff3f133369a0293694e68eadda68a31211748bb))
* target Coolify v4.1.2 API ([7a0eeaf](https://github.com/frndchagas/coolify-mcp/commit/7a0eeaf7ed0010435c91f14a0584a49b78d5cc31)), closes [#12](https://github.com/frndchagas/coolify-mcp/issues/12)

## [0.2.0](https://github.com/frndchagas/coolify-mcp/compare/coolify-mcp-v0.1.4...coolify-mcp-v0.2.0) (2026-01-21)


### Features

* add logMode and harden log redaction ([e98e1d9](https://github.com/frndchagas/coolify-mcp/commit/e98e1d9daa83174a2fa69150d2191475d569fd6a))
* coolify mcp initial release ([989f2ae](https://github.com/frndchagas/coolify-mcp/commit/989f2aeb8a0f4e8e9b60aab90f2b3ac91e61dac9))
* harden log handling and add logMode ([ddf09d5](https://github.com/frndchagas/coolify-mcp/commit/ddf09d54d3c20403a5304d3c16566af35d02d0a1))


### Bug Fixes

* publish workflow rebase ([07be62b](https://github.com/frndchagas/coolify-mcp/commit/07be62be229a38134a39a6ee901d0402d8d9d795))
* simplify tool names ([9c8abdd](https://github.com/frndchagas/coolify-mcp/commit/9c8abddc5019983344d657a68eaf5d4d579711d8))
* simplify tool naming ([7246ec1](https://github.com/frndchagas/coolify-mcp/commit/7246ec159a6365950d8e185f2c24702060d841c4))
* sync publish versioning ([01f3b80](https://github.com/frndchagas/coolify-mcp/commit/01f3b80b15c2f1138330059d37bc89e968f9f000))

## Changelog
