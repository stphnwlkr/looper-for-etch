# Native Etch query testing and current dependency

## For people testing Looper

**Keep Looper active when testing the current release.** Removing it does not delete your content, layouts, or saved queries. It removes the builder and preview tools, the code that reads Looper's special saved-query format, and its extra missing-relationship-provider safeguard. Queries using that special format may stop showing results until converted. Ordinary native Etch definitions continue working.

The current public release is 0.8.1. It does not automatically migrate compatibility definitions to native ones. No frontend-removal change is included in the documentation update that adds this explanation.

## What was tested

Environment: Etch 1.7.1 on WordPress 7.2-beta1 with PHP 8.4.27. The test request used WordPress CLI's `--skip-plugins=looper-for-etch`, and asserted that Looper was not loaded. It saved native definitions through Etch's own `/etch-api/loops` endpoint, switched to an anonymous visitor, and checked both query results and rendered Etch loop output.

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

## What the API investigation found

The installed JavaScript API's exact validator and its bundled dependencies were exercised separately. Extra argument keys are preserved, matching the documented open-ended argument objects. Earlier assumptions that arbitrary extra keys were stripped were incorrect.

Some recognized properties have narrower validation for their value shapes. Examples include nested taxonomy/meta groups, status arrays, sort-direction objects, term taxonomy arrays, user meta-key arrays, certain comparison operators, and taxonomy existence operators. Comma-separated statuses and meta NOT EXISTS with an unused value can pass the validator without a frontend workaround.

Etch's native REST storage and frontend handlers accepted the full native definitions in the 20-case matrix. The remaining issue is how Looper submits and preserves those definitions in the editor, rather than a requirement for Looper to execute those query features on the frontend.

## What has not changed

The released plugin still writes compatibility definitions for some queries. These results do not make existing compatibility definitions safe to use after deactivating Looper. A future implementation must change the editor save path, migrate existing definitions safely, and verify the complete save/edit/deactivation workflow before claiming Looper can be removed after setup.

Meta Box and Media Bridge remain required for their own query extensions. Full multisite and browser/version matrices remain outside this investigation.
