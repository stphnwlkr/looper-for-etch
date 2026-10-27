# Looper for Etch

Build simple and complex WordPress queries for content displayed to site visitors. Looper provides visual controls, generated PHP, and a sample record with copyable Etch dynamic keys.

Requires WordPress 7.1+, PHP 8.3+, and Etch for editor integration. The interface is currently English.

## Install

Download **looper-for-etch.zip** from the [latest release](https://github.com/stphnwlkr/looper-for-etch/releases/latest). Upload it in WordPress under Plugins → Add New → Upload Plugin, then activate it.

Open Looper from Etch's left toolbar. Tools → Looper for Etch also provides query building, preview, and PHP export outside the editor.

## Build and edit loops

- Query controls count, ordering, offset, status, and sticky-post promotion.
- Taxonomies provides term lookup and nested AND/OR groups, including attachment collections.
- Meta data provides stored-key/value comparisons, existence tests, casting, nested groups, and meta sorting settings.
- Dates provides calendar boundaries, relative dates, date columns, and groups.
- Advanced adds content selection, authors, search, pagination, hierarchy, and user roles or publication requirements as appropriate to the source. It excludes execution and database-tuning controls.
- More provides Meta Box relationships when that extension is available.

Supported sources are posts, attachments, public custom post types, taxonomy terms, users, and the inherited Main Query for archive and search templates. JSON and dynamic-data array loops remain in Etch.

Optional scalar arguments generate defaults such as `$count ?? 6`. Lists use fixed values. Preview uses the supplied defaults and never executes pasted PHP. The generated code omits the opening PHP tag for Etch.

Load an existing supported query to edit it. Keeping its key updates that definition; changing its key creates another. New keys use camelCase. Looper can save a definition, insert a loop element, or apply a query to the selected loop element. **Use Etch Save to persist editor changes.** Updating a shared definition affects every loop that references it.

Complex definitions use a compatibility payload stored in Etch's loop registry. Keep Looper active for those definitions to execute correctly. No separate query registry or visitor-facing REST endpoint is added.

## Deactivation and uninstall

For the current release, keep Looper active while testing queries created with it. Removing Looper does not delete content, page layouts, or saved Etch queries. You lose its query builder, preview, and editing tools. Queries saved in Looper's special compatibility format can stop displaying results until their settings are converted to ordinary native Etch definitions. Its extra missing-Meta-Box-relationship safeguard is also removed.

Ordinary native Etch queries keep working. Native-query testing confirmed the query features themselves do not require Looper's frontend processing, but **0.8.1 does not automatically migrate existing definitions**. Field and relationship providers still have their own dependencies. See [native runtime testing](docs/NATIVE-RUNTIME.md).

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

Run `python3 scripts/build-release.py 0.8.1` to create the installable ZIP and update manifest under `dist/`. A pushed `vX.Y.Z` tag runs the release workflow. Runtime versions must match the tag.

GPL-2.0-or-later. This is an independent plugin and is not an official Etch product.

The [product-page overview](docs/product-overview.html) is a reusable HTML fragment. Release history is maintained in [changelog.json](changelog.json); every release is blocked until its version has a matching newest entry.
