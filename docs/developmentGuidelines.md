# OPEN - Development Guidelines

This document establishes the technical standards for the OPEN project. All team members must follow these conventions to ensure consistency and speed during the development process.

## 1. Git and Branching Strategy

We use a simplified branching model to manage our codebase. All work must be integrated through Pull Requests to the develop branch.

### 1.1 Branch Naming
Branches should follow the pattern: type/task-description
- Examples: 
  - feat/1.1.1-setup-monorepo
  - feat/1.3.1-log-parser
  - docs/development-guidelines
  - fix/1.4.3-log-parsing-error

### 1.2 Permanent Branches
- main: Stable production code. No direct commits allowed.
- develop: Main integration branch. All features and fixes target this branch.

### 1.3 Workflow
1. Create a branch from develop: git checkout -b type/task-description
2. Work and commit using Conventional Commits.
3. Push to GitHub and open a Pull Request to develop.
4. Wait for at least one review before merging.

## 2. Commit Conventions

We follow the Conventional Commits specification for a readable history.

Format: type: description (all lowercase)

- feat: A new feature
- fix: A bug fix
- docs: Documentation changes
- style: Formatting and linting
- refactor: Code restructuring
- chore: Maintenance and dependencies
- test: Adding or updating tests

## 3. Pull Request Standard

All Pull Requests must use the following template in the description:

### Description
Short explanation of what this PR adds or changes.

### Main changes
- Technical implementation detail 1
- Technical implementation detail 2

### Validation
- List how the changes were tested.

### Related work
- Task ID and any dependencies.

## 4. Coding Standards

### 4.1 Naming Conventions
We use camelCase for all technical identifiers to maintain consistency in the TypeScript ecosystem.
- Folders and Files: camelCase (e.g., services/src/logParser.ts)
- Variables and Functions: camelCase (e.g., const computeUnits = 0)
- Classes: PascalCase (e.g., class TransactionAnalyzer)

### 4.2 TypeScript Practices
- Use strict mode (no any).
- Define explicit return types for all functions.
- Use async/await for asynchronous operations.
- Wrap external calls (RPC/APIs) in try/catch blocks.

## 5. Tooling and Commands

The project uses npm workspaces. Shared tools are at the root, while specific logic is in each workspace.

- npm install: Sync all dependencies.
- npm run lint: Check for code style and logic errors.
- npm run format: Automatically fix code formatting.
- npm run test: Run unit tests with Vitest.

## 6. Communication

- Language: All code, comments, commits, and PRs must be in English.
- Blockers: Report any blockers immediately to the integration lead.

Author: Nicole (Backend Lead)
Project: OPEN - Visual Transaction Debugger
Last Updated: April 13, 2026
