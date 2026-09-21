export type SemanticNode =
	SemanticRegion | SemanticControl | SemanticField | SemanticTable | SemanticHeading | SemanticText

export interface SemanticRegion {
	kind: 'region'
	region_kind: string
	label?: string
	list_type?: 'ordered' | 'unordered'
	src?: string
	unavailable_reason?: 'cross-origin' | 'unavailable' | 'depth-limit'
	children: SemanticNode[]
}

export type InteractionKind = 'expandable' | 'popup' | 'hoverable' | 'tab'

export interface InteractionHint {
	kind: InteractionKind
	target_ids?: string[]
	popup_type?: string
}

export interface SemanticControl {
	kind: 'control'
	role: string
	label: string
	href?: string
	expanded?: boolean
	disabled?: boolean
	selected?: boolean
	current?: string
	checked?: boolean | 'mixed'
	interaction_hints?: InteractionHint[]
	/** Content already present in the DOM for a referenced popup, menu, tooltip, or panel. */
	disclosed_content?: SemanticNode[]
	/** Referenced ids that are not mounted. Their contents cannot be read without opening the control. */
	unmounted_target_ids?: string[]
}

export interface SemanticField {
	kind: 'field'
	label: string
	input_type: string
	value?: string
	disabled?: boolean
	selected?: boolean
	current?: string
	checked?: boolean | 'mixed'
	interaction_hints?: InteractionHint[]
	disclosed_content?: SemanticNode[]
	unmounted_target_ids?: string[]
}

export interface SemanticTable {
	kind: 'table'
	caption?: string
	headers: string[]
	rows: string[][]
	row_count: number
}

export interface SemanticHeading {
	kind: 'heading'
	level: number
	text: string
}

export interface SemanticText {
	kind: 'text'
	text: string
}

export interface PageSemantics {
	title: string
	url: string
	semantic_tree: SemanticNode[]
}

export interface ScrapeOptions {
	root?: ParentNode
	includeValues?: boolean
	includeShadowDom?: boolean
	includeIframes?: boolean
	maxIframeDepth?: number
}
