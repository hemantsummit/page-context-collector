import { afterEach, describe, expect, it } from 'vitest'

import { pageSemanticsToOutline, scrapePageSemantics } from './index'
import type { PageSemantics } from './types'

afterEach(() => {
	document.body.replaceChildren()
	document.title = ''
})

describe('pageSemanticsToOutline', () => {
	it('formats structural metadata and interaction states', () => {
		const snapshot: PageSemantics = {
			title: 'States',
			url: 'http://localhost:3000/',
			semantic_tree: [
				{
					kind: 'region',
					region_kind: 'list',
					list_type: 'ordered',
					children: [],
				},
				{
					kind: 'region',
					region_kind: 'iframe_stub',
					label: 'Reports',
					src: 'https://reports.example/',
					unavailable_reason: 'cross-origin',
					children: [],
				},
				{
					kind: 'control',
					role: 'tab',
					label: 'Summary',
					selected: false,
					current: 'step',
					checked: 'mixed',
				},
				{
					kind: 'field',
					label: 'Approved',
					input_type: 'checkbox',
					checked: true,
				},
			],
		}

		expect(pageSemanticsToOutline(snapshot)).toBe(
			[
				'region (list) [ordered]',
				'region (iframe_stub): Reports [unavailable:cross-origin] -> https://reports.example/',
				'control (tab): Summary [unselected, current:step, mixed]',
				'field: Approved [checkbox] [checked]',
			].join('\n')
		)
	})
})

describe('scrapePageSemantics', () => {
	it('groups landmarks, controls, fields, and tables while excluding hidden UI', () => {
		document.title = 'Tasks'
		document.body.innerHTML = `
			<main>
				<nav aria-label="Primary">
					<a href="/tasks">My Tasks</a>
					<button aria-expanded="false" aria-haspopup="menu">More</button>
				</nav>
				<label>Search <input type="search"></label>
				<table aria-label="My Tasks" aria-rowcount="274">
					<thead><tr><th>Task</th><th>Status</th></tr></thead>
					<tbody><tr><td>Review</td><td>Open</td></tr></tbody>
				</table>
				<div hidden><button>Invisible action</button></div>
			</main>
		`

		const snapshot = scrapePageSemantics()

		expect(pageSemanticsToOutline(snapshot)).toContain(
			[
				'region (main)',
				'  region (navigation): Primary',
				'    control (link): My Tasks -> http://localhost:3000/tasks',
				'    control (button): More [collapsed, expandable, popup:menu]',
				'  text: Search',
				'  field: Search [search]',
				'  table: My Tasks (274 rows)',
				'    headers: Task | Status',
				'    row 1: Review | Open',
			].join('\n')
		)
		expect(pageSemanticsToOutline(snapshot)).not.toContain('Invisible action')
	})

	it('emits visible static text from generic elements', () => {
		document.body.innerHTML = `
			<main>
				<dl>
					<dt>Interest Rate</dt>
					<dd><span>6.75%</span></dd>
				</dl>
				<div hidden>Secret rate</div>
			</main>
		`

		const outline = pageSemanticsToOutline(scrapePageSemantics())

		expect(outline).toContain('region (definition_pair): Interest Rate')
		expect(outline).toContain('text: 6.75%')
		expect(outline).not.toContain('Secret rate')
	})
})

describe('ARIA semantics', () => {
	it('collects widgets, headings, grids, and interaction states', () => {
		document.body.innerHTML = `
			<div role="textbox" aria-label="Notes" contenteditable="true">Ready for review</div>
			<div role="checkbox" aria-label="Approved" aria-checked="true"></div>
			<div role="radio" aria-label="Manual" aria-checked="false"></div>
			<div role="switch" aria-label="Notifications" aria-checked="mixed"></div>
			<input type="checkbox" aria-label="Subscribed" checked>
			<button role="tab" aria-selected="false">Details</button>
			<a href="/tasks" aria-current="page">Tasks</a>
			<div role="heading" aria-level="3">Decision</div>
			<div role="heading">Fallback heading</div>
			<div role="grid" aria-label="Rates" aria-rowcount="8">
				<div role="row">
					<div role="columnheader">Type</div>
					<div role="columnheader">Rate</div>
				</div>
				<div role="row">
					<div role="gridcell">Fixed</div>
					<div role="gridcell">6.75%</div>
				</div>
			</div>
		`

		const outline = pageSemanticsToOutline(scrapePageSemantics({ includeValues: true }))

		expect(outline).toContain('field: Notes [textbox] = Ready for review')
		expect(outline).toContain('control (checkbox): Approved [checked]')
		expect(outline).toContain('control (radio): Manual [unchecked]')
		expect(outline).toContain('control (switch): Notifications [mixed]')
		expect(outline).toContain('field: Subscribed [checkbox] = on [checked]')
		expect(outline).toContain('control (tab): Details [unselected, tab]')
		expect(outline).toContain('control (link): Tasks [current:page] -> http://localhost:3000/tasks')
		expect(outline).toContain('heading (3): Decision')
		expect(outline).toContain('heading (2): Fallback heading')
		expect(outline).toContain(
			['table: Rates (8 rows)', '  headers: Type | Rate', '  row 1: Fixed | 6.75%'].join('\n')
		)
	})

	it('omits textbox content unless values are requested', () => {
		document.body.innerHTML =
			'<div role="textbox" aria-label="Private notes" contenteditable="true">Sensitive</div>'

		expect(pageSemanticsToOutline(scrapePageSemantics())).toBe(
			'field: Private notes [textbox]'
		)
	})
})

describe('semantic structure', () => {
	it('preserves articles, groups, lists, and list items', () => {
		document.body.innerHTML = `
			<article aria-label="Application">
				<div role="group" aria-label="Loan requests">
					<ol>
						<li>First loan</li>
						<li><button>Review second loan</button></li>
					</ol>
				</div>
			</article>
		`

		expect(pageSemanticsToOutline(scrapePageSemantics())).toBe(
			[
				'region (article): Application',
				'  region (group): Loan requests',
				'    region (list) [ordered]',
				'      region (listitem)',
				'        text: First loan',
				'      region (listitem)',
				'        control (button): Review second loan',
			].join('\n')
		)
	})

	it('pairs definition terms with all of their values', () => {
		document.body.innerHTML = `
			<dl>
				<dt>Interest Rate</dt>
				<dd><span>6.75%</span></dd>
				<dt>Terms</dt>
				<dd>30 years</dd>
				<dd>Fixed</dd>
			</dl>
		`

		expect(pageSemanticsToOutline(scrapePageSemantics())).toBe(
			[
				'region (definition_list)',
				'  region (definition_pair): Interest Rate',
				'    text: 6.75%',
				'  region (definition_pair): Terms',
				'    text: 30 years',
				'    text: Fixed',
			].join('\n')
		)
	})
})

describe('document boundaries', () => {
	it('traverses open shadow roots without duplicating light DOM', () => {
		const host = document.createElement('div')
		host.textContent = 'Light content'
		const shadowRoot = host.attachShadow({ mode: 'open' })
		shadowRoot.innerHTML = '<button>Shadow action</button>'
		document.body.append(host)

		expect(pageSemanticsToOutline(scrapePageSemantics())).toBe(
			[
				'text: Light content',
				'region (shadow_root)',
				'  control (button): Shadow action',
			].join('\n')
		)
		expect(
			pageSemanticsToOutline(scrapePageSemantics({ includeShadowDom: false }))
		).toBe('text: Light content')
	})

	it('traverses same-origin iframes and supports disabling iframe collection', () => {
		const iframe = document.createElement('iframe')
		iframe.title = 'Embedded report'
		document.body.append(iframe)
		iframe.contentDocument!.body.innerHTML = '<main><button>Export report</button></main>'

		expect(pageSemanticsToOutline(scrapePageSemantics())).toBe(
			[
				'region (iframe): Embedded report',
				'  region (main)',
				'    control (button): Export report',
			].join('\n')
		)
		expect(pageSemanticsToOutline(scrapePageSemantics({ includeIframes: false }))).toBe('')
	})

	it('stubs inaccessible and depth-limited iframes', () => {
		const inaccessible = document.createElement('iframe')
		inaccessible.title = 'External report'
		document.body.append(inaccessible)
		Object.defineProperties(inaccessible, {
			src: {
				get: () => 'https://reports.example/view',
			},
			contentDocument: {
				get: () => {
					throw new DOMException('Blocked', 'SecurityError')
				},
			},
		})

		expect(pageSemanticsToOutline(scrapePageSemantics())).toBe(
			'region (iframe_stub): External report [unavailable:cross-origin] -> https://reports.example/view'
		)
		expect(pageSemanticsToOutline(scrapePageSemantics({ maxIframeDepth: 0 }))).toBe(
			'region (iframe_stub): External report [unavailable:depth-limit] -> https://reports.example/view'
		)
	})
})

describe('passive interaction classification', () => {
	it('collects interaction hints without dispatching hover or click events', () => {
		document.body.innerHTML = `
			<main>
				<button id="menu-trigger" aria-expanded="false" aria-haspopup="menu" aria-controls="menu">More</button>
				<div id="menu" hidden>
					<button role="menuitem">Settings</button>
					<button role="menuitem">Sign out</button>
				</div>
				<button id="missing" aria-expanded="false" aria-controls="missing-menu">Later</button>
				<button id="tooltip-trigger" aria-describedby="tip">Help</button>
				<div id="tip" role="tooltip" hidden>Helpful text</div>
				<button id="ordinary">Ordinary</button>
				<button id="unknown-description" aria-describedby="description">Described</button>
				<div id="description">Persistent description</div>
				<div role="tablist">
					<button role="tab" aria-selected="false" aria-controls="panel">Details</button>
				</div>
				<input role="combobox" aria-label="Assignee">
			</main>
		`
		let eventCount = 0
		const countEvent = () => eventCount++
		document.body.addEventListener('mouseenter', countEvent, true)
		document.body.addEventListener('click', countEvent, true)

		const outline = pageSemanticsToOutline(scrapePageSemantics())
		document.body.removeEventListener('mouseenter', countEvent, true)
		document.body.removeEventListener('click', countEvent, true)

		expect(outline).toContain(
			[
				'control (button): More [collapsed, expandable -> #menu, popup:menu -> #menu]',
				'    control (menuitem): Settings',
				'    control (menuitem): Sign out',
			].join('\n')
		)
		expect(outline).toContain(
			'control (button): Later [collapsed, expandable -> #missing-menu] (not in DOM: #missing-menu)'
		)
		expect(outline).toContain(
			['control (button): Help [hoverable -> #tip]', '    text: Helpful text'].join('\n')
		)
		expect(outline).toContain('control (tab): Details [unselected, tab -> #panel]')
		expect(outline).toContain('field: Assignee [text] [popup:listbox]')
		expect(outline).toContain('control (button): Ordinary')
		expect(outline).toContain('control (button): Described')
		expect(outline).not.toContain('Described [hoverable')
		expect(eventCount).toBe(0)
	})
})
