# Native Etch queries: migration and deactivation

## What happens without Looper

Queries saved by 0.9.0 are native Etch definitions. Deactivating or uninstalling Looper removes its visual builder, sample preview, and dynamic-key copying tools. It does not remove content, layouts or queries, or stop their rendering. Etch and any plugins providing relationship/gallery features are still required for their own functionality. Looper no longer installs query-decoding or missing-provider hooks for visitors.

Older compatibility definitions convert automatically during an authenticated administrator visit to WordPress admin or the Etch editor. The migration keeps the first pre-migration registry snapshot in the current site's non-autoloaded `lfe_native_query_backup_v1` option. It preserves IDs, keys, names, scope, parameter expressions, nested/named filters and unknown definition/configuration properties. Invalid payloads remain untouched and produce an editor warning; resolve that warning before deactivating. The conversion is idempotent, with atomic conflict detection and readback.

The local site's 21 existing definitions were already native: no conversion was needed, and none was removed. Separate legacy fixtures exercised both v1 gallery and v2 post, term, user and Main Query formats, including corrupt-payload handling and stale-write rejection.

## Saving from the editor

Looper first uses Etch's public add/update API and checks that the definition is preserved. Accepted native queries update the editor without reloading or automatically saving the page; use Etch Save to persist them. Inserting/applying an unchanged existing query also avoids a reload.

Etch's frontend accepts some argument shapes that its JavaScript validator rejects. If the API rejects a definition without changing the registry, Looper offers **Save changes and reload** and **Cancel**. It saves no editor changes before confirmation. Confirming uses Etch's public `saveAsync`, writes one native definition through its protected endpoint, and reloads. This prevents a stale editor registry overwriting the saved query on a later Etch Save. Definitions with unknown additional properties also use this path when edited so those properties can be retained.

After a confirmed reload, insert/apply actions resume once against the native registry, preserving content, variable names and argument overrides. Review the element and use Etch Save to persist that element change. No encoded query or separate runtime registry is written. The short-lived browser continuation contains the action, query reference and selected-loop binding snapshot, expires after two minutes, and is not a saved form draft. Cancel leaves the form and editor unchanged.

Browser verification loaded a migrated nested-meta query, changed Count to `$count ?? 9`, saved it, reloaded it in Looper, and used Etch Save again. The argument and nested AND/OR, IN and NOT EXISTS filters remained present. Fresh forms clear after refresh.

## What was tested

Environment: Etch 1.7.1 on WordPress 7.2-beta1 with PHP 8.4.27. The final test created 20 disposable definitions in the old encoded format, migrated them with Looper 0.9.0, then actually deactivated the plugin. A separate request asserted that Looper was inactive and its code absent, switched to an anonymous visitor, and checked both query results and rendered Etch loop HTML. Looper was reactivated afterward.

All 20 cases passed:

- Basic posts, default count arguments, and count overrides.
- Nested taxonomy OR/AND groups.
- Nested metadata groups, value lists, and NOT EXISTS.
- Date filtering.
- Multiple post types and publication statuses.
- Comma-separated publication statuses.
- Per-field sort directions.
- Term count, offset, metadata, and argument defaults/overrides.
- User roles, metadata, dates, and count defaults/overrides.
- Multiple taxonomies in a term query.
- Multiple user metadata keys.
- Metadata regular expressions.
- Taxonomy NOT EXISTS.
- Attachment MIME type, parent, collection, and arguments.
- Media Bridge collection ordering, with Media Bridge active.
- Main Query overrides and metadata.
- Meta Box relationships and required arguments, with Meta Box Relationships active.

Some bullets combine multiple cases. All temporary posts, attachments, terms, users, relationship records, and query definitions were removed. The original saved definitions were restored unchanged.

## Coverage limits

The deactivation matrix and browser round trip passed on the environment above. Public JavaScript tests cover native action sequencing, failures, stale edits, selected-loop preservation and continuation expiry. `tests/native-wordpress.php` covers migration, backups, unknown properties, permissions and atomic conflict handling on a local WordPress installation.

A full multisite, minimum-version and cross-browser matrix has not been completed. Meta Box Relationships and Media Bridge were active for their own feature tests. Ordinary WordPress behavior applies if one of those providers is removed; Looper no longer intercepts those queries.
