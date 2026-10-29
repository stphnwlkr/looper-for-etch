# Looper for Etch

Build simple and complex WordPress queries for content displayed to site visitors. Looper provides visual controls, generated PHP, and a sample record with copyable Etch dynamic keys.

Requires WordPress 7.1+, PHP 8.3+, and Etch for editor integration. The interface is currently English.

## Install

Download **looper-for-etch.zip** from the [latest release](https://github.com/stphnwlkr/looper-for-etch/releases/latest). Upload it in WordPress under Plugins → Add New → Upload Plugin, then activate it.

Open Looper from Etch's left toolbar. Copy/paste is the default workflow; enable direct Etch actions in Settings if you want save/update, insert, and apply controls. Tools → Looper for Etch also provides query building, preview, and PHP export outside the editor.

## Build and edit loops

- Query controls count, ordering, offset, status, and sticky-post promotion.
- Taxonomies provides term lookup and nested AND/OR groups, including attachment collections.
- Meta data provides stored-key/value comparisons, existence tests, casting, nested groups, and meta sorting settings.
- Dates provides calendar boundaries, relative dates, date columns, and groups.
- Advanced adds content selection, authors, search, pagination, hierarchy, and user roles or publication requirements as appropriate to the source. It excludes execution and database-tuning controls.
- More provides simple WP Grid Builder and FacetWP query arguments, plus Meta Box relationships when that extension is available. Facet wrapper classes and shortcodes are added separately in Etch.

Supported sources are posts, attachments, public custom post types, taxonomy terms, users, and the inherited Main Query for archive and search templates. JSON and dynamic-data array loops remain in Etch.

**Exclude current post** is available in the Query tab for post queries, including custom post types. Use **Insert loop element** or **Apply to selected loop** to connect the current post automatically. It combines with fixed excluded IDs, and cannot be combined with Include post IDs. This is intended for related content on single post/page templates. Preview uses fixed exclusions only because it has no single-post context.

The saved native query uses `post__not_in` with `$exclude ?? 0`. Looper binds that argument to `this.id` on inserted/applied elements. If you only save the definition or copy its PHP, set the element's `$exclude` argument to `this.id` in Etch. Existing elements using an updated definition need that binding too. Imported exclusions with another argument name, such as `$exc ?? 0`, retain their name and position in the excluded-ID list. This continues working with Looper deactivated.

Optional scalar arguments generate defaults such as `$count ?? 6`. Lists use fixed values. Preview uses the supplied defaults and never executes pasted PHP. The generated PHP stays visible. Copy for Etch copies only the entries inside the $query_args array, omitting the opening PHP tag, assignment and outer brackets. Paste those entries inside Etch’s existing array; this manual route does not reload the editor.

Load an existing supported query to edit it. Keeping its key updates that definition; changing its key creates another. New keys use camelCase. Looper can save a definition, insert a loop element, or apply a query to the selected loop element. **Most actions update the editor without a reload; use Etch Save to keep them. If Etch’s editor API rejects a query shape, Looper offers Save changes and reload or Cancel. Confirming saves all current editor changes and the native query, then reloads. Review inserted/applied elements and use Etch Save afterward.** Updating a shared definition affects every loop that references it.

Queries saved to Etch use native Etch definitions. Looper adds no query decoding or visitor-time query processing.

## Optional builder suggestions

In Settings, enable **HTML loop field suggestions** to list sample fields when typing `{loopAlias.` in Etch's HTML editor. Suggestions follow nested loop aliases and object paths, with keyboard selection and native `.keys()` / `.values()` choices. The sample preview also provides copyable modifier expressions for objects. The setting is off by default, saved for your user on the current site, and takes effect without saving/reloading the document.

This is experimental and currently HTML-editor-only. It uses one matching sample rather than a complete database schema; missing fields may not appear. Required arguments must be available. Main Query needs archive/search context and is not sampled by this first version. Looper steps aside for a visible Etch/Enhancer completion menu. See [autocomplete behavior and tests](docs/AUTOCOMPLETE.md).

## Deactivation and uninstall

Saved queries continue working with Looper deactivated or uninstalled. You lose only Looper's visual query builder, sample preview, copyable dynamic-key tools, and optional builder suggestions. Your content, page layouts, and saved Etch definitions are kept; you can still edit queries in Etch's Loop Manager.

Version 0.9.0 automatically converts older Looper compatibility definitions when an administrator next opens WordPress admin or the Etch editor. It keeps a non-autoloaded, site-specific backup before conversion, retains IDs, keys, scope, arguments and other saved properties, and reports any definition it cannot convert safely. Open the updated editor and resolve any migration warning before removing Looper. No separate query registry or public execution endpoint is added.

Etch remains required to render Etch loops. Meta Box Relationships, Media Bridge, and other providers remain required for their own features. Looper no longer adds a runtime safeguard for a missing relationship provider. See [native runtime and migration testing](docs/NATIVE-RUNTIME.md).

## Multisite

Looper uses the current site's WordPress content and Etch loop registry. It can be activated per site or network-wide; network activation does not make queries global across sites. Site administrators still need the required capabilities. Query previews stay in the current site context, including user membership.

Cross-site post loops and a network-wide loop library are outside this release. Looper does not switch sites during frontend rendering or bypass Etch's current-site context. Update metadata is safely shared through WordPress's network transient cache; installing updates remains a network-administrator responsibility. A full live multisite/Etch compatibility matrix has not yet been exercised.

## Updates

After installing 0.8.0 or later, WordPress checks stable public GitHub releases through its normal Plugins/Updates interface. Optional automatic updates remain under the site's own WordPress setting. Installing older versions once requires uploading a current ZIP.

Update requests use HTTPS and send no site content or credentials. WordPress downloads the versioned release ZIP after validating its repository URL and SHA-256 checksum. See [release instructions](docs/RELEASING.md).

## Validation and security

See [validation](docs/VALIDATION.md), [accessibility](docs/ACCESSIBILITY.md), and [security](SECURITY.md). Automated checks support the review; they are not a certification of complete WCAG conformance or freedom from vulnerabilities.

## Development

Run `npm ci && npm test` for query, editor-action, and DOM accessibility tests. Run `php tests/updater-test.php` for updater trust-boundary tests. Integration checks require a disposable WordPress installation with Etch.

Run `python3 scripts/build-release.py 0.12.1` to create the installable ZIP and update manifest under `dist/`. A pushed `vX.Y.Z` tag runs the release workflow. Runtime versions must match the tag.

GPL-2.0-or-later. This is an independent plugin and is not an official Etch product.

The [product-page overview](docs/product-overview.html) is a reusable HTML fragment. Release history is maintained in [changelog.json](changelog.json); every release is blocked until its version has a matching newest entry.
