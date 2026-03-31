# Forge API Endpoints Documentation

## Overview

This directory contains detailed documentation for Forge and Atlassian REST API endpoints.

## Files

| File | Description |
|------|-------------|
| [forge-runtime-apis.md](./forge-runtime-apis.md) | Forge platform runtime APIs |
| [jira-rest-api.md](./jira-rest-api.md) | Jira REST API v3 reference (recommended for new apps) |
| [jira-rest-api-v2.md](./jira-rest-api-v2.md) | Jira REST API v2 endpoints |
| [bitbucket-rest-api.md](./bitbucket-rest-api.md) | Bitbucket REST API reference |
| [confluence-rest-api.md](./confluence-rest-api.md) | Confluence REST API reference |
| [confluence-rest-api-v2.md](./confluence-rest-api-v2.md) | Confluence REST API v2 endpoints |

## Quick Reference

### Forge APIs
- `@forge/api` - Core runtime, Jira/Confluence REST calls
- `@forge/resolver` - Frontend-to-backend communication
- `@forge/jira-bridge` - UI configuration and modifications
- `@forge/kvs` - Key-value storage

### Atlassian REST APIs

| Product | Documentation |
|---------|---------------|
| Jira v3 (recommended) | [jira-rest-api.md](./jira-rest-api.md) |
| Jira v2 (legacy) | [jira-rest-api-v2.md](./jira-rest-api-v2.md) |
| Bitbucket | [bitbucket-rest-api.md](./bitbucket-rest-api.md) |
| Confluence v3 (recommended) | [confluence-rest-api.md](./confluence-rest-api.md) |
| Confluence v2 (legacy) | [confluence-rest-api-v2.md](./confluence-rest-api-v2.md) |

### API Comparison
- **v2 APIs** - Use `/rest/api/2` or `/wiki/rest/api` base paths. Legacy but stable.
- **v3 APIs** - Use `/rest/api/3` base path. Current standard with improved functionality.

## Learning Path

1. Start with `forge-runtime-apis.md` for core functionality
2. For **new applications**, use v3 APIs (jira-rest-api.md, confluence-rest-api.md)
3. For **legacy integrations** or specific requirements, use v2 APIs
4. Review Bitbucket/Confluence APIs as needed

## API Version Guide

| Use Case | Recommended API |
|----------|-----------------|
| New Forge app development | REST API v3 |
| Legacy integration compatibility | REST API v2 |
| Specific Atlassian endpoints | Check both versions for availability |
