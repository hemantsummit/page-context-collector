import type { PageSemantics, SemanticNode } from './types'

function formatMissingTargets(node: Extract<SemanticNode, { kind: 'control' | 'field' }>): string {
	return node.unmounted_target_ids?.length
		? ` (not in DOM: #${node.unmounted_target_ids.join(', #')})`
		: ''
}

function formatInteractionHints(
	node: Extract<SemanticNode, { kind: 'control' | 'field' }>
): string[] {
	return (node.interaction_hints ?? []).map((hint) => {
		const target = hint.target_ids?.length ? ` -> #${hint.target_ids.join(', #')}` : ''
		if (hint.kind === 'popup') return `popup:${hint.popup_type ?? 'unknown'}${target}`
		return `${hint.kind}${target}`
	})
}

function formatStates(node: Extract<SemanticNode, { kind: 'control' | 'field' }>): string[] {
	return [
		node.selected === true ? 'selected' : node.selected === false ? 'unselected' : null,
		node.current ? `current:${node.current}` : null,
		node.checked === true
			? 'checked'
			: node.checked === false
				? 'unchecked'
				: node.checked === 'mixed'
					? 'mixed'
					: null,
	].filter((state): state is string => state !== null)
}

function formatNode(node: SemanticNode, depth: number, lines: string[]): void {
	const indent = '  '.repeat(depth)

	switch (node.kind) {
		case 'region': {
			const label = node.label ? `: ${node.label}` : ''
			const details = [
				node.list_type ?? null,
				node.unavailable_reason ? `unavailable:${node.unavailable_reason}` : null,
			].filter(Boolean)
			const detailText = details.length > 0 ? ` [${details.join(', ')}]` : ''
			const src = node.src ? ` -> ${node.src}` : ''
			lines.push(`${indent}region (${node.region_kind})${label}${detailText}${src}`)
			for (const child of node.children) formatNode(child, depth + 1, lines)
			break
		}
		case 'control': {
			const states = [
				node.expanded === false ? 'collapsed' : null,
				node.expanded === true ? 'expanded' : null,
				node.disabled ? 'disabled' : null,
				...formatStates(node),
				...formatInteractionHints(node),
			].filter(Boolean)
			const stateText = states.length > 0 ? ` [${states.join(', ')}]` : ''
			const href = node.href ? ` -> ${node.href}` : ''
			const missing = formatMissingTargets(node)
			lines.push(`${indent}control (${node.role}): ${node.label}${stateText}${href}${missing}`)
			for (const child of node.disclosed_content ?? []) formatNode(child, depth + 1, lines)
			break
		}
		case 'field': {
			const value = node.value !== undefined ? ` = ${node.value}` : ''
			const states = [
				node.disabled ? 'disabled' : null,
				...formatStates(node),
				...formatInteractionHints(node),
			].filter(Boolean)
			const stateText = states.length > 0 ? ` [${states.join(', ')}]` : ''
			lines.push(
				`${indent}field: ${node.label} [${node.input_type}]${value}${stateText}${formatMissingTargets(node)}`
			)
			for (const child of node.disclosed_content ?? []) formatNode(child, depth + 1, lines)
			break
		}
		case 'heading':
			lines.push(`${indent}heading (${node.level}): ${node.text}`)
			break
		case 'text':
			lines.push(`${indent}text: ${node.text}`)
			break
		case 'table': {
			const caption = node.caption ? `: ${node.caption}` : ''
			lines.push(`${indent}table${caption} (${node.row_count} rows)`)
			if (node.headers.length > 0) {
				lines.push(`${indent}  headers: ${node.headers.join(' | ')}`)
			}
			node.rows.forEach((row, index) => {
				lines.push(`${indent}  row ${index + 1}: ${row.join(' | ')}`)
			})
			break
		}
	}
}

export function pageSemanticsToOutline(snapshot: PageSemantics): string {
	const lines: string[] = []
	for (const node of snapshot.semantic_tree) formatNode(node, 0, lines)

	return lines.join('\n')
}

export function formatPageSemantics(snapshot: PageSemantics): string {
	return [
		'UI context page structure',
		'=========================',
		`title: ${snapshot.title}`,
		`url: ${snapshot.url}`,
		'',
		'outline',
		'-------',
		pageSemanticsToOutline(snapshot),
		'',
		'snapshot',
		'--------',
		JSON.stringify(snapshot, null, 2),
	].join('\n')
}
