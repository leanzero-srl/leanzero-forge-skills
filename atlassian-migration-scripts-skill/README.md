# Moved: atlassian-migration-scripts-skill → atlassian-migration

On 2026-10-03 this skill was merged with `atlassian-cloud-to-cloud-migration-skill` into ONE skill,
[`atlassian-migration`](../atlassian-migration/). Its content is now the **Plan/Sync/Audit track**:

- skill entry point (both tracks): [`../atlassian-migration/SKILL.md`](../atlassian-migration/SKILL.md)
- docs, templates, scripts: [`../atlassian-migration/plan-sync-audit/`](../atlassian-migration/plan-sync-audit/)

This folder holds no skill any more (no `SKILL.md`), so installers skip it. If you symlinked it, re-run
`./scripts/install-skills.sh` or link `atlassian-migration` instead.
