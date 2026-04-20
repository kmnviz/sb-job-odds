export function mapAsianHandicapLabelToOutcome(label) {
    const normalized = label.trim().toLowerCase();
    if (normalized === 'home')
        return 'home';
    if (normalized === 'away')
        return 'away';
    throw new Error(`Unsupported Asian Handicap label: ${label}`);
}
//# sourceMappingURL=label-mapping.js.map