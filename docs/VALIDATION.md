# Validation history

Review date: 2026-10-27.

## Advanced scope

Kept content selection by IDs, slugs, parents and types; author filters; text search; pagination; password/comment-count visibility filters; term hierarchy; and user roles, stored capabilities and publication requirements. These change matching records or their ordering.

Removed Execution, cache and total-count flags, return formats, comment pagination/status controls, permission mode, term count padding/restriction overrides, the legacy user selector, and cross-site membership selection. Taxonomy, date, and meta controls each have one main location. Ignore sticky promotion is in the basic Query list.

## Security and WordPress

- PHP syntax checks pass for all runtime PHP files.
- Query/compiler, import/export, native editor-action/save/refresh, nested UI, and native-toolbar tests pass.
- Real WordPress REST tests reject anonymous and low-privilege calls, user discovery without list_users, invalid cookie nonces, malformed/disallowed query arguments, and unassigned taxonomy lookups. Authenticated sample output is bounded to one record. Temporary users and roles are removed after testing.
- Metadata-key queries use prepared identifiers/values, bounded results, and caching. The read-only editor routing flag does not change data and remains capability-protected.
- Official WordPress Plugin Check reports one distribution-specific finding: plugin_updater_detected. Custom Update URI handling is intentionally used for GitHub distribution and is not permitted for WordPress.org-hosted plugins. No other findings remained in the reviewed production package.
- Development dependency lockfile generation reported zero known vulnerabilities. Development dependencies are excluded from installable packages.
- Updater tests reject foreign/insecure or mismatched packages, prereleases, invalid checksums, corrupted downloads, and mismatched versions. They verify caching, compatibility metadata, escaped release notes, and isolation from other plugins' updates.

## Environment and limits

Integration environment: WordPress 7.2-beta1, PHP 8.4.27, Etch 1.7.1. Declared minimums remain WordPress 7.1 and PHP 8.3. The public CI checks syntax/updater behavior and portable JavaScript tests; Etch runtime integration requires a local test installation. A full PHP 8.3 / stable WordPress 7.1 / multisite / browser matrix has not been completed.

Multisite uses core site-scoped options/content and network update transients. Network activation requires no schema installation. Cross-site loops are not implemented; actual multi-site-network/Etch end-to-end testing remains unverified.

See ACCESSIBILITY.md for the accessibility checks and remaining coverage limits. The interface is English and has not completed translation coverage. This audit is evidence of checks performed, not a security or accessibility certification.

## Native update verification

Verified against the published 0.8.0 GitHub release: WordPress offered 0.8.0 to an installation temporarily marked 0.7.9, then the standard WordPress plugin upgrader downloaded the versioned package, installed it, and reported a successful 0.7.9 → 0.8.0 update. The release asset checksum matched the public update manifest. The updated plugin remained active and every saved Etch definition was unchanged.

Follow-up verification for 0.8.1: the standard WordPress bulk upgrader installed the public 0.8.1 package from an installation marked 0.8.0. A post-download hook confirmed the checksum-verified temporary file, the plugin remained active, and all 21 saved definitions were unchanged. The single-item low-level upgrader API was also exercised; outside the browser it requires its caller to complete reactivation, so the activation-preservation check uses the normal bulk-upgrade path.

## Native-query storage, migration and deactivation

Legacy v1 gallery and v2 post, term, user and Main Query definitions migrate to native Etch arguments. Integration tests verified backups, idempotency, unknown-property and parameter preservation, corrupt-payload warnings, stale-definition rejection and atomic registry conflicts. The local site's 21 existing definitions were already native and were retained.

Twenty encoded runtime fixtures were migrated, then Looper was actually deactivated. Every query executed and every Etch loop block rendered the expected records as an anonymous visitor. Coverage includes nested filters, argument defaults/overrides, attachments/collections, terms/users, Main Query and provider-backed relationships. Temporary fixtures were removed and Looper reactivated.

Copy for Etch was checked to exclude the assignment and outer brackets while retaining nested sorting arrays. The browser no-reload path, confirmation/cancellation flow, and confirmed save/edit/reload workflow were exercised. The reload path preserved a changed Count argument and nested metadata groups, including a subsequent Etch Save. Public action tests cover saving editor changes before native writes, failure/conflict handling, insertion/application after refresh, nested-loop preservation, and continuation expiry. See NATIVE-RUNTIME.md for workflow and limits.

## 0.10.0 validation

Optional autocomplete and Settings validation are documented in AUTOCOMPLETE.md. Additional browser checks confirmed copy-first controls, direct-action opt-in and disable, a stationary Settings button, no intro banner, and side-by-side source controls. Settings persistence, invalid preference rejection, and ordinary frontend asset exclusion were exercised on localhost.
