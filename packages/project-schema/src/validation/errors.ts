/** Shared validation error shape — every validator reports through this. */

export interface ValidationIssue {
  path: string
  message: string
}

export class ValidationError extends Error {
  constructor(
    public readonly issues: ValidationIssue[]
  ) {
    const first = issues[0]
    super(
      issues.length === 1
        ? `${first.path}: ${first.message}`
        : `${issues.length} validation errors — first: ${first.path}: ${first.message}`
    )
    this.name = 'ValidationError'
  }
}
