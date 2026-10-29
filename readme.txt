=== Looper for Etch ===
Contributors: stphnwlkr
Requires at least: 7.1
Tested up to: 7.2
Requires PHP: 8.3
Stable tag: 0.12.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/old-licenses/gpl-2.0.html

Visual WordPress queries for Etch, with nested filters, PHP output, dynamic-field previews, and direct editor integration.

== Description ==
Build post, attachment, term, user, and archive/search Main Query loops. Combine taxonomy, meta, date, selection, and ordering controls. Saved queries are native Etch definitions and continue working without Looper. Etch is required for editor integration.

Distributed through GitHub releases. Updates appear in the standard WordPress Plugins/Updates interface. This is not a WordPress.org-hosted plugin.

== Installation ==
Upload the release ZIP through Plugins > Add New > Upload Plugin. Activate Looper, reload Etch, and use its left-toolbar button. Copy/paste is the default. Copy for Etch copies only the entries for the existing query-arguments array. Enable direct Etch actions in Settings to reveal save/update, insert, and apply controls. Enable optional HTML loop field suggestions separately. Most direct actions update the editor without reloading; use Etch Save. Queries rejected by Etch’s editor validation offer Save changes and reload or Cancel before any automatic save. Review inserted/applied elements after reload and use Etch Save. Older compatibility queries migrate on the next administrator visit; resolve any warning before removing Looper.

== Changelog ==
= 0.12.0 =
Exclude current post with a native $exclude argument and automatic insert/apply binding. Place the option at the bottom of Query and move sticky promotion controls to More.

= 0.11.0 =
Simple WP Grid Builder selector and FacetWP enable controls under More, with setup guidance and saved-argument support.

= 0.10.0 =
Optional experimental HTML loop field suggestions, a per-user Settings popover, native keys()/values() choices, and a compact form.

= 0.9.0 =
Native Etch query storage, automatic compatibility migration with backup, no runtime decoding, conditional reload confirmation, Etch-ready argument copying, and More after Advanced.

= 0.8.1 =
Added a user overview, versioned JSON changelog, and release consistency validation.

= 0.8.0 =
Reviewed Advanced scope, added secure GitHub release updates, hardened preview permissions and validation, improved label layout, and documented security and accessibility verification.
