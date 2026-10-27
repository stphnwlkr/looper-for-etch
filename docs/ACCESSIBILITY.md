# Accessibility verification

The interface targets WCAG 2.2 AA using native inputs and labels, visible focus, clear errors, status announcements, keyboard-operated tabs, and responsive reflow.

## Verification

- The 0.9.0 main and nested-tab suite was rerun after native-save and tab-order changes, with zero violations across 11 Advanced panels. The reload-confirmation state also passed the automated checks. Saving disables form edits while keeping status text available.
- Automated axe-core checks use WCAG 2 A/AA, 2.1 A/AA, and 2.2 AA rule tags. The source-specific Advanced-panel suite reports zero violations across 11 panels. The separate expanded-interface suite covers 11 additional states with zero violations.
- Top-level and nested tabs have separate accessible names, IDs, selected states, panels, and roving keyboard focus. Arrow, Home, and End keys operate within the current tablist.
- Looper is a nonmodal dialog in Etch. The native left toolbar stays operable; activating another toolbar tool closes Looper without cancelling the native action. The obscured canvas is inert while Looper is open and is restored on close. Escape closes Looper and restores focus. Tools-page mode is not a dialog.
- Rendered browser sampling measured 54 nondecorative text samples, with a minimum contrast ratio of 4.65:1. The decorative logo is exempt from text contrast. No enabled sampled control was smaller than 24 by 24 CSS pixels, and no horizontal overflow was detected in the reviewed desktop state.
- Long labels receive a wider column. Narrow form containers stack labels above their controls. Data/code areas share the main scroll container, and forced-colors and reduced-motion styles are included.
- Help links identify that they open a new tab. Fixed value labels were removed. Unsupported argument controls are omitted rather than represented by misleading disabled actions.

Automated DOM checks exclude geometry-dependent contrast and target measurements, which were sampled separately in the browser. This review does not establish complete WCAG conformance. A full assistive-technology, zoom, and device/browser matrix remains necessary before making a formal conformance claim. Etch and other installed extensions have their own accessibility behavior.
