# 0.8.0 validation

Review date: 2026-10-27.

## Advanced scope

Kept content selection by IDs, slugs, parents and types; author filters; text search; pagination; password/comment-count visibility filters; term hierarchy; and user roles, stored capabilities and publication requirements. These change matching records or their ordering.

Removed Execution, cache and total-count flags, return formats, comment pagination/status controls, permission mode, term count padding/restriction overrides, the legacy user selector, and cross-site membership selection. Taxonomy, date, and meta controls each have one main location. Ignore sticky promotion is in the basic Query list.

## Security and WordPress

- PHP syntax checks pass for all runtime PHP files.
- Query/compiler, import/export, editor-action/readback/rollback, nested UI, and native-toolbar tests pass.
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

The public release must be available before a real WordPress upgrade can be exercised. This section is updated after that verification.
