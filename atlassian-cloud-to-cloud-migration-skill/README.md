# Moved: atlassian-cloud-to-cloud-migration-skill → atlassian-migration

On 2026-10-03 this skill was merged with `atlassian-migration-scripts-skill` into ONE skill,
[`atlassian-migration`](../atlassian-migration/). Its content is now the **Cloud-to-Cloud copy track**:

- skill entry point (both tracks): [`../atlassian-migration/SKILL.md`](../atlassian-migration/SKILL.md)
- docs, templates, scripts, offline tests: [`../atlassian-migration/cloud-to-cloud/`](../atlassian-migration/cloud-to-cloud/)

This folder holds no skill any more (no `SKILL.md`), so installers skip it. If you symlinked it, re-run
`./scripts/install-skills.sh` or link `atlassian-migration` instead.
