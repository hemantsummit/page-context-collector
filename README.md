# page-context-collector

Passive semantic snapshot of the current browser page. It identifies controls
that advertise expandable, popup, hover, and tab behavior without interacting
with the page, and it includes visible static text.

Extracted as a standalone package from
[alibaba/page-agent](https://github.com/alibaba/page-agent).

## Install

```bash
npm install page-context-collector
```

Until it is published, install from this repo:

```bash
npm install github:hemantsummit/page-context-collector
```

## Usage

```ts
import { pageSemanticsToOutline, scrapePageSemantics } from 'page-context-collector'

const snapshot = scrapePageSemantics()
console.log(pageSemanticsToOutline(snapshot))
```

Set `includeValues: true` to include native form values and content from ARIA
textboxes. Values are omitted by default.

```ts
const snapshot = scrapePageSemantics({
	includeValues: true,
	includeShadowDom: true,
	includeIframes: true,
	maxIframeDepth: 2,
})
```

Use `pageSemanticsToOutline()` when sending page context to an LLM. It is the
compact indented tree. `formatPageSemantics()` also includes the full JSON
snapshot and is intended for debugging.

The IIFE build (`dist/lib/page-context-collector.iife.js`) exposes the same
functions on `window.PageContextCollector`.

```js
copy(PageContextCollector.pageSemanticsToOutline(PageContextCollector.scrapePageSemantics()))
```

## Safety

The collector is passive: it does not dispatch events, focus controls, hover,
click, submit forms, or invoke page handlers. Interaction hints are derived
only from explicit DOM semantics such as `aria-expanded`, `aria-haspopup`,
`role="combobox"`, `<summary>`, `role="tab"`, tooltip references, and tooltip
attributes.

If a referenced menu, panel, or tooltip is already mounted, including when it
is hidden, its contents are read and nested under the control. Referenced IDs
that are not in the DOM are marked `not in DOM` and are not opened. Content
created only by a click or hover handler cannot be collected under this
safety policy.

The semantic graph preserves articles, groups, lists, list items, and
definition-list label/value pairs. It also records ARIA selection, current,
and checked states and recognizes ARIA textboxes, checkboxes, radios, switches,
headings, and grids.

Open shadow roots and accessible same-origin iframe documents are traversed by
default. Cross-origin, unavailable, and depth-limited iframes are represented
as stubs. Closed shadow roots cannot be inspected. Images, SVG/canvas pixels,
CSS-generated content, and content that only appears after interaction are not
collected.

## Scripts

```bash
npm test
npm run typecheck
npm run build
```
