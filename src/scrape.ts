import type {
	InteractionHint,
	PageSemantics,
	ScrapeOptions,
	SemanticControl,
	SemanticField,
	SemanticNode,
	SemanticRegion,
	SemanticTable,
	SemanticText,
} from './types'

const IGNORED_TAGS = new Set(['script', 'style', 'template', 'noscript', 'link', 'meta'])
const CONTROL_ROLES = new Set([
	'button',
	'checkbox',
	'link',
	'menuitem',
	'menuitemcheckbox',
	'menuitemradio',
	'option',
	'radio',
	'switch',
	'tab',
	'treeitem',
])
const REGION_ROLES = new Set([
	'article',
	'banner',
	'complementary',
	'contentinfo',
	'dialog',
	'form',
	'group',
	'list',
	'listitem',
	'main',
	'menu',
	'navigation',
	'region',
	'term',
	'definition',
	'toolbar',
])

interface ScrapeContext {
	includeValues: boolean
	includeShadowDom: boolean
	includeIframes: boolean
	maxIframeDepth: number
	iframeDepth: number
	seen: Set<Element>
}

function idsFromAttribute(element: Element, attribute: string): string[] {
	return (element.getAttribute(attribute) ?? '').split(/\s+/).filter(Boolean)
}

function interactionHints(element: Element): InteractionHint[] {
	const hints: InteractionHint[] = []
	const controlledIds = idsFromAttribute(element, 'aria-controls')
	const expanded = element.getAttribute('aria-expanded')
	const role = element.getAttribute('role')

	if (expanded === 'true' || expanded === 'false' || element.tagName.toLowerCase() === 'summary') {
		const hint: InteractionHint = { kind: 'expandable' }
		if (controlledIds.length > 0) hint.target_ids = controlledIds
		hints.push(hint)
	}

	const popup = element.getAttribute('aria-haspopup')
	if (popup && popup !== 'false') {
		const hint: InteractionHint = {
			kind: 'popup',
			popup_type: popup === 'true' ? 'menu' : popup,
		}
		if (controlledIds.length > 0) hint.target_ids = controlledIds
		hints.push(hint)
	} else if (role === 'combobox' || element instanceof HTMLSelectElement) {
		hints.push({ kind: 'popup', popup_type: 'listbox' })
	}

	const tooltipIds = idsFromAttribute(element, 'aria-describedby').filter(
		(id) => element.ownerDocument.getElementById(id)?.getAttribute('role') === 'tooltip'
	)
	if (
		tooltipIds.length > 0 ||
		element.hasAttribute('data-tooltip') ||
		element.hasAttribute('data-tooltip-content') ||
		element.hasAttribute('title')
	) {
		const hint: InteractionHint = { kind: 'hoverable' }
		if (tooltipIds.length > 0) hint.target_ids = tooltipIds
		hints.push(hint)
	}

	if (role === 'tab') {
		const hint: InteractionHint = { kind: 'tab' }
		if (controlledIds.length > 0) hint.target_ids = controlledIds
		hints.push(hint)
	}

	return hints
}

function normalizeText(value: string | null | undefined): string {
	return (value ?? '').replace(/\s+/g, ' ').trim()
}

function booleanAriaState(element: Element, attribute: string): boolean | undefined {
	const value = element.getAttribute(attribute)
	if (value === 'true') return true
	if (value === 'false') return false
	return undefined
}

function checkedState(element: Element): boolean | 'mixed' | undefined {
	const ariaChecked = element.getAttribute('aria-checked')
	if (ariaChecked === 'mixed') return 'mixed'
	if (ariaChecked === 'true') return true
	if (ariaChecked === 'false') return false

	if (
		element instanceof HTMLInputElement &&
		(element.type === 'checkbox' || element.type === 'radio')
	) {
		return element.indeterminate ? 'mixed' : element.checked
	}
	return undefined
}

function currentState(element: Element): string | undefined {
	const value = normalizeText(element.getAttribute('aria-current'))
	return value && value !== 'false' ? value : undefined
}

function isHidden(element: Element): boolean {
	if (
		element.hasAttribute('hidden') ||
		element.hasAttribute('inert') ||
		element.getAttribute('aria-hidden') === 'true'
	) {
		return true
	}

	const ownerWindow = element.ownerDocument.defaultView
	if (ownerWindow) {
		const style = ownerWindow.getComputedStyle(element)
		if (
			style.display === 'none' ||
			style.visibility === 'hidden' ||
			style.visibility === 'collapse'
		) {
			return true
		}
	}

	const parent = element.parentElement
	return parent ? isHidden(parent) : false
}

function accessibleName(element: Element): string {
	const labelledBy = element.getAttribute('aria-labelledby')
	if (labelledBy) {
		const label = labelledBy
			.split(/\s+/)
			.map((id) => normalizeText(element.ownerDocument.getElementById(id)?.textContent))
			.filter(Boolean)
			.join(' ')
		if (label) return label
	}

	const ariaLabel = normalizeText(element.getAttribute('aria-label'))
	if (ariaLabel) return ariaLabel

	if (
		element instanceof HTMLInputElement ||
		element instanceof HTMLSelectElement ||
		element instanceof HTMLTextAreaElement
	) {
		const labels = Array.from(element.labels ?? [])
			.map((label) => normalizeText(label.textContent))
			.filter(Boolean)
		if (labels.length > 0) return labels.join(' ')
	}

	return (
		normalizeText(element.textContent) ||
		normalizeText(element.getAttribute('title')) ||
		normalizeText(element.getAttribute('placeholder')) ||
		normalizeText(element.getAttribute('alt')) ||
		normalizeText(element.getAttribute('name')) ||
		'(unlabelled)'
	)
}

function elementRole(element: Element): string | null {
	const explicitRole = element.getAttribute('role')?.split(/\s+/)[0]
	if (explicitRole) return explicitRole

	const tag = element.tagName.toLowerCase()
	if (tag === 'a' && element.hasAttribute('href')) return 'link'
	if (tag === 'button' || tag === 'summary') return 'button'
	if (tag === 'option') return 'option'
	return null
}

function parseControl(element: Element, context: ScrapeContext): SemanticControl | null {
	const role = elementRole(element)
	if (!role || !CONTROL_ROLES.has(role)) return null

	const control: SemanticControl = {
		kind: 'control',
		role,
		label: accessibleName(element),
	}

	if (element instanceof HTMLAnchorElement && element.href) control.href = element.href

	const expanded = element.getAttribute('aria-expanded')
	if (expanded === 'true' || expanded === 'false') control.expanded = expanded === 'true'

	if (
		element.hasAttribute('disabled') ||
		element.getAttribute('aria-disabled') === 'true' ||
		(element instanceof HTMLButtonElement && element.disabled)
	) {
		control.disabled = true
	}

	const selected = booleanAriaState(element, 'aria-selected')
	if (selected !== undefined) control.selected = selected
	const current = currentState(element)
	if (current) control.current = current
	const checked = checkedState(element)
	if (checked !== undefined) control.checked = checked

	const hints = interactionHints(element)
	if (hints.length > 0) control.interaction_hints = hints
	attachDisclosedContent(element, control, context)

	return control
}

function parseField(element: Element, context: ScrapeContext): SemanticField | null {
	const role = element.getAttribute('role')?.split(/\s+/)[0]
	const isNativeField =
		element instanceof HTMLInputElement ||
		element instanceof HTMLSelectElement ||
		element instanceof HTMLTextAreaElement
	const isAriaTextbox =
		role === 'textbox' ||
		element.getAttribute('contenteditable') === 'true' ||
		element.getAttribute('contenteditable') === 'plaintext-only'
	if (!isNativeField && !isAriaTextbox) return null
	if (element instanceof HTMLInputElement && element.type === 'hidden') return null

	const inputType =
		element instanceof HTMLInputElement
			? element.type || 'text'
			: element instanceof HTMLSelectElement
				? 'select'
				: element instanceof HTMLTextAreaElement
					? 'textarea'
					: 'textbox'
	const field: SemanticField = {
		kind: 'field',
		label: accessibleName(element),
		input_type: inputType,
	}

	const value =
		element instanceof HTMLInputElement ||
		element instanceof HTMLSelectElement ||
		element instanceof HTMLTextAreaElement
			? element.value
			: normalizeText(element.textContent)
	if (context.includeValues && value) field.value = value
	if (
		('disabled' in element && Boolean(element.disabled)) ||
		element.getAttribute('aria-disabled') === 'true'
	) {
		field.disabled = true
	}
	const selected = booleanAriaState(element, 'aria-selected')
	if (selected !== undefined) field.selected = selected
	const current = currentState(element)
	if (current) field.current = current
	const checked = checkedState(element)
	if (checked !== undefined) field.checked = checked
	const hints = interactionHints(element)
	if (hints.length > 0) field.interaction_hints = hints
	attachDisclosedContent(element, field, context)
	return field
}

function directCellText(row: HTMLTableRowElement): string[] {
	return Array.from(row.cells).map((cell) => normalizeText(cell.textContent))
}

function parseTable(element: Element): SemanticTable | null {
	const role = element.getAttribute('role')
	if (!(element instanceof HTMLTableElement) && role !== 'table' && role !== 'grid')
		return null

	if (element instanceof HTMLTableElement) {
		const allRows = Array.from(element.rows)
		const headerRow = allRows.find((row) =>
			Array.from(row.cells).some((cell) => cell.tagName.toLowerCase() === 'th')
		)
		const headers = headerRow ? directCellText(headerRow) : []
		const rows = allRows
			.filter((row) => row !== headerRow)
			.map(directCellText)
			.filter((row) => row.some(Boolean))
		const declaredCount = Number.parseInt(element.getAttribute('aria-rowcount') ?? '', 10)

		return {
			kind: 'table',
			caption: normalizeText(element.caption?.textContent) || accessibleName(element),
			headers,
			rows,
			row_count: Number.isFinite(declaredCount) ? declaredCount : rows.length,
		}
	}

	const rowElements = Array.from(element.querySelectorAll<HTMLElement>('[role="row"]'))
	const headerRow = rowElements.find((row) => row.querySelector('[role="columnheader"]'))
	const headers = headerRow
		? Array.from(headerRow.querySelectorAll('[role="columnheader"]')).map((cell) =>
				normalizeText(cell.textContent)
			)
		: []
	const rows = rowElements
		.filter((row) => row !== headerRow)
		.map((row) =>
			Array.from(row.querySelectorAll('[role="cell"], [role="gridcell"]')).map((cell) =>
				normalizeText(cell.textContent)
			)
		)
		.filter((row) => row.some(Boolean))
	const declaredCount = Number.parseInt(element.getAttribute('aria-rowcount') ?? '', 10)

	return {
		kind: 'table',
		caption: accessibleName(element),
		headers,
		rows,
		row_count: Number.isFinite(declaredCount) ? declaredCount : rows.length,
	}
}

function regionKind(element: Element): string | null {
	const role = element.getAttribute('role')?.split(/\s+/)[0]
	if (role && REGION_ROLES.has(role)) return role

	const tag = element.tagName.toLowerCase()
	const tagRegions: Record<string, string> = {
		article: 'article',
		aside: 'complementary',
		dd: 'definition',
		dialog: 'dialog',
		dl: 'definition_list',
		dt: 'term',
		footer: 'contentinfo',
		form: 'form',
		header: 'banner',
		li: 'listitem',
		main: 'main',
		nav: 'navigation',
		ol: 'list',
		section: 'section',
		ul: 'list',
	}
	return tagRegions[tag] ?? null
}

function attributeTexts(element: Element): SemanticText[] {
	const label = accessibleName(element)
	const values = [
		element.getAttribute('title'),
		element.getAttribute('data-tooltip'),
		element.getAttribute('data-tooltip-content'),
	]
		.map(normalizeText)
		.filter((text) => text && text !== label)

	return [...new Set(values)].map((text) => ({ kind: 'text', text }))
}

function referencedTargets(element: Element): { mounted: Element[]; missing: string[] } {
	const ids = [
		...idsFromAttribute(element, 'aria-controls'),
		...idsFromAttribute(element, 'aria-describedby'),
	]
	const mounted: Element[] = []
	const missing: string[] = []

	for (const id of ids) {
		const target = element.ownerDocument.getElementById(id)
		if (target && !element.contains(target) && !target.contains(element)) mounted.push(target)
		else if (!target) missing.push(id)
	}

	const details = element.tagName.toLowerCase() === 'summary' ? element.closest('details') : null
	if (details) {
		for (const child of details.children) {
			if (child !== element) mounted.push(child)
		}
	}

	return { mounted, missing }
}

function attachDisclosedContent(
	element: Element,
	node: SemanticControl | SemanticField,
	context: ScrapeContext
): void {
	const disclosed: SemanticNode[] = []
	const { mounted, missing } = referencedTargets(element)

	for (const target of mounted) {
		if (!isHidden(target) || context.seen.has(target)) continue
		const content = scrapeMountedTarget(target, context)
		if (content.length > 0) disclosed.push(...content)
	}

	if (element instanceof HTMLSelectElement) {
		disclosed.push(
			...Array.from(element.options).map((option) => ({
				kind: 'control' as const,
				role: 'option',
				label: normalizeText(option.textContent) || '(unlabelled)',
				...(option.disabled ? { disabled: true } : {}),
			}))
		)
	}

	disclosed.push(...attributeTexts(element))
	if (disclosed.length > 0) node.disclosed_content = disclosed
	if (missing.length > 0) node.unmounted_target_ids = missing
}

function scrapeMountedTarget(element: Element, context: ScrapeContext): SemanticNode[] {
	if (context.seen.has(element)) return []
	context.seen.add(element)

	const nodes = parseElement(element, context, true)
	if (nodes.length > 0) return nodes

	const text = normalizeText(element.textContent)
	return text ? [{ kind: 'text', text }] : []
}

function childrenOf(
	element: Element,
	context: ScrapeContext,
	includeHidden = false
): SemanticNode[] {
	const children = childNodesOf(element, context, includeHidden)
	const shadowRoot = context.includeShadowDom ? element.shadowRoot : null
	if (shadowRoot) {
		const shadowChildren = childNodesOf(shadowRoot, context, includeHidden)
		if (shadowChildren.length > 0) {
			children.push({
				kind: 'region',
				region_kind: 'shadow_root',
				children: shadowChildren,
			})
		}
	}
	return children
}

function childNodesOf(
	parent: ParentNode,
	context: ScrapeContext,
	includeHidden = false
): SemanticNode[] {
	return Array.from(parent.childNodes).flatMap((child) => {
		if (child.nodeType === Node.TEXT_NODE) {
			const text = normalizeText(child.nodeValue)
			return text ? [{ kind: 'text' as const, text }] : []
		}
		if (child.nodeType === Node.ELEMENT_NODE) {
			return parseElement(child as Element, context, includeHidden)
		}
		return []
	})
}

function parseDefinitionList(
	element: Element,
	context: ScrapeContext,
	includeHidden: boolean
): SemanticRegion {
	const children: SemanticNode[] = []
	const elements = Array.from(element.children)

	for (let index = 0; index < elements.length; index++) {
		const child = elements[index]
		if (!includeHidden && isHidden(child)) continue

		const role = child.getAttribute('role')?.split(/\s+/)[0]
		const isTerm = child.tagName.toLowerCase() === 'dt' || role === 'term'
		if (!isTerm) {
			children.push(...parseElement(child, context, includeHidden))
			continue
		}

		const definitions: SemanticNode[] = []
		while (index + 1 < elements.length) {
			const candidate = elements[index + 1]
			const candidateRole = candidate.getAttribute('role')?.split(/\s+/)[0]
			const isDefinition =
				candidate.tagName.toLowerCase() === 'dd' || candidateRole === 'definition'
			if (!isDefinition) break
			index++
			if (!includeHidden && isHidden(candidate)) continue
			definitions.push(...childrenOf(candidate, context, includeHidden))
		}

		children.push({
			kind: 'region',
			region_kind: 'definition_pair',
			label: accessibleName(child),
			children: definitions,
		})
	}

	const region: SemanticRegion = {
		kind: 'region',
		region_kind: 'definition_list',
		children,
	}
	const label = normalizeText(element.getAttribute('aria-label'))
	if (label) region.label = label
	return region
}

function iframeSource(element: HTMLIFrameElement): string | undefined {
	const source = normalizeText(element.src || element.getAttribute('src'))
	return source && source !== 'about:blank' ? source : undefined
}

function iframeLabel(element: HTMLIFrameElement, src?: string): string {
	return (
		normalizeText(element.getAttribute('aria-label')) ||
		normalizeText(element.title) ||
		normalizeText(element.name) ||
		src ||
		'(unlabelled)'
	)
}

function parseIframe(element: HTMLIFrameElement, context: ScrapeContext): SemanticRegion {
	const src = iframeSource(element)
	const label = iframeLabel(element, src)
	if (context.iframeDepth >= context.maxIframeDepth) {
		return {
			kind: 'region',
			region_kind: 'iframe_stub',
			label,
			...(src ? { src } : {}),
			unavailable_reason: 'depth-limit',
			children: [],
		}
	}

	try {
		const body = element.contentDocument?.body
		if (body) {
			return {
				kind: 'region',
				region_kind: 'iframe',
				label,
				...(src ? { src } : {}),
				children: childrenOf(body, {
					...context,
					iframeDepth: context.iframeDepth + 1,
				}),
			}
		}
	} catch {
		return {
			kind: 'region',
			region_kind: 'iframe_stub',
			label,
			...(src ? { src } : {}),
			unavailable_reason: 'cross-origin',
			children: [],
		}
	}

	let unavailableReason: SemanticRegion['unavailable_reason'] = 'unavailable'
	if (src) {
		try {
			if (new URL(src, element.ownerDocument.baseURI).origin !== element.ownerDocument.location.origin) {
				unavailableReason = 'cross-origin'
			}
		} catch {
			// Keep the generic unavailable reason for invalid URLs.
		}
	}
	return {
		kind: 'region',
		region_kind: 'iframe_stub',
		label,
		...(src ? { src } : {}),
		unavailable_reason: unavailableReason,
		children: [],
	}
}

function parseElement(
	element: Element,
	context: ScrapeContext,
	includeHidden = false
): SemanticNode[] {
	const tag = element.tagName.toLowerCase()
	if (IGNORED_TAGS.has(tag) || (!includeHidden && isHidden(element))) return []

	if (tag === 'iframe') {
		return context.includeIframes ? [parseIframe(element as HTMLIFrameElement, context)] : []
	}

	const field = parseField(element, context)
	if (field) return [field]

	const control = parseControl(element, context)
	if (control) return [control]

	const table = parseTable(element)
	if (table) return [table]

	const role = element.getAttribute('role')?.split(/\s+/)[0]
	if (/^h[1-6]$/.test(tag) || role === 'heading') {
		const ariaLevel = Number.parseInt(element.getAttribute('aria-level') ?? '', 10)
		return [
			{
				kind: 'heading',
				level: /^h[1-6]$/.test(tag)
					? Number(tag[1])
					: Number.isFinite(ariaLevel) && ariaLevel > 0
						? ariaLevel
						: 2,
				text: normalizeText(element.textContent),
			},
		]
	}

	if (tag === 'dl') {
		const definitionList = parseDefinitionList(element, context, includeHidden)
		return definitionList.children.length > 0 ? [definitionList] : []
	}

	const region = regionKind(element)
	if (region) {
		const children = childrenOf(element, context, includeHidden)
		const node: SemanticRegion = { kind: 'region', region_kind: region, children }
		if (tag === 'ol') node.list_type = 'ordered'
		if (tag === 'ul') node.list_type = 'unordered'
		const label = normalizeText(element.getAttribute('aria-label'))
		if (label) node.label = label
		return children.length > 0 ? [node] : []
	}

	return childrenOf(element, context, includeHidden)
}

export function scrapePageSemantics(options: ScrapeOptions = {}): PageSemantics {
	const root = options.root ?? document
	const rootElement =
		root instanceof Document ? root.body : root instanceof Element ? root : root.firstElementChild
	const context: ScrapeContext = {
		includeValues: options.includeValues ?? false,
		includeShadowDom: options.includeShadowDom ?? true,
		includeIframes: options.includeIframes ?? true,
		maxIframeDepth: Math.max(0, options.maxIframeDepth ?? 2),
		iframeDepth: 0,
		seen: new Set<Element>(),
	}
	const semanticTree = rootElement
		? rootElement.tagName.toLowerCase() === 'body'
			? childrenOf(rootElement, context)
			: parseElement(rootElement, context)
		: []

	return {
		title: root.ownerDocument?.title ?? (root instanceof Document ? root.title : document.title),
		url:
			root.ownerDocument?.location?.href ??
			(root instanceof Document ? root.location.href : document.location.href),
		semantic_tree: semanticTree,
	}
}
