# Changelog

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
